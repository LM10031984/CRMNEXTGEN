/**
 * Phase 11 Plan 11-06 — Worker BullMQ "invoice-reminders-daily" (FACT-03).
 *
 * Clone-strict du pattern Phase 2.2 `closure/worker.ts` :
 *  - `startInvoiceReminderWorker()` enregistre les listeners completed/failed/error
 *  - `scheduleDailyReminders()` inscrit un job repeatable cron via `getInvoiceReminderQueue()`
 *  - `processReminderJob()` (handler interne, exporté pour testabilité) scan
 *    tous les tenants, pour chaque tenant lit `invoiceReminderDays`, scanne les
 *    factures éligibles (filtre R2 + skip lastReminderAt < 24h + skip niveau
 *    max atteint), puis appelle `sendInvoiceReminder({triggered_by:'cron'})` pour
 *    chaque ligne.
 *
 * D-09 : la server action `sendInvoiceReminder` est partagée cron + manual.
 * D-13b : idempotence 24h appliquée côté worker (defense-in-depth) ET côté action.
 *
 * R2 (RESEARCH §Risques) — MITIGATION CASCADE : `REMINDER_START_DATE` filtre
 * `issueDate >= 2026-05-19` pour éviter une avalanche d'emails sur l'historique
 * au premier démarrage en prod.
 */

import { Worker, type Job } from 'bullmq';
import { prisma } from '@qualiof/db';
import { getWorkerRedis } from '../closure/redis';
import { sendInvoiceReminder } from '@/server/actions/invoices';
import {
  getInvoiceReminderQueue,
  INVOICE_REMINDER_QUEUE_NAME,
} from './queue';

/**
 * R2 (RESEARCH §Risques) — Date de mise en service Phase 11.
 * Le worker ne traite QUE les factures émises à partir de cette date pour
 * éviter une cascade d'emails sur l'historique au premier démarrage.
 */
export const REMINDER_START_DATE = new Date('2026-05-19T00:00:00Z');

interface ReminderJobPayload {
  triggered_by: 'cron' | 'manual_admin_trigger';
}

const REMINDER_DEDUP_MS = 24 * 60 * 60 * 1000;

/**
 * Scan tous les tenants → toutes les factures éligibles → appelle
 * `sendInvoiceReminder({triggered_by:'cron'})` pour chacune.
 * Retourne le nombre de relances effectivement envoyées (ok=true) — utile pour
 * les logs `worker.on('completed')` et pour les tests.
 */
export async function processReminderJob(
  job: Job<ReminderJobPayload>,
): Promise<{ processed: number }> {
  console.log('[invoice-reminder-worker] tick', {
    triggered_by: job.data.triggered_by,
  });

  const tenants = await prisma.tenant.findMany({
    select: { id: true, invoiceReminderDays: true },
  });

  let processed = 0;
  const now = Date.now();

  for (const tenant of tenants) {
    const reminderDays = tenant.invoiceReminderDays ?? [30, 45];
    const maxLevel = reminderDays.length;
    if (maxLevel === 0) continue;
    const minDays = reminderDays[0]!;
    const minOverdueDate = new Date(now - minDays * 24 * 60 * 60 * 1000);

    const invoices = await prisma.invoice.findMany({
      where: {
        tenantId: tenant.id,
        // D-13 auto-stop : on n'attaque jamais PAID/CANCELLED/CREDIT_NOTE/DRAFT
        status: { in: ['ISSUED', 'PARTIAL', 'OVERDUE'] },
        // R2 mitigation cascade : ignore l'historique pré-Phase 11
        issueDate: { gte: REMINDER_START_DATE },
        // Échéance dépassée du premier seuil (sinon trop tôt pour relancer)
        OR: [
          { dueDate: { lte: minOverdueDate } },
          { dueDate: null, issueDate: { lte: minOverdueDate } },
        ],
      },
      select: {
        id: true,
        reminderCount: true,
        lastReminderAt: true,
      },
    });

    for (const inv of invoices) {
      // D-13b idempotence 24h (defense-in-depth — action recheck aussi)
      if (
        inv.lastReminderAt &&
        now - inv.lastReminderAt.getTime() < REMINDER_DEDUP_MS
      ) {
        continue;
      }
      // Niveau max atteint
      if (inv.reminderCount >= maxLevel) continue;

      const result = await sendInvoiceReminder({
        invoiceId: inv.id,
        triggered_by: 'cron',
      });
      if (result.ok) processed += 1;
    }
  }

  console.log('[invoice-reminder-worker] processed', { processed });
  return { processed };
}

export function startInvoiceReminderWorker(): Worker<ReminderJobPayload> {
  const worker = new Worker<ReminderJobPayload>(
    INVOICE_REMINDER_QUEUE_NAME,
    processReminderJob as never,
    {
      connection: getWorkerRedis(),
      concurrency: 1,
    },
  );

  worker.on('completed', (job, result) => {
    console.log('[invoice-reminder-worker] completed', {
      jobId: job.id,
      result,
    });
  });
  worker.on('failed', (job, err) => {
    console.error('[invoice-reminder-worker] failed', {
      jobId: job?.id,
      err: err.message,
    });
  });
  worker.on('error', (err) => {
    console.error('[invoice-reminder-worker] error', err);
  });

  console.log(
    `[invoice-reminder-worker] started (queue="${INVOICE_REMINDER_QUEUE_NAME}")`,
  );
  return worker;
}

/**
 * Inscrit le job repeatable cron daily à 8h00 Europe/Paris.
 * Idempotent grâce au `jobId` fixe `'daily-reminders-cron'` (BullMQ dédoublonne).
 *
 * Doit être appelé au boot du process worker (cf `scripts/invoice-reminder-worker.ts`).
 */
export async function scheduleDailyReminders(): Promise<void> {
  const queue = getInvoiceReminderQueue();
  await queue.add(
    'daily-reminders',
    { triggered_by: 'cron' as const },
    {
      repeat: { pattern: '0 8 * * *', tz: 'Europe/Paris' },
      jobId: 'daily-reminders-cron',
    },
  );
  console.log(
    '[invoice-reminder-worker] daily cron registered (08:00 Europe/Paris)',
  );
}
