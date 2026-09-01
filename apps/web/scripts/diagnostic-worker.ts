/**
 * Quick 260901-qr7 — entry-point cron des envois du diagnostic (croner).
 *
 * Toutes les 5 minutes : le prospect qui vient de remplir le diagnostic sur le
 * stand reçoit son programme pendant qu'il est encore à la soirée. C'est le
 * bon rythme — assez rapide pour l'effet, assez lent pour ne pas mettre un
 * appel au modèle sur le chemin critique du formulaire.
 *
 * Lancé via :
 *   pnpm --filter @qualiof/web worker:diagnostic
 *
 * En conteneur (plan 20-04) : lancé par pm2, pas par ce script pnpm.
 */

import '@qualiof/shared/env'; // fail-loud au boot (parité veille-worker.ts)
import { Cron } from 'croner';
import { processDiagnosticSends } from '../src/lib/diagnostic/worker';

const job = new Cron(
  '*/5 * * * *',
  {
    name: 'diagnostic',
    timezone: 'Europe/Paris',
    catch: (e: unknown) => console.error('[diagnostic-worker] cron error', e),
    protect: true, // un tick lent ne se fait pas doubler par le suivant
  },
  async () => {
    await processDiagnosticSends({ triggered_by: 'cron' });
  },
);
console.log('[diagnostic-worker] croner registered (*/5 min Europe/Paris), next:', job.nextRun());

const shutdown = (signal: string) => {
  console.log(`[diagnostic-worker] received ${signal}, stopping cron…`);
  job.stop();
  process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
