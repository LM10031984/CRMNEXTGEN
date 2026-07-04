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

import '@qualiof/shared/env'; // fail-loud au démarrage worker (ne passe pas par next.config.mjs)
import { startClosureWorker } from '../src/lib/closure/worker';
import { requeueStuckClosureJobs } from '../src/lib/closure/requeue';

const worker = startClosureWorker();

// Reprise auto des jobs orphelins d'un run précédent (worker tué en cours :
// Ollama timeout / kill / reboot). Le worker est déjà à l'écoute, donc les jobs
// QUEUED ré-enfilés seront traités dans la foulée → plus de doc « qui ne se
// génère pas » à relancer à la main.
requeueStuckClosureJobs()
  .then((r) => {
    if (r.requeued || r.markedError) {
      console.log(
        `[closure-worker] reprise démarrage : ${r.requeued} job(s) ré-enfilé(s), ${r.markedError} périmé(s) → ERROR`,
      );
    } else {
      console.log('[closure-worker] reprise démarrage : aucun job orphelin');
    }
  })
  .catch((e) => console.error('[closure-worker] reprise démarrage échouée :', e));

const shutdown = async (signal: string) => {
  console.log(`[closure-worker] received ${signal}, shutting down…`);
  await worker.close();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
