# Deferred items — Phase 09.1

## From Plan 09.1-03 (parallel execution)

- **tsc error in `apps/web/src/components/apprenants/timeline/learner-timeline.tsx:40`**
  - Error: `Type '`/app/${string}`' is not assignable to type 'UrlObject | RouteImpl<`/app/${string}`>'`.
  - **Owner**: Plan 09.1-04 (apprenants timeline domain — parallel agent).
  - **Out of scope** for Plan 09.1-03 (sessions domain). Logged here per Rule scope boundary.
  - Likely fix: change `href={personHrefForEmpty as `/app/${string}`}` to `href={personHrefForEmpty as Route}` with `import type { Route } from 'next'`.
