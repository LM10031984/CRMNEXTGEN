/**
 * Phase 11 Plan 11-06 → Phase 20 Plan 20-01 — Entry-point cron quotidien (croner).
 *
 * Deux tâches quotidiennes y vivent, dans cet ordre :
 *  1. les relances d'impayés (raison d'être historique du process) ;
 *  2. la purge des traces d'envoi arrivées à échéance (RGPD art. 30,
 *     Traitement 5 — lot 0 · 0.2). Elle passe APRÈS et dans son propre
 *     `try` : une purge qui échoue ne doit pas priver Laurent de ses relances ;
 *  3. la veille de chronologie des numéros de facture (lot B du 10/09/2026),
 *     même discipline : après, dans son propre `try`, et SILENCIEUSE tant qu'il
 *     n'y a rien à dire.
 *
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
import { purgeExpiredEmailMessages } from '../src/lib/rgpd/purge-email-messages';
import { scanChronologyBreaks } from './audit-invoice-chronology';

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

    // RGPD — le registre annonce que les traces d'envoi sont conservées « avec
    // le dossier de formation ». Sans ce balayage, la durée annoncée ne serait
    // qu'une phrase dans un document.
    try {
      const purge = await purgeExpiredEmailMessages();
      if (purge.supprimees > 0) {
        console.log(
          `[invoice-reminder-worker] purge RGPD : ${purge.supprimees} trace(s) d'envoi échue(s) sur ${purge.examinees} examinée(s)`,
        );
      }
    } catch (e) {
      console.error('[invoice-reminder-worker] purge RGPD en échec', e);
    }

    // Veille de chronologie (lot B du 10/09/2026). A remplacé l'alerte
    // d'émission : celle-ci ne voyait que les deux server actions où elle était
    // branchée, celle-là relit tout le parc — imports et scripts compris.
    // Lecture seule. Muette s'il n'y a aucune rupture : un worker qui parle
    // tous les jours pour dire « rien » n'est plus lu le jour où il parle.
    try {
      const ruptures = await scanChronologyBreaks();
      if (ruptures.length > 0) {
        const total = ruptures.reduce((n, r) => n + r.report.breaks.length, 0);
        console.warn(
          `[invoice-reminder-worker] ⚠ chronologie : ${total} rupture(s) de numérotation`,
        );
        for (const { tenantName, report } of ruptures) {
          for (const b of report.breaks) {
            console.warn(
              `  ${tenantName} · ${report.label} · ${b.number} émise le ` +
                `${b.issueDate.toISOString().slice(0, 10)} recule de ${b.backwardDays} j ` +
                `derrière ${b.previousNumber} (${b.previousIssueDate.toISOString().slice(0, 10)})`,
            );
          }
        }
        console.warn('  → inventaire complet : pnpm invoices:audit-chronology');
      }
    } catch (e) {
      console.error('[invoice-reminder-worker] veille de chronologie en échec', e);
    }
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
