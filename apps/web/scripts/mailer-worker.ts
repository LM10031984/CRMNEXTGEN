/**
 * Entry-point du worker BullMQ "mailer-outbound" (Sprint 3 — Robustesse).
 *
 * Lancé via :
 *   pnpm --filter @qualiof/web worker:mailer
 *
 * Process indépendant de Next.js. Traite les jobs poussés par
 * `enqueueMail()` depuis les Server Actions / Workers. À garder ouvert
 * en dev pour que les notifications partent.
 */

import { startMailerWorker } from '../src/lib/mailer-queue/worker';
import { childLogger } from '../src/lib/logger';

const log = childLogger('mailer-worker-entry');
const worker = startMailerWorker();

const shutdown = async (signal: string): Promise<void> => {
  log.info({ signal }, 'shutdown.start');
  await worker.close();
  log.info('shutdown.done');
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
