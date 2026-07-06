# Deferred items — Phase 06

## From 06-02 (2026-05-13)

### Build prerender errors during parallel execution

**Context:** During execution of 06-02 in wave 1 (parallel with 06-01 and 06-03),
`pnpm --filter @qualiof/web build` produced prerender export errors:

```
Cannot find module './9192.js'
TypeError: Cannot read properties of undefined (reading 'call')
Error occurred prerendering page "/login", "/app/sessions", "/app/factures", "/app/produits", "/"
```

**Cause:** Concurrent builds clashing on `apps/web/.next/` artifacts
(parallel agents reading/writing the same `webpack-runtime.js`/chunk files).
NOT caused by the 06-02 changes (only `collapsible-section.tsx` was modified,
a small isolated client component with `aria-label`/`aria-controls` additions).

**Evidence the 06-02 code is clean:**
- `pnpm exec tsc --noEmit` in `apps/web` → exit code 0.
- All affected pages have nothing to do with the dashboard or
  CollapsibleSection (login, sessions list, factures, produits, root).

**Action:** Deferred. Will re-verify with a clean `.next` after wave 1
completes (orchestrator may run a verification build post-merge).
