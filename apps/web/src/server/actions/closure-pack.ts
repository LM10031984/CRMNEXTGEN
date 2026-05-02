'use server';

import archiver from 'archiver';
import { revalidatePath } from 'next/cache';
import { prisma, type ClosureDocKind } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { downloadFile, DOCS_BUCKET } from '@/lib/storage';
import { CLOSURE_DOC_KINDS, CLOSURE_DOC_KIND_LABELS } from '@/lib/closure/types';
import { enqueueClosureJob } from '@/lib/closure/queue';

/**
 * Lance la génération du pack fin de formation pour TOUS les participants
 * confirmés/présents/préinscrits d'une session.
 *
 * Stratégie :
 *   1. Crée un ClosureBatch (status PENDING)
 *   2. Crée 5 ClosureJob par participant (une par kind)
 *   3. Enqueue chaque job dans BullMQ (le worker prend le relais)
 *
 * On NE relance PAS automatiquement les batches précédents — chaque clic crée
 * un nouveau batch (idempotence via hashSha256 si le doc est déjà identique).
 */
export async function generateClosurePack(
  sessionId: string,
): Promise<{ ok: boolean; batchId?: string; total?: number; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const session = await prisma.trainingSession.findFirst({
    where: { id: sessionId, tenantId: user.tenantId },
    include: {
      participants: {
        where: {
          enrollmentStatus: { in: ['PRE_ENROLLED', 'CONFIRMED', 'ATTENDED'] },
        },
        select: { id: true },
      },
    },
  });
  if (!session) return { ok: false, error: 'Session introuvable' };
  if (session.participants.length === 0) {
    return { ok: false, error: 'Aucun apprenant éligible (statut PRE_ENROLLED/CONFIRMED/ATTENDED)' };
  }

  const totalDocs = session.participants.length * CLOSURE_DOC_KINDS.length;

  const batch = await prisma.closureBatch.create({
    data: {
      tenantId: user.tenantId,
      sessionId,
      status: 'PENDING',
      totalDocs,
      createdByUserId: user.id,
      jobs: {
        create: session.participants.flatMap((p) =>
          CLOSURE_DOC_KINDS.map((kind) => ({
            participantId: p.id,
            kind,
            status: 'QUEUED' as const,
          })),
        ),
      },
    },
    include: { jobs: { select: { id: true, participantId: true, kind: true } } },
  });

  // Enqueue tous les jobs BullMQ
  for (const job of batch.jobs) {
    await enqueueClosureJob({
      jobId: job.id,
      batchId: batch.id,
      tenantId: user.tenantId,
      sessionId,
      participantId: job.participantId,
      kind: job.kind,
    });
  }

  revalidatePath(`/app/sessions/${sessionId}`);
  return { ok: true, batchId: batch.id, total: totalDocs };
}

export interface ClosureBatchStatusJob {
  id: string;
  participantId: string;
  participantName: string;
  kind: ClosureDocKind;
  kindLabel: string;
  status: 'QUEUED' | 'PROCESSING' | 'DONE' | 'ERROR';
  attempts: number;
  errorMessage: string | null;
  documentId: string | null;
  pedagogicalAssetId: string | null;
}

export interface ClosureBatchStatusPayload {
  id: string;
  sessionId: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED';
  totalDocs: number;
  doneDocs: number;
  errorDocs: number;
  startedAt: string | null;
  completedAt: string | null;
  jobs: ClosureBatchStatusJob[];
}

export async function getClosureBatchStatus(
  batchId: string,
): Promise<{ ok: boolean; batch?: ClosureBatchStatusPayload; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const batch = await prisma.closureBatch.findFirst({
    where: { id: batchId, tenantId: user.tenantId },
    include: {
      jobs: {
        orderBy: [{ kind: 'asc' }, { participantId: 'asc' }],
      },
    },
  });
  if (!batch) return { ok: false, error: 'Batch introuvable' };

  // Charge les noms des participants en bulk
  const participantIds = Array.from(new Set(batch.jobs.map((j) => j.participantId)));
  const participants = await prisma.sessionParticipant.findMany({
    where: { id: { in: participantIds } },
    select: { id: true, person: { select: { firstName: true, lastName: true } } },
  });
  const nameById = new Map(
    participants.map((p) => [p.id, `${p.person.firstName} ${p.person.lastName}`.trim()]),
  );

  return {
    ok: true,
    batch: {
      id: batch.id,
      sessionId: batch.sessionId,
      status: batch.status,
      totalDocs: batch.totalDocs,
      doneDocs: batch.doneDocs,
      errorDocs: batch.errorDocs,
      startedAt: batch.startedAt?.toISOString() ?? null,
      completedAt: batch.completedAt?.toISOString() ?? null,
      jobs: batch.jobs.map((j) => ({
        id: j.id,
        participantId: j.participantId,
        participantName: nameById.get(j.participantId) ?? '?',
        kind: j.kind,
        kindLabel: CLOSURE_DOC_KIND_LABELS[j.kind],
        status: j.status,
        attempts: j.attempts,
        errorMessage: j.errorMessage,
        documentId: j.documentId,
        pedagogicalAssetId: j.pedagogicalAssetId,
      })),
    },
  };
}

/**
 * Construit un buffer ZIP en streaming contenant tous les PDFs générés du batch.
 * Les jobs en erreur sont ignorés.
 *
 * Renommé en `pack-fin-formation_<sessionCode>_<date>.zip` côté API route.
 */
export async function buildClosureZipBuffer(
  batchId: string,
): Promise<{ ok: boolean; buffer?: Buffer; filename?: string; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const batch = await prisma.closureBatch.findFirst({
    where: { id: batchId, tenantId: user.tenantId },
    include: {
      jobs: {
        where: { status: 'DONE' },
        include: {
          batch: { select: { sessionId: true } },
        },
      },
    },
  });
  if (!batch) return { ok: false, error: 'Batch introuvable' };
  if (batch.jobs.length === 0) return { ok: false, error: 'Aucun document généré' };

  const session = await prisma.trainingSession.findUnique({
    where: { id: batch.sessionId },
    select: { code: true },
  });
  const sessionCode = session?.code ?? batch.sessionId.slice(0, 8);

  // Récupère les PDFs en parallèle (Documents + PedagogicalAssets)
  const docIds = batch.jobs.map((j) => j.documentId).filter((x): x is string => Boolean(x));
  const assetIds = batch.jobs
    .map((j) => j.pedagogicalAssetId)
    .filter((x): x is string => Boolean(x));

  const [docs, assets, participants] = await Promise.all([
    prisma.document.findMany({
      where: { id: { in: docIds } },
      select: { id: true, pdfUrl: true, type: true, participantId: true },
    }),
    prisma.pedagogicalAsset.findMany({
      where: { id: { in: assetIds } },
      select: { id: true, pdfUrl: true, kind: true, participantId: true },
    }),
    prisma.sessionParticipant.findMany({
      where: { id: { in: Array.from(new Set(batch.jobs.map((j) => j.participantId))) } },
      select: { id: true, person: { select: { firstName: true, lastName: true } } },
    }),
  ]);
  const nameById = new Map(
    participants.map((p) => [
      p.id,
      slugify(`${p.person.lastName}-${p.person.firstName}`),
    ]),
  );
  const docById = new Map(docs.map((d) => [d.id, d]));
  const assetById = new Map(assets.map((a) => [a.id, a]));

  // Build le zip
  const archive = archiver('zip', { zlib: { level: 6 } });
  const chunks: Buffer[] = [];
  archive.on('data', (c: Buffer) => chunks.push(c));
  const finalized = new Promise<void>((resolve, reject) => {
    archive.on('end', () => resolve());
    archive.on('error', (err) => reject(err));
  });

  for (const job of batch.jobs) {
    const slug = nameById.get(job.participantId) ?? job.participantId.slice(0, 8);
    let pdfKey: string | null = null;
    if (job.documentId) pdfKey = docById.get(job.documentId)?.pdfUrl ?? null;
    if (!pdfKey && job.pedagogicalAssetId) pdfKey = assetById.get(job.pedagogicalAssetId)?.pdfUrl ?? null;
    if (!pdfKey) continue;

    try {
      const buf = await downloadFile(DOCS_BUCKET, pdfKey);
      const fname = `${slug}/${job.kind.toLowerCase()}.pdf`;
      archive.append(buf, { name: fname });
    } catch (e) {
      console.error(`[closure-zip] skip ${job.id}: ${(e as Error).message}`);
    }
  }
  archive.finalize();
  await finalized;

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return {
    ok: true,
    buffer: Buffer.concat(chunks),
    filename: `pack-fin-formation_${sessionCode}_${today}.zip`,
  };
}

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

/**
 * Re-enqueue tous les jobs en ERROR du batch. Utile pour la page batch
 * (bouton "Régénérer les erreurs"). Idempotent : un job DONE ou en cours
 * n'est pas touché.
 */
export async function retryClosureBatchErrors(
  batchId: string,
): Promise<{ ok: boolean; relaunched?: number; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const batch = await prisma.closureBatch.findFirst({
    where: { id: batchId, tenantId: user.tenantId },
    include: { jobs: { where: { status: 'ERROR' } } },
  });
  if (!batch) return { ok: false, error: 'Batch introuvable' };
  if (batch.jobs.length === 0) return { ok: true, relaunched: 0 };

  // Reset des compteurs et des jobs en erreur
  await prisma.$transaction([
    prisma.closureJob.updateMany({
      where: { id: { in: batch.jobs.map((j) => j.id) } },
      data: { status: 'QUEUED', errorMessage: null, attempts: 0, startedAt: null, completedAt: null },
    }),
    prisma.closureBatch.update({
      where: { id: batchId },
      data: {
        status: 'RUNNING',
        errorDocs: { decrement: batch.jobs.length },
        completedAt: null,
      },
    }),
  ]);

  for (const job of batch.jobs) {
    await enqueueClosureJob({
      jobId: job.id,
      batchId,
      tenantId: user.tenantId,
      sessionId: batch.sessionId,
      participantId: job.participantId,
      kind: job.kind,
    });
  }

  revalidatePath(`/app/sessions/${batch.sessionId}/closure/${batchId}`);
  return { ok: true, relaunched: batch.jobs.length };
}
