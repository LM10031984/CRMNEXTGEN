/**
 * Phase 11 Plan 11-06 — Entry-point du worker BullMQ "invoice-reminders-daily".
 *
 * Lancé via :
 *   pnpm --filter @qualiof/web worker:reminders
 *
 * Process indépendant de Next.js. À garder ouvert pendant le dev pour que
 * le job repeatable cron daily (8h00 Europe/Paris) soit déclenché et que les
 * factures éligibles soient relancées automatiquement.
 *
 * En prod : tourne en service systemd / pm2 / docker — même pattern que
 * `closure-worker.ts` Phase 2.2.
 *
 * Mode dégradé Redis : si Redis n'est pas joignable au boot (CI/test sans
 * docker), on log un warning + keepalive setInterval pour ne pas faire planter
 * concurrently (cf `pnpm dev:full`).
 */

import {
  startInvoiceReminderWorker,
  scheduleDailyReminders,
} from '../src/lib/invoice-reminders/worker';

async function main() {
  try {
    const worker = startInvoiceReminderWorker();
    await scheduleDailyReminders();

    const shutdown = async (signal: string) => {
      console.log(
        `[invoice-reminder-worker] received ${signal}, shutting down…`,
      );
      await worker.close();
      process.exit(0);
    };

    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
  } catch (e) {
    console.warn(
      '[invoice-reminder-worker] Redis indisponible — worker désactivé en mode dégradé.',
      e,
    );
    // Keepalive pour ne pas faire planter concurrently
    setInterval(() => {}, 60_000);
  }
}

void main();
