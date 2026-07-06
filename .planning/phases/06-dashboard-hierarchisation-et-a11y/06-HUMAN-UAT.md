---
status: partial
phase: 06-dashboard-hierarchisation-et-a11y
source: [06-VERIFICATION.md, 06-SMOKE.md]
started: 2026-05-13
updated: 2026-05-13
---

## Current Test

[awaiting human testing]

## Tests

### 1. Smoke build + vitest end-to-end (sandbox-refused during 06-04)
expected: `pnpm --filter @qualiof/web build` exit 0 AND `pnpm --filter @qualiof/web test` exit 0
how_to_run: |
  cd "/Users/laurentmarx/Documents/CRM Next gen/files"
  rm -rf apps/web/.next && pnpm --filter @qualiof/web build && pnpm --filter @qualiof/web test
result: passed (confirmé manuellement par Laurent 2026-05-13)

### 2. Visual QA dashboard `/app`
expected: |
  - 4 PrioCard en haut (CA encaissé · AGEFICE consommé · Sessions à venir · Taux remplissage moyen)
  - Section "Indicateurs détaillés" repliée par défaut, dépliable au clic
  - Persistance localStorage du toggle (recharger la page → état conservé)
how_to_run: |
  Aller sur `/app` après login, observer le bandeau du haut + tester le toggle CollapsibleSection
result: [pending]

### 3. Visual QA codes financeurs harmonisés
expected: |
  - Aucun "OPCOMMERCE" ou "OPCO_EP" raw affiché dans l'UI
  - À la place : "OPCO Commerce", "OPCO EP", etc.
  - Vérifier au moins 3 pages : `/app/financeurs`, `/app/financeurs/OPCOMMERCE`, `/app/dossiers-opco`
how_to_run: |
  Naviguer sur `/app/financeurs`, `/app/financeurs/OPCOMMERCE` (h1 page detail), `/app/dossiers-opco` (badges sponsor)
result: [pending]

## Summary

total: 3
passed: 1
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps

(none yet — populated if user reports issues during UAT)
