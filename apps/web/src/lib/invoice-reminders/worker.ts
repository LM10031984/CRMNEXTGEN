/**
 * Phase 11 Plan 11-06 → Phase 20 Plan 20-01 — Handler relances factures (croner).
 *
 * WORK-02 (D-03 « Redis viré partout ») : ce handler ne dépend plus de BullMQ.
 * Il accepte un payload neutre `{ triggered_by }` et est appelé par le cron
 * interne `scripts/invoice-reminder-worker.ts` (croner, quotidien 8h Europe/Paris).
 *
 *  - `processReminderJob()` scanne tous les tenants, pour chaque tenant lit
 *    `invoiceReminderDays`, scanne les factures éligibles (filtre R2 + skip
 *    lastReminderAt < 24h + skip niveau max atteint), puis appelle
 *    `sendInvoiceReminder({triggered_by:'cron'})` pour chaque ligne.
 *
 * D-09 : la server action `sendInvoiceReminder` est partagée cron + manual.
 * D-13b : idempotence 24h appliquée côté worker (defense-in-depth) ET côté action.
 *
 * R2 (RESEARCH §Risques) — MITIGATION CASCADE : `REMINDER_START_DATE` filtre
 * `issueDate >= 2026-05-19` pour éviter une avalanche d'emails sur l'historique
 * au premier démarrage en prod.
 */

import { prisma } from '@qualiof/db';
import { sendInvoiceReminder } from '@/server/actions/invoices';

/**
 * R2 (RESEARCH §Risques) — Date de mise en service Phase 11.
 * Le worker ne traite QUE les factures émises à partir de cette date pour
 * éviter une cascade d'emails sur l'historique au premier démarrage.
 */
export const REMINDER_START_DATE = new Date('2026-05-19T00:00:00Z');

const REMINDER_DEDUP_MS = 24 * 60 * 60 * 1000;

/**
 * Scan tous les tenants → toutes les factures éligibles → appelle
 * `sendInvoiceReminder({triggered_by:'cron'})` pour chacune.
 * Retourne le nombre de relances effectivement envoyées (ok=true) — utile pour
 * les logs et pour les tests.
 */
export async function processReminderJob(input: {
  triggered_by: 'cron' | 'manual_admin_trigger';
}): Promise<{ processed: number }> {
  console.log('[invoice-reminder-worker] tick', {
    triggered_by: input.triggered_by,
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
