'use server';

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { uploadFile, downloadFile, DOCS_BUCKET } from '@/lib/storage';
import { renderHtmlToPdf } from '@/lib/pdf-render';
import { renderProgrammeHtml, type ProgrammeData } from '@/lib/programme-template';

const OF_DEFAULTS = {
  name: 'Start Academy',
  siret: process.env.OF_SIRET ?? '00000000000000',
  address: process.env.OF_ADDRESS ?? '— Adresse à compléter dans .env —',
  rnq: process.env.OF_RNQ ?? '— Numéro de déclaration à compléter —',
  phone: process.env.OF_PHONE ?? '04 00 00 00 00',
  email: process.env.OF_EMAIL ?? 'contact@start-academy.fr',
};

export async function generateProgrammeForParticipant(
  participantId: string,
): Promise<{ ok: boolean; documentId?: string; pdfUrl?: string; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  // 1. Charge le participant + relations
  const participant = await prisma.sessionParticipant.findFirst({
    where: { id: participantId, session: { tenantId: user.tenantId } },
    include: {
      person: true,
      session: {
        include: {
          product: true,
          location: true,
          trainers: { include: { person: true } },
        },
      },
    },
  });
  if (!participant) return { ok: false, error: 'Inscription introuvable' };

  const session = participant.session;
  const product = session.product;

  // 2. Construit le payload
  const objectives = Array.isArray(product.objectives) ? (product.objectives as string[]) : [];
  const lieu = session.location
    ? `${session.location.name}${(session.location.address as any)?.city ? ` — ${(session.location.address as any).city}` : ''}`
    : null;

  const data: ProgrammeData = {
    apprenantPrenom: participant.person.firstName,
    apprenantNom: participant.person.lastName,
    apprenantEmail: participant.person.email,
    sessionCode: session.code,
    sessionName: session.name ?? product.title,
    sessionStartDate: session.startDate,
    sessionEndDate: session.endDate,
    sessionLieu: lieu,
    sessionModalite: session.modality,
    sessionFormateurs: session.trainers.map((t) => `${t.person.firstName} ${t.person.lastName}`),
    produitTitre: product.title,
    produitCode: product.code,
    produitDureeHeures: product.durationHours,
    produitPriceHT: Number(product.priceHT),
    produitObjectifs: objectives,
    produitProgrammeMd: product.programMd ?? '',
    produitPrerequisites: product.prerequisites,
    produitTargetAudience: product.targetAudience,
    produitPedagogicalMethods: product.pedagogicalMethods,
    produitEvaluationMethods: product.evaluationMethods,
    produitAccessibility: product.accessibility,
    produitAccessConditions: product.accessConditions,
    produitTrainerProfile: product.trainerProfile,
    produitPedagogicalSupport: product.pedagogicalSupport,
    ofName: OF_DEFAULTS.name,
    ofSiret: OF_DEFAULTS.siret,
    ofAddress: OF_DEFAULTS.address,
    ofRnq: OF_DEFAULTS.rnq,
    ofPhone: OF_DEFAULTS.phone,
    ofEmail: OF_DEFAULTS.email,
  };

  // 3. Render HTML → PDF
  let pdfBuffer: Buffer;
  try {
    const html = renderProgrammeHtml(data);
    pdfBuffer = await renderHtmlToPdf(html, `programme-${session.code}.html`);
  } catch (e: any) {
    return { ok: false, error: `Erreur génération PDF : ${e?.message ?? e}` };
  }

  // 4. Upload MinIO
  const hash = createHash('sha256').update(pdfBuffer).digest('hex');
  const safePersonSlug = `${participant.person.lastName}-${participant.person.firstName}`
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
  const key = `programmes/${session.code}/${safePersonSlug}-${hash.slice(0, 8)}.pdf`;
  try {
    await uploadFile(DOCS_BUCKET, key, pdfBuffer, 'application/pdf');
  } catch (e: any) {
    return { ok: false, error: `Erreur upload MinIO : ${e?.message ?? e}` };
  }

  // 5. Crée le record Document (idempotent : si même hash existe déjà, on retourne)
  const existing = await prisma.document.findFirst({
    where: { tenantId: user.tenantId, hashSha256: hash, type: 'PROGRAMME' },
  });
  if (existing) {
    return { ok: true, documentId: existing.id, pdfUrl: existing.pdfUrl };
  }

  const doc = await prisma.document.create({
    data: {
      tenantId: user.tenantId,
      type: 'PROGRAMME',
      entityType: 'participant',
      entityId: participantId,
      pdfUrl: key, // clé S3 (pour récupérer via lib/storage.downloadFile)
      hashSha256: hash,
      sessionId: session.id,
      participantId,
    },
  });

  revalidatePath(`/app/sessions/${session.id}`);
  revalidatePath(`/app/apprenants/${participant.person.id}`);

  return { ok: true, documentId: doc.id, pdfUrl: key };
}

/**
 * Stream le PDF d'un Document existant (utilisé par la route /api/documents/[id]).
 */
export async function getDocumentPdfBuffer(documentId: string): Promise<Buffer | null> {
  const { user } = await validateRequest();
  if (!user) return null;
  const doc = await prisma.document.findFirst({
    where: { id: documentId, tenantId: user.tenantId },
  });
  if (!doc) return null;
  return downloadFile(DOCS_BUCKET, doc.pdfUrl);
}
