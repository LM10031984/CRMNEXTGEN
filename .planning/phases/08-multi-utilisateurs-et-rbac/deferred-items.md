# Phase 8 — Deferred Items

Out-of-scope discoveries during execution. Not fixed in current plan, tracked here for downstream attention.

## From Plan 08-03 (acceptInvitation flow)

### Pre-existing TS errors in `nav-config.test.ts` (Plan 08-04 territory)

`apps/web/src/components/layout/__tests__/nav-config.test.ts` references an export `filterNavForRole` not yet present in `nav-config.ts`, plus several implicit `any` on `s, i` callback params. These errors pre-exist Plan 08-03 and belong to Plan 08-04 which is running in parallel (Wave 3 with us). Out of scope for 08-03 — do NOT fix here.

Lines impacted:
- nav-config.test.ts(2,15): `filterNavForRole` missing export
- nav-config.test.ts(18,40)..(100,61): implicit `any` on s, i callback params (12 occurrences)

Expected to be resolved when Plan 08-04 commits (it'll add `filterNavForRole` to `nav-config.ts` and update the test typings).
