'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { uploadFile, PREENROLLMENT_BUCKET } from '@/lib/storage';
import { extractPreEnrollmentDocuments } from '@/lib/preinscription-extractor';
import { validateFileBuffer, type AllowedMime } from '@/lib/file-validation';
import { buildPreEnrollmentKey } from '@/lib/storage-key';
import { checkRateLimit, RateLimitProfile } from '@/lib/rate-limit';

interface SubmitInput {
  token: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  birthDate?: string;
  birthPlace?: string;
  professionalStatus?: string;
  diploma?: string;
  educationLevel?: string;
  professionalExperience?: string;
  rgpdAccepted: boolean;
  files: Array<{
    kind: 'CNI' | 'RIB' | 'CFP';
    name: string;
    contentType: string;
    base64: string; // contenu encodé base64
  }>;
}

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
  input: SubmitInput,
): Promise<{ ok: boolean; error?: string }> {
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
  if (!input.firstName?.trim() || !input.lastName?.trim() || !input.email?.trim()) {
    return { ok: false, error: 'Nom, prénom et email sont obligatoires' };
  }
  if (!input.rgpdAccepted) {
    return { ok: false, error: 'Tu dois accepter le traitement RGPD pour continuer' };
  }
  if (input.files.length === 0) {
    return { ok: false, error: 'Au moins une pièce justificative est requise' };
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
      console.error('Upload error', e);
      return { ok: false, error: `Échec de l'upload du fichier ${file.name}` };
    }
  }

  // 4) Mise à jour de la pré-inscription
  await prisma.preEnrollment.update({
    where: { id: pe.id },
    data: {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone?.trim() || null,
      birthDate: input.birthDate ? new Date(input.birthDate) : null,
      birthPlace: input.birthPlace?.trim() || null,
      professionalStatus: input.professionalStatus?.trim() || null,
      diploma: input.diploma?.trim() || null,
      educationLevel: input.educationLevel?.trim() || null,
      professionalExperience: input.professionalExperience?.trim() || null,
      cniKey: uploadedKeys.CNI,
      ribKey: uploadedKeys.RIB,
      cfpKey: uploadedKeys.CFP,
      rgpdAcceptedAt: new Date(),
      submittedAt: new Date(),
      status: 'SUBMITTED',
    },
  });

  revalidatePath('/app/inscriptions');

  // Déclenche l'extraction IA en background (fire-and-forget)
  // L'utilisateur reçoit la confirmation immédiatement, l'IA tourne en parallèle.
  Promise.resolve().then(() =>
    extractPreEnrollmentDocuments(pe.id).catch((err) => {
      console.error('Extraction IA échouée pour', pe.id, err);
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
      console.error('Re-extraction échouée', err);
    }),
  );
  revalidatePath('/app/inscriptions');
  revalidatePath(`/app/inscriptions/${preEnrollmentId}`);
  return { ok: true };
}
