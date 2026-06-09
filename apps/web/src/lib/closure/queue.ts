/**
 * Queue BullMQ "closure-generation" — chaque job génère 1 doc Qualiopi
 * pour 1 participant.
 *
 * Le batch global est traqué dans Postgres (ClosureBatch / ClosureJob).
 * BullMQ gère uniquement le retry + la concurrence côté worker.
 */

import { Queue, type JobsOptions } from 'bullmq';
import { getQueueRedis } from './redis';
import type { ClosureJobPayload } from './types';
import { STANDARD_JOB_POLICY } from '@/lib/bullmq-policies';

export const CLOSURE_QUEUE_NAME = 'closure-generation';

let _queue: Queue<ClosureJobPayload> | null = null;

export function getClosureQueue(): Queue<ClosureJobPayload> {
  if (_queue) return _queue;
  // Sprint 4 — Politique STANDARD partagée (cf lib/bullmq-policies.ts).
  // Avant : attempts=3, backoff=5s, pas d'âge TTL.
  // Après : attempts=5 (Mistral peut throttle), backoff=10s, TTL 7j/30j.
  _queue = new Queue<ClosureJobPayload>(CLOSURE_QUEUE_NAME, {
    connection: getQueueRedis(),
    defaultJobOptions: STANDARD_JOB_POLICY,
  });
  return _queue;
}

export async function enqueueClosureJob(
  payload: ClosureJobPayload,
  opts?: JobsOptions,
): Promise<void> {
  const queue = getClosureQueue();
  await queue.add(`${payload.kind}:${payload.participantId}`, payload, {
    jobId: payload.jobId, // idempotence : si on relance, BullMQ dédoublonne
    ...opts,
  });
}
