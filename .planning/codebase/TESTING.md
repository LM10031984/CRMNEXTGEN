# Testing

**Analysis Date:** 2026-05-12

## Framework

**Vitest 2.1.8** — declared in `apps/web/package.json` and `packages/shared/package.json`. No Jest, no Playwright config file in the repo.

`Makefile` mentions `playwright` but no `playwright.config.{ts,js}`, no `e2e/` directory, no `@playwright/test` in `package.json` — Playwright is **aspirational, not wired**.

## Coverage (current state)

**Two unit test files. Total.**

```
packages/shared/src/helpers/__tests__/siret.test.ts
packages/shared/src/helpers/__tests__/normalize.test.ts
```

That's it.

- ❌ No tests for server actions
- ❌ No tests for Prisma queries
- ❌ No tests for closure pack worker
- ❌ No tests for Ollama integrations
- ❌ No tests for PDF templates
- ❌ No tests for React components
- ❌ No E2E despite memory note "validé E2E SES-0010 5 personnes/12 min" — that was **manual validation in dev**, not an automated test

## How to run

```bash
pnpm test                 # turbo runs test in every package
pnpm --filter @qualiof/shared test
pnpm --filter @qualiof/web test
```

## File Structure (when added)

Existing convention (from the 2 tests):
```
<module>/
  __tests__/
    <module>.test.ts
  <module>.ts
```

Co-located `__tests__/` next to source. No separate `tests/` or `__tests__/` at the repo root.

## Patterns Observed (n=2)

```ts
import { describe, expect, it } from 'vitest';
import { isValidSiret } from '../siret';

describe('isValidSiret', () => {
  it('accepts a valid SIRET', () => { expect(isValidSiret('39214012700024')).toBe(true); });
  it('rejects invalid lengths', () => { ... });
});
```

Plain Vitest, no mocking helpers, no fixtures, no test DB setup.

## Mocking

No mocking strategy in place because there's nothing to mock yet. When mocking starts:

- Prisma: candidate libraries are `vitest-mock-extended` for `DeepMockProxy<PrismaClient>` or hitting a test Postgres via Docker
- Ollama: HTTP mocks via `msw` or fetch interception
- BullMQ: skip queueing in tests (sync mode), or use `bullmq`'s built-in test helpers

## Manual / Validation flows

What today substitutes for automated tests:

1. **Local end-to-end via `pnpm dev:full`** — boots web + worker, validates closure pack generation
2. **Memory-recorded validations:**
   - SES-0010, 5 personnes, 12 min (closure pack E2E manual)
   - QW4 toasts audit
   - OPCO V2 audit ready for prod
3. **Code review** — commits like `fix(palier-4): bloquants identifiés par le code review (avant prod)` show review-gated releases

## CI

**None detected.** No `.github/workflows/`, no `.gitlab-ci.yml`, no `Jenkinsfile`. Tests / lint are only run locally before commits.

## Recommendations (for the new milestone)

Pri 1 — **Smoke-test the audit fixes:** integration tests that boot Next + Prisma + a test Postgres and assert each protected page renders 200 (sessions list, sessions detail, dashboard, dossiers OPCO list). Catches future "FileText is not defined" cleanly.

Pri 2 — **E2E with Playwright** for the critical workflow: login → create session → add participant → trigger closure pack → assert ClosureJob success. The memory's SES-0010 walkthrough is the natural script.

Pri 3 — **Server-action contract tests** that hit a real Prisma (test DB) and verify `{ ok: true/false }` shape per action.

Out of scope today: unit tests for templates (low value, brittle), component snapshot tests.

---

*Testing analysis: 2026-05-12*
