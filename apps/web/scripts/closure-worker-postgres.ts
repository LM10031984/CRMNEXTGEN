/**
 * Entry-point worker Postgres "closure-generation".
 *
 * Variant cloud du worker : poll Postgres au lieu d'écouter Redis BullMQ.
 * Lancé via :
 *   pnpm --filter @qualiof/web worker:closure:pg
 *
 * Boucle :
 *   1. claim N jobs QUEUED via FOR UPDATE SKIP LOCKED
 *   2. process en parallèle (réutilise processClosureJobPayload)
 *   3. sleep QUEUE_POLL_INTERVAL_MS (default 3000)
 *   4. répète
 *
 * En prod Vercel : remplacer par `/api/cron/closure-worker` appelé toutes
 * les 30s par Vercel Cron (1 invocation = 1 batch). Cf sub-phase G.
 */

import '@qualiof/shared/env'; // fail-loud au démarrage worker (ne passe pas par next.config.mjs)
import { processNextClosureJobs } from '../src/lib/closure/queue-postgres';

const POLL_INTERVAL_MS = Number(process.env.QUEUE_POLL_INTERVAL_MS ?? 3000);
const CONCURRENCY = Number(process.env.QUEUE_CONCURRENCY ?? 3);

let stopped = false;

async function loop() {
  console.log(
    `[closure-worker-pg] started — concurrency=${CONCURRENCY}, poll=${POLL_INTERVAL_MS}ms`,
  );
  while (!stopped) {
    try {
      const r = await processNextClosureJobs(CONCURRENCY);
      if (r.processed > 0) {
        console.log(
          `[closure-worker-pg] processed=${r.processed} ok=${r.succeeded} fail=${r.failed}`,
        );
      }
    } catch (e: any) {
      console.error('[closure-worker-pg] loop error:', e.message);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  console.log('[closure-worker-pg] stopped');
}

const shutdown = (signal: string) => {
  console.log(`[closure-worker-pg] received ${signal}, draining…`);
  stopped = true;
  // Laisse 2s à la dernière itération pour finir proprement
  setTimeout(() => process.exit(0), 2000);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

loop().catch((e) => {
  console.error('[closure-worker-pg] fatal:', e);
  process.exit(1);
});
