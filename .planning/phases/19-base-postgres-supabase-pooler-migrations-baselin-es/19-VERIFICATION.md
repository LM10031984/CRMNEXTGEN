---
phase: 19-base-postgres-supabase-pooler-migrations-baselin-es
verified: 2026-07-05T00:00:00Z
status: passed
score: 4/4 must-haves verified
re_verification: false
gaps: []
human_verification: []
---

# Phase 19: Base Postgres Supabase Verification Report

**Phase Goal:** La base Postgres cloud EU est saine et prouvée : le drift `db push` historique est résolu, `prisma migrate deploy` tourne vert via la connexion directe, l'app parle au pooler transaction-mode sans erreur de prepared statement, et les extensions/séquences résolvent au runtime.
**Verified:** 2026-07-05
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `prisma migrate status` est clean sur la base cloud et `_prisma_migrations` est peuplé — `migrate deploy` a vraiment tourné vert via `DIRECT_URL` :5432 (pas juste un `db push`) | VERIFIED | `19-SMOKE.md` : `migrate status` = « Database schema is up to date! » (1 migration, `aws-0-eu-west-1.pooler.supabase.com:5432`), `migrate deploy` = « No pending migrations to apply. », `_prisma_migrations` = `["0_init"]` uniquement. Commits `bbe7fcd` + `4f70475`. |
| 2 | Un round-trip Prisma read/write depuis un worker réussit via `DATABASE_URL` poolée (`:6543 ?pgbouncer=true&connection_limit=1`) sans erreur `prepared statement already exists` | VERIFIED | `19-SMOKE.md` : `[round-trip] 5 reads OK, tenant=db191440-…` (5× `BEGIN/DEALLOCATE ALL/COUNT/COMMIT` sans erreur `s0`) + `[serializable-tx] interactive tx OK under pooler` (pattern `bumpAndFinalize` worker.ts:334 reproduit). Exit 0, grep `prepared statement` = 0 occurrence. |
| 3 | Les 4 extensions (pgcrypto, uuid-ossp, pg_trgm, unaccent) résolvent au runtime — une recherche trigram et un `unaccent` fonctionnent | VERIFIED | `19-SMOKE.md` : `[extensions] pg_trgm similarity=0.5555556, unaccent OK` (`unaccent('Éléonore')='Eleonore'`). `pg_extension` cloud confirme 4/4 : `pg_trgm`(public), `pgcrypto`(extensions), `unaccent`(public), `uuid-ossp`(extensions). |
| 4 | Un INSERT test après restore ne collisionne pas de PK (séquences réalignées via `setval`) | VERIFIED | `19-SMOKE.md` : `[insert-test] UUID PK INSERT+delete OK, id=0c13e623-… (no sequence, no collision)`. `grep -c 'autoincrement()' schema.prisma` = 0 → toutes PK sont `@default(uuid())`, aucune séquence Postgres concernée. Collision structurellement impossible, prouvée empiriquement (run 2× → UUIDs différents, 0 collision). Aucun `setval` requis. |

**Score:** 4/4 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/web/scripts/db-smoke-cloud.ts` | Script runner tsx, 4 fonctions, min 80 lignes, contient `similarity` | VERIFIED | 132 lignes. 4 fonctions (`proveRoundTripPooled`, `proveSerializableInteractiveTx`, `proveExtensions`, `proveInsertNoPkCollision`). `from '@qualiof/db'`=1, `similarity(`=2, `unaccent(`=2, `pathToFileURL`=3, `isolationLevel: 'Serializable'`=1, `$disconnect`=1. `tsc --noEmit` exit 0. |
| `packages/db/prisma/migrations/0_init/migration.sql` | Baseline collapse du schéma courant, contient `CREATE TABLE` | VERIFIED | 1493 lignes. 47 `CREATE TABLE`, 28 `CREATE TYPE`. Généré via `migrate diff --from-empty`. Seul dossier actif dans `migrations/` (aucun `2026*` restant). |
| `.planning/phases/19-.../19-SMOKE.md` | Journal des preuves cloud DB-01/DB-02, contient `prepared statement` | VERIFIED | Existe. Section « RÉSULTATS DE VALIDATION — 2026-07-05 ». 4 tableaux de critères avec Résultat+date datés 2026-07-05. `prepared statement`=10 occurrences, `similarity`/`unaccent`=9, `autoincrement`=1. DB-01 VALIDÉ / DB-02 VALIDÉ explicites. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `apps/web/scripts/db-smoke-cloud.ts` | `@qualiof/db` prisma | `import { prisma } from '@qualiof/db'` | WIRED | `from '@qualiof/db'`=1, tous les appels Prisma via ce client. |
| `apps/web/scripts/db-smoke-cloud.ts` | pg_trgm / unaccent | `$queryRawUnsafe` avec `similarity`/`unaccent` | WIRED | Deux appels `$queryRawUnsafe` avec validation de résultat + throw si KO. |
| `.env DATABASE_URL` | Supavisor transaction pooler | `?pgbouncer=true&connection_limit=1` | WIRED | `.env` : `DATABASE_URL=postgresql://…@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1`. Pattern `6543.*pgbouncer=true` vérifié (grep=2 incluant la ligne de commentaire). |
| `.env DIRECT_URL` | Supavisor session pooler | port 5432 | WIRED | `.env` : `DIRECT_URL=postgresql://…@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`. Pattern `pooler.supabase.com:5432` vérifié (grep=1). Aucun `pgbouncer` sur `DIRECT_URL`. |
| `db:smoke:cloud` | base Supabase cloud réelle | `DATABASE_URL` poolée + `DIRECT_URL` session | WIRED (avec déviation outillage) | `package.json` contient `"db:smoke:cloud": "dotenv -e .env -- pnpm --filter @qualiof/web exec tsx scripts/db-smoke-cloud.ts"`. Déviation documentée : `dotenv-cli` non installé → exécution via `tsx --env-file=../../.env` au smoke. Résultat identique, même `.env`, même script. Dette légère consignée. |

---

### Data-Flow Trace (Level 4)

Non applicable. Cette phase ne livre pas de composant UI rendant des données dynamiques — elle livre un script de preuve CLI (`db-smoke-cloud.ts`) et des artefacts de configuration de base de données (migrations, `.env`). Le data-flow est prouvé directement par les sorties runtime consignées dans `19-SMOKE.md`.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `db-smoke-cloud.ts` compile sans erreur TypeScript | `pnpm --filter @qualiof/web exec tsc --noEmit` | exit 0, aucune erreur | PASS |
| Script contient les 4 fonctions de preuve (round-trip / serializable / extensions / insert) | `grep -c "for (let i = 0; i < 5\|isolationLevel.*Serializable\|similarity(\|DB_SMOKE_TEST"` | 1 / 1 / 2 / 2 | PASS |
| npm script `db:smoke:cloud` présent en racine | `grep '"db:smoke:cloud"' package.json` | 1 occurrence | PASS |
| Baseline `0_init` couvre les 47 tables du schéma | `grep -c 'CREATE TABLE' 0_init/migration.sql` | 47 | PASS |
| Aucune migration `2026*` ne reste dans `migrations/` | `ls migrations/2026* 2>/dev/null \| wc -l` | 0 | PASS |
| 29 migrations archivées dans `archived-db-push/` | `ls -d archived-db-push/2026*/ \| wc -l` | 29 | PASS |
| Smoke runtime cloud : 4 critères PROUVÉS (résultats datés dans 19-SMOKE.md) | Sortie consignée : `[db-smoke] ALL 4 CRITERIA PROVEN`, exit 0, grep `prepared statement` = 0 | ✅ ALL 4 CRITERIA PROVEN — 2026-07-05 | PASS |

**Note Step 7b :** Le smoke runtime (`pnpm db:smoke:cloud`) n'a pas pu être relancé ici (requiert la base cloud réelle avec credentials en `.env`, convention « cloud réel = étape séparée »). La vérification s'appuie sur les sorties brutes datées consignées dans `19-SMOKE.md` — evidence suffisante et conforme à la stratégie de validation définie dans `19-VALIDATION.md`.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DB-01 | 19-01, 19-02, 19-03 | Supabase Postgres EU provisionné, historique migrations Prisma baseliné (résolution drift `db push`), `prisma migrate deploy` vert via `DIRECT_URL` :5432 | SATISFIED | `0_init/migration.sql` (47 tables, 1493 lignes). `migrate deploy` = « No pending migrations ». `migrate status` = « up to date ». `_prisma_migrations` = `["0_init"]`. Drift db-push (`derouleJson`, `RevenueTarget`, `SessionCalendarSync`) résolu forward (0 DROP). Commits `4f70475`, `bbe7fcd`. |
| DB-02 | 19-01, 19-02, 19-03 | `DATABASE_URL` poolée (`:6543 ?pgbouncer=true&connection_limit=1`) + `DIRECT_URL` directe câblées, 4 extensions actives (pgcrypto, uuid-ossp, pg_trgm, unaccent), séquences alignées post-restore | SATISFIED | `.env` : `DATABASE_URL` :6543 `?pgbouncer=true&connection_limit=1`, `DIRECT_URL` :5432 sans pgbouncer. Extensions 4/4 dans `pg_extension`. Round-trip poolé 5 hits exit 0. Tx Serializable OK. `similarity=0.5555556`, `unaccent='Eleonore'`. 0 autoincrement → aucun `setval` requis. |

**Orphelins potentiels :** Aucun. Les 2 requirements DB-01/DB-02 de la phase sont mappés dans `REQUIREMENTS.md` (phase 19, status Complete) et revendiqués dans les 3 plans. Aucun REQ-ID Phase 19 supplémentaire dans `REQUIREMENTS.md`.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/db/prisma/migrations/0_init/migration.sql` | 68 | `TODO` dans `CREATE TYPE "TaskStatus" AS ENUM ('TODO', …)` | INFO | Faux positif — c'est une valeur d'enum métier (`TaskStatus.TODO`), pas un commentaire de code incomplet. Aucun impact. |

Aucun anti-pattern bloquant détecté. Le script `db-smoke-cloud.ts` ne contient aucun `TODO/FIXME/placeholder`, aucun `return null`/`return {}`, aucune valeur hardcodée simulant des données. Le `19-SMOKE.md` contient des résultats réels datés, pas de colonnes vides.

---

### Déviations documentées (non bloquantes)

**1. `dotenv-cli` non installé → contournement `tsx --env-file`**
Le npm script `db:smoke:cloud` invoque `dotenv -e .env`, mais `dotenv-cli` est absent (`node_modules/.bin/dotenv` manquant). Au smoke, exécution via `tsx --env-file=../../.env scripts/db-smoke-cloud.ts` — même `.env`, même script, seul le loader d'env change. Résultat identique. Dette légère consignée dans `19-SMOKE.md` pour Phase 20.

**2. Archive `archived-db-push/` placée dans `packages/db/prisma/` (non dans `migrations/`)**
Le plan 19-02 mentionnait `migrations/archived-db-push/`, mais Prisma scanne `migrations/` et échoue `P3015` sur un sous-dossier sans `migration.sql`. Correction immédiate : déplacement vers `packages/db/prisma/archived-db-push/` (sibling de `migrations/`, non scanné). Les 29 dossiers sont conservés et comptés.

---

### Human Verification Required

Aucun item nécessite de vérification humaine supplémentaire. Les 4 critères de succès sont des preuves runtime consignées avec sorties brutes datées dans `19-SMOKE.md`, validées le 2026-07-05.

---

### Gaps Summary

Aucun gap. Les 4 truths observables sont VERIFIED, les 3 artefacts requis existent, sont substantiels et câblés. Les 2 requirements DB-01 et DB-02 sont SATISFIED avec evidence concrète. Aucun anti-pattern bloquant. Phase 19 atteint son objectif.

---

_Verified: 2026-07-05_
_Verifier: Claude (gsd-verifier)_
