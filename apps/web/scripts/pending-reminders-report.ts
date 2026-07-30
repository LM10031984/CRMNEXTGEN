/**
 * Phase 22 Plan 22-04 — Rapport des envois de relances factures en attente
 * + inventaire des relances « brûlées » en dry-run (D-06 / Pitfall 1).
 *
 * LECTURE SEULE STRICTE : ce script ne fait QUE des findMany/findUnique Prisma
 * contre la base du `.env` (= cloud Supabase). Aucune mutation, aucun email.
 *
 * POURQUOI :
 *   - D-06 : avant tout flip MAIL_DRY_RUN=false, Laurent doit voir la liste
 *     NOMINATIVE exacte des relances qui partiraient au premier run réel du
 *     cron Railway (quotidien 8h). Règle payeur : l'auto-entrepreneur est son
 *     propre payeur → une relance facture peut toucher un APPRENANT (flag).
 *   - Pitfall 1 CRITIQUE : le cron dry-run tourne depuis la Phase 20 et
 *     INCRÉMENTE `reminderCount` à blanc (invoice-reminder-core.ts) — des
 *     niveaux de relance ont été « brûlés » sans qu'aucun email ne parte.
 *     Inventaire facture par facture via AuditLog (diff.dryRun = true).
 *
 * PARITÉ DE SÉLECTION : la Partie A REPRODUIT EXACTEMENT les filtres du cron
 * (apps/web/src/lib/invoice-reminders/worker.ts) — REMINDER_START_DATE est
 * IMPORTÉE du worker (pas redéclarée), status IN (ISSUED, PARTIAL, OVERDUE),
 * OR dueDate/issueDate <= minOverdueDate, puis filtres du core :
 * reminderCount < maxLevel, dedup 24h sur lastReminderAt.
 *
 * USAGE (depuis apps/web) :
 *   pnpm dotenv -e ../../.env -- tsx scripts/pending-reminders-report.ts
 *
 * Sortie : .planning/phases/22-bascule-prod-conformit-rgpd/22-PENDING-SENDS-REPORT.md
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '@qualiof/db';
// Parité stricte avec la sélection du cron — on importe la constante du worker.
import { REMINDER_START_DATE } from '../src/lib/invoice-reminders/worker';

const REMINDER_DEDUP_MS = 24 * 60 * 60 * 1000; // parité worker.ts

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../../..');
const REPORT_PATH = path.join(
  REPO_ROOT,
  '.planning/phases/22-bascule-prod-conformit-rgpd/22-PENDING-SENDS-REPORT.md',
);

const eur = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
});

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '—';
  return d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

type PendingRow = {
  number: string;
  payerName: string;
  recipient: string;
  recipientSource: string;
  flag: string;
  nextLevel: number;
  reminderCount: number;
  maxLevel: number;
  lastReminderAt: Date | null;
  remaining: number;
};

type UpcomingRow = {
  number: string;
  payerName: string;
  status: string;
  dueDate: Date | null;
  eligibleAt: Date;
  remaining: number;
};

async function collectPending(): Promise<{
  rows: PendingRow[];
  upcoming: UpcomingRow[];
}> {
  const rows: PendingRow[] = [];
  const upcoming: UpcomingRow[] = [];
  const now = Date.now();

  const tenants = await prisma.tenant.findMany({
    select: { id: true, invoiceReminderDays: true },
  });

  for (const tenant of tenants) {
    // Parité worker.ts : reminderDays par tenant, défaut [30, 45]
    const reminderDays = tenant.invoiceReminderDays ?? [30, 45];
    const maxLevel = reminderDays.length;
    if (maxLevel === 0) continue;
    const minDays = reminderDays[0]!;
    const minOverdueDate = new Date(now - minDays * 24 * 60 * 60 * 1000);

    // Filtre de base du worker (status + issueDate). La condition d'échéance
    // (OR dueDate/issueDate <= minOverdueDate, parité worker.ts) est appliquée
    // en JS ci-dessous — sémantique IDENTIQUE — pour pouvoir AUSSI lister les
    // factures pas encore éligibles (horizon D-06 : expliquer un tableau vide).
    const invoicesBase = await prisma.invoice.findMany({
      where: {
        tenantId: tenant.id,
        // D-13 auto-stop : jamais PAID/CANCELLED/CREDIT_NOTE/DRAFT
        status: { in: ['ISSUED', 'PARTIAL', 'OVERDUE'] },
        // R2 mitigation cascade : ignore l'historique pré-Phase 11
        issueDate: { gte: REMINDER_START_DATE },
      },
      include: {
        payerOrg: {
          select: { legalName: true, email: true, emailBilling: true },
        },
        participant: {
          include: {
            person: {
              select: { firstName: true, lastName: true, email: true },
            },
          },
        },
      },
      orderBy: { number: 'asc' },
    });

    // Échéance dépassée du premier seuil (parité STRICTE du OR du worker) :
    // { dueDate <= minOverdueDate } OU { dueDate null ET issueDate <= minOverdueDate }
    const invoices = invoicesBase.filter(
      (inv) =>
        (inv.dueDate !== null && inv.dueDate <= minOverdueDate) ||
        (inv.dueDate === null &&
          inv.issueDate !== null &&
          inv.issueDate <= minOverdueDate),
    );

    // Horizon informatif : factures encore SOUS le seuil — date à laquelle le
    // cron les prendrait (référence échéance + minDays jours).
    for (const inv of invoicesBase) {
      if (invoices.includes(inv)) continue;
      const ref = inv.dueDate ?? inv.issueDate;
      if (!ref) continue;
      upcoming.push({
        number: inv.number,
        payerName:
          inv.payerOrg?.legalName ??
          (inv.participant?.person
            ? `${inv.participant.person.firstName} ${inv.participant.person.lastName}`
            : '—'),
        status: inv.status,
        dueDate: inv.dueDate,
        eligibleAt: new Date(ref.getTime() + minDays * 24 * 60 * 60 * 1000),
        remaining: Number(inv.amountTTC) - Number(inv.amountPaid),
      });
    }

    for (const inv of invoices) {
      // Filtres du core (invoice-reminder-core.ts) :
      // D-13b idempotence 24h
      if (
        inv.lastReminderAt &&
        now - inv.lastReminderAt.getTime() < REMINDER_DEDUP_MS
      ) {
        continue;
      }
      // Niveau max atteint (⚠ inclut les niveaux BRÛLÉS en dry-run !)
      if (inv.reminderCount >= maxLevel) continue;

      // Cascade destinataire EXACTE du core :
      // payerOrg.emailBilling ?? payerOrg.email ?? participant.person.email
      let recipient: string | null = null;
      let recipientSource = '—';
      let flag = '';
      if (inv.payerOrg?.emailBilling) {
        recipient = inv.payerOrg.emailBilling;
        recipientSource = 'payerOrg.emailBilling';
      } else if (inv.payerOrg?.email) {
        recipient = inv.payerOrg.email;
        recipientSource = 'payerOrg.email';
      } else if (inv.participant?.person?.email) {
        recipient = inv.participant.person.email;
        recipientSource = 'participant.person.email';
        // Règle payeur : l'auto-entrepreneur est son propre payeur — la relance
        // toucherait directement un APPRENANT.
        flag = '⚠ APPRENANT';
      } else {
        recipient = null;
        recipientSource = 'aucune';
        flag = '⚠ AUCUN EMAIL (échec loggé, pas d’envoi)';
      }

      const payerName =
        inv.payerOrg?.legalName ??
        (inv.participant?.person
          ? `${inv.participant.person.firstName} ${inv.participant.person.lastName}`
          : '—');

      rows.push({
        number: inv.number,
        payerName,
        recipient: recipient ?? '—',
        recipientSource,
        flag,
        nextLevel: inv.reminderCount + 1,
        reminderCount: inv.reminderCount,
        maxLevel,
        lastReminderAt: inv.lastReminderAt,
        remaining: Number(inv.amountTTC) - Number(inv.amountPaid),
      });
    }
  }

  upcoming.sort((a, b) => a.eligibleAt.getTime() - b.eligibleAt.getTime());
  return { rows, upcoming };
}

type BurnedGroup = {
  invoiceId: string;
  number: string;
  burnedCount: number;
  levels: string;
  dates: string;
  reminderCount: number;
  reallySent: number;
  status: string;
};

async function collectBurned(): Promise<{
  groups: BurnedGroup[];
  totalBurnedLogs: number;
  totalRealLogs: number;
  totalAllLogs: number;
  invoicesWithCounter: number;
}> {
  // Contre-vérifications (le « zéro » ne doit pas être un artefact du filtre
  // Prisma Json path) : total TOUTES traces de relance + compteurs non nuls.
  const totalAllLogs = await prisma.auditLog.count({
    where: { action: 'invoices.reminder_sent' },
  });
  const invoicesWithCounter = await prisma.invoice.count({
    where: { reminderCount: { gt: 0 } },
  });
  // Toutes les traces de relance — on partitionne dryRun true/false en JS
  // (le filtre Prisma Json path est appliqué pour la partie « brûlées »).
  const burned = await prisma.auditLog.findMany({
    where: {
      action: 'invoices.reminder_sent',
      diff: { path: ['dryRun'], equals: true },
    },
    orderBy: { createdAt: 'asc' },
  });

  const real = await prisma.auditLog.findMany({
    where: {
      action: 'invoices.reminder_sent',
      diff: { path: ['dryRun'], equals: false },
    },
    orderBy: { createdAt: 'asc' },
  });

  const realByInvoice = new Map<string, number>();
  for (const log of real) {
    realByInvoice.set(log.entityId, (realByInvoice.get(log.entityId) ?? 0) + 1);
  }

  const byInvoice = new Map<string, typeof burned>();
  for (const log of burned) {
    const arr = byInvoice.get(log.entityId) ?? [];
    arr.push(log);
    byInvoice.set(log.entityId, arr);
  }

  const invoiceIds = [
    ...new Set([...byInvoice.keys(), ...realByInvoice.keys()]),
  ];
  const invoices = await prisma.invoice.findMany({
    where: { id: { in: invoiceIds } },
    select: { id: true, number: true, reminderCount: true, status: true },
  });
  const invById = new Map(invoices.map((i) => [i.id, i]));

  const groups: BurnedGroup[] = [];
  for (const [invoiceId, logs] of byInvoice) {
    const inv = invById.get(invoiceId);
    const levels = logs
      .map((l) => {
        const diff = l.diff as Record<string, unknown> | null;
        return diff && typeof diff === 'object' ? String(diff.level ?? '?') : '?';
      })
      .join(', ');
    const dates = logs
      .map((l) => l.createdAt.toISOString().slice(0, 10))
      .join(', ');
    groups.push({
      invoiceId,
      number: inv?.number ?? `(facture supprimée ${invoiceId})`,
      burnedCount: logs.length,
      levels,
      dates,
      reminderCount: inv?.reminderCount ?? 0,
      reallySent: realByInvoice.get(invoiceId) ?? 0,
      status: inv?.status ?? '—',
    });
  }
  groups.sort((a, b) => a.number.localeCompare(b.number));

  return {
    groups,
    totalBurnedLogs: burned.length,
    totalRealLogs: real.length,
    totalAllLogs,
    invoicesWithCounter,
  };
}

async function main(): Promise<void> {
  const generatedAt = new Date();
  const { rows: pending, upcoming } = await collectPending();
  const {
    groups: burnedGroups,
    totalBurnedLogs,
    totalRealLogs,
    totalAllLogs,
    invoicesWithCounter,
  } = await collectBurned();

  const lines: string[] = [];
  lines.push(
    '# 22-PENDING-SENDS-REPORT — Relances factures : envois en attente + relances brûlées (D-06 / Pitfall 1)',
    '',
    `**Généré le :** ${generatedAt.toISOString()} (script lecture seule \`apps/web/scripts/pending-reminders-report.ts\`, base = \`.env\` → cloud Supabase)`,
    '',
    `**Parité de sélection :** filtres du cron Railway répliqués à l'identique — \`REMINDER_START_DATE\` importée du worker (${REMINDER_START_DATE.toISOString()}), status IN (ISSUED, PARTIAL, OVERDUE), échéance dépassée du 1er seuil (\`reminderDays[0]\`, défaut [30, 45]), puis filtres du core : \`reminderCount < maxLevel\`, dedup 24 h sur \`lastReminderAt\`.`,
    '',
    '## Tableau A — Envois qui partiraient au premier run réel (flip MAIL_DRY_RUN=false)',
    '',
  );

  if (pending.length === 0) {
    lines.push(
      '**Aucune relance ne partirait au prochain run du cron** (aucune facture ne passe les filtres worker + core à la date de génération).',
      '',
      '⚠ Attention Pitfall 1 : ce « zéro » peut être un SILENCE ARTIFICIEL — des factures éligibles ont pu atteindre leur niveau max (`reminderCount >= maxLevel`) uniquement à cause des relances brûlées en dry-run (voir Tableau B).',
      '',
    );
  } else {
    lines.push(
      '| Facture | Payeur | Email destinataire | Source cascade | Niveau qui partirait | reminderCount actuel | maxLevel | Dernière relance | Restant dû | Flag |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    );
    for (const r of pending) {
      lines.push(
        `| ${r.number} | ${r.payerName} | ${r.recipient} | \`${r.recipientSource}\` | ${r.nextLevel} | ${r.reminderCount} | ${r.maxLevel} | ${fmtDate(r.lastReminderAt)} | ${eur.format(r.remaining)} | ${r.flag} |`,
      );
    }
    const apprenants = pending.filter((r) => r.flag.includes('APPRENANT')).length;
    lines.push(
      '',
      `**Total : ${pending.length} relance(s) partiraient**, dont **${apprenants} directement vers un APPRENANT** (règle payeur : auto-entrepreneur = son propre payeur).`,
      '',
    );
  }

  // Horizon informatif D-06 : factures qui passeront le filtre plus tard.
  lines.push('### Horizon — prochaines factures qui deviendront éligibles', '');
  if (upcoming.length === 0) {
    lines.push(
      'Aucune facture ISSUED/PARTIAL/OVERDUE émise depuis `REMINDER_START_DATE` n\'est en attente de franchir le seuil de relance.',
      '',
    );
  } else {
    lines.push(
      '| Facture | Payeur | Statut | Échéance | Éligible au cron à partir du | Restant dû |',
      '| --- | --- | --- | --- | --- | --- |',
    );
    for (const u of upcoming) {
      lines.push(
        `| ${u.number} | ${u.payerName} | ${u.status} | ${u.dueDate ? u.dueDate.toISOString().slice(0, 10) : '— (référence issueDate)'} | ${u.eligibleAt.toISOString().slice(0, 10)} | ${eur.format(u.remaining)} |`,
      );
    }
    lines.push(
      '',
      '_Date d\'éligibilité = référence d\'échéance (dueDate, sinon issueDate) + premier seuil `reminderDays[0]` (défaut 30 j). Si `MAIL_DRY_RUN=false` est actif à cette date, la relance niveau 1 PART réellement au run de 8 h._',
      '',
    );
  }

  lines.push(
    '## Tableau B — Relances « brûlées » en dry-run (Pitfall 1 — cron Railway depuis la Phase 20)',
    '',
    `Traces \`AuditLog\` action \`invoices.reminder_sent\` avec \`diff.dryRun = true\` : le compteur \`reminderCount\` a été incrémenté SANS qu'aucun email ne parte. Total : **${totalBurnedLogs} relance(s) brûlée(s)** sur ${burnedGroups.length} facture(s). Relances réellement parties (dryRun=false) toutes factures confondues : **${totalRealLogs}**.`,
    '',
  );

  if (burnedGroups.length === 0) {
    lines.push(
      '**Aucune relance brûlée détectée** — aucun AuditLog `invoices.reminder_sent` avec `dryRun=true`.',
      '',
      `**Contre-vérification (le zéro n'est pas un artefact du filtre Json) :** ${totalAllLogs} AuditLog \`invoices.reminder_sent\` au TOTAL (tous dryRun confondus) et ${invoicesWithCounter} facture(s) avec \`reminderCount > 0\` dans toute la base. Le cron dry-run Railway n'a donc encore consommé AUCUN niveau de relance (aucune facture n'a franchi le 1er seuil d'échéance depuis son démarrage).`,
      '',
    );
  } else {
    lines.push(
      '| Facture | Statut | Relances brûlées (dry-run) | Niveaux brûlés | Dates | reminderCount actuel | Relances réellement parties |',
      '| --- | --- | --- | --- | --- | --- | --- |',
    );
    for (const g of burnedGroups) {
      lines.push(
        `| ${g.number} | ${g.status} | ${g.burnedCount} | ${g.levels} | ${g.dates} | ${g.reminderCount} | ${g.reallySent} |`,
      );
    }
    lines.push(
      '',
      '**Lecture de la colonne comparative :** pour chaque facture, `reminderCount actuel` (ce que croit la base) vs `Relances réellement parties` (emails réels, dryRun=false) — l\'écart = niveaux consommés à blanc. Une facture au niveau max avec 0 relance réelle est en SILENCE TOTAL : le cron ne la relancera plus jamais alors que le payeur n\'a rien reçu.',
      '',
    );
  }

  lines.push(
    '## Décision requise (checkpoint plan 22-07)',
    '',
    'Avant le flip `MAIL_DRY_RUN=false`, Laurent tranche le sort des compteurs brûlés :',
    '',
    '1. **① Reset des compteurs brûlés** — remise à l\'état pré-dry-run (`reminderCount` décrémenté du nombre de relances brûlées, `lastReminderAt` recalé) : le cycle de relance repart comme si le dry-run n\'avait jamais tourné.',
    '2. **② Reset sélectif** — facture par facture, sur la base des deux tableaux ci-dessus (ex. : ne réarmer que les factures encore impayées dont le payeur n\'a jamais été relancé par ailleurs).',
    '3. **③ Acceptation en l\'état** — les niveaux brûlés restent consommés : aucune relance rétroactive, seules les factures encore sous le niveau max seront relancées.',
    '',
    '**ATTENTION : un reset aveugle re-enverrait un niveau 1 à des payeurs peut-être déjà relancés manuellement hors outil** (téléphone, email direct) — croiser avec la connaissance terrain avant de choisir ①.',
    '',
    '---',
    '*Phase 22 — Plan 22-04, Task 2 (D-06 / Pitfall 1). Script lecture seule — aucune écriture DB, aucun email envoyé.*',
    '',
  );

  fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');

  console.log(
    `[pending-reminders-report] ${pending.length} envoi(s) en attente, ${totalBurnedLogs} relance(s) brûlée(s) sur ${burnedGroups.length} facture(s) → ${path.relative(REPO_ROOT, REPORT_PATH)}`,
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('[pending-reminders-report] échec', e);
  process.exit(1);
});
