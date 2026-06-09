/**
 * Phase 13 Plan 13-05 — Entry-point du worker BullMQ "veille".
 *
 * Lancé via :
 *   pnpm --filter @qualiof/web worker:veille
 *
 * Process indépendant de Next.js. À garder ouvert pour que le cron hebdo
 * (lundi 8h Europe/Paris) se déclenche. En prod : tourne en service
 * systemd / pm2 / docker (même pattern que `closure-worker.ts` et
 * `invoice-reminder-worker.ts`).
 *
 * Mode dégradé Redis (clone Phase 11 invoice-reminder-worker.ts:39-46) :
 * si Redis n'est pas joignable au boot (CI / test sans Docker), on log
 * un warning + keepalive setInterval pour ne pas faire planter
 * `concurrently` (cf `pnpm dev:full`).
 */

import {
  startVeilleWorker,
} from '../src/lib/veille/worker';
import { scheduleWeeklyVeille } from '../src/lib/veille/queue';

async function main() {
  try {
    const worker = startVeilleWorker();
    await scheduleWeeklyVeille();

    const shutdown = async (signal: string) => {
      console.log(`[veille-worker] received ${signal}, shutting down…`);
      await worker.close();
      process.exit(0);
    };

    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
  } catch (e) {
    console.warn(
      '[veille-worker] Redis indisponible — worker désactivé en mode dégradé.',
      e,
    );
    // Keepalive : empêche concurrently de planter en dev:full sans Redis.
    setInterval(() => {}, 60_000);
  }
}

void main();
