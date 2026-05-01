/**
 * Worker BullMQ "closure-generation".
 *
 * Lancé via `pnpm --filter @qualiof/web worker:closure` (script séparé).
 * Process indépendant de Next.js — robuste aux redémarrages SSR.
 *
 * Responsabilités :
 *   1. Charger les données nécessaires (participant + session + product)
 *   2. Appeler le renderer (mock pour Day 1, réel à partir de Day 2)
 *   3. Uploader le PDF dans MinIO
 *   4. Créer Document (ATTESTATION, CERTIFICAT) ou PedagogicalAsset
 *      (QCM, GRILLE_OBS, ANALYSE_BESOIN)
 *   5. Mettre à jour ClosureJob + ClosureBatch (compteurs, status)
 */

import { createHash } from 'node:crypto';
import { Worker, type Job } from 'bullmq';
import { prisma, type ClosureDocKind, type DocType, type PedagogicalKind } from '@qualiof/db';
import { uploadFile, DOCS_BUCKET } from '@/lib/storage';
import { getWorkerRedis } from './redis';
import { CLOSURE_QUEUE_NAME } from './queue';
import { renderClosureDoc } from './renderer';
import type { ClosureContext } from './shared-template';
import type { ClosureJobPayload } from './types';

const CONCURRENCY = Number(process.env.CLOSURE_WORKER_CONCURRENCY ?? 5);

// Mapping kind → DocType pour les documents écrits dans `Document`
const DOC_TYPE_BY_KIND: Partial<Record<ClosureDocKind, DocType>> = {
  ATTESTATION: 'ATTESTATION_FIN',
  CERTIFICAT: 'CERTIFICAT_REALISATION',
};

// Mapping kind → PedagogicalKind pour les actifs écrits dans `PedagogicalAsset`
const PEDAGOGICAL_KIND_BY_KIND: Partial<Record<ClosureDocKind, PedagogicalKind>> = {
  QCM: 'QCM',
  GRILLE_OBS: 'GRILLE_OBS',
  ANALYSE_BESOIN: 'ANALYSE_BESOIN',
};

export function startClosureWorker(): Worker<ClosureJobPayload> {
  const worker = new Worker<ClosureJobPayload>(
    CLOSURE_QUEUE_NAME,
    async (job) => processClosureJob(job),
    {
      connection: getWorkerRedis(),
      concurrency: CONCURRENCY,
    },
  );

  worker.on('completed', (job) => {
    console.log(`[closure-worker] ✓ ${job.id} (${job.data.kind} for ${job.data.participantId})`);
  });
  worker.on('failed', (job, err) => {
    console.error(`[closure-worker] ✗ ${job?.id} — ${err.message}`);
  });
  worker.on('error', (err) => {
    console.error('[closure-worker] error:', err);
  });

  console.log(`[closure-worker] started (concurrency=${CONCURRENCY}, queue="${CLOSURE_QUEUE_NAME}")`);
  return worker;
}

async function processClosureJob(job: Job<ClosureJobPayload>): Promise<void> {
  const payload = job.data;

  // 1. Marque le job en PROCESSING dans Postgres
  await prisma.closureJob.update({
    where: { id: payload.jobId },
    data: {
      status: 'PROCESSING',
      attempts: { increment: 1 },
      startedAt: new Date(),
      errorMessage: null,
    },
  });
  await markBatchRunningIfNeeded(payload.batchId);

  try {
    // 2. Charge les données nécessaires au render (participant + session + product + location + trainers)
    const participant = await prisma.sessionParticipant.findFirst({
      where: { id: payload.participantId, session: { tenantId: payload.tenantId } },
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
    if (!participant) throw new Error(`Inscription introuvable : ${payload.participantId}`);

    const session = participant.session;
    const product = session.product;
    const sessionLocation = session.location
      ? `${session.location.name}${(session.location.address as { city?: string } | null)?.city ? ` — ${(session.location.address as { city?: string }).city}` : ''}`
      : null;

    const ctx: ClosureContext = {
      apprenantPrenom: participant.person.firstName,
      apprenantNom: participant.person.lastName,
      apprenantCivility: participant.person.civility ?? null,
      sessionCode: session.code,
      sessionTitle: product.title,
      sessionStartDate: session.startDate,
      sessionEndDate: session.endDate,
      sessionLocation,
      sessionTrainers: session.trainers.map((t) => `${t.person.firstName} ${t.person.lastName}`.trim()),
      durationHours: product.durationHours,
    };

    // 3. Render PDF via le dispatch real (Day 2 avec stubs IA, Day 3 avec Ollama)
    const { pdfBuffer, rawJson } = await renderClosureDoc(payload.kind, ctx);

    // 4. Upload MinIO
    const hash = createHash('sha256').update(pdfBuffer).digest('hex');
    const safePersonSlug = `${participant.person.lastName}-${participant.person.firstName}`
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9-]/g, '-')
      .toLowerCase();
    const key = `closure/${participant.session.code}/${payload.batchId.slice(0, 8)}/${safePersonSlug}-${payload.kind.toLowerCase()}-${hash.slice(0, 8)}.pdf`;
    await uploadFile(DOCS_BUCKET, key, pdfBuffer, 'application/pdf');

    // 5a. Si ATTESTATION/CERTIFICAT → Document
    let documentId: string | null = null;
    let pedagogicalAssetId: string | null = null;

    const docType = DOC_TYPE_BY_KIND[payload.kind];
    if (docType) {
      const doc = await prisma.document.create({
        data: {
          tenantId: payload.tenantId,
          type: docType,
          entityType: 'participant',
          entityId: payload.participantId,
          pdfUrl: key,
          hashSha256: hash,
          sessionId: payload.sessionId,
          participantId: payload.participantId,
        },
      });
      documentId = doc.id;
    }

    // 5b. Si QCM/GRILLE_OBS/ANALYSE_BESOIN → PedagogicalAsset (upsert : 1 par session+participant+kind)
    const pedKind = PEDAGOGICAL_KIND_BY_KIND[payload.kind];
    if (pedKind) {
      const asset = await prisma.pedagogicalAsset.upsert({
        where: {
          sessionId_participantId_kind: {
            sessionId: payload.sessionId,
            participantId: payload.participantId,
            kind: pedKind,
          },
        },
        update: {
          rawJson: (rawJson ?? {}) as object,
          pdfUrl: key,
          hashSha256: hash,
          generatedAt: new Date(),
        },
        create: {
          tenantId: payload.tenantId,
          sessionId: payload.sessionId,
          participantId: payload.participantId,
          kind: pedKind,
          rawJson: (rawJson ?? {}) as object,
          pdfUrl: key,
          hashSha256: hash,
        },
      });
      pedagogicalAssetId = asset.id;
    }

    // 6. Marque le job DONE + incrémente le batch
    await prisma.closureJob.update({
      where: { id: payload.jobId },
      data: {
        status: 'DONE',
        completedAt: new Date(),
        documentId,
        pedagogicalAssetId,
        errorMessage: null,
      },
    });
    await prisma.closureBatch.update({
      where: { id: payload.batchId },
      data: { doneDocs: { increment: 1 } },
    });
    await finalizeBatchIfDone(payload.batchId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Si BullMQ va retry, on garde le job en PROCESSING (pas ERROR définitif)
    const isFinalAttempt = (job.attemptsMade + 1) >= (job.opts.attempts ?? 1);
    await prisma.closureJob.update({
      where: { id: payload.jobId },
      data: {
        status: isFinalAttempt ? 'ERROR' : 'QUEUED',
        errorMessage: msg.slice(0, 500),
      },
    });
    if (isFinalAttempt) {
      await prisma.closureBatch.update({
        where: { id: payload.batchId },
        data: { errorDocs: { increment: 1 } },
      });
      await finalizeBatchIfDone(payload.batchId);
    }
    throw err; // BullMQ doit voir l'erreur pour gérer retry
  }
}

async function markBatchRunningIfNeeded(batchId: string): Promise<void> {
  await prisma.closureBatch.updateMany({
    where: { id: batchId, status: 'PENDING' },
    data: { status: 'RUNNING', startedAt: new Date() },
  });
}

async function finalizeBatchIfDone(batchId: string): Promise<void> {
  const batch = await prisma.closureBatch.findUnique({ where: { id: batchId } });
  if (!batch) return;
  const handled = batch.doneDocs + batch.errorDocs;
  if (handled < batch.totalDocs) return;

  let nextStatus: 'COMPLETED' | 'PARTIAL' | 'FAILED';
  if (batch.errorDocs === 0) nextStatus = 'COMPLETED';
  else if (batch.doneDocs === 0) nextStatus = 'FAILED';
  else nextStatus = 'PARTIAL';

  await prisma.closureBatch.update({
    where: { id: batchId },
    data: { status: nextStatus, completedAt: new Date() },
  });
}
