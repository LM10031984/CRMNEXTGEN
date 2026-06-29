# Deferred items — Phase 15

Out-of-scope discoveries logged during execution (NOT fixed — unrelated to current task changes).

## Plan 15-01 (2026-06-29)

- **Pre-existing test failure (unrelated to onglets):**
  `src/lib/closure/__tests__/shared-template.test.ts:175` — `loadLogoColorDataUrl` returns
  `data:image/jpeg;base64,...` but the test asserts `/^data:image\/jpg;base64,/`.
  This is a MIME-string mismatch (`jpeg` vs `jpg`) in the closure logo loader, present on the
  baseline before this plan. Out of scope for Lot 1 (coquille à onglets). Not fixed.
  Suite is otherwise green (1091/1092 before my changes).
