---
phase: 11-factures-cycle-complet
plan: 00
subsystem: database
tags: [prisma, postgres, vitest, factures, avoirs, relances]

# Dependency graph
requires:
  - phase: 07-param-tres-organisme-ditables
    provides: "Tenant.invoicePrefix + lib/numbering.ts pattern (Phase 7-02)"
  - phase: 09-distribution-leads-automatique
    provides: "logLeadEvent pattern (Phase 9 D-Phase9-H) à cloner pour logInvoiceEvent"
  - phase: 09.1-centralisation-qualiopi-360
    provides: "document-audit.ts module isolé pattern (D-Phase9.1-02)"
provides:
  - "Migration Prisma additive : Invoice +3 colonnes (originalInvoiceId self-FK, lastReminderAt, reminderCount) + Tenant +2 colonnes (creditNotePrefix, invoiceReminderDays Int[])"
  - "2 nouveaux index Postgres : [tenantId, status, lastReminderAt] (worker scan) + [originalInvoiceId] (reverse lookup avoirs)"
  - "8 fichiers tests stubs Vitest source-regex pour Plans Wave 1-3 (numbering credit-note + invoice audit + credit-note action + send-reminder action + invoices-export route + invoices-list action + worker + invoice-reminder mailer template)"
  - "@prisma/client régénéré avec types Invoice.creditNotes / Invoice.originalInvoice / Tenant.invoiceReminderDays"
affects: [11-01, 11-02, 11-03, 11-04, 11-05, 11-06, 11-07, 11-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave 0 Nyquist Dimension 8 : tests stubs créés AVANT les plans Wave 1-3 (zéro fichier MISSING)"
    - "Self-FK Prisma via relation nommée (`@relation(\"InvoiceToCreditNote\")`) avec onDelete SetNull pour préserver l'avoir juridiquement (CGI art. 289)"
    - "Postgres Int[] via Prisma 5.22 (`Int[] @default([30, 45])`) — 1ère utilisation QualiOF d'array natif"

key-files:
  created:
    - "packages/db/prisma/migrations/20260519120000_add_credit_notes_and_reminders/migration.sql"
    - "apps/web/src/lib/__tests__/numbering.credit-note.test.ts"
    - "apps/web/src/lib/__tests__/invoice-audit.test.ts"
    - "apps/web/src/server/actions/__tests__/credit-note.test.ts"
    - "apps/web/src/server/actions/__tests__/send-reminder.test.ts"
    - "apps/web/src/server/actions/__tests__/invoices-export.test.ts"
    - "apps/web/src/server/actions/__tests__/invoices-list.test.ts"
    - "apps/web/src/lib/invoice-reminders/__tests__/worker.test.ts"
    - "apps/web/src/lib/mailer-templates/__tests__/invoice-reminder.test.ts"
  modified:
    - "packages/db/prisma/schema.prisma (+16 lignes : Tenant +5 lignes Phase 11 commentées, Invoice +7 lignes + 2 nouveaux @@index)"

key-decisions:
  - "D-01 confirmée : réutilisation Invoice + status=CREDIT_NOTE + originalInvoiceId String? self-FK SetNull (pas de model séparé CreditNote)"
  - "D-02 confirmée : Tenant.creditNotePrefix String? @default(\"AVO\") séquence distincte des factures"
  - "D-10 confirmée : Tenant.invoiceReminderDays Int[] @default([30, 45]) — array Postgres natif"
  - "D-13b confirmée : tracking Invoice.lastReminderAt + Invoice.reminderCount @default(0) pour idempotence cron + auto-stop niveau max"
  - "Numérotation migration : timestamp \"20260519120000\" préfixe convention Prisma + slug human-readable add_credit_notes_and_reminders"
  - "Tests stubs Vitest pattern source-regex (D-Phase9-N) : import { describe, it } + it.todo(...) — collectés par Vitest sans throw, 73 todo + 421 existants verts (suite passe à 494 tests)"

patterns-established:
  - "Self-FK Prisma : `@relation(\"NomDeLaRelation\", fields: [fk], references: [id], onDelete: SetNull)` côté FK + `Invoice[] @relation(\"NomDeLaRelation\")` côté inverse"
  - "Postgres Int[] @default([...]) : pour listes courtes config tenant (1-3 valeurs), pas besoin de table séparée"
  - "Vitest stub Wave 0 : header `// Wave 0 stub — Phase 11 — implemented in Plan {NN}` + `describe(...)` + `it.todo('...')` — permet aux plans Wave 1-3 de pointer vers leur fichier sans throw"

requirements-completed: [FACT-01, FACT-02, FACT-03, FACT-04]

# Metrics
duration: ~25min
completed: 2026-05-19
---

# Phase 11 Plan 00: Foundation — Migration Prisma + 8 fichiers tests stubs Wave 0

**Migration Prisma additive (Invoice + Tenant) + 8 fichiers tests stubs Vitest pour débloquer Wave 1-3 — passe Nyquist Dimension 8**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-19T15:18:00Z
- **Completed:** 2026-05-19T15:43:25Z
- **Tasks:** 2 (both type=auto, autonomous)
- **Files modified:** 10 (1 schema + 1 migration + 8 tests stubs)

## Accomplishments

- **Schema BDD étendu** : `Invoice` reçoit `originalInvoiceId` (self-FK SetNull pour avoirs), `lastReminderAt` et `reminderCount` (tracking relances) ; `Tenant` reçoit `creditNotePrefix` (séquence AVO-) et `invoiceReminderDays Int[]` (config J+N par tenant)
- **Migration additive 100% safe** : tous les ADD COLUMN sont nullables ou ont un DEFAULT — aucune row existante cassée (validé par Plan 07-04 fix)
- **2 nouveaux index Postgres** : `[tenantId, status, lastReminderAt]` (worker daily scan) + `[originalInvoiceId]` (reverse lookup "quels avoirs pour cette facture ?")
- **8 fichiers tests stubs créés** aux chemins canoniques de 11-VALIDATION.md, collectés par Vitest sans erreur (73 it.todo), zéro régression sur les 421 tests existants
- **`@prisma/client` régénéré** : types `Invoice.creditNotes`, `Invoice.originalInvoice`, `Tenant.invoiceReminderDays` dispo pour Plans Wave 1-3

## Task Commits

Chaque task committée atomiquement :

1. **Task 1: Migration Prisma additive + schema.prisma** — `965daa7` (feat)
2. **Task 2: 8 fichiers tests stubs scaffolds Wave 0** — `8575440` (test)

## Files Created/Modified

### Created
- `packages/db/prisma/migrations/20260519120000_add_credit_notes_and_reminders/migration.sql` — 5 ADD COLUMN + 1 ADD CONSTRAINT (self-FK SetNull) + 2 CREATE INDEX
- `apps/web/src/lib/__tests__/numbering.credit-note.test.ts` — 6 `it.todo` getNextCreditNoteNumber séquence AVO- + custom prefix + tx atomicité (Plan 11-01)
- `apps/web/src/lib/__tests__/invoice-audit.test.ts` — 5 `it.todo` logInvoiceEvent entity='Invoice' + 6 actions invoices.* namespacées (Plan 11-02)
- `apps/web/src/server/actions/__tests__/credit-note.test.ts` — 11 `it.todo` createCreditNote avoir total/partiel + RBAC + montants négatifs (Plan 11-05)
- `apps/web/src/server/actions/__tests__/send-reminder.test.ts` — 12 `it.todo` sendInvoiceReminder cron/manual + auto-stop PAID + idempotence 24h + dry-run (Plan 11-06)
- `apps/web/src/server/actions/__tests__/invoices-export.test.ts` — 11 `it.todo` exportInvoicesXlsx route API 12 colonnes + RBAC ADMIN+COMPTABLE + AVO négatif (Plan 11-07)
- `apps/web/src/server/actions/__tests__/invoices-list.test.ts` — 10 `it.todo` getInvoicesListData 4 KPI CA/Impayés/DSO/À-facturer + filtres + tri + pagination (Plan 11-08)
- `apps/web/src/lib/invoice-reminders/__tests__/worker.test.ts` — 9 `it.todo` invoice-reminder-worker cron Europe/Paris + skip logic + Redis indisponible (Plan 11-06)
- `apps/web/src/lib/mailer-templates/__tests__/invoice-reminder.test.ts` — 9 `it.todo` renderInvoiceReminderEmail level=1 amical / level=2 ferme + escapeHtml (Plan 11-03)

### Modified
- `packages/db/prisma/schema.prisma` (+16 lignes) :
  - `model Tenant` : `creditNotePrefix String? @default("AVO")` + `invoiceReminderDays Int[] @default([30, 45])`
  - `model Invoice` : `originalInvoiceId String?` + self-FK `originalInvoice Invoice?` + back-relation `creditNotes Invoice[]` + `lastReminderAt DateTime?` + `reminderCount Int @default(0)`
  - `model Invoice` @@index : `[tenantId, status, lastReminderAt]` (worker) + `[originalInvoiceId]` (reverse lookup avoirs)

## Decisions Made

Aucune décision nouvelle — plan exécuté à la lettre selon les D-01..D-21 lockées dans 11-CONTEXT.md et 11-RESEARCH.md.

Seul choix mineur de Claude's Discretion :
- **Convention nommage migration** : `20260519120000_add_credit_notes_and_reminders` (timestamp 6 chiffres heure conventional + slug court). Cohérent avec les 20 migrations existantes (`20260516160839_phase09_distribution`, `20260518131134_phase091_participant_doc_status`).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Aucun. Vitest collecte les 8 fichiers stubs sans erreur :

```
Test Files  49 passed | 8 skipped (57)
     Tests  421 passed | 73 todo (494)
```

Les 8 stubs apparaissent comme `↓ src/.../{file}.test.ts (N tests | N skipped)` — comportement attendu pour `it.todo()` (rapporté comme TODO, ne plante pas).

## Self-Check: PASSED

**Files created/modified vérifiés :**
- ✓ `packages/db/prisma/migrations/20260519120000_add_credit_notes_and_reminders/migration.sql` (5 ADD COLUMN + 1 ADD CONSTRAINT + 2 CREATE INDEX)
- ✓ `packages/db/prisma/schema.prisma` (Tenant.creditNotePrefix + Tenant.invoiceReminderDays + Invoice.originalInvoiceId + Invoice.lastReminderAt + Invoice.reminderCount + 2 nouveaux @@index)
- ✓ 8 fichiers tests stubs existent aux chemins canoniques (vérifié par `[ -f ]`)
- ✓ Tous les 8 fichiers contiennent l'en-tête `// Wave 0 stub — Phase 11 — implemented in Plan {NN}` (8/8 grep match)
- ✓ Tous les acceptance criteria grep pass (numbering.credit-note / invoice-audit / credit-note / send-reminder / invoices-export / invoices-list / worker / invoice-reminder)

**Commits vérifiés :**
- ✓ `965daa7` (Task 1) — feat(11-00): Prisma additive migration credit notes + reminders
- ✓ `8575440` (Task 2) — test(11-00): 8 stubs Wave 0 — credit-note, reminders, export, list

**Tests Vitest :**
- ✓ 421 tests existants passent (0 régression Phase 9.1)
- ✓ 73 it.todo collectés sur les 8 nouveaux fichiers
- ✓ `pnpm --filter @qualiof/web test -- --run` exit 0

**Typecheck :**
- ✓ `npx tsc --noEmit` exit 0 (apps/web)
- ✓ `pnpm --filter @qualiof/db db:generate` exit 0 — Prisma client v5.22.0 régénéré

## User Setup Required

None - no external service configuration required. Le `prisma migrate dev` ou `prisma migrate deploy` sera exécuté par Laurent quand il déploiera (la migration est commitée mais pas appliquée sur la BDD locale en sandbox).

## Next Phase Readiness

- **Plans Wave 1 débloqués** : 11-01 (`getNextCreditNoteNumber`), 11-02 (`logInvoiceEvent`), 11-03 (template email `invoice-reminder.ts`) peuvent maintenant pointer vers leur fichier de test dédié sans erreur de collecte.
- **Plans Wave 2 débloqués** : 11-04 (`recordPartialPayment` / extension `recordInvoicePayment`), 11-05 (`createCreditNote`), 11-06 (worker `invoice-reminder-worker.ts` + `sendInvoiceReminder`).
- **Plans Wave 3 débloqués** : 11-07 (`exportInvoicesXlsx` route API), 11-08 (`getInvoicesListData` + UI page liste).
- **Aucun blocker** identifié — schema BDD prêt, `@prisma/client` régénéré, tests stubs en place.

---
*Phase: 11-factures-cycle-complet*
*Completed: 2026-05-19*
