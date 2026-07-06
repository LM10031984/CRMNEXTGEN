---
phase: 19-base-postgres-supabase-pooler-migrations-baselin-es
plan: 01
subsystem: database
tags: [postgres, supabase, prisma, pgbouncer, pg_trgm, unaccent, tsx, smoke-test]

# Dependency graph
requires:
  - phase: 17-fondations-cloud-r-gion-eu-env
    provides: "env.ts fail-loud sur DATABASE_URL/DIRECT_URL (boot valide les URLs cloud)"
  - phase: 18-supabase-storage-migration-objets-direct-to-storage
    provides: "pattern script tsx worker/CLI-safe + garde d'entrée pathToFileURL (espaces %20)"
provides:
  - "apps/web/scripts/db-smoke-cloud.ts : runner tsx qui prouve les 4 critères DB-01/DB-02 contre la base cloud"
  - "npm script racine db:smoke:cloud (dotenv .env -> tsx via @qualiof/web)"
affects: [19-02, 19-03, worker, closure]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Preuve RUNTIME cloud par runner tsx (pas Vitest — Prisma est mocké dans la suite)"
    - "Round-trip 5 hits pour révéler prepared-statement-already-exists du pooler transaction mode"
    - "Reproduction du pattern worker Serializable ($transaction interactive) sans toucher de ClosureBatch réel"
    - "INSERT test jetable + delete immédiat (ne jamais polluer la base cloud)"

key-files:
  created:
    - apps/web/scripts/db-smoke-cloud.ts
  modified:
    - package.json

key-decisions:
  - "INSERT test dans AuditLog (id UUID, table jetable) avec champs NOT NULL réels : tenantId/entity/entityId/action/diff"
  - "npm script ajouté au package.json RACINE (conforme au plan et à l'acceptance grep), pas apps/web"
  - "Script LIVRÉ mais NON exécuté contre le cloud — l'exécution réelle est gatée Laurent au plan 19-03"

patterns-established:
  - "Smoke cloud DB = 4 fonctions distinctes (round-trip / serializable-tx / extensions / insert-test) appelées en séquence sous try/catch/finally $disconnect"
  - "console.log ne loggue que des IDs (UUID) et compteurs — jamais de PII (RGPD)"

requirements-completed: [DB-01, DB-02]

# Metrics
duration: 8min
completed: 2026-07-04
---

# Phase 19 Plan 01: Script de preuve cloud db-smoke-cloud.ts Summary

**Runner tsx `db-smoke-cloud.ts` qui prouve mécaniquement les 4 critères DB-01/DB-02 contre la base cloud — round-trip poolé (5 hits), transaction interactive Serializable (chemin worker bumpAndFinalize), extensions pg_trgm+unaccent, INSERT UUID nettoyé — 0 PII loggé, exécution réelle gatée 19-03.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-07-04T20:40:00Z (approx)
- **Completed:** 2026-07-04T20:47:43Z
- **Tasks:** 1
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- Script tsx unique worker/CLI-safe (importe UNIQUEMENT `@qualiof/db`, aucun import React/auth) couvrant les 4 critères de la Phase 19 par 4 fonctions distinctes.
- Round-trip poolé : `for (let i=0; i<5; i++)` de `trainingSession.count()` — révèle tout `prepared statement already exists` du pooler transaction mode :6543.
- Chemin worker prouvé : `prisma.$transaction(async (tx) => {...}, { isolationLevel: 'Serializable' })` reproduit le pattern EXACT de `closure/worker.ts:334` `bumpAndFinalize` SANS toucher de ClosureBatch réel.
- Extensions : `similarity('Dupont','Dupond') > 0` (pg_trgm) + `unaccent('Éléonore') === 'Eleonore'` via `$queryRawUnsafe`, avec throw explicite si KO.
- INSERT sans collision de PK : INSERT réel dans `AuditLog` (id UUID) + `delete` immédiat ; commenté « 0 autoincrement dans schema.prisma → collision de séquence IMPOSSIBLE ».
- Garde d'entrée robuste aux espaces (`pathToFileURL(process.argv[1]).href`, leçon 18-SMOKE bug #1) + `finally { $disconnect() }`.
- npm script racine `db:smoke:cloud` (dotenv `.env` -> tsx).

## Task Commits

Each task was committed atomically:

1. **Task 1: Écrire db-smoke-cloud.ts (round-trip poolé + extensions + INSERT test UUID)** - `82c2fbc` (feat)

## Files Created/Modified
- `apps/web/scripts/db-smoke-cloud.ts` - Runner de preuve cloud : 4 fonctions (proveRoundTripPooled / proveSerializableInteractiveTx / proveExtensions / proveInsertNoPkCollision) + main() try/catch/finally + garde d'entrée pathToFileURL.
- `package.json` (racine) - Ajout du npm script `db:smoke:cloud`.

## Decisions Made
- **Modèle pour l'INSERT test = AuditLog** : id `@default(uuid())`, table jetable idéale. Champs NOT NULL réels confirmés au `schema.prisma:1230` (`tenantId`, `entity`, `entityId`, `action`, `diff` Json) — tous remplis avec des valeurs de test explicites (`action: 'DB_SMOKE_TEST'`, `diff` note transitoire), ligne supprimée immédiatement.
- **npm script dans le package.json RACINE** : conforme au plan (`grep -c '"db:smoke:cloud"' package.json` = 1 cible la racine) et cohérent avec `import:smartof` déjà présent en racine. Les autres scripts tsx (`storage:migrate`, `calendar:backfill`) vivent dans `apps/web` mais l'acceptance et le plan ciblent explicitement la racine ici.
- **Script NON exécuté contre le cloud** : la preuve réelle (round-trip, extensions, INSERT contre le Supabase réel) est l'étape gatée Laurent du plan 19-03 (« destructif/cloud réel = étape séparée »).

## Deviations from Plan

None - plan executed exactly as written.

Ajustements mécaniques mineurs (non structurels, pas des déviations) :
- Accès aux résultats `$queryRawUnsafe` durcis avec optional chaining (`trg[0]?.similarity`, `ua[0]?.unaccent`) et `Number(...)` pour satisfaire `noUncheckedIndexedAccess` (tsconfig strict) — `tsc --noEmit` exit 0.

## Issues Encountered
None. `tsc --noEmit` exit 0 du premier coup ; tous les greps d'acceptance verts.

## User Setup Required
None - le script ne crée aucune clé env et ne modifie pas `.env`. Il consomme `DATABASE_URL`/`DIRECT_URL` déjà validées au boot (Phase 17). L'exécution réelle sera lancée par Laurent en 19-03 une fois les URLs cloud renseignées (plan 19-02).

## Verification
- `pnpm --filter @qualiof/web exec tsc --noEmit` → exit 0 (aucune régression type).
- Acceptance greps tous verts : `from '@qualiof/db'`=1 / `for (let i=0; i<5`=1 / `isolationLevel: 'Serializable'`=1 / `similarity(`=2 / `unaccent(`=2 / `$disconnect`=1 / `pathToFileURL`=3 / `DB_SMOKE_TEST|.delete(`=2 / `"db:smoke:cloud"` (package.json)=1 / PII dans console.log=0.
- Commit purement additif (nouveau script + 1 ligne scripts) : aucun fichier de production métier touché, aucun `.env` modifié → suite Vitest structurellement inchangée (aucun test n'importe ce script).

## Next Phase Readiness
- Le contrat de preuve est prêt. Le plan 19-02 (câblage des URLs cloud poolée :6543 / directe :5432 + activation des extensions dans le SQL Editor Supabase) le renseigne ; le plan 19-03 l'EXÉCUTE contre le Supabase réel (gaté Laurent) pour clore DB-01/DB-02.
- Aucun blocker.

## Known Stubs
None - le script est fonctionnel et complet ; sa non-exécution contre le cloud est une étape gatée intentionnelle (19-03), pas un stub.

## Self-Check: PASSED

- FOUND: apps/web/scripts/db-smoke-cloud.ts
- FOUND: .planning/phases/19-.../19-01-SUMMARY.md
- FOUND commit: 82c2fbc

---
*Phase: 19-base-postgres-supabase-pooler-migrations-baselin-es*
*Completed: 2026-07-04*
