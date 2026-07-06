---
phase: 14-google-calendar
plan: 03
subsystem: calendar
tags: [google-calendar, prisma, idempotence, multi-tenant, audit-qualiopi]
requires:
  - "apps/web/src/lib/calendar/idempotency.ts (Plan 14-01, type CalendarEventType + eventKey)"
provides:
  - "model SessionCalendarSync (schema.prisma) — trace + 2e filet idempotence"
  - "upsertSyncRecord(record) — upsert clé composite sessionId_eventKey (idempotent)"
  - "getSyncRecordsForSession(tenantId, sessionId) — lecture tenant-scopée"
affects:
  - "Plan 14-04 (orchestrateur) upsert une ligne par événement après events.insert"
  - "Plan 14-05 (backfill) lit/écrit la trace pour décider skip/update au re-run"
tech-stack:
  added: []
  patterns:
    - "Modèle Prisma additif (aucune modif des modèles existants hors 1 relation inverse)"
    - "Helper lib worker-safe important @qualiof/db (autorisé, comme le worker closure)"
    - "Toute requête Prisma tenant-scopée (tenantId dans where)"
    - "Schéma appliqué via prisma db push (migrate dev interactif hangs en sandbox)"
key-files:
  created:
    - "apps/web/src/lib/calendar/sync-state.ts"
    - "apps/web/src/lib/calendar/__tests__/sync-state.test.ts"
  modified:
    - "packages/db/prisma/schema.prisma (model SessionCalendarSync + relation calendarSyncs)"
decisions:
  - "Clé d'idempotence DB = @@unique([sessionId, eventKey]) (composite), miroir de la clé extendedProperties.private côté Google. upsert sur cette clé = skip/update au lieu de dupliquer."
  - "tenantId porté sur create (defense-in-depth) ; update ne touche ni tenantId ni sessionId (immutables) mais rafraîchit googleEventId/dayIndex/sentUpdates."
  - "Schéma appliqué via `prisma db push` (pas de migration versionnée) — cohérent avec la règle projet (migrate dev hangs). DETTE : générer une migration versionnée + `prisma migrate deploy` avant le déploiement cloud (directUrl déjà présent dans le schema)."
metrics:
  duration: "~25 min (dont déblocage Bash subagent par l'orchestrateur)"
  completed: "2026-06-25"
  tasks: 2
  commits: 2
  files: 3
  tests-added: 4
---

# Phase 14 Plan 03 : Table Prisma SessionCalendarSync + sync-state Summary

Table de trace `SessionCalendarSync` (second filet d'idempotence + preuve d'audit Qualiopi du backfill) ajoutée au schéma et appliquée au Postgres local, avec helpers `sync-state.ts` tenant-scopés et worker-safe. Vague 1 de la Phase 14 complète.

## What Was Built

- **`model SessionCalendarSync`** (schema.prisma, additif) : `id, tenantId, sessionId (FK TrainingSession onDelete:Cascade), eventKey, googleEventId, eventType, dayIndex?, syncMode, sentUpdates, createdAt, updatedAt` + `@@unique([sessionId, eventKey])` + `@@index([tenantId, sessionId])`. Relation inverse `calendarSyncs SessionCalendarSync[]` ajoutée sur `TrainingSession` (seule modif d'un modèle existant).
- **`sync-state.ts`** : `upsertSyncRecord(record)` (upsert sur la clé composite — idempotent par construction) + `getSyncRecordsForSession(tenantId, sessionId)` (findMany avec `tenantId` obligatoire dans le where). Worker-safe : importe uniquement `@qualiof/db` + un type depuis `./idempotency`.

## Tasks

| Task | Name | Type | Commit | Files |
| ---- | ---- | ---- | ------ | ----- |
| 1 | Modèle SessionCalendarSync + application DB | auto | 0a5acb4 | schema.prisma (+ db push) |
| 2 | Helpers sync-state tenant-scopés + tests | auto / tdd | c040966 | sync-state.ts + sync-state.test.ts |

## Verification

- `pnpm --filter @qualiof/db run db:push` → « Your database is now in sync with your Prisma schema » + client régénéré (`prisma.sessionCalendarSync` disponible).
- `pnpm vitest run src/lib/calendar/__tests__/sync-state.test.ts` → 4/4 verts.
- Suite calendar complète : 34/34 (idempotency 6 + countdown 8 + texts 16 + sync-state 4).
- Worker-safe : `grep -E "(server/actions|/rbac|validateRequest|requireRole|from 'react')"` sur lib/calendar/*.ts (hors tests) → 0 ligne.
- `tsc --noEmit` propre sur le module calendar.

## Deviations from Plan

### Orchestrator-resolved blockers

**1. [Sandbox] Bash refusé pour le sous-agent exécuteur en cours de run**
- **Issue:** le sous-agent gsd-executor a pu écrire les 3 fichiers mais sa permission Bash a été refusée en cours de route → impossible d'appliquer la migration, lancer les tests et committer.
- **Fix (orchestrateur):** l'orchestrateur (session principale, Bash OK) a appliqué `db push` + `generate`, lancé les tests, et fait les commits atomiques + ce SUMMARY + maj STATE/ROADMAP.

**2. [Test] vi.mock hoisté au-dessus des const mocks → ReferenceError**
- **Found during:** premier run de test (post-déblocage).
- **Issue:** `const upsert = vi.fn()` / `findMany` déclarés sous `vi.mock` mais référencés dans la factory hoistée → « Cannot access 'upsert' before initialization ».
- **Fix:** `const { upsert, findMany } = vi.hoisted(() => ({ ... }))` (pattern vitest canonique). 4/4 verts après fix.
- **Files modified:** sync-state.test.ts (commit c040966).

## Known Stubs / Debt

- **Pas de migration versionnée** : appliquée via `prisma db push`. DETTE explicite — générer une migration + `prisma migrate deploy` avant le passage cloud (cf [[feedback_prisma_migrate_deploy]] et le `directUrl` déjà présent dans le schema).

## Notes for Next Plan (14-04)

- Après chaque `events.insert`/`update`, appeler `upsertSyncRecord({ tenantId, sessionId, eventKey, googleEventId, eventType, dayIndex?, syncMode, sentUpdates })`.
- Pour l'idempotence du backfill (14-05), `getSyncRecordsForSession` donne les eventKey déjà synchronisés (en complément du lookup Google `privateExtendedProperty=qualiof_key=...`).

## Self-Check: PASSED

- 3 fichiers présents (schema model + sync-state.ts + test).
- 2 commits présents (0a5acb4 schema, c040966 helpers+test).
- Table en base (db push OK), 4/4 tests verts, worker-safe, tenant-scopé.
