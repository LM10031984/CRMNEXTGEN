/**
 * Reprise des ClosureJob orphelins — logique partagée entre le script CLI
 * `requeue-stuck-closure-jobs.ts` et le DÉMARRAGE du worker.
 *
 * Symptôme : un `ClosureJob` reste `QUEUED`/`PROCESSING` en base mais n'est plus
 * dans la queue BullMQ (worker tué : Ollama timeout, kill -9, reboot Mac). Le doc
 * n'est alors jamais produit → l'utilisateur doit le relancer à la main.
 *
 * Reprise (appelée à chaque (re)démarrage du worker) :
 *   1. `PROCESSING` depuis > staleMinutes → marqués `ERROR` (worker abandonné).
 *   2. `QUEUED` orphelins → ré-enfilés dans BullMQ avec leur jobId existant
 *      (idempotent : BullMQ dédoublonne par jobId, pas de doublon en queue).
 *
 * ⚠️ WORKER-SAFE : n'importe que @qualiof/db + la queue (aucun auth/react).
 */

import { prisma } from '@qualiof/db';
import { enqueueClosureJob } from './queue';

export const STUCK_PROCESSING_MINUTES = 15;

export interface RequeueResult {
  markedError: number;
  requeued: number;
}

export async function requeueStuckClosureJobs(opts?: {
  sessionId?: string;
  staleMinutes?: number;
  now?: Date;
}): Promise<RequeueResult> {
  const staleMinutes = opts?.staleMinutes ?? STUCK_PROCESSING_MINUTES;
  const now = opts?.now ?? new Date();
  const batchFilter = opts?.sessionId ? { batch: { sessionId: opts.sessionId } } : {};

  // 1. PROCESSING périmés → ERROR.
  const cutoff = new Date(now.getTime() - staleMinutes * 60 * 1000);
  const stuckProcessing = await prisma.closureJob.findMany({
    where: { status: 'PROCESSING', startedAt: { lt: cutoff }, ...batchFilter },
    select: { id: true },
  });
  if (stuckProcessing.length > 0) {
    await prisma.closureJob.updateMany({
      where: { id: { in: stuckProcessing.map((j) => j.id) } },
      data: {
        status: 'ERROR',
        errorMessage: `Worker stalled (>${staleMinutes}min en PROCESSING) — auto-reset au démarrage du worker`,
        completedAt: now,
      },
    });
  }

  // 2. QUEUED orphelins → re-enqueue.
  const queued = await prisma.closureJob.findMany({
    where: { status: 'QUEUED', ...batchFilter },
    select: {
      id: true,
      kind: true,
      participantId: true,
      batchId: true,
      batch: { select: { tenantId: true, sessionId: true } },
    },
  });
  for (const j of queued) {
    await enqueueClosureJob({
      jobId: j.id,
      batchId: j.batchId,
      tenantId: j.batch.tenantId,
      sessionId: j.batch.sessionId,
      participantId: j.participantId,
      kind: j.kind,
    });
  }

  return { markedError: stuckProcessing.length, requeued: queued.length };
}
