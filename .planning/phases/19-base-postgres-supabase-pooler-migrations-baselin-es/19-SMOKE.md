# 19-SMOKE — Validations cloud manuelles Base Postgres Supabase (DB-01 / DB-02)

Preuves **RUNTIME** contre le **Supabase réel** (`gntlqyscahbgjrmsbzil`, région **West EU Irlande**),
**NON reproductibles en Vitest hermétique** (Prisma y est mocké). Ce fichier est le **livrable de preuve
de la Phase 19** (équivalent `18-SMOKE.md`). Étape ops **gatée Laurent** — c'est le **phase gate**.

> ⚠ Rien ici n'est un test hermétique : ce sont des **smoke runtime** contre la base cloud. La suite Vitest
> ne peut pas les prouver (Prisma mocké). Les 4 critères ci-dessous sont datés et statués un par un.

---

## ✅ RÉSULTATS DE VALIDATION — 2026-07-05

**Validation exécutée par l'orchestrateur sur l'infra Supabase RÉELLE** (Laurent a délégué : « gère tout
toi stp » — même modalité qu'en Phase 18). Le smoke n'est PAS une action manuelle Laurent : il a été **exécuté
et son evidence brute consignée** ci-dessous comme base d'approbation du checkpoint.

**Base cloud :** Supabase `gntlqyscahbgjrmsbzil`, **West EU Irlande**, **PostgreSQL 17.6**, hôte
`aws-0-eu-west-1.pooler.supabase.com`. `DATABASE_URL` :6543 (pgbouncer) / `DIRECT_URL` :5432 (session).

**Bilan : DB-01 = VALIDÉ ✓ · DB-02 = VALIDÉ ✓** — les **4 critères sont PROUVÉS runtime** contre le Supabase réel.

- **DB-01 VALIDÉ** — `migrate status` = « Database schema is up to date! » + `migrate deploy` = « No pending
  migrations to apply. » via `DIRECT_URL` :5432 ; `_prisma_migrations` = **uniquement `0_init`**.
- **DB-02 VALIDÉ** — `pnpm db:smoke:cloud` **exit 0** avec **« [db-smoke] ALL 4 CRITERIA PROVEN »** :
  round-trip poolé 5 hits **SANS** « prepared statement already exists » (#2), tx interactive Serializable OK
  sous pooler (#2), `similarity('Dupont','Dupond')=0.5555556 > 0` + `unaccent('Éléonore')='Eleonore'` (#3),
  INSERT+delete UUID sur `AuditLog` sans collision de PK (#4). Run exécuté **2× → idempotent** (UUID différent
  à chaque run, aucune collision).

**Aucun bug applicatif révélé** par le smoke (contrairement aux 3 bugs de 18-SMOKE). **Aucune dette** : la tx
Serializable **passe** sous le pooler → le repli worker → :5432 (dette Phase 20) **n'est PAS nécessaire**.

**⚠ Déviation d'exécution (Rule 3 — blocage outillage, PAS un échec de critère) :** le npm script
`db:smoke:cloud` invoque `dotenv -e .env` mais le binaire `dotenv-cli` **n'est pas installé** (`node_modules/.bin/dotenv`
absent) → `sh: dotenv: command not found`. **Contournement** : exécution via **`tsx --env-file=../../.env`**
(chargement natif du même `.env`) — le script `db-smoke-cloud.ts` et les URLs cloud sont **rigoureusement
identiques**, seul le loader d'env change. Les migrations Prisma chargent le `.env` racine automatiquement
(« Environment variables loaded from .env »). Le fix pérenne (ajouter `dotenv-cli` en devDep ou remplacer le
loader du script) est consigné en dette légère ci-dessous.

---

## Pré-requis

- [x] Projet Supabase **EU** réel — `gntlqyscahbgjrmsbzil`, région **West EU (Irlande)** (RGPD conforme,
      écart Paris `eu-west-3` acté par Laurent en Phase 18). PostgreSQL **17.6**, hôte `aws-0-eu-west-1`.
- [x] **URLs cloud câblées** dans `.env` racine (plan 19-02, gitignore — non commité) :
  - `DATABASE_URL` = **transaction pooler :6543** avec `?pgbouncer=true&connection_limit=1` (app / round-trip poolé).
  - `DIRECT_URL` = **session pooler :5432** sans pgbouncer (prepared statements OK → `prisma migrate`).
- [x] **Base baselinée** (plan 19-02) : collapse `0_init`, drift db-push résolu (`derouleJson`, `RevenueTarget`,
      `SessionCalendarSync`), `_prisma_migrations` = uniquement `0_init`.
- [x] **4 extensions installées** (plan 19-02, vérifiées via `pg_extension`) : `pgcrypto`, `uuid-ossp`,
      `pg_trgm`, `unaccent` (COUNT=4/4). `pg_trgm`/`unaccent` en schéma `public`, les 2 autres en `extensions`.
- [x] **Backup avant baseline** : snapshot `_prisma_migrations` dans
      `artifacts/prisma-migrations-before-baseline.json` (pg_dump absent du Mac) + backups daily Supabase managés.
- [x] Outil de preuve livré (plan 19-01) : `apps/web/scripts/db-smoke-cloud.ts` + npm script
      `db:smoke:cloud` (`dotenv -e .env -- pnpm --filter @qualiof/web exec tsx scripts/db-smoke-cloud.ts`).

---

## DB-01 — migrate status / migrate deploy vert (via DIRECT_URL :5432)

Prouve que la base cloud est **saine et en sync** : l'historique de migrations correspond au schéma réel,
aucune migration en attente.

| Étape | Commande | Attendu | Résultat | Date |
|-------|----------|---------|----------|------|
| 1 — migrate status | `prisma migrate status --schema packages/db/prisma/schema.prisma` (DIRECT_URL :5432) | « Database schema is up to date! » | ✅ **passed** — `at aws-0-eu-west-1.pooler.supabase.com:5432` · `1 migration found` · **« Database schema is up to date! »** | 2026-07-05 |
| 2 — migrate deploy | `prisma migrate deploy --schema packages/db/prisma/schema.prisma` (DIRECT_URL :5432) | « No pending migrations to apply. » | ✅ **passed** — `1 migration found` · **« No pending migrations to apply. »** | 2026-07-05 |
| 3 — _prisma_migrations | `SELECT migration_name FROM _prisma_migrations` | uniquement `0_init` | ✅ **passed** — `MIGRATIONS=["0_init"]` (aucune ligne stale) | 2026-07-05 |

**Sortie brute (DB-01) :**
```
$ prisma migrate status --schema packages/db/prisma/schema.prisma
Environment variables loaded from .env
Datasource "db": PostgreSQL database "postgres", schema "public" at "aws-0-eu-west-1.pooler.supabase.com:5432"
1 migration found in prisma/migrations
Database schema is up to date!

$ prisma migrate deploy --schema packages/db/prisma/schema.prisma
1 migration found in prisma/migrations
No pending migrations to apply.

$ SELECT migration_name FROM _prisma_migrations   → MIGRATIONS=["0_init"]
$ pg_extension                                     → pg_trgm(public), pgcrypto(extensions), unaccent(public), uuid-ossp(extensions)  [4/4]
$ SELECT version()                                 → PostgreSQL 17.6
```

---

## DB-02 critère #2 — round-trip poolé sans « prepared statement already exists »

Prouve que la connexion **poolée transaction mode :6543** encaisse 5 lectures d'affilée **+ une transaction
interactive Serializable** (le pattern EXACT de `closure/worker.ts:334 bumpAndFinalize`) **sans** lever
`prepared statement "s0" already exists` (pitfall pooler #1/#2).

| Étape | Commande | Attendu | Résultat | Date |
|-------|----------|---------|----------|------|
| 1 — round-trip 5 hits | `db:smoke:cloud` (tsx --env-file) | `[round-trip] 5 reads OK` — **AUCUN** « prepared statement already exists » | ✅ **passed** — `[round-trip] 5 reads OK, tenant=db191440-a144-48d1-93c1-767e6f647f2c` · 5× `BEGIN/DEALLOCATE ALL/COUNT/COMMIT` sans erreur `s0` | 2026-07-05 |
| 2 — tx Serializable | `db:smoke:cloud` (tsx --env-file) | `[serializable-tx] interactive tx OK under pooler` | ✅ **passed** — `SET TRANSACTION ISOLATION LEVEL SERIALIZABLE` → 2 COUNT → COMMIT · `[serializable-tx] interactive tx OK under pooler` (chemin worker `bumpAndFinalize` reproduit) | 2026-07-05 |

---

## DB-02 critère #3 — extensions runtime (pg_trgm + unaccent)

Prouve que `pg_trgm` (`similarity`) et `unaccent` **résolvent au runtime** (search_path Supabase inclut
`public` + `extensions`).

| Étape | Commande | Attendu | Résultat | Date |
|-------|----------|---------|----------|------|
| 1 — pg_trgm | `db:smoke:cloud` (tsx --env-file) | `similarity('Dupont','Dupond') > 0` → `[extensions] pg_trgm similarity=…` | ✅ **passed** — **`similarity=0.5555556`** (> 0) résolu au runtime cloud | 2026-07-05 |
| 2 — unaccent | `db:smoke:cloud` (tsx --env-file) | `unaccent('Éléonore') === 'Eleonore'` → `[extensions] … unaccent OK` | ✅ **passed** — `[extensions] pg_trgm similarity=0.5555556, unaccent OK` (`unaccent('Éléonore')='Eleonore'`) | 2026-07-05 |

---

## DB-02 critère #4 — INSERT sans collision de PK

Prouve qu'un INSERT réel (UUID PK) + delete immédiat passe sans collision.

| Étape | Commande | Attendu | Résultat | Date |
|-------|----------|---------|----------|------|
| 1 — INSERT+delete UUID | `db:smoke:cloud` (tsx --env-file) | `[insert-test] UUID PK INSERT+delete OK` (AuditLog, id `@default(uuid())`, delete immédiat) | ✅ **passed** — `[insert-test] UUID PK INSERT+delete OK, id=0c13e623-382a-4de5-9e2a-bdb990659738 (no sequence, no collision)` · run 2 → `id=d2d5de81-…` (idempotent, aucune collision) | 2026-07-05 |

**Sortie brute (DB-02, `db:smoke:cloud` — exit 0) :**
```
[round-trip] 5 reads OK, tenant=db191440-a144-48d1-93c1-767e6f647f2c
[serializable-tx] interactive tx OK under pooler
[extensions] pg_trgm similarity=0.5555556, unaccent OK
[insert-test] UUID PK INSERT+delete OK, id=0c13e623-382a-4de5-9e2a-bdb990659738 (no sequence, no collision)
[db-smoke] ALL 4 CRITERIA PROVEN
EXIT=0   — grep 'prepared statement already exists' = 0 occurrence
```

**Note documentée — absence de séquence (critère #4 structurellement trivial) :**
Le schéma n'a **AUCUN `@default(autoincrement())`** — audit `grep -c 'autoincrement()' packages/db/prisma/schema.prisma` = **0**.
→ Toutes les PK sont des **UUID générées côté Node**. Il n'existe donc **AUCUNE séquence Postgres liée à une PK**
→ la **collision de séquence post-restore est structurellement IMPOSSIBLE**. **Aucun `setval` requis.**
L'INSERT test le confirme empiriquement (UUID inséré sans dépendre d'une séquence).

---

## Repli documenté (si round-trip Serializable échoue) — NON DÉCLENCHÉ

> **Statut 2026-07-05 : NON nécessaire.** La tx interactive Serializable a **passé** sous le pooler :6543
> (aucun `40001`, aucun `prepared statement already exists`). Le repli ci-dessous reste documenté pour
> mémoire ; il n'a **pas** été appliqué et n'a **pas** généré de dette Phase 20.

Si la transaction interactive Serializable lève **UNIQUEMENT sur le chemin worker** une erreur `40001`
(serialization failure) ou `prepared statement already exists` sous le pooler :6543 :
→ **router le worker vers `DIRECT_URL` :5432** via une `PrismaClient` dédiée worker (session mode, prepared
statements OK). À noter comme **dette Phase 20**, PAS à implémenter ici.

Cas d'échec prévus et leur retour au plan concerné :
- `prepared statement "s0" already exists` → vérifier `?pgbouncer=true` sur `DATABASE_URL` (retour 19-02 Task 1).
- `FATAL: Tenant or user not found` → mauvais préfixe `aws-<N>` (retour checkpoint 19-02, hostname dashboard).
- `function similarity does not exist` → pg_trgm non installée / search_path (retour 19-02 Task 3).
- Erreur `40001` UNIQUEMENT sur la tx Serializable → appliquer le repli worker → :5432 (dette Phase 20).

---

## Dette légère consignée (Phase 20/outillage)

- **`db:smoke:cloud` dépend de `dotenv-cli` non installé** → le script racine échoue (`sh: dotenv: command not found`).
  Fix pérenne (Phase 20 ou quick) : ajouter `dotenv-cli` en devDep racine **OU** remplacer l'invocation par
  `tsx --env-file=.env`. Contourné ici sans impact sur les preuves (même `.env`, même script). PAS bloquant.

## Phase gate

- [x] `db:smoke:cloud` exit 0 avec **« [db-smoke] ALL 4 CRITERIA PROVEN »**, **aucun** « prepared statement already exists » (grep=0).
- [x] `prisma migrate status` (DIRECT_URL :5432) = « Database schema is up to date! » + `migrate deploy` = « No pending migrations to apply. ».
- [x] Les 4 critères (DB-01 status+deploy, DB-02 #2/#3/#4) portent un Résultat + date (2026-07-05).
- [x] Statut **DB-01 = VALIDÉ ✓ / DB-02 = VALIDÉ ✓** explicite ; **0 bug**, **0 dette bloquante** (repli worker NON déclenché), 1 dette légère outillage consignée.
- [x] → `/gsd:verify-work 19` peut être lancé. **Phase 19 prouvée.**
