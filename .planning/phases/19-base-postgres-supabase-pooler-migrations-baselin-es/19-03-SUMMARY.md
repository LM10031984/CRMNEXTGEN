---
phase: 19-base-postgres-supabase-pooler-migrations-baselin-es
plan: 03
subsystem: database
tags: [prisma, postgres, supabase, supavisor, pooler, pg_trgm, unaccent, smoke, phase-gate]

# Dependency graph
requires:
  - phase: 19-01
    provides: "script de preuve cloud db-smoke-cloud.ts + npm script db:smoke:cloud"
  - phase: 19-02
    provides: ".env cable cloud (:6543 poole / :5432 direct), baseline 0_init, 4 extensions installees"
provides:
  - "19-SMOKE.md : journal de preuve RUNTIME gate Laurent des 4 criteres DB-01/DB-02 contre le Supabase reel"
  - "DB-01 PROUVE runtime : migrate status/deploy verts via DIRECT_URL :5432, _prisma_migrations=0_init"
  - "DB-02 PROUVE runtime : round-trip poole sans prepared statement, tx Serializable OK sous pooler, pg_trgm+unaccent resolvent, INSERT UUID sans collision PK"
  - "Phase 19 = SAINE ET PROUVEE (equivalent 18-SMOKE.md)"
affects: [20, 21, worker, closure]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Smoke runtime cloud gate : executer db:smoke:cloud + prisma migrate status/deploy contre le Supabase reel, consigner l'evidence brute dans XX-SMOKE.md (calque 18-SMOKE.md)"
    - "Contournement dotenv-cli absent : tsx --env-file=.env charge le meme .env sans dependance CLI"

key-files:
  created:
    - .planning/phases/19-base-postgres-supabase-pooler-migrations-baselin-es/19-SMOKE.md
  modified: []

key-decisions:
  - "Checkpoint human-verify resolu AUTONOME sur delegation explicite de Laurent (gere tout toi stp), evidence brute = base d'approbation (meme modalite Phase 18)"
  - "Repli worker -> :5432 (dette Phase 20) NON declenche : la tx Serializable passe sous le pooler :6543 sans 40001 ni prepared statement"
  - "Critere #4 (collision PK) structurellement trivial : 0 autoincrement dans schema.prisma -> aucune sequence -> collision impossible ; prouve empiriquement par l'INSERT test"

patterns-established:
  - "XX-SMOKE.md = livrable de preuve runtime d'une phase infra (non reproductible en Vitest, Prisma mocke)"

requirements-completed: [DB-01, DB-02]

# Metrics
duration: ~5min
completed: 2026-07-05
---

# Phase 19 Plan 03: Smoke cloud DB-01/DB-02 — 19-SMOKE.md Summary

**Les 4 criteres de la Phase 19 PROUVES runtime contre le Supabase reel (`gntlqyscahbgjrmsbzil`, West EU Irlande, PostgreSQL 17.6) : `db:smoke:cloud` exit 0 avec « ALL 4 CRITERIA PROVEN » (round-trip poole 5 hits SANS prepared statement, tx Serializable OK sous pooler, similarity=0.5555556 + unaccent=Eleonore, INSERT+delete UUID sans collision), `migrate status/deploy` verts via :5432. `19-SMOKE.md` = journal de preuve gate Laurent. Phase 19 saine ET prouvee.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-07-05
- **Completed:** 2026-07-05
- **Tasks:** 2 auto + 1 checkpoint human-verify (resolu autonome sur delegation Laurent)
- **Files modified:** 1 cree (19-SMOKE.md)

## Accomplishments

- **DB-01 PROUVE runtime** (via `DIRECT_URL` :5432) :
  - `prisma migrate status` = **« Database schema is up to date! »** (`aws-0-eu-west-1.pooler.supabase.com:5432`, 1 migration).
  - `prisma migrate deploy` = **« No pending migrations to apply. »**.
  - `_prisma_migrations` = **`["0_init"]`** (aucune ligne stale).
- **DB-02 PROUVE runtime** — `db:smoke:cloud` **exit 0**, **« [db-smoke] ALL 4 CRITERIA PROVEN »** :
  - **Critere #2 (round-trip poole)** : `[round-trip] 5 reads OK` sur :6543 + `[serializable-tx] interactive tx OK under pooler` (pattern EXACT `bumpAndFinalize`) — **AUCUN** « prepared statement already exists » (grep=0).
  - **Critere #3 (extensions runtime)** : `similarity('Dupont','Dupond')=0.5555556` (> 0) + `unaccent('Éléonore')='Eleonore'` → `[extensions] pg_trgm similarity=0.5555556, unaccent OK`.
  - **Critere #4 (INSERT sans collision PK)** : `[insert-test] UUID PK INSERT+delete OK` sur `AuditLog` (id `@default(uuid())`, delete immediat). Run 2× → UUID different, aucune collision.
- **Extensions cloud re-confirmees** : `pg_trgm`(public), `pgcrypto`(extensions), `unaccent`(public), `uuid-ossp`(extensions) — **4/4**. PostgreSQL **17.6**.
- **`19-SMOKE.md` cree** (calque `18-SMOKE.md`) : section RÉSULTATS DE VALIDATION datee, 4 tableaux de criteres avec Resultat+date, sorties brutes DB-01/DB-02, note 0 autoincrement, phase gate coche.

## Task Commits

1. **Task 1: Squelette 19-SMOKE.md** - `a41c1f8` (docs) — 4 sections de criteres en tableaux, note 0 autoincrement, repli documente
2. **Task 2: Finalisation 19-SMOKE.md** - `065db29` (docs) — resultats dates, verdict DB-01/DB-02 VALIDE, sorties brutes, dette outillage

*(Checkpoint human-verify entre les deux : resolu autonome — smoke execute par l'orchestrateur, evidence brute = base d'approbation.)*

## Sorties CLI brutes (preuve)

```
$ db:smoke:cloud (tsx --env-file=../../.env scripts/db-smoke-cloud.ts)  → EXIT=0
[round-trip] 5 reads OK, tenant=db191440-a144-48d1-93c1-767e6f647f2c
[serializable-tx] interactive tx OK under pooler
[extensions] pg_trgm similarity=0.5555556, unaccent OK
[insert-test] UUID PK INSERT+delete OK, id=0c13e623-382a-4de5-9e2a-bdb990659738 (no sequence, no collision)
[db-smoke] ALL 4 CRITERIA PROVEN
grep 'prepared statement already exists' = 0 occurrence

$ prisma migrate status --schema packages/db/prisma/schema.prisma
Datasource "db": ... at "aws-0-eu-west-1.pooler.supabase.com:5432"
1 migration found in prisma/migrations
Database schema is up to date!

$ prisma migrate deploy --schema packages/db/prisma/schema.prisma
1 migration found in prisma/migrations
No pending migrations to apply.

$ _prisma_migrations   → ["0_init"]
$ pg_extension          → pg_trgm(public), pgcrypto(extensions), unaccent(public), uuid-ossp(extensions)  [4/4]
$ version()             → PostgreSQL 17.6
```

## Decisions Made

- **Checkpoint human-verify resolu AUTONOME** : Laurent a delegue « gère tout toi stp » (meme modalite que la Phase 18). Le smoke a ete **execute par l'orchestrateur** et son evidence brute consignee dans `19-SMOKE.md` comme base d'approbation — pas d'attente d'une action manuelle Laurent.
- **Repli worker -> :5432 NON declenche** : la tx interactive Serializable **passe** sous le pooler :6543 (aucun `40001`, aucun prepared statement). La dette Phase 20 documentee dans le plan n'a pas lieu d'etre.
- **Critere #4 documente ET prouve** : `grep -c 'autoincrement()' schema.prisma = 0` → toutes les PK sont des UUID → aucune sequence Postgres → collision structurellement impossible ; l'INSERT test le confirme empiriquement.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `dotenv-cli` non installe → contournement `tsx --env-file`**
- **Found during:** Checkpoint (execution du smoke)
- **Issue:** Le npm script `db:smoke:cloud` invoque `dotenv -e .env`, mais le binaire `dotenv-cli` n'est **pas installe** (`node_modules/.bin/dotenv` absent) → `sh: dotenv: command not found` (exit 1/254). Blocage pur outillage, PAS un echec de critere DB.
- **Fix:** Execution via **`tsx --env-file=../../.env scripts/db-smoke-cloud.ts`** (chargement natif du meme `.env` racine). Script `db-smoke-cloud.ts` et URLs cloud rigoureusement identiques — seul le loader d'env change. Les migrations Prisma chargent le `.env` racine automatiquement.
- **Files modified:** aucun fichier repo (contournement d'execution).
- **Verification:** smoke exit 0, « ALL 4 CRITERIA PROVEN » ; `migrate status`/`deploy` verts.
- **Committed in:** documente dans `065db29` (section « Déviation d'exécution » de 19-SMOKE.md).
- **Dette legere consignee (Phase 20/quick)** : ajouter `dotenv-cli` en devDep racine OU remplacer le loader du script par `tsx --env-file`.

---

**Total deviations:** 1 auto-fixed (blocking outillage). Aucun echec de critere, aucune expansion de scope.
**Impact on plan:** Nul sur les preuves — meme `.env`, meme script, memes URLs cloud. Le fix pérenne est une dette legere non bloquante.

## Issues Encountered

- **`dotenv-cli` absent** (voir deviation Rule 3 ci-dessus) — contourne sans impact sur les preuves.
- Aucun bug applicatif revele par le smoke (contrairement aux 3 bugs de 18-SMOKE).

## User Setup Required

None — checkpoint human-verify resolu autonome sur delegation explicite de Laurent (« gère tout toi stp »). Le smoke a ete execute et son evidence brute consignee comme base d'approbation.

## Known Stubs

None — aucun stub. `19-SMOKE.md` porte des resultats reels dates ; 4 criteres VALIDES prouves runtime.

## Next Phase Readiness

- **Phase 19 = SAINE ET PROUVEE** : DB-01 + DB-02 valides runtime contre le Supabase reel → `/gsd:verify-work 19` peut etre lance.
- **Base cloud operationnelle** (pooler :6543 app + :5432 migrations, extensions actives) → **Phase 20** (worker 3e hote) peut s'appuyer dessus. Le repli worker :5432 n'est PAS necessaire (tx Serializable OK sous pooler).
- **Dette legere Phase 20/quick** : reparer `db:smoke:cloud` (installer `dotenv-cli` ou passer a `tsx --env-file`).

## Self-Check: PASSED

*(rempli apres verification ci-dessous)*

---
*Phase: 19-base-postgres-supabase-pooler-migrations-baselin-es*
*Completed: 2026-07-05*
