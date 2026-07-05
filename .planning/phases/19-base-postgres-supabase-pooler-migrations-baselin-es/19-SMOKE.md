# 19-SMOKE — Validations cloud manuelles Base Postgres Supabase (DB-01 / DB-02)

Preuves **RUNTIME** contre le **Supabase réel** (`gntlqyscahbgjrmsbzil`, région **West EU Irlande**),
**NON reproductibles en Vitest hermétique** (Prisma y est mocké). Ce fichier est le **livrable de preuve
de la Phase 19** (équivalent `18-SMOKE.md`). Étape ops **gatée Laurent** — c'est le **phase gate**.

> ⚠ Rien ici n'est un test hermétique : ce sont des **smoke runtime** contre la base cloud. La suite Vitest
> ne peut pas les prouver (Prisma mocké). Les 4 critères ci-dessous sont datés et statués un par un.

---

<!-- RÉSULTATS DE VALIDATION insérés en tête à la Task 2, après exécution réelle. -->

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
| 1 — migrate status | `pnpm --filter @qualiof/db exec prisma migrate status` (DIRECT_URL :5432) | « Database schema is up to date! » | | |
| 2 — migrate deploy | `pnpm --filter @qualiof/db exec prisma migrate deploy` (DIRECT_URL :5432) | « No pending migrations to apply. » | | |
| 3 — _prisma_migrations | `SELECT migration_name FROM _prisma_migrations` | uniquement `0_init` | | |

---

## DB-02 critère #2 — round-trip poolé sans « prepared statement already exists »

Prouve que la connexion **poolée transaction mode :6543** encaisse 5 lectures d'affilée **+ une transaction
interactive Serializable** (le pattern EXACT de `closure/worker.ts:334 bumpAndFinalize`) **sans** lever
`prepared statement "s0" already exists` (pitfall pooler #1/#2).

| Étape | Commande | Attendu | Résultat | Date |
|-------|----------|---------|----------|------|
| 1 — round-trip 5 hits | `pnpm db:smoke:cloud` | `[round-trip] 5 reads OK` — **AUCUN** « prepared statement already exists » | | |
| 2 — tx Serializable | `pnpm db:smoke:cloud` | `[serializable-tx] interactive tx OK under pooler` | | |

---

## DB-02 critère #3 — extensions runtime (pg_trgm + unaccent)

Prouve que `pg_trgm` (`similarity`) et `unaccent` **résolvent au runtime** (search_path Supabase inclut
`public` + `extensions`).

| Étape | Commande | Attendu | Résultat | Date |
|-------|----------|---------|----------|------|
| 1 — pg_trgm | `pnpm db:smoke:cloud` | `similarity('Dupont','Dupond') > 0` → `[extensions] pg_trgm similarity=…` | | |
| 2 — unaccent | `pnpm db:smoke:cloud` | `unaccent('Éléonore') === 'Eleonore'` → `[extensions] … unaccent OK` | | |

---

## DB-02 critère #4 — INSERT sans collision de PK

Prouve qu'un INSERT réel (UUID PK) + delete immédiat passe sans collision.

| Étape | Commande | Attendu | Résultat | Date |
|-------|----------|---------|----------|------|
| 1 — INSERT+delete UUID | `pnpm db:smoke:cloud` | `[insert-test] UUID PK INSERT+delete OK` (AuditLog, id `@default(uuid())`, delete immédiat) | | |

**Note documentée — absence de séquence (critère #4 structurellement trivial) :**
Le schéma n'a **AUCUN `@default(autoincrement())`** — audit `grep -c 'autoincrement()' packages/db/prisma/schema.prisma` = **0**.
→ Toutes les PK sont des **UUID générées côté Node**. Il n'existe donc **AUCUNE séquence Postgres liée à une PK**
→ la **collision de séquence post-restore est structurellement IMPOSSIBLE**. **Aucun `setval` requis.**
L'INSERT test le confirme empiriquement (UUID inséré sans dépendre d'une séquence).

---

## Repli documenté (si round-trip Serializable échoue)

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

## Phase gate

- [ ] `pnpm db:smoke:cloud` exit 0 avec **« [db-smoke] ALL 4 CRITERIA PROVEN »**, aucun « prepared statement already exists ».
- [ ] `prisma migrate status` (DIRECT_URL :5432) = « Database schema is up to date! ».
- [ ] Les 4 critères (DB-01 status+deploy, DB-02 #2/#3/#4) portent un Résultat + date.
- [ ] Statut DB-01 / DB-02 explicite (VALIDÉ ou échec détaillé), dette/bugs éventuels consignés.
