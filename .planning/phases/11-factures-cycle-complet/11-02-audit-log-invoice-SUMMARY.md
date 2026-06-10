---
phase: 11-factures-cycle-complet
plan: 02
subsystem: audit
tags: [audit-log, prisma, vitest, invoice, namespaced-actions]

# Dependency graph
requires:
  - phase: 07-param-tres-organisme-ditables
    provides: logTenantSettingsChange — pattern AuditLog entity-namespaced (parameters.*)
  - phase: 08-multi-utilisateurs-et-rbac
    provides: logUserAction — pattern actorUserId nullable + targetEntityId
  - phase: 09-distribution-leads-automatique
    provides: logLeadEvent — D-Phase9-H pattern (pas de no-op sur diff vide)
  - phase: 09.1-centralisation-qualiopi-360
    provides: logDocumentEvent + D-Phase9.1-02 (one helper per entity, module isolé)
  - phase: 11-factures-cycle-complet (Plan 11-00)
    provides: stub it.todo apps/web/src/lib/__tests__/invoice-audit.test.ts
provides:
  - logInvoiceEvent helper (apps/web/src/lib/invoice-audit.ts) — 5ème instance « one helper per entity »
  - 6 actions namespacées D-18 (invoices.created / issued / payment_recorded / credit_note_created / reminder_sent / exported)
  - Convention targetInvoiceId='BULK' pour invoices.exported (export Plan 11-07)
  - Convention actorUserId=null pour cron worker daily relances (Plan 11-06)
affects:
  - 11-05 (createCreditNote → invoices.credit_note_created)
  - 11-06 (worker relances cron → invoices.reminder_sent, actorUserId null)
  - 11-07 (route /api/factures/export → invoices.exported, targetInvoiceId='BULK')
  - 11-08 (page liste — actions de mutation factures)
  - Toute Phase 12+ touchant aux factures

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One helper per entity (D-Phase9.1-02) : 5ème instance après Phase 7/8/9/9.1"
    - "AuditLog entity-namespaced — entity='Invoice', action='invoices.<verb>' (D-18)"
    - "Pattern test Vitest clone-strict document-audit.test.ts (Phase 9.1) : factory mock prisma + cast vi.fn()"

key-files:
  created:
    - apps/web/src/lib/invoice-audit.ts
  modified:
    - apps/web/src/lib/__tests__/invoice-audit.test.ts

key-decisions:
  - "Aligner le pattern de mock test sur document-audit.test.ts (factory + cast) plutôt que sur le snippet imbriqué du PLAN — cohérence Phase 9.1 explicite (mentionné dans <read_first>)."
  - "Cast `as never` sur le champ diff prisma (cohérent helpers Phase 7/8/9/9.1 — Json column typing strict)."

patterns-established:
  - "Pattern test AuditLog helper : `vi.mock('@qualiof/db')` factory + `prisma.auditLog.create as unknown as ReturnType<typeof vi.fn>` cast — Phase 9.1 reproduit Phase 11."
  - "Convention targetInvoiceId='BULK' pour les actions sur N rows (vs entityId réel pour single-row actions)."

requirements-completed:
  - FACT-01
  - FACT-02
  - FACT-03
  - FACT-04

# Metrics
duration: 2m 11s
completed: 2026-05-19
---

# Phase 11 Plan 02 : Audit log invoice Summary

**Helper `logInvoiceEvent` clone-strict du pattern Phase 9.1, 6 actions namespacées D-18, module isolé (audit-log.ts global intact).**

## Performance

- **Duration:** 2m 11s
- **Started:** 2026-05-19T15:50:32Z
- **Completed:** 2026-05-19T15:52:43Z
- **Tasks:** 1 / 1 (TDD: RED → GREEN)
- **Files modified:** 2 (1 created + 1 modified stub→real)

## Accomplishments

- Module isolé `apps/web/src/lib/invoice-audit.ts` (50 lignes) exporte `logInvoiceEvent` + type `Diff`.
- 6 tests Vitest verts (135 lignes) couvrant la sémantique D-18 complète :
  1. Création de row AuditLog avec `entity='Invoice'`
  2. `actorUserId: null` accepté (cron worker — D-13c)
  3. Les 6 actions namespacées D-18 (`invoices.created` / `invoices.issued` / `invoices.payment_recorded` / `invoices.credit_note_created` / `invoices.reminder_sent` / `invoices.exported`)
  4. Sérialisation `diff` en JSON via `Record<string, unknown>`
  5. Pas de no-op sur diff vide (cohérent D-Phase9-H Phase 9)
  6. `targetInvoiceId='BULK'` accepté (convention `invoices.exported` Plan 11-07)
- Anti-régression : `apps/web/src/lib/audit-log.ts` global **non modifié** (D-Phase9.1-02 — frontière phase préservée).
- Suite audit complète (Phase 7 + 9 + 9.1 + 11) : **13/13 verts** sur les 3 fichiers de tests audit.

## Task Commits

Each task was committed atomically (TDD RED → GREEN, pas de refactor nécessaire) :

1. **Task 1 RED — Tests `logInvoiceEvent`** — `e88614d` (test)
2. **Task 1 GREEN — Module `logInvoiceEvent`** — `70378ba` (feat)

**Plan metadata commit:** (à venir — voir final_commit step)

_Note: REFACTOR sauté — module de 50 lignes, signature stable, JSDoc complète, clone-strict du pattern Phase 9.1 — rien à nettoyer._

## Files Created/Modified

- `apps/web/src/lib/invoice-audit.ts` (créé, 50 lignes) — Helper `logInvoiceEvent` + JSDoc complète (4ème instance « one helper per entity » documentée : Phase 7/8/9/9.1/11 lineage).
- `apps/web/src/lib/__tests__/invoice-audit.test.ts` (modifié, stub `it.todo` → suite réelle 135 lignes / 6 tests).

## Decisions Made

- **Style des tests aligné Phase 9.1 (pas le snippet du PLAN)** : le plan proposait un mock avec `createMock` extracted à top-level + closure dans la factory ; le pattern documenté Phase 9.1 (cité dans `<read_first>` du plan : « document-audit.ts pattern Phase 9.1 D-Phase9.1-02 — module isolé per-entity, à reproduire à l'identique ») utilise `vi.fn()` à l'intérieur de la factory + cast `prisma.auditLog.create as unknown as ReturnType<typeof vi.fn>`. Choix : aligner sur Phase 9.1 pour cohérence stylistique (Claude's Discretion implicite — le contenu fonctionnel des 6 tests reste 100% conforme au plan). Tous les assertions (`entity='Invoice'`, 6 actions, BULK, no-op rejeté, null actor) sont préservées.
- **Type `Diff` exporté** (cohérent `document-audit.ts` qui exporte aussi `Diff`) — permet aux callers Plans 11-05/06/07/08 d'utiliser le type unifié si besoin d'un computeDiff plus tard.
- **`as never` cast Json column** : pattern repris de Phase 7/8/9/9.1 audit-log.ts — Prisma `Json` field typing strict nécessite ce cast (sinon TS hurle sur `Record<string, unknown>` vs `Prisma.JsonValue`).

## Deviations from Plan

None - plan executed exactly as written (le raffinement de style des tests est conforme à la directive `<read_first>` du plan qui demande de reproduire **à l'identique** le pattern `document-audit.ts`).

## Issues Encountered

- Vitest filtre `pnpm --filter @qualiof/web test -- --run <file>` ne propage pas le filtre correctement (lance toute la suite, où on voit des FAIL non-liés à 11-02 — appartiennent à l'agent parallèle 11-01 sur `numbering.credit-note.test.ts`). Contournement : `cd apps/web && pnpm exec vitest run <file>` qui isole correctement le fichier.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Plan 11-05** (createCreditNote) peut importer `logInvoiceEvent` depuis `@/lib/invoice-audit` pour action `invoices.credit_note_created`.
- **Plan 11-06** (worker relances) peut utiliser `actorUserId: null` + `action: 'invoices.reminder_sent'` avec payload `{level, channel, triggered_by}`.
- **Plan 11-07** (export xlsx) peut utiliser `targetInvoiceId: 'BULK'` + `action: 'invoices.exported'` avec payload `{from, to, count}`.
- **Plan 11-08** (page liste) peut utiliser pour les mutations factures inline.
- Convention D-18 verrouillée, pas d'ambiguïté pour les Plans aval.

## Self-Check

Verification of claims before state updates:

**Files exist:**
- FOUND: `apps/web/src/lib/invoice-audit.ts` (50 lines)
- FOUND: `apps/web/src/lib/__tests__/invoice-audit.test.ts` (135 lines)

**Commits exist:**
- FOUND: `e88614d` test(11-02): add failing tests for logInvoiceEvent
- FOUND: `70378ba` feat(11-02): add logInvoiceEvent helper

**Anti-regression check:**
- `git diff HEAD~5 HEAD -- apps/web/src/lib/audit-log.ts` → empty (D-Phase9.1-02 respected)
- Audit suite (audit-log + document-audit + invoice-audit) : 13/13 verts

## Self-Check: PASSED

---
*Phase: 11-factures-cycle-complet*
*Completed: 2026-05-19*
