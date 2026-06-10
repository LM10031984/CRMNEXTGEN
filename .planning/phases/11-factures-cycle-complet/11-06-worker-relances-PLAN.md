---
phase: 11-factures-cycle-complet
plan: 06
type: execute
wave: 2
depends_on:
  - "11-02"
  - "11-03"
  - "11-04"
files_modified:
  - apps/web/src/lib/invoice-reminders/queue.ts
  - apps/web/src/lib/invoice-reminders/worker.ts
  - apps/web/src/lib/invoice-reminders/__tests__/worker.test.ts
  - apps/web/scripts/invoice-reminder-worker.ts
  - apps/web/src/server/actions/invoices.ts
  - apps/web/src/server/actions/__tests__/send-reminder.test.ts
  - apps/web/src/components/invoices/send-reminder-button.tsx
  - apps/web/src/components/invoices/__tests__/send-reminder-button.test.ts
  - apps/web/package.json
autonomous: true
requirements:
  - FACT-03
must_haves:
  truths:
    - "Worker BullMQ daily registered au boot via scheduleDailyReminders() avec cron '0 8 * * *' tz Europe/Paris."
    - "Worker scan Invoice WHERE status ∈ {ISSUED, PARTIAL, OVERDUE} AND issueDate ≥ REMINDER_START_DATE (mitigation cascade R2)."
    - "Worker skip si lastReminderAt > now - 24h (idempotence)."
    - "Worker auto-stop si reminderCount >= invoiceReminderDays.length OU status=PAID/CANCELLED."
    - "sendInvoiceReminder server action accepte triggered_by='cron'|'manual' avec RBAC manual-only."
    - "Mailer dry-run automatique si SMTP_HOST vide."
    - "AuditLog invoices.reminder_sent créé via logInvoiceEvent."
    - "Worker démarre via pnpm dev:full (concurrently)."
  artifacts:
    - path: "apps/web/src/lib/invoice-reminders/queue.ts"
      provides: "BullMQ Queue singleton (clone-strict closure/queue.ts)"
      exports: ["INVOICE_REMINDER_QUEUE_NAME", "getInvoiceReminderQueue"]
    - path: "apps/web/src/lib/invoice-reminders/worker.ts"
      provides: "startInvoiceReminderWorker + scheduleDailyReminders + processReminderJob"
      exports: ["startInvoiceReminderWorker", "scheduleDailyReminders"]
    - path: "apps/web/scripts/invoice-reminder-worker.ts"
      provides: "Entry-point process worker (clone-strict scripts/closure-worker.ts)"
    - path: "apps/web/src/server/actions/invoices.ts"
      provides: "Extension avec sendInvoiceReminder (manuel + cron)"
      exports: ["sendInvoiceReminder"]
    - path: "apps/web/src/components/invoices/send-reminder-button.tsx"
      provides: "Bouton 'Envoyer relance maintenant' sur fiche facture"
  key_links:
    - from: "pnpm dev:full"
      to: "scripts/invoice-reminder-worker.ts"
      via: "concurrently -n next,closure,reminders"
      pattern: "worker:reminders"
    - from: "worker BullMQ cron daily"
      to: "sendInvoiceReminder({triggered_by:'cron'})"
      via: "processReminderJob"
      pattern: "triggered_by.*cron"
    - from: "Bouton fiche facture"
      to: "sendInvoiceReminder({triggered_by:'manual'})"
      via: "<SendReminderButton>"
      pattern: "triggered_by.*manual"
---

<objective>
Implémenter le système hybride de relances (D-09 + D-13) : (1) Worker BullMQ daily clone-strict `closure-worker.ts`, repeatable cron `'0 8 * * *'` tz Europe/Paris, lecture `Tenant.invoiceReminderDays` par tick ; (2) Server action `sendInvoiceReminder(invoiceId, triggered_by)` partagée cron + manual, idempotence 24h pour cron (pas pour manual), auto-stop sur PAID/CANCELLED, dry-run mailer automatique ; (3) Bouton manuel UI fiche facture ; (4) Intégration `pnpm dev:full` via concurrently.

Purpose: Cœur de FACT-03. Sans worker, pas de relance automatique. Sans bouton manuel, pas de levier ad-hoc.
Output: 4 fichiers nouveaux (queue/worker/script + 1 composant) + 1 server action étendue + 1 script package.json modifié + 3 suites Vitest vertes.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/11-factures-cycle-complet/11-CONTEXT.md
@.planning/phases/11-factures-cycle-complet/11-RESEARCH.md
@apps/web/src/lib/closure/queue.ts
@apps/web/src/lib/closure/worker.ts
@apps/web/src/lib/closure/redis.ts
@apps/web/scripts/closure-worker.ts
@apps/web/src/lib/mailer.ts
@apps/web/src/lib/mailer-templates/invoice-reminder.ts
@apps/web/src/lib/invoice-audit.ts
@apps/web/src/lib/of-config.ts
@apps/web/package.json

<interfaces>
<!-- Worker BullMQ -->

```typescript
// apps/web/src/lib/invoice-reminders/queue.ts
export const INVOICE_REMINDER_QUEUE_NAME = 'invoice-reminders-daily';
export function getInvoiceReminderQueue(): Queue;

// apps/web/src/lib/invoice-reminders/worker.ts
export function startInvoiceReminderWorker(): Worker;
export async function scheduleDailyReminders(): Promise<void>;
// processReminderJob (interne) : scan + filter + appelle sendInvoiceReminder per invoice
```

<!-- Server action -->
```typescript
// apps/web/src/server/actions/invoices.ts (extension)
export async function sendInvoiceReminder(input: {
  invoiceId: string;
  triggered_by: 'cron' | 'manual';
}): Promise<{
  ok: true;
  level?: 1 | 2;
  dryRun?: boolean;
} | { ok: false; error: string }>;
// RBAC : ['ADMIN', 'MANAGER', 'COMPTABLE'] si triggered_by='manual'
//        SKIP requireRole si triggered_by='cron' (worker système)
```

<!-- Constante mitigation R2 (RESEARCH Risque 2) -->
```typescript
// apps/web/src/lib/invoice-reminders/worker.ts
export const REMINDER_START_DATE = new Date('2026-05-19T00:00:00Z'); // date de mise en service Phase 11
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1 : Server action sendInvoiceReminder (manuel + cron)</name>
  <files>apps/web/src/server/actions/invoices.ts, apps/web/src/server/actions/__tests__/send-reminder.test.ts</files>
  <read_first>
    - apps/web/src/server/actions/invoices.ts (3 actions Phase 7-02 — patterns existants à respecter)
    - apps/web/src/lib/mailer.ts (sendMail dry-run pattern Phase 8/9)
    - apps/web/src/lib/mailer-templates/invoice-reminder.ts (renderInvoiceReminderEmail Plan 11-03)
    - apps/web/src/lib/of-config.ts (loadOfConfig(tenantId) Phase 7 D-01)
    - apps/web/src/lib/invoice-audit.ts (logInvoiceEvent Plan 11-02)
    - apps/web/src/server/actions/__tests__/send-reminder.test.ts (stub Wave 0 — 12 it.todo à remplir)
    - .planning/phases/11-factures-cycle-complet/11-RESEARCH.md §Server Actions Inventory L578-592 + §Open Questions Q5 (email resolution)
  </read_first>
  <behavior>
    - Test 1 : triggered_by='manual' + RBAC COMMERCIAL → `{ ok: false, error: 'Forbidden' }`
    - Test 2 : triggered_by='cron' → SKIP requireRole (pas d'erreur même sans user)
    - Test 3 : status=PAID → skip + return `{ ok: false, error: 'Facture déjà payée' }` (auto-stop D-13)
    - Test 4 : status=CANCELLED → skip + return error
    - Test 5 : triggered_by='cron' + lastReminderAt > now - 24h → skip (idempotence D-13b)
    - Test 6 : triggered_by='manual' + lastReminderAt il y a 1h → PAS de skip (manual ignore idempotence — D-09)
    - Test 7 : reminderCount=2, invoiceReminderDays=[30,45] → skip (level max atteint)
    - Test 8 : level computed = clamp(reminderCount + 1, 1, invoiceReminderDays.length)
    - Test 9 : appelle `sendMail` + `renderInvoiceReminderEmail` avec input correct
    - Test 10 : SMTP_HOST vide → result.dryRun=true + AuditLog diff.dryRun=true
    - Test 11 : update Invoice { lastReminderAt: now, reminderCount: { increment: 1 } }
    - Test 12 : AuditLog `invoices.reminder_sent` avec diff `{level, channel:'email', triggered_by, dryRun, daysOverdue}`
    - Test 13 : Aucun email payeur (payerOrg.emailBilling, payerOrg.email, participant.person.email tous null) → `{ ok: false, error: 'Aucun email payeur configuré' }`
  </behavior>
  <action>
1. Étendre `apps/web/src/server/actions/invoices.ts` avec `sendInvoiceReminder` :

```typescript
import { sendMail } from '@/lib/mailer';
import { loadOfConfig } from '@/lib/of-config';
import { renderInvoiceReminderEmail } from '@/lib/mailer-templates/invoice-reminder';

const REMINDER_DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

function getReminderRecipientEmail(invoice: {
  payerOrg: { email: string | null; emailBilling: string | null } | null;
  participant: { person: { email: string | null } | null } | null;
}): string | null {
  return (
    invoice.payerOrg?.emailBilling ??
    invoice.payerOrg?.email ??
    invoice.participant?.person?.email ??
    null
  );
}

export async function sendInvoiceReminder(input: {
  invoiceId: string;
  triggered_by: 'cron' | 'manual';
}): Promise<
  | { ok: true; level: 1 | 2; dryRun: boolean }
  | { ok: false; error: string }
> {
  // RBAC : manual seulement (cron skip)
  let userId: string | null = null;
  let tenantId: string;

  if (input.triggered_by === 'manual') {
    let user;
    try {
      user = await requireRole(['ADMIN', 'MANAGER', 'COMPTABLE']);
    } catch (e) {
      if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
        return { ok: false, error: e.message };
      }
      throw e;
    }
    userId = user.id;
    tenantId = user.tenantId;
  } else {
    // Cron : pas d'utilisateur — on lit le tenantId depuis la facture
    const inv = await prisma.invoice.findUnique({
      where: { id: input.invoiceId },
      select: { tenantId: true },
    });
    if (!inv) return { ok: false, error: 'Facture introuvable' };
    tenantId = inv.tenantId;
  }

  // Lookup facture + relations
  const invoice = await prisma.invoice.findFirst({
    where: { id: input.invoiceId, tenantId },
    include: {
      payerOrg: { select: { legalName: true, email: true, emailBilling: true } },
      participant: { include: { person: { select: { firstName: true, lastName: true, email: true } } } },
    },
  });
  if (!invoice) return { ok: false, error: 'Facture introuvable' };

  // Auto-stop D-13 : PAID ou CANCELLED → skip
  if (invoice.status === 'PAID') return { ok: false, error: 'Facture déjà payée' };
  if (invoice.status === 'CANCELLED') return { ok: false, error: 'Facture annulée' };
  if (invoice.status === 'CREDIT_NOTE') return { ok: false, error: 'Pas de relance sur un avoir' };
  if (invoice.status === 'DRAFT') return { ok: false, error: 'Facture en brouillon' };

  // Idempotence 24h pour cron seulement (D-09 — manual confiance utilisateur)
  if (input.triggered_by === 'cron' && invoice.lastReminderAt) {
    const since = Date.now() - invoice.lastReminderAt.getTime();
    if (since < REMINDER_DEDUP_WINDOW_MS) {
      return { ok: false, error: 'Idempotence 24h (cron)' };
    }
  }

  // Lecture tenant.invoiceReminderDays + niveau max
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { invoiceReminderDays: true },
  });
  const reminderDays = tenant?.invoiceReminderDays ?? [30, 45];
  const maxLevel = reminderDays.length;

  if (invoice.reminderCount >= maxLevel) {
    return { ok: false, error: `Niveau maximum atteint (${maxLevel})` };
  }

  const level = (Math.min(invoice.reminderCount + 1, maxLevel)) as 1 | 2;

  // Email recipient
  const recipientEmail = getReminderRecipientEmail(invoice);
  if (!recipientEmail) {
    // AuditLog quand même (traçabilité — RESEARCH Q5)
    await logInvoiceEvent({
      tenantId,
      actorUserId: userId,
      targetInvoiceId: invoice.id,
      action: 'invoices.reminder_sent',
      diff: { level, triggered_by: input.triggered_by, error: 'no_email_recipient' },
    });
    return { ok: false, error: 'Aucun email payeur configuré' };
  }

  // Days overdue
  const dueDate = invoice.dueDate ?? invoice.issueDate ?? new Date();
  const daysOverdue = Math.max(
    0,
    Math.floor((Date.now() - new Date(dueDate).getTime()) / (24 * 60 * 60 * 1000)),
  );

  // Payer name (fallback)
  const payerName =
    invoice.payerOrg?.legalName ??
    (invoice.participant?.person
      ? `${invoice.participant.person.firstName} ${invoice.participant.person.lastName}`
      : 'Cher client');

  // Of config (Phase 7 D-01 hybride)
  const of = await loadOfConfig(tenantId);

  // Render template (Plan 11-03)
  const remaining = Number(invoice.amountTTC) - Number(invoice.amountPaid);
  const invoiceUrl = `${process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? ''}/app/factures/${invoice.id}`;

  const { subject, html, text } = renderInvoiceReminderEmail(
    {
      level,
      invoiceNumber: invoice.number,
      issueDate: invoice.issueDate ?? new Date(),
      dueDate: new Date(dueDate),
      daysOverdue,
      amountTtc: remaining,
      payerName,
      invoiceUrl,
    },
    of,
  );

  // Send mail (dry-run automatique si SMTP_HOST vide)
  const mailResult = await sendMail({ to: recipientEmail, subject, html, text });
  const dryRun = mailResult.dryRun === true;

  // Update invoice tracking
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      lastReminderAt: new Date(),
      reminderCount: { increment: 1 },
    },
  });

  // AuditLog D-13c
  await logInvoiceEvent({
    tenantId,
    actorUserId: userId,
    targetInvoiceId: invoice.id,
    action: 'invoices.reminder_sent',
    diff: { level, channel: 'email', triggered_by: input.triggered_by, dryRun, daysOverdue },
  });

  if (input.triggered_by === 'manual') {
    revalidatePath(`/app/factures/${invoice.id}`);
  }

  return { ok: true, level, dryRun };
}
```

2. Remplacer `apps/web/src/server/actions/__tests__/send-reminder.test.ts` (stub Wave 0) avec 13 tests (cf behavior).

3. Lancer : `pnpm --filter @qualiof/web test -- --run src/server/actions/__tests__/send-reminder.test.ts` → 13 verts.
  </action>
  <verify>
    <automated>pnpm --filter @qualiof/web test -- --run src/server/actions/__tests__/send-reminder.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `apps/web/src/server/actions/invoices.ts` contient `export async function sendInvoiceReminder` (grep)
    - Skip requireRole si `triggered_by === 'cron'` (grep `triggered_by === 'manual'`)
    - Check `status === 'PAID'` → skip (grep)
    - Idempotence 24h via `REMINDER_DEDUP_WINDOW_MS` (grep)
    - Lit `tenant.invoiceReminderDays` (grep)
    - Appelle `renderInvoiceReminderEmail` + `sendMail` (grep)
    - Appelle `logInvoiceEvent` avec action `'invoices.reminder_sent'` (grep)
    - Helper `getReminderRecipientEmail` priorité `payerOrg.emailBilling > payerOrg.email > participant.person.email` (grep)
    - Update Invoice `{ lastReminderAt: new Date(), reminderCount: { increment: 1 } }` (grep)
    - 13/13 tests verts
  </acceptance_criteria>
  <done>Server action partagée cron+manual, idempotence cron only, auto-stop PAID, dry-run mailer, audit-loggée systématique.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2 : Worker BullMQ daily (queue + worker + script)</name>
  <files>apps/web/src/lib/invoice-reminders/queue.ts, apps/web/src/lib/invoice-reminders/worker.ts, apps/web/src/lib/invoice-reminders/__tests__/worker.test.ts, apps/web/scripts/invoice-reminder-worker.ts, apps/web/package.json</files>
  <read_first>
    - apps/web/src/lib/closure/queue.ts (pattern Phase 2.2 — Queue BullMQ singleton)
    - apps/web/src/lib/closure/worker.ts (pattern Worker — concurrency, listeners completed/failed/error)
    - apps/web/src/lib/closure/redis.ts (getQueueRedis / getWorkerRedis — RÉUTILISÉ tel quel)
    - apps/web/scripts/closure-worker.ts (24 lignes — pattern entry-point + SIGINT/SIGTERM)
    - apps/web/package.json (scripts dev:full + worker:closure — à étendre)
    - apps/web/src/lib/invoice-reminders/__tests__/worker.test.ts (stub Wave 0 — 9 it.todo à remplir)
    - .planning/phases/11-factures-cycle-complet/11-RESEARCH.md §Worker BullMQ relances + §Risques 2/3 (R2 REMINDER_START_DATE, R3 dry-run sans Redis)
  </read_first>
  <behavior>
    - Test 1 : `scheduleDailyReminders` inscrit un job repeatable avec `jobId='daily-reminders-cron'` (idempotence)
    - Test 2 : `scheduleDailyReminders` utilise pattern cron `'0 8 * * *'` tz `'Europe/Paris'`
    - Test 3 : `processReminderJob` scan Invoice WHERE `status ∈ {ISSUED, PARTIAL, OVERDUE}`
    - Test 4 : `processReminderJob` filtre `issueDate >= REMINDER_START_DATE` (mitigation R2)
    - Test 5 : Pour chaque tenant : lit `Tenant.invoiceReminderDays` par tick
    - Test 6 : Skip facture si `reminderCount >= invoiceReminderDays.length`
    - Test 7 : Skip facture si `lastReminderAt > now - 24h`
    - Test 8 : Appelle `sendInvoiceReminder({ invoiceId, triggered_by: 'cron' })` pour chaque facture éligible
    - Test 9 : Si scan compute une facture éligible avec dueDate < now - days[level] → relance niveau approprié
  </behavior>
  <action>
1. Créer `apps/web/src/lib/invoice-reminders/queue.ts` (clone-strict `closure/queue.ts`) :

```typescript
import { Queue } from 'bullmq';
import { getQueueRedis } from '../closure/redis';

export const INVOICE_REMINDER_QUEUE_NAME = 'invoice-reminders-daily';

let _queue: Queue | null = null;
export function getInvoiceReminderQueue(): Queue {
  if (_queue) return _queue;
  _queue = new Queue(INVOICE_REMINDER_QUEUE_NAME, {
    connection: getQueueRedis(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 60000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  });
  return _queue;
}
```

2. Créer `apps/web/src/lib/invoice-reminders/worker.ts` :

```typescript
import { Worker, type Job } from 'bullmq';
import { prisma } from '@qualiof/db';
import { getWorkerRedis } from '../closure/redis';
import { sendInvoiceReminder } from '@/server/actions/invoices';
import { getInvoiceReminderQueue, INVOICE_REMINDER_QUEUE_NAME } from './queue';

/**
 * Phase 11 — Mitigation Risque 2 (RESEARCH §Risques).
 * Le worker ne traite QUE les factures émises à partir de cette date pour éviter une cascade
 * d'emails sur l'historique au premier démarrage en prod.
 */
export const REMINDER_START_DATE = new Date('2026-05-19T00:00:00Z');

interface ReminderJobPayload {
  triggered_by: 'cron' | 'manual_admin_trigger';
}

const REMINDER_DEDUP_MS = 24 * 60 * 60 * 1000;

/**
 * Scan tous les tenants → toutes les factures éligibles → appelle sendInvoiceReminder pour chacune.
 */
export async function processReminderJob(job: Job<ReminderJobPayload>): Promise<{ processed: number }> {
  console.log('[invoice-reminder-worker] tick', { triggered_by: job.data.triggered_by });

  const tenants = await prisma.tenant.findMany({
    select: { id: true, invoiceReminderDays: true },
  });

  let processed = 0;
  const now = Date.now();

  for (const tenant of tenants) {
    const reminderDays = tenant.invoiceReminderDays ?? [30, 45];
    const maxLevel = reminderDays.length;
    const minDays = reminderDays[0]!;
    const minOverdueDate = new Date(now - minDays * 24 * 60 * 60 * 1000);

    const invoices = await prisma.invoice.findMany({
      where: {
        tenantId: tenant.id,
        status: { in: ['ISSUED', 'PARTIAL', 'OVERDUE'] },
        issueDate: { gte: REMINDER_START_DATE }, // mitigation R2
        // Ne tirer que celles dont l'échéance est dépassée du premier seuil
        OR: [
          { dueDate: { lte: minOverdueDate } },
          { dueDate: null, issueDate: { lte: minOverdueDate } },
        ],
      },
      select: { id: true, reminderCount: true, lastReminderAt: true },
    });

    for (const inv of invoices) {
      // Idempotence 24h
      if (inv.lastReminderAt && now - inv.lastReminderAt.getTime() < REMINDER_DEDUP_MS) continue;
      // Niveau max atteint
      if (inv.reminderCount >= maxLevel) continue;

      const result = await sendInvoiceReminder({
        invoiceId: inv.id,
        triggered_by: 'cron',
      });
      if (result.ok) processed += 1;
    }
  }

  return { processed };
}

export function startInvoiceReminderWorker(): Worker<ReminderJobPayload> {
  const worker = new Worker<ReminderJobPayload>(
    INVOICE_REMINDER_QUEUE_NAME,
    processReminderJob as never,
    {
      connection: getWorkerRedis(),
      concurrency: 1,
    },
  );

  worker.on('completed', (job, result) => {
    console.log('[invoice-reminder-worker] completed', { jobId: job.id, result });
  });
  worker.on('failed', (job, err) => {
    console.error('[invoice-reminder-worker] failed', { jobId: job?.id, err: err.message });
  });
  worker.on('error', (err) => {
    console.error('[invoice-reminder-worker] error', err);
  });

  return worker;
}

export async function scheduleDailyReminders(): Promise<void> {
  const queue = getInvoiceReminderQueue();
  await queue.add(
    'daily-reminders',
    { triggered_by: 'cron' as const },
    {
      repeat: { pattern: '0 8 * * *', tz: 'Europe/Paris' },
      jobId: 'daily-reminders-cron',
    },
  );
  console.log('[invoice-reminder-worker] daily cron registered (8h Paris)');
}
```

3. Créer `apps/web/scripts/invoice-reminder-worker.ts` (clone-strict `scripts/closure-worker.ts`) :

```typescript
import { startInvoiceReminderWorker, scheduleDailyReminders } from '../src/lib/invoice-reminders/worker';

async function main() {
  try {
    const worker = startInvoiceReminderWorker();
    await scheduleDailyReminders();

    const shutdown = async (signal: string) => {
      console.log(`[invoice-reminder-worker] ${signal} — shutting down`);
      await worker.close();
      process.exit(0);
    };

    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
  } catch (e) {
    console.warn('[invoice-reminder-worker] Redis indisponible — worker désactivé en mode dégradé.', e);
    // Keepalive pour ne pas faire planter concurrently
    setInterval(() => {}, 60_000);
  }
}

void main();
```

4. Éditer `apps/web/package.json` pour ajouter le script worker:reminders ET modifier dev:full :

```json
{
  "scripts": {
    // ... scripts existants ...
    "worker:reminders": "dotenv -e ../../.env -- tsx scripts/invoice-reminder-worker.ts",
    "dev:full": "rm -rf .next && concurrently -n next,closure,reminders -c blue,magenta,cyan -k \"pnpm dev\" \"pnpm worker:closure\" \"pnpm worker:reminders\""
  }
}
```

**IMPORTANT** : préserver `rm -rf .next` AVANT concurrently (mémoire utilisateur — non-négociable).

5. Remplacer `apps/web/src/lib/invoice-reminders/__tests__/worker.test.ts` (stub Wave 0) par 9 tests (cf behavior). Pattern : mock `@qualiof/db` (tenant.findMany + invoice.findMany), mock `sendInvoiceReminder` server action, mock `getQueueRedis` + `getWorkerRedis`.

6. Lancer : `pnpm --filter @qualiof/web test -- --run src/lib/invoice-reminders/__tests__/worker.test.ts` → 9 verts.
  </action>
  <verify>
    <automated>pnpm --filter @qualiof/web test -- --run src/lib/invoice-reminders/__tests__/worker.test.ts && grep -q "worker:reminders" apps/web/package.json && grep -q "rm -rf .next" apps/web/package.json</automated>
  </verify>
  <acceptance_criteria>
    - 3 fichiers `apps/web/src/lib/invoice-reminders/` créés (queue.ts, worker.ts, __tests__/worker.test.ts) (ls)
    - `worker.ts` exporte `startInvoiceReminderWorker`, `scheduleDailyReminders`, `REMINDER_START_DATE`, `processReminderJob` (grep)
    - `scheduleDailyReminders` utilise `repeat: { pattern: '0 8 * * *', tz: 'Europe/Paris' }` (grep)
    - `scheduleDailyReminders` utilise `jobId: 'daily-reminders-cron'` (grep)
    - `processReminderJob` filtre `status: { in: ['ISSUED', 'PARTIAL', 'OVERDUE'] }` (grep)
    - `processReminderJob` filtre `issueDate: { gte: REMINDER_START_DATE }` (grep)
    - Appelle `sendInvoiceReminder` avec `triggered_by: 'cron'` (grep)
    - `apps/web/scripts/invoice-reminder-worker.ts` existe avec try/catch + setInterval keepalive (grep)
    - `apps/web/package.json` contient `"worker:reminders":` (grep)
    - `apps/web/package.json` dev:full contient `rm -rf .next` AVANT `concurrently` (grep)
    - `apps/web/package.json` dev:full contient `pnpm worker:reminders` (grep)
    - 9/9 tests verts
    - `pnpm --filter @qualiof/web typecheck` → exit 0
  </acceptance_criteria>
  <done>Worker BullMQ daily registered au boot, scan + skip + relance, dégradé mode si Redis absent, intégré pnpm dev:full.</done>
</task>

<task type="auto">
  <name>Task 3 : SendReminderButton + intégration fiche facture</name>
  <files>apps/web/src/components/invoices/send-reminder-button.tsx, apps/web/src/components/invoices/__tests__/send-reminder-button.test.ts, apps/web/src/app/app/factures/[id]/page.tsx</files>
  <read_first>
    - apps/web/src/components/leads/reassign-lead-button.tsx (Pattern Radix Dialog Phase 9 — confirmation dialog)
    - apps/web/src/app/app/factures/[id]/page.tsx (page existante — Plan 11-05 a déjà ajouté CreateCreditNoteDialog ; cette tâche ajoute SendReminderButton sur la même page)
    - .planning/phases/11-factures-cycle-complet/11-RESEARCH.md §Open Questions Q6 (dialog confirmation manuel)
  </read_first>
  <action>
1. Créer `apps/web/src/components/invoices/send-reminder-button.tsx` :

```typescript
'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { sendInvoiceReminder } from '@/server/actions/invoices';

interface Props {
  invoiceId: string;
  status: string;
  lastReminderAt: Date | null;
  reminderCount: number;
  maxLevel: number;
}

const fmtDateTime = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function SendReminderButton({ invoiceId, status, lastReminderAt, reminderCount, maxLevel }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const disabled = !['ISSUED', 'PARTIAL', 'OVERDUE'].includes(status) || reminderCount >= maxLevel;
  const lastReminderLabel = lastReminderAt
    ? `Dernière relance le ${fmtDateTime.format(lastReminderAt)} (niveau ${reminderCount}).`
    : 'Aucune relance envoyée.';

  const handleSend = () => {
    startTransition(async () => {
      const res = await sendInvoiceReminder({ invoiceId, triggered_by: 'manual' });
      if (res.ok) {
        toast.success(`Relance envoyée (niveau ${res.level})${res.dryRun ? ' — DRY RUN' : ''}`);
        setOpen(false);
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="rounded border border-orange-300 bg-orange-50 px-4 py-2 text-sm text-orange-900 hover:bg-orange-100 disabled:opacity-50"
          title={disabled ? 'Niveau max atteint ou facture non éligible' : lastReminderLabel}
        >
          Envoyer relance maintenant
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[480px] rounded-lg bg-white p-6 shadow-xl">
          <Dialog.Title className="text-lg font-semibold">Envoyer une relance</Dialog.Title>
          <Dialog.Description className="text-sm text-slate-600 mt-1">
            {lastReminderLabel} Souhaitez-vous envoyer une nouvelle relance maintenant ?
          </Dialog.Description>
          <div className="flex justify-end gap-2 mt-6">
            <Dialog.Close asChild>
              <button type="button" className="rounded border border-slate-300 px-4 py-2 text-sm">Annuler</button>
            </Dialog.Close>
            <button
              type="button"
              onClick={handleSend}
              disabled={isPending}
              className="rounded bg-orange-600 text-white px-4 py-2 text-sm disabled:opacity-50"
            >
              {isPending ? 'Envoi…' : 'Envoyer la relance'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

2. Éditer `apps/web/src/app/app/factures/[id]/page.tsx` pour ajouter `<SendReminderButton>` après le block `<CreateCreditNoteDialog>` (Plan 11-05) :

```typescript
{['ISSUED', 'PARTIAL', 'OVERDUE'].includes(invoice.status) && (
  <SendReminderButton
    invoiceId={invoice.id}
    status={invoice.status}
    lastReminderAt={invoice.lastReminderAt}
    reminderCount={invoice.reminderCount}
    maxLevel={tenantReminderDays.length}
  />
)}
```

Étendre la query Prisma de la page existante pour inclure `lastReminderAt` et `reminderCount` dans le `select` :
```typescript
const invoice = await prisma.invoice.findFirst({
  where: { id, tenantId: user.tenantId },
  select: {
    // ... champs existants ...
    lastReminderAt: true,
    reminderCount: true,
    // ...
  },
});

const tenant = await prisma.tenant.findUnique({
  where: { id: user.tenantId },
  select: { invoiceReminderDays: true },
});
const tenantReminderDays = tenant?.invoiceReminderDays ?? [30, 45];
```

3. Créer `apps/web/src/components/invoices/__tests__/send-reminder-button.test.ts` (source-regex 5 tests) :
   - `'use client'` présent
   - Import `@radix-ui/react-dialog`, `sendInvoiceReminder`
   - Trigger label = "Envoyer relance maintenant"
   - Bouton submit appelle `sendInvoiceReminder` avec `triggered_by: 'manual'`
   - Disabled si reminderCount >= maxLevel OU status non éligible

4. Lancer : `pnpm --filter @qualiof/web test -- --run src/components/invoices/__tests__/send-reminder-button.test.ts`.
  </action>
  <verify>
    <automated>pnpm --filter @qualiof/web test -- --run src/components/invoices/__tests__/send-reminder-button.test.ts && pnpm --filter @qualiof/web typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `apps/web/src/components/invoices/send-reminder-button.tsx` existe avec `'use client'` (grep)
    - Importe `sendInvoiceReminder` (grep)
    - Trigger contient verbatim "Envoyer relance maintenant" (grep)
    - Appelle `sendInvoiceReminder({ invoiceId, triggered_by: 'manual' })` (grep `triggered_by: 'manual'`)
    - `apps/web/src/app/app/factures/[id]/page.tsx` contient `<SendReminderButton` (grep)
    - 5/5 tests verts
    - `pnpm --filter @qualiof/web typecheck` → exit 0
  </acceptance_criteria>
  <done>Bouton manuel UI fonctionnel, dialog de confirmation, toast success/error.</done>
</task>

</tasks>

<verification>
- `pnpm --filter @qualiof/web test -- --run src/server/actions/__tests__/send-reminder.test.ts` → 13/13
- `pnpm --filter @qualiof/web test -- --run src/lib/invoice-reminders/__tests__/worker.test.ts` → 9/9
- `pnpm --filter @qualiof/web test -- --run src/components/invoices/__tests__/send-reminder-button.test.ts` → 5/5
- `pnpm --filter @qualiof/web typecheck` → exit 0
- `pnpm --filter @qualiof/web build` toutes routes compilent
- **Manuel (cf 11-VALIDATION.md)** : `make up && pnpm dev:full` → vérifier log "daily-reminders-cron registered (8h Paris)" + worker reminders n'empêche pas closure worker de démarrer
- Anti-régression : tests Phase 2.2 closure worker toujours verts
</verification>

<success_criteria>
- Worker BullMQ daily cron registered au boot
- sendInvoiceReminder partagée cron+manual, idempotence cron only, auto-stop sur PAID
- AuditLog systématique (même sur error/dry-run)
- Bouton UI manuel avec dialog de confirmation
- pnpm dev:full lance 3 workers concurremment sans crash
- 27 tests Vitest verts (13 + 9 + 5)
- Mitigation R2 : REMINDER_START_DATE filtre l'historique
</success_criteria>

<output>
After completion, create `.planning/phases/11-factures-cycle-complet/11-06-SUMMARY.md`
</output>
