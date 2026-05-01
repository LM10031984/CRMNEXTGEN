/**
 * Entry-point du worker BullMQ "closure-generation".
 *
 * Lancé via :
 *   pnpm --filter @qualiof/web worker:closure
 *
 * Process indépendant de Next.js. À garder ouvert pendant le dev pour que
 * les jobs créés par /sessions/[id] (bouton 📦 Pack fin de formation) soient
 * traités. En prod : tourne en service systemd / pm2 / docker.
 */

import { startClosureWorker } from '../src/lib/closure/worker';

const worker = startClosureWorker();

const shutdown = async (signal: string) => {
  console.log(`[closure-worker] received ${signal}, shutting down…`);
  await worker.close();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
