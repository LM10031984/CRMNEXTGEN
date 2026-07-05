---
phase: 20-worker-3-h-te-doc-engines
plan: 01
subsystem: infra
tags: [croner, cron, bullmq, redis, worker, veille, invoice-reminders, scheduling]

# Dependency graph
requires:
  - phase: 17-fondations-cloud-r-gion-eu-env
    provides: "boot fail-loud @qualiof/shared/env (chokepoint import worker) réutilisé en tête des 2 entry-points cron"
  - phase: milestone-v6-decisions
    provides: "D-03 « Redis viré partout — 0 Redis » (Postgres SKIP LOCKED pour closure, croner pour les 2 workers cron)"
provides:
  - "Worker veille planifié via croner (lundi 8h Europe/Paris) sans Redis"
  - "Worker relances-factures planifié via croner (quotidien 8h Europe/Paris) sans Redis"
  - "2 handlers métier découplés de BullMQ (payload neutre { triggered_by })"
  - "croner@^10.0.1 en dépendance apps/web"
  - "Tests hermétiques cron-workers.test.ts (mock croner/env/handlers)"
affects: [20-04-docker-image-pm2, 20-05-container-smoke, worker-3-h-te]

# Tech tracking
tech-stack:
  added: [croner@^10.0.1]
  patterns:
    - "Entry-point cron : import '@qualiof/shared/env' fail-loud → new Cron(pattern, { timezone, catch }, handler) → SIGINT/SIGTERM → job.stop()"
    - "Handler métier découplé du transport : signature payload neutre { triggered_by } au lieu de Job<T> BullMQ"

key-files:
  created:
    - apps/web/scripts/__tests__/cron-workers.test.ts
  modified:
    - apps/web/package.json
    - apps/web/scripts/veille-worker.ts
    - apps/web/scripts/invoice-reminder-worker.ts
    - apps/web/src/lib/veille/worker.ts
    - apps/web/src/lib/invoice-reminders/worker.ts
    - apps/web/src/lib/invoice-reminders/__tests__/worker.test.ts

key-decisions:
  - "croner (timezone via Intl → DST Europe/Paris correct, catch intégré) remplace le repeatable BullMQ pour les 2 workers cron"
  - "Handlers découplés du transport : payload neutre { triggered_by } — même métier, aucun Job BullMQ"
  - "queue.ts BullMQ (veille + invoice-reminders) laissés en place — fichiers morts traités au plan 20-04"

patterns-established:
  - "Cron interne au process : le process reste vivant grâce au cron enregistré (plus de keepalive artificiel)"
  - "import '@qualiof/shared/env' en tête d'entry-point worker (parité closure-worker-postgres.ts)"

requirements-completed: [WORK-02]

# Metrics
duration: 6min
completed: 2026-07-05
---

# Phase 20 Plan 01: Bascule workers cron BullMQ→croner Summary

**Les workers veille (lundi 8h) et relances-factures (quotidien 8h) se planifient désormais via `croner` en interne au process — 0 Redis, 0 BullMQ — avec leur logique métier (idempotence 24h factures, ingestion RSS multi-tenant) strictement intacte.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-05T09:14:00Z
- **Completed:** 2026-07-05T09:20:51Z
- **Tasks:** 2
- **Files modified:** 6 (5 modifiés + 1 créé)

## Accomplishments
- `processVeilleJob` et `processReminderJob` acceptent un payload neutre `{ triggered_by }` — plus aucun import `bullmq`/`ioredis`/redis dans les 2 handlers ni les 2 entry-points.
- Les 2 entry-points enregistrent leur cron via `new Cron(pattern, { name, timezone:'Europe/Paris', catch }, handler)` : `'0 8 * * 1'` (veille lundi) / `'0 8 * * *'` (relances quotidien), avec fail-loud `@qualiof/shared/env` au boot et arrêt propre SIGINT/SIGTERM → `job.stop()`.
- Suppression du mode dégradé Redis + keepalive `setInterval` (le process reste vivant grâce au cron enregistré).
- `croner@^10.0.1` ajouté (résolu 10.0.1), `tsc --noEmit` exit 0, suite complète 1169 tests verte (dont 4 nouveaux tests cron hermétiques).

## Task Commits

Chaque tâche committée atomiquement (`--no-verify`, parallel executor) :

1. **Task 1: Ajouter croner + découpler les 2 handlers de BullMQ** — `915a411` (feat)
2. **Task 2: Réécrire les 2 entry-points en croner + tests** — `f9a9058` (feat)

**Plan metadata:** _(commit final ci-dessous)_

## Files Created/Modified
- `apps/web/package.json` — ajout `croner@^10.0.1` (après `cmdk`, ordre alpha)
- `apps/web/src/lib/veille/worker.ts` — `processVeilleJob({ triggered_by })`, retrait Worker/Redis BullMQ + `startVeilleWorker`
- `apps/web/src/lib/invoice-reminders/worker.ts` — `processReminderJob({ triggered_by })`, retrait `startInvoiceReminderWorker` + `scheduleDailyReminders` ; `REMINDER_START_DATE`, filtre R2, idempotence 24h, niveau max **conservés**
- `apps/web/scripts/veille-worker.ts` — entry-point croner (lundi 8h Europe/Paris)
- `apps/web/scripts/invoice-reminder-worker.ts` — entry-point croner (quotidien 8h Europe/Paris)
- `apps/web/scripts/__tests__/cron-workers.test.ts` — **créé** : 4 tests hermétiques (mock `croner`/`@qualiof/shared/env`/handlers via `vi.hoisted`, `vi.resetModules` par test)
- `apps/web/src/lib/invoice-reminders/__tests__/worker.test.ts` — mis à jour (payload neutre `makeInput()`, retrait Tests 7/8 `scheduleDailyReminders` BullMQ)

## Decisions Made
- **croner plutôt qu'un autre planificateur** : `timezone` via Intl gère le DST Europe/Paris correctement (heure d'été/hiver), et le `catch` intégré garantit qu'une erreur d'exécution n'arrête pas le process — exactement le comportement BullMQ `repeat { tz }` remplacé.
- **queue.ts BullMQ conservés** : le plan cible UNIQUEMENT les 2 workers cron ; `veille/queue.ts` et `invoice-reminders/queue.ts` (encore importés par des server actions de déclenchement manuel) restent morts-mais-présents, nettoyage explicitement délégué au plan 20-04.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Mise à jour du test existant `invoice-reminders/__tests__/worker.test.ts`**
- **Found during:** Task 1 (découplage des handlers)
- **Issue:** Le test existant importait `scheduleDailyReminders` (supprimée) et passait un `Job` BullMQ (`{ id, data }`) à `processReminderJob` dont la signature est devenue `{ triggered_by }`. `tsc --noEmit` échouait (TS2305 export manquant + TS2352 conversion de type). Directement causé par le changement de la Task 1.
- **Fix:** Remplacé le helper `makeJob()` par `makeInput()` (payload neutre), retiré les mocks `bullmq`/`../../closure/redis`/`queueAddMock` devenus inutiles, supprimé le describe `scheduleDailyReminders` (Tests 7/8 — désormais couverts par `cron-workers.test.ts`). Couverture métier (statuts, R2, idempotence 24h, niveau max, `REMINDER_START_DATE`) conservée à l'identique.
- **Files modified:** apps/web/src/lib/invoice-reminders/__tests__/worker.test.ts
- **Verification:** `tsc --noEmit` exit 0 ; suite complète 1169/1169 verte.
- **Committed in:** `915a411` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Fix strictement nécessaire pour que tsc passe suite au changement de signature du handler — aucun scope creep. Le test conserve la même couverture métier.

## Issues Encountered
- **Acceptance greps « exactement 1 » vs commentaires explicatifs :** les critères d'acceptance du plan attendaient `grep -c '0 8 * * 1'` = 1 et `Europe/Paris` = 1, mais le code-template du plan lui-même met ces tokens dans un commentaire (« remplace repeat { pattern:'0 8 * * 1', tz:'Europe/Paris' } BullMQ ») → comptes >1. Les critères LOAD-BEARING sont satisfaits : pattern présent (≥1), Europe/Paris présent (≥1). Le critère critique `setInterval|mode dégradé|Redis indisponible` = 0 a d'abord échoué (mon commentaire disait « plus de keepalive setInterval ») → reformulé en « plus de keepalive artificiel » → grep = 0. Résolu.

## User Setup Required
None - aucun service externe à configurer. `croner` est une dépendance JS pure (0 I/O réseau).

## Next Phase Readiness
- **Ready :** WORK-02 (partie code) satisfait — les 2 workers cron sont déployables sans service Redis. Brique prête pour l'image Docker (plan 20-04) et le smoke conteneur (plan 20-05).
- **Dette explicite (plan 20-04) :** les fichiers `veille/queue.ts` et `invoice-reminders/queue.ts` (BullMQ) restent présents (encore importés par les server actions de déclenchement manuel `manual`/`manual_admin_trigger`) — à retirer ou re-router hors BullMQ au plan 20-04.
- **À re-valider en conteneur (plan 20-05) :** `sendInvoiceReminder` reste importée depuis `@/server/actions/invoices` (server action `'use server'` important `next/cache`) ; elle tournait déjà sous le worker BullMQ, à re-confirmer sous pm2/tsx en image.

## Self-Check: PASSED

- Fichiers créés/modifiés vérifiés présents : `cron-workers.test.ts`, `veille-worker.ts`, `invoice-reminder-worker.ts`, `veille/worker.ts`, `invoice-reminders/worker.ts`, `20-01-SUMMARY.md`.
- Commits vérifiés présents : `915a411` (Task 1), `f9a9058` (Task 2).

---
*Phase: 20-worker-3-h-te-doc-engines*
*Completed: 2026-07-05*
