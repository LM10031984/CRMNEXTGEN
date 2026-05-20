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

export const INVOICE_REMINDER_QUEUE_NAME = 'invoice-reminders-daily';

let _queue: Queue | null = null;

export function getInvoiceReminderQueue(): Queue {
  if (_queue) return _queue;
  _queue = new Queue(INVOICE_REMINDER_QUEUE_NAME, {
    connection: getQueueRedis(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 60000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  });
  return _queue;
}
