/**
 * Phase 22 Plan 22-07 — Task 3 : remédiation des compteurs de relance « brûlés »
 * (décision Laurent 2026-08-03 : OPTION ① RESET COMPLET).
 *
 * CONTEXTE (voir 22-PENDING-SENDS-REPORT.md § Découverte 2026-08-03) :
 *   Le brûlage RÉEL n'est PAS la classe `diff.dryRun=true` du Pitfall 1 initial
 *   (0 occurrence en base) mais une VARIANTE « mode réel raté » : entre le 20/07
 *   (éligibilité du trio FAC-000006/007/008) et le 31/07 (pose de MAIL_DRY_RUN=true
 *   sur le worker), le cron Railway a tourné en mode réel (`SMTP_HOST` posé,
 *   `MAIL_DRY_RUN` absent) SANS auth SMTP (SMTP_USER/PASS jamais posés) et avec
 *   l'egress SMTP bloqué (plan Hobby, 20-SMOKE P5) → sendMail() = { ok:false },
 *   MAIS invoice-reminder-core.ts incrémente reminderCount même sur échec.
 *   Résultat : des AuditLog `invoices.reminder_sent` avec `diff.dryRun=false`
 *   alors qu'AUCUN email n'est parti.
 *
 * DÉFINITION « BRÛLÉ » (élargie en conséquence, documentée deferred-items n°6) :
 *   AuditLog action `invoices.reminder_sent` avec
 *     - diff.dryRun === true  (classe Pitfall 1 d'origine), OU
 *     - diff.dryRun === false ET createdAt ∈ [BURN_WINDOW_START, BURN_WINDOW_END]
 *       (fenêtre « mode réel raté » prouvée — worker sans auth SMTP).
 *   Les logs d'échec `no_email_recipient` (dryRun absent) n'incrémentent PAS le
 *   compteur → hors périmètre par construction.
 *
 * RESET (état pré-brûlage, jamais un zéro aveugle) :
 *   reminderCount  = max(0, reminderCount - nbBrûlées)
 *   lastReminderAt = createdAt de la DERNIÈRE relance réellement partie
 *                    (log hors classe brûlée avec dryRun === false) ou null.
 *
 * SÉCURITÉ (convention projet « destructif = étape séparée ») :
 *   - DRY par défaut : aucune écriture. `WRITE=1` pour exécuter.
 *   - Snapshot des lignes AVANT écriture, imprimé (à coller au rapport).
 *   - Chaque update tracé en AuditLog `invoices.reminder_reset`,
 *     diff { reason: 'phase22-burned-dryrun', before, after } (réversibilité).
 *
 * USAGE (depuis apps/web) :
 *   pnpm dotenv -e ../../.env -- tsx scripts/_reset-burned-reminders.ts          # DRY
 *   WRITE=1 pnpm dotenv -e ../../.env -- tsx scripts/_reset-burned-reminders.ts # WRITE
 */

import { prisma } from '@qualiof/db';

const WRITE = process.env.WRITE === '1';

// Fenêtre « mode réel raté » prouvée (22-PENDING-SENDS-REPORT.md, 2026-08-03) :
// du franchissement de seuil du trio (20/07) à la pose de MAIL_DRY_RUN=true
// sur le worker Railway (31/07, déviation Rule 2 du 22-06).
const BURN_WINDOW_START = new Date('2026-07-20T00:00:00.000Z');
const BURN_WINDOW_END = new Date('2026-07-31T23:59:59.999Z');

type ReminderLog = {
  entityId: string;
  createdAt: Date;
  diff: unknown;
};

function dryRunOf(log: ReminderLog): boolean | undefined {
  const d = log.diff as Record<string, unknown> | null;
  if (!d || typeof d !== 'object') return undefined;
  return typeof d.dryRun === 'boolean' ? d.dryRun : undefined;
}

function isBurned(log: ReminderLog): boolean {
  const dr = dryRunOf(log);
  if (dr === true) return true; // classe Pitfall 1 d'origine
  if (
    dr === false &&
    log.createdAt >= BURN_WINDOW_START &&
    log.createdAt <= BURN_WINDOW_END
  ) {
    return true; // classe « mode réel raté » (sans auth SMTP → 0 email parti)
  }
  return false;
}

async function main(): Promise<void> {
  console.log(
    `[reset-burned-reminders] mode=${WRITE ? 'WRITE' : 'DRY'} — fenêtre mode réel raté : ${BURN_WINDOW_START.toISOString()} → ${BURN_WINDOW_END.toISOString()}`,
  );

  const logs = (await prisma.auditLog.findMany({
    where: { action: 'invoices.reminder_sent' },
    orderBy: { createdAt: 'asc' },
    select: { entityId: true, createdAt: true, diff: true },
  })) as ReminderLog[];

  // Groupement par facture : brûlées + dernière relance réellement partie.
  const burnedByInvoice = new Map<string, ReminderLog[]>();
  const lastRealByInvoice = new Map<string, Date>();
  for (const log of logs) {
    if (isBurned(log)) {
      const arr = burnedByInvoice.get(log.entityId) ?? [];
      arr.push(log);
      burnedByInvoice.set(log.entityId, arr);
    } else if (dryRunOf(log) === false) {
      // Relance réellement partie (hors fenêtre brûlée)
      const prev = lastRealByInvoice.get(log.entityId);
      if (!prev || log.createdAt > prev) {
        lastRealByInvoice.set(log.entityId, log.createdAt);
      }
    }
  }

  if (burnedByInvoice.size === 0) {
    console.log('[reset-burned-reminders] Aucune facture brûlée détectée — rien à faire.');
    await prisma.$disconnect();
    return;
  }

  const invoices = await prisma.invoice.findMany({
    where: { id: { in: [...burnedByInvoice.keys()] } },
    select: {
      id: true,
      tenantId: true,
      number: true,
      status: true,
      reminderCount: true,
      lastReminderAt: true,
    },
  });

  console.log('\n=== SNAPSHOT AVANT (réversibilité — à coller au rapport) ===');
  for (const inv of invoices) {
    console.log(
      JSON.stringify({
        id: inv.id,
        number: inv.number,
        status: inv.status,
        reminderCount: inv.reminderCount,
        lastReminderAt: inv.lastReminderAt?.toISOString() ?? null,
      }),
    );
  }

  console.log('\n=== PLAN DE RESET ===');
  for (const inv of invoices) {
    const burned = burnedByInvoice.get(inv.id) ?? [];
    const newCount = Math.max(0, inv.reminderCount - burned.length);
    const lastReal = lastRealByInvoice.get(inv.id) ?? null;
    console.log(
      `${inv.number}: reminderCount ${inv.reminderCount} → ${newCount} (décrément=${burned.length} brûlée(s) : ${burned
        .map((b) => b.createdAt.toISOString().slice(0, 10))
        .join(', ')}), lastReminderAt ${inv.lastReminderAt?.toISOString() ?? 'null'} → ${lastReal?.toISOString() ?? 'null'}`,
    );

    if (WRITE) {
      const before = {
        reminderCount: inv.reminderCount,
        lastReminderAt: inv.lastReminderAt?.toISOString() ?? null,
      };
      const after = {
        reminderCount: newCount,
        lastReminderAt: lastReal?.toISOString() ?? null,
      };
      await prisma.invoice.update({
        where: { id: inv.id },
        data: { reminderCount: newCount, lastReminderAt: lastReal },
      });
      await prisma.auditLog.create({
        data: {
          tenantId: inv.tenantId,
          userId: null,
          action: 'invoices.reminder_reset',
          entity: 'Invoice',
          entityId: inv.id,
          diff: { reason: 'phase22-burned-dryrun', before, after },
        },
      });
      console.log(`  → WRITE OK (update + AuditLog invoices.reminder_reset)`);
    }
  }

  if (!WRITE) {
    console.log('\n[reset-burned-reminders] DRY — aucune écriture. Relancer avec WRITE=1 pour appliquer.');
  } else {
    // Contrôle post-écriture
    const check = await prisma.invoice.findMany({
      where: { id: { in: [...burnedByInvoice.keys()] } },
      select: { number: true, reminderCount: true, lastReminderAt: true },
    });
    const resets = await prisma.auditLog.count({
      where: { action: 'invoices.reminder_reset' },
    });
    console.log('\n=== CONTRÔLE POST-WRITE ===');
    for (const c of check) {
      console.log(
        `${c.number}: reminderCount=${c.reminderCount}, lastReminderAt=${c.lastReminderAt?.toISOString() ?? 'null'}`,
      );
    }
    console.log(`AuditLog invoices.reminder_reset (total en base) : ${resets}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('[reset-burned-reminders] échec', e);
  process.exit(1);
});
