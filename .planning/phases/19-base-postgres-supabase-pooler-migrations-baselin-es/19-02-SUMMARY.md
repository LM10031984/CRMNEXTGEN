---
phase: 19-base-postgres-supabase-pooler-migrations-baselin-es
plan: 02
subsystem: database
tags: [prisma, postgres, supabase, supavisor, pooler, migrations, baseline, pg_trgm, unaccent]

# Dependency graph
requires:
  - phase: 19-01
    provides: "script de preuve cloud db-smoke-cloud.ts (consomme DATABASE_URL/DIRECT_URL cablees ici)"
  - phase: 17
    provides: "env.ts fail-loud avec DIRECT_URL requise + turbo globalEnv"
  - phase: 18
    provides: "STORAGE_PROVIDER=supabase + cles SUPABASE_* dans .env (projet gntlqyscahbgjrmsbzil)"
provides:
  - ".env cable sur le cloud Supabase : DATABASE_URL transaction pooler :6543 (?pgbouncer=true&connection_limit=1), DIRECT_URL session pooler :5432"
  - "baseline collapse 0_init (47 tables, 28 enums) remplacant les 29 migrations db-push"
  - "base cloud SAINE et EN SYNC : drift db-push resolu (derouleJson, RevenueTarget, SessionCalendarSync)"
  - "migrate deploy vert + migrate status clean via DIRECT_URL :5432"
  - "4 extensions installees et verifiees (pgcrypto, uuid-ossp, pg_trgm, unaccent)"
affects: [19-03, 20, 21, worker, closure]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Baseline collapse Prisma : migrate diff --from-empty -> 0_init, archive hors migrations/, resolve --applied"
    - "archived-db-push/ DOIT vivre HORS de migrations/ (Prisma scanne migrations/ et exige un migration.sql par sous-dossier)"
    - "Verification credentials cloud via PrismaClient datasources override + select version() (pas de psql, pas de pg installe)"

key-files:
  created:
    - packages/db/prisma/migrations/0_init/migration.sql
    - packages/db/prisma/archived-db-push/README.md
    - .planning/phases/19-base-postgres-supabase-pooler-migrations-baselin-es/artifacts/prisma-migrations-before-baseline.json
  modified:
    - .env (gitignore — non commite : URLs cloud reelles)
    - .env.example (format pooler documente, placeholders)

key-decisions:
  - "Collapse 0_init (RESEARCH Option A) confirme par migrate diff : la base cloud manquait 3 objets db-push"
  - "Drift db-push applique a la base cloud AVANT resolve (sinon base restait desynchronisee de schema.prisma)"
  - "29 lignes stale de _prisma_migrations supprimees (snapshotees) pour un collapse propre, puis 0_init resolve --applied"
  - "archived-db-push deplace de migrations/ vers prisma/ (Prisma echouait P3015 sur le README sans migration.sql)"

patterns-established:
  - "Collapse baseline cloud : snapshot _prisma_migrations -> generer 0_init -> archiver hors migrations/ -> appliquer drift forward non-destructif -> nettoyer stale rows -> resolve --applied -> prouver deploy/status"

requirements-completed: [DB-01, DB-02]

# Metrics
duration: ~28min
completed: 2026-07-05
---

# Phase 19 Plan 02: Cablage URLs Supabase + baseline collapse cloud Summary

**Base cloud Supabase rendue SAINE : 2 URLs pooler cablees (:6543 pgbouncer / :5432 direct), collapse de 29 migrations db-push en une baseline 0_init, drift resolu (derouleJson + RevenueTarget + SessionCalendarSync), migrate deploy vert et 4 extensions actives.**

## Performance

- **Duration:** ~28 min
- **Started:** 2026-07-05 (reprise apres checkpoint human-action)
- **Completed:** 2026-07-05
- **Tasks:** 3 (+ Task 0 checkpoint resolu autonome)
- **Files modified:** 2 tracked (.env.example, migrations) + .env (gitignore)

## Accomplishments

- **Credentials cloud VERIFIEES par connexion reelle** : `select version()` OK sur pooler :6543 ET direct :5432 (PostgreSQL 17.6, aws-0-eu-west-1). Password de `.env.local.cloud-backup` toujours valide, hostname confirme implicitement.
- **`.env` cable** : DATABASE_URL = transaction pooler :6543 avec `?pgbouncer=true&connection_limit=1` (ajoute — absent du backup) ; DIRECT_URL = session pooler :5432 sans pgbouncer.
- **Baseline collapse 0_init** : 1493 lignes, 47 CREATE TABLE, 28 CREATE TYPE — genere via `migrate diff --from-empty`.
- **Drift db-push RESOLU** : la base cloud restauree manquait `TrainingProduct.derouleJson`, `RevenueTarget`, `SessionCalendarSync` (ajoutes localement via db push apres le dump). Applique en forward (0 DROP) -> `migrate diff live vs schema` = "No difference detected".
- **migrate deploy vert + migrate status clean** via DIRECT_URL :5432, `_prisma_migrations` = uniquement `0_init`.
- **4 extensions confirmees** installees et verifiees via `pg_extension`.

## Task Commits

1. **Task 1: Cabler URLs cloud** - `bbe7fcd` (feat) — .env + .env.example
2. **Task 2: Baseline collapse 0_init + resolution drift** - `4f70475` (feat) — 0_init, archive 29, snapshot, reconcile _prisma_migrations
3. **Task 3: Extensions** - pas de commit (operation DB-side, aucun fichier modifie ; verification consignee ci-dessous)

## Sorties CLI brutes (pour 19-SMOKE.md / plan 19-03)

### migrate status AVANT baseline
```
29 migrations found in prisma/migrations
Database schema is up to date!
```
(la base restauree portait deja les 29 lignes _prisma_migrations du dump — mais le schema reel divergeait)

### migrate diff live vs schema.prisma (drift constate)
```
ALTER TABLE "TrainingProduct" ADD COLUMN "derouleJson" JSONB;
CREATE TABLE "RevenueTarget" (...);
CREATE TABLE "SessionCalendarSync" (...);
+ 4 index + 1 FK   (0 DROP — forward non-destructif)
```

### migrate diff live vs schema APRES application du drift
```
No difference detected.
```

### migrate resolve --applied 0_init
```
Migration 0_init marked as applied.
```

### migrate deploy (via DIRECT_URL :5432)
```
1 migration found in prisma/migrations
No pending migrations to apply.
```

### migrate status (via DIRECT_URL :5432)
```
1 migration found in prisma/migrations
Database schema is up to date!
```

### _prisma_migrations final
```
[{"migration_name":"0_init","applied_steps_count":0,"rolled_back":false}]
```

### Extensions (select ... from pg_extension)
```
pg_trgm    schema=public      v1.6
pgcrypto   schema=extensions  v1.3
unaccent   schema=public      v1.1
uuid-ossp  schema=extensions  v1.1
COUNT=4/4
```
Note : `pg_trgm`/`unaccent` etaient deja presents en schema `public` (setup Supabase d'origine) ; `create extension if not exists ... with schema extensions` est idempotent et ne les a pas deplaces. Les 4 sont installees et resolvables. La preuve RUNTIME (similarity()/unaccent() resolvent via search_path) est faite par `db-smoke-cloud.ts` au plan 19-03.

## Filet de securite (backup avant baseline)

`pg_dump` absent du Mac. Filet applique : **SELECT + sauvegarde du contenu complet de `_prisma_migrations`** AVANT toute manipulation, dans
`.planning/phases/19-.../artifacts/prisma-migrations-before-baseline.json` (29 lignes, restaurable par re-insertion). Backups daily Supabase manages existent en complement (compte payant). La baseline `resolve --applied` n'execute aucun SQL destructif ; le seul SQL joue sur la base = le drift forward (ADD COLUMN + CREATE TABLE, 0 DROP).

## Decisions Made

- **Collapse Option A confirme par les faits** : `migrate diff` a prouve que la base cloud divergeait de `schema.prisma` (3 objets db-push manquants). L'historique lineaire des 29 ne correspondait plus -> collapse `0_init` justifie.
- **Application du drift AVANT resolve (Rule 2)** : le plan focalisait sur le collapse de l'historique ; mais l'objectif "RENDRE LA BASE CLOUD SAINE" + le critere "schema in sync" exigeaient d'appliquer aussi les 3 objets manquants a la base reelle, sinon le worker/app (qui attendent `derouleJson`, `RevenueTarget`, `SessionCalendarSync`) casseraient. Ajout non-destructif (0 DROP).
- **Nettoyage des 29 lignes stale de _prisma_migrations** : pour un collapse propre (sinon Prisma aurait signale 29 "applied migrations not found in migrations directory"). Lignes snapshotees avant suppression.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Application du drift db-push a la base cloud**
- **Found during:** Task 2
- **Issue:** La base cloud restauree manquait 3 objets presents dans schema.prisma (`TrainingProduct.derouleJson`, `RevenueTarget`, `SessionCalendarSync`). Le plan resolvait l'historique de migrations mais pas la desynchronisation reelle du schema -> app/worker auraient casse.
- **Fix:** Genere le drift via `migrate diff --from-url(live) --to-schema-datamodel` (forward, 0 DROP), applique via `prisma db execute`. `migrate diff` post-application = "No difference detected".
- **Files modified:** base cloud (aucun fichier repo ; le schema.prisma etait deja la cible)
- **Verification:** `migrate diff --exit-code` = No difference detected
- **Committed in:** `4f70475`

**2. [Rule 3 - Blocking] archived-db-push deplace hors de migrations/**
- **Found during:** Task 2 (migrate deploy)
- **Issue:** Le plan placait l'archive a `migrations/archived-db-push/`. Prisma scanne `migrations/` et a echoue `P3015` : il traitait `archived-db-push` comme une migration sans `migration.sql` (README seul).
- **Fix:** Deplace vers `packages/db/prisma/archived-db-push/` (sibling de migrations/, non scanne). Les 29 dossiers + README conserves.
- **Files modified:** packages/db/prisma/archived-db-push/ (chemin)
- **Verification:** `migrate deploy` -> "No pending migrations", `migrate status` -> "up to date"
- **Committed in:** `4f70475`

**3. [Rule 3 - Blocking] Nettoyage des 29 lignes stale de _prisma_migrations**
- **Found during:** Task 2
- **Issue:** La base cloud portait deja 29 lignes _prisma_migrations (heritees du dump). Apres collapse, elles seraient devenues orphelines (non presentes sur disque) -> status non totalement propre.
- **Fix:** DELETE des 29 lignes (name like '2026%') APRES snapshot, puis `resolve --applied 0_init`.
- **Files modified:** base cloud (_prisma_migrations)
- **Verification:** _prisma_migrations = uniquement `0_init`
- **Committed in:** `4f70475`

---

**Total deviations:** 3 auto-fixed (1 missing critical, 2 blocking)
**Impact on plan:** Tous necessaires pour l'objectif reel "base cloud SAINE et EN SYNC". Aucune expansion de scope — les 3 corrigent la desynchronisation db-push que le plan visait a resoudre. Le path de l'archive differe du plan (contrainte Prisma), sans changer la semantique.

## Issues Encountered

- **Extensions creees hors executeur Supabase SQL Editor** : par instruction explicite de Laurent ("gere tout toi"), le SQL a ete joue via Prisma `$executeRawUnsafe` sur DIRECT_URL :5432 (role suffisamment privilegie — aucun checkpoint necessaire). Note : `pg_trgm`/`unaccent` restent en schema `public` (deja installes au setup Supabase) ; `if not exists` ne les deplace pas. Sans effet sur la resolution runtime (search_path Supabase inclut public + extensions).

## User Setup Required

None — Task 0 (password + hostname + backup) a ete resolu autonome sur delegation explicite de Laurent. Credentials verifies par connexion reelle.

## Known Stubs

None — aucune valeur stub introduite. `.env` porte les vraies URLs cloud (gitignore, non commite).

## Next Phase Readiness

- Base cloud saine, en sync, `migrate deploy`/`status` verts -> **plan 19-03** peut executer `db:smoke:cloud` (round-trip pooler, tx Serializable, extensions runtime, INSERT AuditLog) contre cette base.
- 4 extensions installees -> la preuve runtime `similarity()`/`unaccent()` du smoke 19-03 a ses prerequis.
- **⚠ Note pour 19-03/20** : les URLs cloud sont maintenant DANS `.env` racine (gitignore). Le worker et l'app pointent desormais le cloud en local. Si Laurent veut retravailler en local Docker, restaurer `.env` depuis un backup local.

## Self-Check: PASSED

- FOUND: packages/db/prisma/migrations/0_init/migration.sql
- FOUND: packages/db/prisma/archived-db-push/README.md (29 dossiers archives)
- FOUND: .planning/phases/19-.../artifacts/prisma-migrations-before-baseline.json
- FOUND commit bbe7fcd (Task 1), FOUND commit 4f70475 (Task 2)
- Live DB in sync : migrate diff = No difference detected ; migrate status = up to date ; 4/4 extensions

---
*Phase: 19-base-postgres-supabase-pooler-migrations-baselin-es*
*Completed: 2026-07-05*
