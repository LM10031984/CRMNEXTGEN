---
phase: 11-factures-cycle-complet
plan: 01
subsystem: invoicing
tags: [numbering, credit-note, avoir, vitest, atomicity, cgi-289]

# Dependency graph
requires:
  - phase: 07-param-tres-organisme-ditables
    provides: "lib/numbering.ts getNextInvoiceNumber Phase 7-02 (pattern à cloner)"
  - phase: 11-factures-cycle-complet
    provides: "Plan 11-00 — Tenant.creditNotePrefix String? @default('AVO') + stub Vitest numbering.credit-note.test.ts"
provides:
  - "Helper getNextCreditNoteNumber(tenantId, tx?): Promise<string> exporté depuis apps/web/src/lib/numbering.ts"
  - "Séquence dédiée AVO-NNNNNN distincte de FAC-NNNNNN (CGI art. 289)"
  - "Atomicité transactionnelle via tx?: Prisma.TransactionClient (race condition mitigée)"
  - "Suite Vitest 7 tests verts (initial sample 6 du plan + 1 bonus 'Tenant introuvable' aligné numbering.test.ts Phase 7)"
affects: [11-05, 11-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Clone-strict d'un helper Phase précédente — additions only, signature originale intacte (anti-régression)"
    - "Mock Vitest `vi.mock('@qualiof/db', () => ({ prisma: { ... } }))` aligné numbering.test.ts Phase 7 (cohérence inter-tests)"
    - "Bonus test 'Tenant introuvable (findUnique null)' inspiré du Test 4bis Phase 7 — défense en profondeur"

key-files:
  created:
    - "(aucun — extension du fichier existant lib/numbering.ts + remplacement stub Vitest)"
  modified:
    - "apps/web/src/lib/numbering.ts (+50 lignes : getNextCreditNoteNumber + JSDoc CGI art. 289)"
    - "apps/web/src/lib/__tests__/numbering.credit-note.test.ts (stub Wave 0 6 it.todo → 7 it() verts, +126 lignes -8)"

key-decisions:
  - "Pattern de mock Vitest aligné numbering.test.ts Phase 7 (vi.mock + vi.fn() dans la factory), pas la variante du plan (closures findUniqueMock/findFirstMock externes) — meilleure cohérence inter-tests"
  - "+1 test bonus 'Test 4bis — Tenant introuvable (findUnique null) → fallback AVO' aligné Phase 7 Test 4bis, défense en profondeur"
  - "REFACTOR step TDD jugé inutile : code déjà minimal, clone-strict d'un pattern Phase 7 stable, pas de duplication interne à factoriser"

requirements-completed: [FACT-02]

# Metrics
duration: ~2min
completed: 2026-05-19
---

# Phase 11 Plan 01: Numérotation Avoirs Summary

**Helper `getNextCreditNoteNumber` clone-strict de Phase 7 (AVO-NNNNNN séquentiel atomique, fallback configurable) débloquant Plan 11-05 `createCreditNote`.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-05-19T15:50:11Z
- **Completed:** 2026-05-19T15:52:12Z
- **Tasks:** 1 (type=auto, tdd=true, autonomous)
- **Commits:** 2 (RED + GREEN — REFACTOR non nécessaire)

## Accomplishments

- **`getNextCreditNoteNumber(tenantId, tx?)` exporté** depuis `apps/web/src/lib/numbering.ts` (50 lignes additives, dont JSDoc CGI art. 289).
- **Séquence AVO-NNNNNN dédiée** : préfixe lu depuis `Tenant.creditNotePrefix` (Plan 11-00), fallback `'AVO'` cohérent avec `@default("AVO")` du schema Prisma.
- **Atomicité transactionnelle** : signature `(tenantId, tx?: Prisma.TransactionClient)` permet l'usage `prisma.$transaction(tx => getNextCreditNoteNumber(tenantId, tx))` requis pour éviter la race condition (2 admins créant un avoir simultanément).
- **Isolation factures/avoirs** : filtre `findFirst` utilise `startsWith: ${prefix}-` (donc `'AVO-'`), n'inclut PAS les `'FAC-'` — Test 6 le verrouille.
- **7/7 tests Vitest verts** (6 du plan + 1 bonus 'Tenant introuvable' aligné Phase 7).
- **Anti-régression** : `numbering.test.ts` Phase 7-02 toujours 6/6 verts, signature `getNextInvoiceNumber` strictement inchangée.

## Files Modified

| File                                                          | Change                                                                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/numbering.ts`                               | +50 lignes : `getNextCreditNoteNumber` après `getNextInvoiceNumber`, JSDoc CGI art. 289 + usage pattern |
| `apps/web/src/lib/__tests__/numbering.credit-note.test.ts`    | +126 / -8 : stub Wave 0 (6 `it.todo`) → 7 vrais tests Vitest source-regex                               |

## Commits

| Step  | Hash      | Message                                                                                  |
| ----- | --------- | ---------------------------------------------------------------------------------------- |
| RED   | `5c93f41` | `test(11-01): add failing tests for getNextCreditNoteNumber`                              |
| GREEN | `e11cb2c` | `feat(11-01): implement getNextCreditNoteNumber for credit note sequence AVO-NNNNNN`     |

## Deviations from Plan

### Mock pattern aligned with Phase 7 (Rule 2 — coherence)

**1. [Rule 2 — Coherence] Mock Vitest aligné `numbering.test.ts` Phase 7**
- **Found during:** Task 1 (writing tests RED)
- **Issue:** Le plan proposait un pattern de mock avec closures externes (`findUniqueMock`, `findFirstMock`) hoistées avant le `vi.mock` — fonctionne, mais s'écarte du pattern existant `numbering.test.ts` Phase 7 (mêmes fonctions, mêmes mocks dans la même `__tests__/`).
- **Fix:** Adopté le pattern Phase 7 — `vi.mock('@qualiof/db', () => ({ prisma: { tenant: { findUnique: vi.fn() }, invoice: { findFirst: vi.fn() } } }))`, puis cast `prisma.tenant.findUnique as unknown as ReturnType<typeof vi.fn>`. Cohérence inter-tests > variation locale.
- **Files modified:** `apps/web/src/lib/__tests__/numbering.credit-note.test.ts`
- **Commit:** `5c93f41`

### Bonus test added (Rule 2 — defense in depth)

**2. [Rule 2 — Defense] +1 test 'Tenant introuvable (findUnique null) → fallback AVO'**
- **Found during:** Task 1 (writing tests RED, comparing with Phase 7)
- **Issue:** Phase 7 `numbering.test.ts` couvre 2 cas de fallback : `{ invoicePrefix: null }` ET `findUnique → null` (Tenant inexistant). Le plan ne demandait que le premier ; le second est aussi valide via `tenant?.creditNotePrefix` (optional chaining).
- **Fix:** Ajouté `Test 4bis — Tenant introuvable (findUnique null) → fallback 'AVO'`. Total = 7 tests (au lieu des 6 demandés).
- **Justification:** Défense en profondeur sans coût (le code est déjà robuste), couverture symétrique de Phase 7.
- **Files modified:** `apps/web/src/lib/__tests__/numbering.credit-note.test.ts`
- **Commit:** `5c93f41`

## Verification Output

```bash
$ cd apps/web && npx vitest run src/lib/__tests__/numbering.credit-note.test.ts
 ✓ src/lib/__tests__/numbering.credit-note.test.ts (7 tests) 2ms

 Test Files  1 passed (1)
      Tests  7 passed (7)

$ cd apps/web && npx vitest run src/lib/__tests__/numbering.test.ts
 ✓ src/lib/__tests__/numbering.test.ts (6 tests) 3ms

 Test Files  1 passed (1)
      Tests  6 passed (6)
```

**Acceptance criteria (grep-verified)** :
- ✓ `export async function getNextCreditNoteNumber(tenantId: string, tx?: Prisma.TransactionClient): Promise<string>`
- ✓ `select: { creditNotePrefix: true }` (lecture Tenant)
- ✓ `tenant?.creditNotePrefix ?? 'AVO'` (fallback)
- ✓ `where: { tenantId, number: { startsWith: ${prefix}- } }` (filtre isolation)
- ✓ `git diff apps/web/src/lib/numbering.ts` ne montre que des additions (signature `getNextInvoiceNumber` intacte)

## Downstream Unblock

- **Plan 11-05** (`createCreditNote`) : peut maintenant importer `getNextCreditNoteNumber` depuis `@/lib/numbering` et l'utiliser dans `prisma.$transaction(tx => ...)` pour générer le numéro de l'avoir.
- **Plan 11-08** (`page liste factures`) : les avoirs apparaîtront comme rows distinctes avec préfixe `AVO-` (filtre `status=CREDIT_NOTE` ou regex sur `number`).

## Notes

- Le test `numbering.credit-note.test.ts` fait partie de la suite Vitest globale (`pnpm --filter @qualiof/web test`). Quand les Plans 11-02 (audit), 11-03 (mailer) auront livré leurs implémentations, les 53 `todo` actuels deviendront des tests réels et la suite passera de 481 (428 verts + 53 todo) à ~534 tests.
- Pas de typecheck error introduit (`tsc --noEmit` propre sur ce fichier).

## Self-Check: PASSED

- ✓ FOUND: `apps/web/src/lib/numbering.ts` contient `getNextCreditNoteNumber`
- ✓ FOUND: `apps/web/src/lib/__tests__/numbering.credit-note.test.ts` 7/7 verts
- ✓ FOUND: commit `5c93f41` (RED test)
- ✓ FOUND: commit `e11cb2c` (GREEN feat)
- ✓ FOUND: anti-régression `numbering.test.ts` 6/6 verts
- ✓ Plan 11-01 SUMMARY.md créé à `.planning/phases/11-factures-cycle-complet/11-01-numerotation-avoirs-SUMMARY.md`
