'use server';

/**
 * Actions PUBLIQUES du formulaire d'inscription par session.
 *
 * Aucune session Lucia : l'autorisation vient du `publicToken` porté par la
 * session de formation — jamais de `validateRequest()` ici.
 *
 * Rien n'est écrit en base avant la soumission : les pièces montent d'abord
 * sous un `draftId` généré par le navigateur. C'est ce qui évite qu'un lien
 * diffusé largement remplisse la table de dossiers vides (défaut de
 * /preinscription, qui crée une ligne à chaque visite).
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { createSignedUploadUrl, PREENROLLMENT_BUCKET } from '@/lib/storage';
import { publicLinkState, generatePublicToken } from '@/lib/enrollment/public-link';

export type EnrollmentDocKind = 'CNI' | 'RIB' | 'CFP';

const EXTENSIONS_AUTORISEES = new Set(['pdf', 'jpg', 'jpeg', 'png']);
const DRAFT_ID_VALIDE = /^[0-9a-zA-Z-]{8,64}$/;

/** Statuts d'une demande qui occupe encore une place dans la session. */
const STATUTS_EN_COURS = ['SUBMITTED', 'EXTRACTING', 'EXTRACTED', 'VALIDATED'] as const;

type ActionError = { ok: false; error: string };
type SignedUploadOk = { ok: true; path: string; token: string; signedUrl: string };

export interface SessionEnrollmentFields {
  firstName: string;
  lastName: string;
  birthName?: string;
  email: string;
  phone?: string;
  birthDate?: string;
  birthPlace?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  /** Transporté, JAMAIS persisté ici — cf. minimisation RGPD (spec §4.2). */
  socialSecurityNb?: string;
  educationLevel?: string;
  managerSince?: string;
  companyName?: string;
  companySiret?: string;
  professionalStatus?: string;
  rgpdAccepted: boolean;
}

type SessionOuverte = {
  id: string;
  tenantId: string;
  publicToken: string | null;
  publicFormClosedAt: Date | null;
  status: string;
  capacityMax: number;
  endDate: Date;
};

/**
 * Charge la session par jeton et calcule si le formulaire accepte encore des
 * dépôts. Retour discriminé sur `ok` : `'erreur' in r` ne suffirait pas à
 * restreindre le type, TypeScript gardant `string | undefined`.
 */
async function chargerSessionOuverte(
  publicToken: string,
): Promise<{ ok: false; erreur: string } | { ok: true; session: SessionOuverte }> {
  const session = await prisma.trainingSession.findUnique({
    where: { publicToken },
    select: {
      id: true,
      tenantId: true,
      publicToken: true,
      publicFormClosedAt: true,
      status: true,
      capacityMax: true,
      endDate: true,
    },
  });
  if (!session) return { ok: false, erreur: 'Lien invalide' };

  const [participantCount, pendingRequestCount] = await Promise.all([
    prisma.sessionParticipant.count({ where: { sessionId: session.id } }),
    prisma.preEnrollment.count({
      where: { intendedSessionId: session.id, status: { in: [...STATUTS_EN_COURS] } },
    }),
  ]);

  const etat = publicLinkState({
    publicToken: session.publicToken,
    publicFormClosedAt: session.publicFormClosedAt,
    sessionStatus: session.status,
    capacityMax: session.capacityMax,
    participantCount,
    pendingRequestCount,
  });

  if (etat === 'complet') return { ok: false, erreur: 'Cette session est complète' };
  if (etat !== 'ouvert') return { ok: false, erreur: 'Les inscriptions sont closes' };
  return { ok: true, session };
}

export async function createSessionEnrollmentUploadUrl(
  publicToken: string,
  draftId: string,
  kind: EnrollmentDocKind,
  ext: string,
): Promise<SignedUploadOk | ActionError> {
  if (!DRAFT_ID_VALIDE.test(draftId)) {
    return { ok: false, error: 'Identifiant de dépôt invalide' };
  }
  const extension = ext.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!EXTENSIONS_AUTORISEES.has(extension)) {
    return { ok: false, error: 'Format accepté : PDF, JPG ou PNG' };
  }

  const r = await chargerSessionOuverte(publicToken);
  if (!r.ok) return { ok: false, error: r.erreur };

  const path = `sessions/${r.session.id}/${draftId}/${kind.toLowerCase()}-${Date.now()}.${extension}`;
  try {
    const { token, signedUrl } = await createSignedUploadUrl(PREENROLLMENT_BUCKET, path);
    return { ok: true, path, token, signedUrl };
  } catch (e: any) {
    console.error('[inscription] signed upload URL échoué', e);
    return { ok: false, error: `Préparation de l'envoi échouée : ${e?.message ?? e}` };
  }
}

export async function submitSessionEnrollmentRequest(
  publicToken: string,
  draftId: string,
  keys: Partial<Record<EnrollmentDocKind, string>>,
  fields: SessionEnrollmentFields,
): Promise<{ ok: true } | ActionError> {
  if (!DRAFT_ID_VALIDE.test(draftId)) {
    return { ok: false, error: 'Identifiant de dépôt invalide' };
  }
  if (!fields.firstName?.trim() || !fields.lastName?.trim() || !fields.email?.trim()) {
    return { ok: false, error: 'Nom, prénom et email sont obligatoires' };
  }
  if (!fields.rgpdAccepted) {
    return { ok: false, error: 'Tu dois accepter le traitement de tes données pour continuer' };
  }
  if (Object.keys(keys).length === 0) {
    return { ok: false, error: 'Au moins une pièce justificative est requise' };
  }

  const r = await chargerSessionOuverte(publicToken);
  if (!r.ok) return { ok: false, error: r.erreur };
  const { session } = r;

  // Les données du formulaire, SANS le numéro de sécurité sociale : il n'est
  // écrit qu'à la validation, directement dans SensitiveData (spec §4.2).
  const donnees = {
    firstName: fields.firstName.trim(),
    lastName: fields.lastName.trim(),
    birthName: fields.birthName?.trim() || null,
    email: fields.email.trim().toLowerCase(),
    phone: fields.phone?.trim() || null,
    birthDate: fields.birthDate ? new Date(fields.birthDate) : null,
    birthPlace: fields.birthPlace?.trim() || null,
    address: fields.address?.trim() || null,
    city: fields.city?.trim() || null,
    postalCode: fields.postalCode?.trim() || null,
    educationLevel: fields.educationLevel?.trim() || null,
    managerSince: fields.managerSince?.trim() || null,
    companyName: fields.companyName?.trim() || null,
    companySiret: fields.companySiret?.replace(/\D/g, '') || null,
    professionalStatus: fields.professionalStatus?.trim() || null,
    cniKey: keys.CNI ?? null,
    ribKey: keys.RIB ?? null,
    cfpKey: keys.CFP ?? null,
    rgpdAcceptedAt: new Date(),
    submittedAt: new Date(),
    status: 'SUBMITTED' as const,
  };

  // Idempotence : le même brouillon renvoyé (double clic, reprise réseau) met
  // à jour la demande existante au lieu d'en créer une seconde.
  const existante = await prisma.preEnrollment.findFirst({
    where: {
      intendedSessionId: session.id,
      extractedData: { path: ['draftId'], equals: draftId },
    },
    select: { id: true },
  });

  if (existante) {
    await prisma.preEnrollment.update({ where: { id: existante.id }, data: donnees });
  } else {
    const expiresAt = new Date(session.endDate);
    expiresAt.setDate(expiresAt.getDate() + 30);
    await prisma.preEnrollment.create({
      data: {
        ...donnees,
        tenantId: session.tenantId,
        token: generatePublicToken(),
        expiresAt,
        intendedSessionId: session.id,
        extractedData: { draftId },
      },
    });
  }

  revalidatePath('/app/inscriptions');
  revalidatePath(`/app/sessions/${session.id}`);
  return { ok: true };
}
