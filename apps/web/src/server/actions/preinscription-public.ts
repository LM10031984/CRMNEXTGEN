'use server';

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { uploadFile, PREENROLLMENT_BUCKET } from '@/lib/storage';
import { extractPreEnrollmentDocuments } from '@/lib/preinscription-extractor';
import { validateFileBuffer, type AllowedMime } from '@/lib/file-validation';
import { buildPreEnrollmentKey } from '@/lib/storage-key';
import { checkRateLimit, RateLimitProfile } from '@/lib/rate-limit';
import { childLogger } from '@/lib/logger';

const log = childLogger('preinscription-public');

/**
 * Sprint 3 — Validation Zod stricte sur l'endpoint PUBLIC.
 *
 * C'est notre point d'entrée le plus exposé (pas d'auth, juste un token).
 * Tout ce qui rentre doit être validé : injection PII, payloads malformés,
 * tailles abusives. La validation magic-bytes (Sprint 1) couvre déjà le
 * contenu binaire des pièces ; Zod couvre ici les champs structurés.
 *
 * Règles métier :
 *   - token : 32 hex (généré par preinscriptions.ts via crypto.randomBytes)
 *   - email : RFC 5321 + max 254 chars
 *   - firstName/lastName : trim non-vide, max 100 chars (anti-DoS BDD)
 *   - birthDate : ISO date, refuse si année hors [1900, currentYear]
 *   - rgpdAccepted : true strict (pas truthy)
 *   - files : 1 à 4 entrées, base64 ≤ 14 Mo (10 Mo binaire × 1.4 base64)
 *   - signatureBase64 : optionnel mais ≤ 3 Mo (2 Mo binaire × 1.4)
 */
const submitInputSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{32,128}$/, 'Token invalide.'),
  firstName: z.string().trim().min(1, 'Prénom requis.').max(100),
  lastName: z.string().trim().min(1, 'Nom requis.').max(100),
  email: z.string().trim().toLowerCase().email('Email invalide.').max(254),
  phone: z.string().trim().max(40).optional(),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date de naissance invalide (yyyy-mm-dd).')
    .optional(),
  birthPlace: z.string().trim().max(120).optional(),
  professionalStatus: z.string().trim().max(120).optional(),
  diploma: z.string().trim().max(500).optional(),
  educationLevel: z.string().trim().max(120).optional(),
  professionalExperience: z.string().trim().max(500).optional(),
  rgpdAccepted: z.literal(true, {
    errorMap: () => ({ message: 'Acceptation RGPD obligatoire.' }),
  }),
  files: z
    .array(
      z.object({
        kind: z.enum(['CNI', 'RIB', 'CFP']),
        name: z.string().trim().min(1).max(255),
        contentType: z.string().max(100), // ignoré côté serveur (magic-bytes), mais limité quand même
        base64: z.string().max(14 * 1024 * 1024),
      }),
    )
    .min(1, 'Au moins une pièce justificative est requise.')
    .max(4, 'Trop de pièces (4 max).'),
  signatureBase64: z.string().max(3 * 1024 * 1024).optional(),
});

type SubmitInput = z.infer<typeof submitInputSchema>;

const MAX_FILE_SIZE_MB = 10;

/**
 * MIME autorisés par catégorie de pièce. CNI et signature ne tolèrent que
 * l'image (PDF accepté pour CNI car beaucoup de scans arrivent ainsi). Les
 * justificatifs RIB et CFP sont quasi toujours PDF mais on accepte l'image
 * pour les téléphones qui scannent.
 */
const MIME_BY_KIND: Record<'CNI' | 'RIB' | 'CFP', AllowedMime[]> = {
  CNI: ['application/pdf', 'image/jpeg', 'image/png'],
  RIB: ['application/pdf', 'image/jpeg', 'image/png'],
  CFP: ['application/pdf', 'image/jpeg', 'image/png'],
};

export async function submitPreEnrollmentForm(
  rawInput: unknown,
): Promise<{ ok: boolean; error?: string }> {
  // Sprint 3 — Validation Zod stricte avant tout traitement. Le client peut
  // envoyer n'importe quoi (endpoint public), donc on filtre les types,
  // longueurs, regex AVANT de toucher la BDD ou le storage.
  const parsed = submitInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const path = firstIssue?.path.join('.') ?? '?';
    log.warn({ issues: parsed.error.issues.slice(0, 3) }, 'validation.failed');
    return { ok: false, error: `Champ invalide (${path}) : ${firstIssue?.message ?? 'valeur incorrecte.'}` };
  }
  const input: SubmitInput = parsed.data;

  // Sprint 1 — Rate-limit anti-spam : 10 soumissions max / heure par IP sur cet
  // endpoint public. Évite qu'un attaquant pollue la BDD ou sature le pipeline
  // d'extraction IA. Le token n'est pas dans la clé : un attaquant qui aurait
  // 10 tokens valides pourrait quand même les soumettre — mais c'est OK car
  // ça nécessite déjà 10 liens légitimes émis par l'admin.
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? 'unknown';
  const rl = await checkRateLimit({
    key: `preinscription:submit:${ip}`,
    ...RateLimitProfile.PREENROLLMENT_SUBMIT,
  });
  if (!rl.ok) {
    return {
      ok: false,
      error: `Trop de soumissions depuis cette adresse. Réessayez dans ${Math.ceil(rl.resetIn / 60)} min.`,
    };
  }

  // 1) Validation token
  const pe = await prisma.preEnrollment.findUnique({ where: { token: input.token } });
  if (!pe) return { ok: false, error: 'Lien invalide' };
  if (pe.expiresAt < new Date()) return { ok: false, error: 'Ce lien a expiré' };
  if (pe.status !== 'PENDING_FORM' && pe.status !== 'SUBMITTED') {
    return { ok: false, error: 'Ce dossier a déjà été traité' };
  }

  // 2) Validation champs
  // Sprint 3 — Les checks de présence des champs (firstName, lastName, email,
  // rgpdAccepted, files non vide) sont désormais couverts par submitInputSchema.
  // Le seul check métier qui reste : signature électronique obligatoire au sens
  // contractuel (la signature peut être vide dans le schéma — c'est la règle
  // métier qui l'exige, pas le format).
  if (!input.signatureBase64) {
    return { ok: false, error: 'La signature électronique est obligatoire pour valider ta demande' };
  }

  // Conversion Date après validation Zod (le schéma valide le format YYYY-MM-DD,
  // mais on doit aussi rejeter les années aberrantes type "275760" → Prisma planterait).
  let parsedBirthDate: Date | null = null;
  if (input.birthDate) {
    const d = new Date(input.birthDate);
    if (isNaN(d.getTime())) {
      return { ok: false, error: 'Date de naissance invalide' };
    }
    const year = d.getUTCFullYear();
    if (year < 1900 || year > new Date().getUTCFullYear()) {
      return { ok: false, error: `Date de naissance hors-bornes (année ${year})` };
    }
    parsedBirthDate = d;
  }

  // 3) Upload des fichiers vers MinIO
  const uploadedKeys: Record<'CNI' | 'RIB' | 'CFP', string | null> = {
    CNI: pe.cniKey,
    RIB: pe.ribKey,
    CFP: pe.cfpKey,
  };

  for (const file of input.files) {
    const buffer = Buffer.from(file.base64, 'base64');
    // Validation server-side : magic-bytes + taille + MIME liste blanche.
    // Le `file.contentType` envoyé par le client est ignoré (jamais fiable).
    const check = validateFileBuffer(buffer, {
      allowed: MIME_BY_KIND[file.kind],
      maxBytes: MAX_FILE_SIZE_MB * 1024 * 1024,
    });
    if (!check.ok) {
      return { ok: false, error: `${file.name} : ${check.error}` };
    }
    const key = buildPreEnrollmentKey(input.token, file.kind.toLowerCase() as 'cni' | 'rib' | 'cfp', file.name);
    try {
      await uploadFile(PREENROLLMENT_BUCKET, key, buffer, check.mime);
      uploadedKeys[file.kind] = key;
    } catch (e) {
      log.error(
        { fileName: file.name, kind: file.kind, err: { message: (e as Error).message } },
        'upload.failed',
      );
      return { ok: false, error: `Échec de l'upload du fichier ${file.name}` };
    }
  }

  // 3-bis) Upload + hash de la signature électronique
  let signatureKey: string | null = pe.signatureKey ?? null;
  let signatureHash: string | null = pe.signatureHash ?? null;
  let signatureSignedAt: Date | null = pe.signatureSignedAt ?? null;
  let signatureIp: string | null = pe.signatureIp ?? null;
  let signatureUserAgent: string | null = pe.signatureUserAgent ?? null;
  if (input.signatureBase64) {
    try {
      const sigBuffer = Buffer.from(input.signatureBase64, 'base64');
      // Validation magic-bytes : la signature DOIT être un vrai PNG (sinon le
      // canvas client a été manipulé). Bornes 200o min / 2 Mo max.
      const sigCheck = validateFileBuffer(sigBuffer, {
        allowed: ['image/png'],
        minBytes: 200,
        maxBytes: 2 * 1024 * 1024,
      });
      if (!sigCheck.ok) {
        return { ok: false, error: `Signature invalide : ${sigCheck.error}` };
      }
      signatureHash = createHash('sha256').update(sigBuffer).digest('hex');
      signatureKey = buildPreEnrollmentKey(input.token, 'signature', 'signature.png');
      await uploadFile(PREENROLLMENT_BUCKET, signatureKey, sigBuffer, sigCheck.mime);
      signatureSignedAt = new Date();
      const h = await headers();
      signatureIp = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null;
      signatureUserAgent = h.get('user-agent') ?? null;
    } catch (e) {
      log.error(
        { err: { message: (e as Error).message } },
        'signature.upload.failed',
      );
      return { ok: false, error: 'Échec de l\'enregistrement de la signature' };
    }
  }

  // 4) Mise à jour de la pré-inscription
  try {
    await prisma.preEnrollment.update({
      where: { id: pe.id },
      data: {
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        email: input.email.trim().toLowerCase(),
        phone: input.phone?.trim() || null,
        birthDate: parsedBirthDate,
        birthPlace: input.birthPlace?.trim() || null,
        professionalStatus: input.professionalStatus?.trim() || null,
        diploma: input.diploma?.trim() || null,
        educationLevel: input.educationLevel?.trim() || null,
        professionalExperience: input.professionalExperience?.trim() || null,
        cniKey: uploadedKeys.CNI,
        ribKey: uploadedKeys.RIB,
        cfpKey: uploadedKeys.CFP,
        signatureKey,
        signatureHash,
        signatureSignedAt,
        signatureIp,
        signatureUserAgent,
        rgpdAcceptedAt: new Date(),
        submittedAt: new Date(),
        status: 'SUBMITTED',
      },
    });
  } catch (e: any) {
    log.error(
      { preEnrollmentId: pe.id, err: { message: e?.message ?? String(e) } },
      'update.failed',
    );
    return { ok: false, error: `Échec de l'enregistrement : ${e?.message ?? 'erreur inconnue'}` };
  }

  revalidatePath('/app/inscriptions');

  // Déclenche l'extraction IA en background (fire-and-forget)
  // L'utilisateur reçoit la confirmation immédiatement, l'IA tourne en parallèle.
  Promise.resolve().then(() =>
    extractPreEnrollmentDocuments(pe.id).catch((err) => {
      log.error(
        { preEnrollmentId: pe.id, err: { message: (err as Error).message } },
        'extraction.failed',
      );
    }),
  );

  return { ok: true };
}

/**
 * Server action manuelle : relancer l'extraction IA pour une pré-inscription.
 * Utile depuis la page admin si la 1ère extraction a échoué ou pour reprocesser.
 */
export async function retriggerExtraction(preEnrollmentId: string): Promise<{ ok: boolean; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };
  const pe = await prisma.preEnrollment.findFirst({
    where: { id: preEnrollmentId, tenantId: user.tenantId },
  });
  if (!pe) return { ok: false, error: 'Pré-inscription introuvable' };
  // Lancement non bloquant
  Promise.resolve().then(() =>
    extractPreEnrollmentDocuments(preEnrollmentId).catch((err) => {
      log.error(
        { preEnrollmentId, err: { message: (err as Error).message } },
        'reextraction.failed',
      );
    }),
  );
  revalidatePath('/app/inscriptions');
  revalidatePath(`/app/inscriptions/${preEnrollmentId}`);
  return { ok: true };
}
