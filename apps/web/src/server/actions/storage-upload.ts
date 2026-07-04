'use server';

/**
 * Server actions direct-to-storage (Phase 18 STOR-03, côté serveur).
 *
 * Principe : aucun octet de fichier ne transite par une server action. Le
 * navigateur upload DIRECTEMENT vers Supabase via un signed upload URL (contourne
 * le cap 4,5 Mo body Vercel = Pitfall 2/413). Ces actions ne font QUE :
 *   1. générer un signed upload URL scopé (admin par tenant / public par token PE)
 *   2. confirmer l'upload post-facto et recâbler l'OCR (Pitfall 4 : l'OCR ne meurt pas)
 *
 * Le composant client d'upload (progression, retry) vient au plan 18-04.
 * ⚠ upload-apprenant-docs.ts et submitPreEnrollmentForm restent en place jusqu'à
 * la bascule client (plan 04) — ne rien casser.
 */

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { createSignedUploadUrl, DOCS_BUCKET, PREENROLLMENT_BUCKET } from '@/lib/storage';
import { extractPreEnrollmentDocuments } from '@/lib/preinscription-extractor';

export type ApprenantDocKind = 'CNI' | 'RIB' | 'CFP';

/** Extension nettoyée (alphanum only) — reprend upload-apprenant-docs.ts. */
function safeExt(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? 'bin';
  return /^[a-z0-9]+$/.test(ext) ? ext : 'bin';
}

/** Content-type déduit de l'extension — reprend upload-apprenant-docs.ts. */
export function guessContentType(name: string, fallback?: string): string {
  if (fallback && fallback !== 'application/octet-stream') return fallback;
  const ext = safeExt(name);
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  return 'application/octet-stream';
}

// ─── Résultats discriminés (erreurs en FRANÇAIS) ───────────────────
type SignedUploadOk = { ok: true; path: string; token: string; signedUrl: string };
type ActionError = { ok: false; error: string };
type SignedUploadResult = SignedUploadOk | ActionError;

// ─── ADMIN : signed upload URL scopé tenant ────────────────────────
/**
 * Génère un signed upload URL pour un doc apprenant (CNI/RIB/CFP), scopé par
 * user.tenantId. Path : apprenants/{tenantId}/{uuid}/{kind}.{ext}. Le service_role
 * n'est JAMAIS exposé au client — seul le token signé part au navigateur.
 */
export async function createApprenantUploadUrl(
  kind: ApprenantDocKind,
  ext: string,
): Promise<SignedUploadResult> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const folder = randomUUID();
  const path = `apprenants/${user.tenantId}/${folder}/${kind.toLowerCase()}.${safeExt('x.' + ext)}`;
  try {
    const { token, signedUrl } = await createSignedUploadUrl(DOCS_BUCKET, path);
    return { ok: true, path, token, signedUrl };
  } catch (e: any) {
    return { ok: false, error: `Préparation upload échouée : ${e?.message ?? e}` };
  }
}

// ─── PUBLIC : signed upload URL validé par PreEnrollment.token ──────
/**
 * Génère un signed upload URL pour le formulaire PUBLIC /p/[token] : PAS de
 * session Lucia → validation via PreEnrollment.token (jamais validateRequest).
 * Path : {peToken}/{kind}-{stamp}.{ext} dans le bucket preinscriptions.
 */
export async function createPreEnrollmentUploadUrl(
  peToken: string,
  kind: ApprenantDocKind,
  ext: string,
): Promise<SignedUploadResult> {
  const pe = await prisma.preEnrollment.findUnique({ where: { token: peToken } });
  if (!pe) return { ok: false, error: 'Lien invalide' };
  if (pe.expiresAt < new Date()) return { ok: false, error: 'Ce lien a expiré' };

  const stamp = Date.now();
  const path = `${peToken}/${kind.toLowerCase()}-${stamp}.${safeExt('x.' + ext)}`;
  try {
    const { token, signedUrl } = await createSignedUploadUrl(PREENROLLMENT_BUCKET, path);
    return { ok: true, path, token, signedUrl };
  } catch (e: any) {
    return { ok: false, error: `Préparation upload échouée : ${e?.message ?? e}` };
  }
}

// ─── PUBLIC : confirmation post-upload + recâblage OCR ──────────────
interface PreEnrollmentFields {
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
}

/**
 * Confirme un upload direct côté PUBLIC : met à jour la PreEnrollment avec les
 * keys uploadées + les champs texte du formulaire (reprend submitPreEnrollmentForm),
 * PUIS recâble l'OCR (Pitfall 4 : extractPreEnrollmentDocuments fire-and-forget).
 */
export async function confirmPreEnrollmentUpload(
  peToken: string,
  keys: Partial<Record<ApprenantDocKind, string>>,
  fields: PreEnrollmentFields,
): Promise<{ ok: boolean; error?: string }> {
  const pe = await prisma.preEnrollment.findUnique({ where: { token: peToken } });
  if (!pe) return { ok: false, error: 'Lien invalide' };
  if (pe.expiresAt < new Date()) return { ok: false, error: 'Ce lien a expiré' };
  if (pe.status !== 'PENDING_FORM' && pe.status !== 'SUBMITTED') {
    return { ok: false, error: 'Ce dossier a déjà été traité' };
  }

  if (!fields.firstName?.trim() || !fields.lastName?.trim() || !fields.email?.trim()) {
    return { ok: false, error: 'Nom, prénom et email sont obligatoires' };
  }
  if (!fields.rgpdAccepted) {
    return { ok: false, error: 'Tu dois accepter le traitement RGPD pour continuer' };
  }

  await prisma.preEnrollment.update({
    where: { id: pe.id },
    data: {
      firstName: fields.firstName.trim(),
      lastName: fields.lastName.trim(),
      email: fields.email.trim().toLowerCase(),
      phone: fields.phone?.trim() || null,
      birthDate: fields.birthDate ? new Date(fields.birthDate) : null,
      birthPlace: fields.birthPlace?.trim() || null,
      professionalStatus: fields.professionalStatus?.trim() || null,
      diploma: fields.diploma?.trim() || null,
      educationLevel: fields.educationLevel?.trim() || null,
      professionalExperience: fields.professionalExperience?.trim() || null,
      cniKey: keys.CNI ?? pe.cniKey,
      ribKey: keys.RIB ?? pe.ribKey,
      cfpKey: keys.CFP ?? pe.cfpKey,
      rgpdAcceptedAt: new Date(),
      submittedAt: new Date(),
      status: 'SUBMITTED',
    },
  });

  revalidatePath('/app/inscriptions');

  // Recâblage OCR (Pitfall 4) : fire-and-forget, l'utilisateur a déjà sa confirmation.
  Promise.resolve().then(() =>
    extractPreEnrollmentDocuments(pe.id).catch((err) =>
      console.error('Extraction IA échouée pour', pe.id, err),
    ),
  );

  return { ok: true };
}

// ─── ADMIN : confirmation (retourne les keys pour le wizard) ───────
/**
 * Confirme un upload direct côté ADMIN : retourne simplement les keys au wizard,
 * qui les persiste et déclenche son extraction (extractDocsFromBuffers) comme
 * aujourd'hui — pas de régression du contrat wizard.
 */
export async function confirmApprenantUpload(
  keys: Partial<Record<ApprenantDocKind, string>>,
): Promise<{ ok: true; keys: Partial<Record<ApprenantDocKind, string>> } | ActionError> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };
  return { ok: true, keys };
}

// ─── Downscale avant vision OCR (Pitfall 3) ────────────────────────
const OCR_DOWNSCALE_THRESHOLD = 4 * 1024 * 1024; // 4 Mo

/**
 * Réduit une image trop lourde AVANT de l'envoyer à la vision OCR (Pitfall 3 :
 * photo smartphone 10-50 Mo → échec vision silencieux). Décision RESEARCH Open Q2 :
 * sharp ajouté (le NO-OP risquait l'échec OCR silencieux, critère de succès #3).
 *
 * - Non-image ou < seuil → renvoie le buffer tel quel.
 * - Image ≥ seuil → resize width 2000 (withoutEnlargement) + jpeg qualité 80.
 * - sharp échoue (format exotique, native binding) → fallback buffer original.
 *
 * sharp importé dynamiquement pour ne pas charger la native lib au load du module
 * (server actions collectées au build) ni dans les tests hermétiques.
 */
export async function downscaleForOcr(buffer: Buffer, contentType: string): Promise<Buffer> {
  if (!contentType.startsWith('image/')) return buffer;
  if (buffer.length <= OCR_DOWNSCALE_THRESHOLD) return buffer;
  try {
    const sharp = (await import('sharp')).default;
    return await sharp(buffer)
      .resize({ width: 2000, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch (e) {
    // Fallback : mieux vaut tenter la vision sur l'original que perdre le doc.
    console.error('downscaleForOcr : sharp a échoué, fallback buffer original', e);
    return buffer;
  }
}
