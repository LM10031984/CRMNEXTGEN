---
phase: 11-factures-cycle-complet
plan: 06
subsystem: payments
tags: [bullmq, cron, redis, invoice-reminders, server-actions, radix-dialog, react]

# Dependency graph
requires:
  - phase: 11-04
    provides: "Tenant.invoiceReminderDays + InvoiceReminderSettingsSchema (config J+N relances)"
  - phase: 11-03
    provides: "renderInvoiceReminderEmail template (level 1 amical / 2 ferme)"
  - phase: 11-02
    provides: "logInvoiceEvent + AuditLog convention invoices.*"
  - phase: 11-00
    provides: "Invoice.lastReminderAt + Invoice.reminderCount (migration foundation)"
  - phase: 7
    provides: "loadOfConfig(tenantId) hybride BDD/ENV"
  - phase: 8
    provides: "requireRole + UnauthorizedError/ForbiddenError + AuditLog conventions"
  - phase: 9
    provides: "pattern Radix Dialog (ReassignLeadButton D-Phase9-J)"
provides:
  - "sendInvoiceReminder({invoiceId, triggered_by:'cron'|'manual'}) server action partagée"
  - "Worker BullMQ daily cron 0 8 * * * Europe/Paris (jobId daily-reminders-cron)"
  - "Scan multi-tenant + skip logic (R2 cascade mitigation + D-13b 24h)"
  - "<SendReminderButton> Client Component fiche facture (D-09 manual ignore idempotence)"
  - "Process worker indépendant : pnpm worker:reminders intégré dev:full"
affects: [11-08-page-liste-factures, 11-09-bookkeeping]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Worker BullMQ daily repeatable (cron + tz + jobId fixe idempotent)"
    - "Server action partagée cron/manual (skip requireRole conditionnel)"
    - "REMINDER_START_DATE constante figée pour mitiger cascade historique (R2)"
    - "Mode dégradé Redis : try/catch + setInterval keepalive (clone closure-worker)"
    - "concurrently 3 workers (next + closure + reminders) avec rm -rf .next gardien"

key-files:
  created:
    - "apps/web/src/lib/invoice-reminders/queue.ts"
    - "apps/web/src/lib/invoice-reminders/worker.ts"
    - "apps/web/scripts/invoice-reminder-worker.ts"
    - "apps/web/src/components/invoices/send-reminder-button.tsx"
    - "apps/web/src/components/invoices/__tests__/send-reminder-button.test.ts"
  modified:
    - "apps/web/src/lib/invoice-reminders/__tests__/worker.test.ts (stub Wave 0 → 9 tests)"
    - "apps/web/package.json (worker:reminders + dev:full étendu 3 workers)"
    - "apps/web/src/server/actions/invoices.ts (sendInvoiceReminder, Task 1 commit 3eeda99 préalable)"
    - "apps/web/src/server/actions/__tests__/send-reminder.test.ts (Task 1 commit 3eeda99 préalable)"
    - "apps/web/src/app/app/factures/[id]/page.tsx (CTA SendReminderButton + tenant.invoiceReminderDays parallel fetch)"

key-decisions:
  - "Worker daily repeatable cron via jobId='daily-reminders-cron' fixe — BullMQ dédoublonne nativement, scheduleDailyReminders idempotent au boot."
  - "REMINDER_START_DATE = 2026-05-19T00:00:00Z figée dans le code (mitigation R2). Le worker IGNORE l'historique pré-Phase 11 pour éviter cascade emails au premier boot prod."
  - "Idempotence 24h appliquée 2 fois (defense-in-depth) : côté worker (skip avant l'action) ET côté action (recheck) — la 2e passe est gratuite si la 1e a déjà filtré."
  - "Mode dégradé Redis : try/catch + setInterval keepalive 60s (clone closure-worker pattern). Le worker ne fait pas planter `pnpm dev:full` si Docker compose n'est pas up — important pour tests/CI/onboarding."
  - "dev:full étendu : concurrently 3 workers (next/closure/reminders) avec `rm -rf .next &&` strictement AVANT — règle utilisateur non-négociable préservée."
  - "Test stratégie vi.mock(bullmq) factory inline pour éviter ReferenceError d'hoisting — pattern source-regex pour le composant UI (D-Phase9-N, React Testing Library non installé)."

patterns-established:
  - "Worker BullMQ daily : clone strict Phase 2.2 closure (queue + worker + script + dev:full) — réutilisable Phase 12+ pour autres jobs CRON (relances OPCO, satisfaction froid, etc.)."
  - "Server action partagée cron/manual : skip RBAC conditionnel `if (input.triggered_by === 'manual') { requireRole(...) }` + lookup tenantId depuis facture si cron — pattern réutilisable pour futures actions système."
  - "Boutons UI fiche facture : pattern <Send icon + Radix Dialog + useTransition + toast> aligné avec CreateCreditNoteDialog + ReassignLeadButton."

requirements-completed: [FACT-03]

# Metrics
duration: 28min
completed: 2026-05-20
---

# Phase 11 Plan 06: Worker BullMQ daily relances factures Summary

**Worker BullMQ cron daily 8h Europe/Paris + server action sendInvoiceReminder partagée cron/manual + bouton manuel UI fiche facture, avec mitigation cascade R2 (REMINDER_START_DATE) et mode dégradé Redis.**

## Performance

- **Duration:** ~28 min (Task 2 + Task 3 + SUMMARY + bookkeeping — Task 1 livré préalablement commit `3eeda99`)
- **Started:** 2026-05-20T09:52:55Z (resume sur Task 2)
- **Completed:** 2026-05-20T12:21:00Z
- **Tasks:** 3 (Task 1 pré-livrée, Tasks 2 et 3 exécutées dans cette session)
- **Files modified:** 8 (5 créés + 3 modifiés dans cette session ; Task 1 = 2 fichiers du commit préalable)

## Accomplishments

- **FACT-03 livré** : système hybride de relances factures (worker daily automatique + bouton manuel UI) avec audit-log systématique et dry-run mailer si SMTP non configuré.
- **Worker BullMQ daily** registered au boot via `scheduleDailyReminders()` avec cron `'0 8 * * *'` tz `Europe/Paris` et `jobId='daily-reminders-cron'` (idempotence BullMQ native, ré-exec safe).
- **Server action `sendInvoiceReminder`** partagée cron + manual (D-09) avec skip `requireRole` côté cron (worker système) et idempotence 24h cron-only (D-13b — l'utilisateur force au manuel).
- **`<SendReminderButton>`** Client Component Radix Dialog sur fiche facture (`/app/factures/[id]`), désactivé si status non éligible OU niveau max atteint, avec tooltip explicite et toast sonner.
- **Mitigation R2 (cascade historique)** : `REMINDER_START_DATE = 2026-05-19T00:00:00Z` figée — le worker ne traite QUE les factures émises depuis Phase 11 (pas d'avalanche d'emails sur les anciennes factures impayées au premier boot prod).
- **`pnpm dev:full`** étendu : concurrently 3 workers (next/closure/reminders) avec `rm -rf .next` strictement AVANT (règle utilisateur non-négociable préservée).
- **Mode dégradé Redis** : si Redis indisponible au boot du process worker, log warning + `setInterval` keepalive → ne fait pas planter `dev:full` en CI/test/onboarding.

## Task Commits

Each task was committed atomically:

1. **Task 1: sendInvoiceReminder server action (cron + manual)** - `3eeda99` (feat) — *livré préalablement à cette session, état initial du prompt*
2. **Task 2: Worker BullMQ daily (queue + worker + script + dev:full)** - `5a72da1` (feat)
3. **Task 3: SendReminderButton + intégration fiche facture** - `3e5f4c0` (feat)

**Plan metadata:** _à venir, commit final SUMMARY + STATE + ROADMAP._

## Files Created/Modified

### Créés dans cette session (Tasks 2 + 3)

- `apps/web/src/lib/invoice-reminders/queue.ts` — BullMQ Queue singleton `invoice-reminders-daily` (clone-strict `closure/queue.ts`).
- `apps/web/src/lib/invoice-reminders/worker.ts` — `startInvoiceReminderWorker` + `scheduleDailyReminders` + `processReminderJob` (handler exporté pour testabilité) + `REMINDER_START_DATE` constante mitigation R2.
- `apps/web/scripts/invoice-reminder-worker.ts` — Entry-point process worker (clone-strict `scripts/closure-worker.ts`) avec try/catch + setInterval keepalive en mode dégradé.
- `apps/web/src/components/invoices/send-reminder-button.tsx` — Client Component Radix Dialog (D-Phase9-J pattern) avec disabled wiring (status + reminderCount) + tooltip explicite + toast success/error + `router.refresh()`.
- `apps/web/src/components/invoices/__tests__/send-reminder-button.test.ts` — 5 tests source-regex (use client + radix + sendInvoiceReminder + label + manual + disabled).

### Modifiés dans cette session

- `apps/web/src/lib/invoice-reminders/__tests__/worker.test.ts` — Stub Wave 0 (9 `it.todo`) remplacé par 9 tests verts (scan status IN + filtre R2 + multi-tenant + skip reminderCount/lastReminderAt + delegate à sendInvoiceReminder + cron pattern Europe/Paris + jobId fixe + REMINDER_START_DATE).
- `apps/web/package.json` — Ajouté `worker:reminders` script + `dev:full` étendu avec `concurrently -n next,closure,reminders -c blue,magenta,cyan -k`. `rm -rf .next &&` préservé en tête (règle non-négociable).
- `apps/web/src/app/app/factures/[id]/page.tsx` — Import `SendReminderButton` + `Promise.all([invoice.findFirst, tenant.findUnique({invoiceReminderDays})])` parallel fetch + insertion CTA dans `<section flex-wrap>` après `<CreateCreditNoteDialog>`. Visible si status ∈ {ISSUED, PARTIAL, OVERDUE}.

### Modifiés préalablement (Task 1, commit `3eeda99`)

- `apps/web/src/server/actions/invoices.ts` — `sendInvoiceReminder(input)` appendée (193 lignes) avec helper `getReminderRecipientEmail` priorité `payerOrg.emailBilling > payerOrg.email > participant.person.email`, RBAC manual-only, idempotence cron-only 24h, AuditLog systématique même sur erreur/dry-run.
- `apps/web/src/server/actions/__tests__/send-reminder.test.ts` — 13 tests verts (RBAC × 5 cas + auto-stop status × 4 + idempotence cron vs manual + niveau max + clamp level + sendMail/renderInvoiceReminderEmail + dry-run + update invoice tracking + AuditLog diff complet + aucun email payeur).

## Decisions Made

- **Worker daily repeatable cron via jobId fixe** : `jobId='daily-reminders-cron'` permet ré-exec idempotent au boot du process. Pas besoin de `removeRepeatable` ni de check `getRepeatableJobs` — BullMQ dédoublonne nativement.
- **`REMINDER_START_DATE` figée dans le code** (constante exportée, pas variable d'env) : la mitigation R2 doit être identique en dev/staging/prod, pas configurable accidentellement. Si on doit la changer un jour, c'est un commit explicite + audit, pas une rotation de secret.
- **Idempotence 24h en defense-in-depth** : appliquée 2 fois (worker scan ET action recheck). Le coût est nul (1 condition `if`), et ça permet à l'action d'être appelée directement (ex. tests, futures intégrations CLI) sans bypasser la sécurité.
- **Tooltip explicite sur les 3 raisons disabled** : si le bouton est grisé, l'utilisateur sait pourquoi (non éligible status / niveau max / dernière relance). Évite les "pourquoi je peux pas cliquer ?" de support.
- **Test source-regex pour le composant UI** : D-Phase9-N reproduite (React Testing Library non installé, vitest env=node). 5 tests structurels couvrent le contrat (use client + radix + import action + verbatim label + triggered_by manual + disabled wiring) sans scope creep.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] vi.mock hoisting ReferenceError sur `queueCtorMock`**

- **Found during:** Task 2 (premier run du worker test)
- **Issue:** Le pattern initial déclarait `const queueCtorMock = vi.fn()...` AVANT `vi.mock('bullmq', () => ({ Queue: queueCtorMock, ... }))`. Vitest hoist `vi.mock` au top du fichier, donc la factory s'exécute AVANT que `queueCtorMock` ne soit initialisé → `ReferenceError: Cannot access 'queueCtorMock' before initialization`.
- **Fix:** Inline les mocks directement dans la factory `vi.mock('bullmq', () => { const queueAdd = vi.fn()...; return { Queue: ..., Worker: ..., __queueAdd: queueAdd }; })`. Récupération côté tests via `import * as bullmq from 'bullmq'` + cast `(bullmq as { __queueAdd: ... }).__queueAdd`.
- **Files modified:** `apps/web/src/lib/invoice-reminders/__tests__/worker.test.ts`
- **Verification:** 9/9 tests verts au second run.
- **Committed in:** `5a72da1` (Task 2 commit, fix appliqué avant commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Le fix est purement testing infrastructure — aucun changement de comportement runtime. Pattern à retenir pour les futurs mocks de classes (ES modules vs hoisting Vitest).

## Issues Encountered

- **vi.mock hoisting** (cf. Deviations Rule 3) : pattern résolu et documenté pour les futurs tests de modules BullMQ / autres classes.
- **Anti-régression** : suite complète apps/web 537/537 verts (+5 Task 3 +9 Task 2 = +14 vs baseline 523 pré-session). Aucune autre suite cassée. tsc clean.

## User Setup Required

None - le worker démarre automatiquement via `pnpm dev:full`. Mode dégradé Redis géré (le worker keepalive sans crash). En prod : ajouter `pnpm worker:reminders` au systemd/pm2/docker à côté de `worker:closure`.

**Validation manuelle (cf 11-VALIDATION.md, à exécuter par Laurent au prochain `make up && pnpm dev:full`)** :
- Vérifier log `[invoice-reminder-worker] daily cron registered (08:00 Europe/Paris)` au boot.
- Créer une facture test, attendre 30+ jours (ou modifier `dueDate` côté BDD) — au prochain tick cron 8h, vérifier email envoyé + AuditLog `invoices.reminder_sent`.
- Sur fiche facture impayée, cliquer "Envoyer relance maintenant" → toast vert "Relance envoyée (niveau 1)" + `reminderCount` incrémenté + `lastReminderAt` mis à jour.

## Next Phase Readiness

- **FACT-03 fonctionnellement complet** : worker daily + bouton manuel + audit + dry-run + R2 mitigation + mode dégradé.
- **Plan 11-08 (page liste factures) débloqué** : peut consommer `lastReminderAt` + `reminderCount` pour afficher un badge "Relancée le {date} (N1)" sur la liste.
- **Plan 11-09 (bookkeeping fin de phase) débloqué** : tous les plans Wave 2 (11-05/06/07) livrés.
- **Dette tracée** : aucune. Le worker scan O(tenants × invoices), acceptable pour les volumes Start Academy (< 100 factures actives par tenant). Si scale, optimisation possible via index composite `(tenantId, status, issueDate, dueDate)` — pas critique en v1.

## Self-Check: PASSED

All 6 files claimed in this summary exist on disk:
- `apps/web/src/lib/invoice-reminders/queue.ts` FOUND
- `apps/web/src/lib/invoice-reminders/worker.ts` FOUND
- `apps/web/scripts/invoice-reminder-worker.ts` FOUND
- `apps/web/src/components/invoices/send-reminder-button.tsx` FOUND
- `apps/web/src/components/invoices/__tests__/send-reminder-button.test.ts` FOUND
- `.planning/phases/11-factures-cycle-complet/11-06-worker-relances-SUMMARY.md` FOUND

All 3 commits exist in git log:
- `3eeda99` (Task 1, livré préalablement) FOUND
- `5a72da1` (Task 2) FOUND
- `3e5f4c0` (Task 3) FOUND

---
*Phase: 11-factures-cycle-complet*
*Completed: 2026-05-20*
