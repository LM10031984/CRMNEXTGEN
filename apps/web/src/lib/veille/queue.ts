/**
 * Phase 13 Plan 13-05 — BullMQ Queue + cron hebdo veille.
 *
 * Clone-strict pattern Phase 11 `invoice-reminders/queue.ts` + `worker.ts:scheduleDailyReminders`.
 *
 * Cron pattern figé (D-01) : `'0 8 * * 1'` (lundi 8h) tz `'Europe/Paris'`,
 * jobId fixe `'weekly-veille-cron'` (idempotence native BullMQ — relance du
 * worker ne crée pas de doublon).
 *
 * Worker safety : 0 import server-action / rbac / React.
 */

import { Queue } from 'bullmq';
import { getQueueRedis } from '../closure/redis';

export const VEILLE_QUEUE_NAME = 'veille';

export interface VeilleJobPayload {
  triggered_by: 'cron' | 'manual';
}

let _queue: Queue<VeilleJobPayload> | null = null;

export function getVeilleQueue(): Queue<VeilleJobPayload> {
  if (_queue) return _queue;
  _queue = new Queue<VeilleJobPayload>(VEILLE_QUEUE_NAME, {
    connection: getQueueRedis(),
    defaultJobOptions: {
      attempts: 2, // 1 retry — Ollama / RSS instables, mais inutile de spammer
      backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: { count: 20 },
      removeOnFail: { count: 50 },
    },
  });
  return _queue;
}

/**
 * Inscrit le job repeatable cron hebdo (lundi 8h Europe/Paris).
 * Idempotent grâce au `jobId` fixe (BullMQ dédoublonne en interne).
 *
 * Doit être appelé au boot du process worker
 * (cf `scripts/veille-worker.ts`).
 */
export async function scheduleWeeklyVeille(): Promise<void> {
  const queue = getVeilleQueue();
  await queue.add(
    'weekly-veille',
    { triggered_by: 'cron' as const },
    {
      repeat: { pattern: '0 8 * * 1', tz: 'Europe/Paris' },
      jobId: 'weekly-veille-cron',
    },
  );
  console.log(
    '[veille] weekly cron registered (lundi 08:00 Europe/Paris, jobId=weekly-veille-cron)',
  );
}
