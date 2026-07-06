# Deferred Items — Phase 20

## Pre-existing test-isolation flakiness (OUT OF SCOPE, plan 20-02)

- **File:** `apps/web/src/lib/invoice-reminders/__tests__/worker.test.ts`
- **Symptom:** Passes in isolation (9/9), but fails (8 failed) when run in the
  full parallel suite alongside `closure/__tests__` files.
- **Root cause:** cross-file mock pollution of `bullmq`/`ioredis` module mocks
  (shared `queueAddMock`) — NOT related to the OCR worker change of 20-02.
- **Proof it is pre-existing:** reproduced on the clean tree (git stash) and
  when run with `closure/__tests__` only; the OCR queue driver does not import
  bullmq/ioredis/invoice-reminders.
- **Scope decision:** SCOPE BOUNDARY — only auto-fix issues directly caused by
  the current task's changes. Logged, not fixed here.
