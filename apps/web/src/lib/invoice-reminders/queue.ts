/**
 * Phase 11 Plan 11-06 — Queue BullMQ "invoice-reminders-daily".
 *
 * Clone-strict du pattern Phase 2.2 `closure/queue.ts` : singleton + connection
 * partagée via `getQueueRedis()` (cf `closure/redis.ts`). 1 seul "job" répétable
 * inscrit via `scheduleDailyReminders()` (worker.ts) avec cron `'0 8 * * *'` tz
 * Europe/Paris + jobId fixe `daily-reminders-cron` (idempotence native BullMQ).
 */

import { Queue } from 'bullmq';
import { getQueueRedis } from '../closure/redis';
import { SLOW_JOB_POLICY } from '@/lib/bullmq-policies';

export const INVOICE_REMINDER_QUEUE_NAME = 'invoice-reminders-daily';

let _queue: Queue | null = null;

export function getInvoiceReminderQueue(): Queue {
  if (_queue) return _queue;
  // Sprint 4 — Politique SLOW partagée (cron quotidien, retry espacé).
  // Avant : pas d'âge TTL sur removeOnComplete/Fail.
  // Après : TTL 1j (complétés) / 7j (échoués) pour éviter l'accumulation.
  _queue = new Queue(INVOICE_REMINDER_QUEUE_NAME, {
    connection: getQueueRedis(),
    defaultJobOptions: SLOW_JOB_POLICY,
  });
  return _queue;
}
