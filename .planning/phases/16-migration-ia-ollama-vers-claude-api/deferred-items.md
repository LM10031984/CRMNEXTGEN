# Deferred Items — Phase 16

Out-of-scope discoveries logged during execution (NOT fixed — pre-existing, unrelated to task changes).

## Pre-existing pnpm symlink drift on `packages/shared` (vitest / tsc)

- **Found during:** Plan 16-01 Task 1 (running `pnpm --filter @qualiof/shared test -- env`).
- **Symptom:**
  - `packages/shared/node_modules/vitest` symlinks to `vitest@2.1.9_@types+node@22.19.17` (no `_jsdom` suffix) but the real installed package in the pnpm store is `vitest@2.1.9_@types+node@22.19.17_jsdom@25.0.1`. The workspace-local `.bin/vitest` and `.bin/tsc` therefore fail with `Cannot find module '.../node_modules/vitest/vitest.mjs'`.
  - Consequently `tsc --noEmit` on `packages/shared` reports `error TS2307: Cannot find module 'vitest'` on ALL test files (`env.test.ts` + 8 pre-existing test files identically).
- **Why out of scope:** Not caused by the 16-01 changes. It affects the 8 pre-existing shared test files exactly the same way. It is a stale install / pnpm store hoisting drift.
- **Workaround used for verification:** ran the test via the root-resolved binary `node node_modules/.pnpm/vitest@2.1.9_@types+node@22.19.17_jsdom@25.0.1/node_modules/vitest/vitest.mjs run env` → 4/4 green. `tsc` on `src/env.ts` (non-test source) is clean.
- **Suggested fix (not applied):** `pnpm install` at repo root to repair the `packages/shared/node_modules/vitest` symlink, then `pnpm --filter @qualiof/shared test` resolves normally.
