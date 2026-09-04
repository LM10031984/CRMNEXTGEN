'use server';

/**
 * Génère une convocation stagiaire pour une inscription (Qualiopi indic 9).
 *
 * BUG-14 — Lettre formelle qui confirme : titre, dates, horaires, lieu,
 * formateur, modalité d'évaluation, contact référent handicap. Doit être
 * envoyée AVANT la formation (process Start Academy, cf. process docx).
 *
 * Pattern : clone-light de convention-generator.ts. Idempotent via hash sha256
 * → si une convocation identique existe déjà pour ce participant, on retourne
 * l'existante.
 */

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { uploadFile, DOCS_BUCKET } from '@/lib/storage';
import { renderHtmlToPdfWeasy } from '@/lib/pdf-render';
import {
  renderConvocationHtml,
  type ConvocationData,
} from '@/lib/convocation-template';
import { loadOfConfig } from '@/lib/of-config';
import { resumeHorairesSession } from '@/lib/sessions/horaires';

const MODALITY_LABELS: Record<string, string> = {
  PRESENTIEL: 'Présentiel',
  DISTANCIEL: 'Distanciel',
  MIXTE: 'Mixte (présentiel + distanciel)',
  ELEARNING: 'E-learning',
};

export async function generateConvocationForParticipant(
  participantId: string,
  options?: { force?: boolean },
): Promise<{ ok: boolean; documentId?: string; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  // Idempotence inconditionnelle : on supprime toujours l'ancien Document du
  // même type avant de recréer (anti-doublons). Le paramètre `force` reste
  // accepté dans la signature pour compat appelants mais ne conditionne plus rien.
  await prisma.document.deleteMany({
    where: { tenantId: user.tenantId, type: 'CONVOCATION', participantId },
  });

  const participant = await prisma.sessionParticipant.findFirst({
    where: { id: participantId, session: { tenantId: user.tenantId } },
    include: {
      person: true,
      session: {
        include: {
          product: { select: { title: true, durationHours: true } },
          location: true,
          trainers: {
            include: { person: { select: { firstName: true, lastName: true } } },
            orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }],
          },
          // Horaires réels — source unique `lib/sessions/horaires.ts`.
          slots: { orderBy: [{ date: 'asc' }, { startTime: 'asc' }] },
        },
      },
    },
  });
  if (!participant) return { ok: false, error: 'Inscription introuvable' };
  if (!participant.session.product) return { ok: false, error: 'Produit manquant' };

  const of = await loadOfConfig(user.tenantId);

  // Adresse stagiaire (depuis Person.personalAddress jsonb)
  const personalAddr = participant.person.personalAddress as
    | { street?: string; postalCode?: string; city?: string }
    | null
    | undefined;
  const stagiaireAddressFull = personalAddr
    ? [personalAddr.street, [personalAddr.postalCode, personalAddr.city].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(', ') || null
    : null;

  // Lieu de formation
  const locAddr = participant.session.location?.address as
    | { street?: string; postalCode?: string; city?: string }
    | null
    | undefined;
  const lieuAddressFull = locAddr
    ? [locAddr.street, [locAddr.postalCode, locAddr.city].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(', ') || null
    : null;

  // Formateur principal (étoile = isPrimary, fallback 1er par ordre stable)
  const primaryTrainer =
    participant.session.trainers.find((t) => t.isPrimary) ??
    participant.session.trainers[0];
  const formateurFullName = primaryTrainer
    ? `${primaryTrainer.person.firstName} ${primaryTrainer.person.lastName}`.trim()
    : null;

  // Horaires : les créneaux planifiés de la session font foi (source unique
  // `lib/sessions/horaires.ts`). Une session hors norme — SES-0111, J1
  // 11h00-13h00 / 14h30-17h30 — recevait sinon une convocation annonçant
  // « 9h00 – 17h00 », soit une convocation fausse au sens Qualiopi ind. 9.
  // Sans créneau (majorité de l'historique) : mention générique d'avant.
  const horaires =
    resumeHorairesSession(participant.session.slots) ??
    '9h00 – 17h00 (pauses café + déjeuner incluses)';

  const data: ConvocationData = {
    stagiairePrenom: participant.person.firstName,
    stagiaireNom: participant.person.lastName,
    stagiaireCivilite:
      participant.person.civility === 'MR' || participant.person.civility === 'MME'
        ? participant.person.civility
        : null,
    stagiaireAddressFull,
    formationTitre: participant.session.name ?? participant.session.product.title,
    formationDuree: participant.session.product.durationHours,
    dateDebut: participant.session.startDate,
    dateFin: participant.session.endDate,
    horaires,
    modaliteText: MODALITY_LABELS[participant.session.modality] ?? participant.session.modality,
    lieuName: participant.session.location?.name ?? null,
    lieuAddressFull,
    formateurFullName,
    evaluationModaliteText:
      'QCM de positionnement en début de formation + QCM final (10 questions, 10 min).',
    signatureDate: new Date(),
  };

  let pdfBuffer: Buffer;
  try {
    const html = renderConvocationHtml(data, of, user.tenantId);
    pdfBuffer = await renderHtmlToPdfWeasy(html);
  } catch (e: any) {
    return { ok: false, error: `Erreur rendu PDF convocation : ${e?.message ?? e}` };
  }

  // Idempotence : si une convocation identique existe déjà → reuse
  const hash = createHash('sha256').update(pdfBuffer).digest('hex');
  const existing = await prisma.document.findFirst({
    where: {
      tenantId: user.tenantId,
      type: 'CONVOCATION',
      participantId,
      hashSha256: hash,
    },
    select: { id: true, pdfUrl: true },
  });
  if (existing) {
    return { ok: true, documentId: existing.id };
  }

  const safePersonSlug = `${participant.person.lastName}-${participant.person.firstName}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const objectKey = `convocations/${participant.session.code}/${safePersonSlug}-${hash.slice(0, 8)}.pdf`;

  try {
    await uploadFile(DOCS_BUCKET, objectKey, pdfBuffer, 'application/pdf');
  } catch (e: any) {
    return { ok: false, error: `Erreur upload MinIO : ${e?.message ?? e}` };
  }

  const document = await prisma.document.create({
    data: {
      tenantId: user.tenantId,
      type: 'CONVOCATION',
      entityType: 'participant',
      entityId: participant.id,
      sessionId: participant.session.id,
      participantId: participant.id,
      pdfUrl: objectKey,
      hashSha256: hash,
    },
  });

  revalidatePath(`/app/sessions/${participant.session.id}`);
  revalidatePath(`/app/apprenants/${participant.person.id}`);
  return { ok: true, documentId: document.id };
}
