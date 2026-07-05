/**
 * Phase 11 Plan 11-06 → Phase 20 Plan 20-01 — Entry-point cron relances (croner).
 *
 * WORK-02 (D-03 « Redis viré partout ») : plus de BullMQ ni de Redis. La
 * planification quotidienne (8h Europe/Paris) renaît du code au boot du process
 * via `croner` (timezone via Intl → DST Europe/Paris correct ; `catch` intégré →
 * une erreur d'exécution n'arrête pas le process). Le process reste vivant grâce
 * au cron enregistré (plus de keepalive artificiel).
 *
 * Lancé via :
 *   pnpm --filter @qualiof/web worker:reminders
 *
 * En conteneur (plan 20-04) : lancé par pm2 (pas par ce script pnpm).
 */

import '@qualiof/shared/env'; // fail-loud au boot (parité closure-worker-postgres.ts)
import { Cron } from 'croner';
import { processReminderJob } from '../src/lib/invoice-reminders/worker';

// Quotidien 8h Europe/Paris (remplace repeat { pattern:'0 8 * * *', tz:'Europe/Paris' } BullMQ)
const job = new Cron(
  '0 8 * * *',
  {
    name: 'invoice-reminders',
    timezone: 'Europe/Paris',
    catch: (e: unknown) =>
      console.error('[invoice-reminder-worker] cron error', e),
  },
  async () => {
    await processReminderJob({ triggered_by: 'cron' });
  },
);
console.log(
  '[invoice-reminder-worker] croner registered (quotidien 08:00 Europe/Paris), next:',
  job.nextRun(),
);

const shutdown = (signal: string) => {
  console.log(`[invoice-reminder-worker] received ${signal}, stopping cron…`);
  job.stop();
  process.exit(0);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
