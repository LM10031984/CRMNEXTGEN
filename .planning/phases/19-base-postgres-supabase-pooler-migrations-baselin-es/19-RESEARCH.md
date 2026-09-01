# Phase 19: Base Postgres Supabase (pooler + migrations baselinées) - Research

**Researched:** 2026-07-04
**Domain:** Prisma 5 + Supabase Postgres (Supavisor pooler, baselining, extensions, transaction pooling)
**Confidence:** HIGH (tous les [VERIFY] résolus par docs officielles Supabase + Prisma)

## Summary

Cette phase raccorde l'app Prisma 5.22 à la base Postgres cloud Supabase (Irlande, `gntlqyscahbgjrmsbzil`, réutilisée de la Phase 18) de façon **saine et prouvée**. Quatre chantiers indépendants : (1) **baseliner** le drift `db push` historique pour que `migrate deploy`/`migrate status` soient verts sans détruire les données restaurées ; (2) **câbler les deux URLs** poolée (transaction :6543) et directe/session (:5432) selon la sémantique Supavisor ; (3) **activer 4 extensions** au runtime ; (4) **réaligner les séquences** post-restore pour éviter les collisions de PK.

Le schéma Prisma est **déjà prêt** : `datasource db` a `directUrl = env("DIRECT_URL")` et `extensions = [pgcrypto, uuid_ossp(map:"uuid-ossp"), pg_trgm, unaccent]` (preview `postgresqlExtensions`). Le blocage n'est donc PAS le code app — c'est l'état de la base cloud et la stratégie d'opérations Prisma. Découverte clé de l'audit codebase : **aucune requête runtime n'utilise `pg_trgm`/`unaccent`/`similarity()` en SQL** — le `similarity()` de `session-gaps.ts` est du JS pur (Jaccard), et `gen_random_uuid`/hash sont faits en Node (`createHash`), pas via `pgcrypto`. Les extensions sont déclarées « au cas où » et pour la conformité du schéma ; le critère de succès #3 (« une recherche trigram fonctionne ») devra être prouvé par un `$queryRaw` de test dédié, pas par un chemin de code existant.

**Recommandation primaire :** `DATABASE_URL` = **transaction pooler** `aws-<N>-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1`, `DIRECT_URL` = **session pooler** `…pooler.supabase.com:5432/postgres` (PAS le direct `db.<ref>.supabase.co:5432` qui est IPv6-only sans add-on payant — le session pooler est IPv4 ET supporte les prepared statements requises par les migrations). Baseline via `migrate diff --from-empty` + `migrate resolve --applied` sur les migrations existantes, jamais de `migrate deploy` destructif sur une base peuplée. Lire le hostname exact (`aws-0` vs `aws-1`) **dans le dashboard**, jamais deviné.

## User Constraints

*(Aucun CONTEXT.md trouvé pour la Phase 19 — pas de session `/gsd:discuss-phase`. Contraintes dérivées de CLAUDE.md, REQUIREMENTS.md, ROADMAP.md et mémoire projet.)*

### Contraintes verrouillées (mémoire projet + roadmap, ne pas re-litiguer)
- **Région Supabase = Irlande (West EU)**, projet `gntlqyscahbgjrmsbzil` — immuable, réutilisé de la Phase 18. Écart eu-west-3 (Paris) acté non bloquant (Irlande = UE → RGPD conforme). Arbitrage Paris dédié éventuel = Phase 21, HORS scope Phase 19.
- **Destructif = étape séparée** (convention projet, mémoire `feedback_destructif_etape_separee`) : tout DELETE/restore/`setval` en masse → liste finale + dépendances → mot de Laurent → exécution en tours distincts, `pg_dump` avant.
- **`prisma migrate dev` échoue en sandbox** (mémoire `feedback_prisma_db_push_sandbox`) → utiliser `db push --skip-generate` + `generate` séparé en LOCAL ; mais sur le CLOUD c'est **`migrate deploy` (jamais `dev`, jamais `db push`)** qui doit tourner — c'est précisément le critère de succès #1.
- **Toute migration créée DOIT être `migrate deploy`ée** sur Postgres (mémoire `feedback_prisma_migrate_deploy`).
- **Prisma 5.22.0 figé** (pas de bump vers Prisma 6/7 dans cette phase — le schéma et les scripts sont calés sur 5.x).

### Discrétion Claude
- Choix session pooler vs direct+IPv4 add-on pour `DIRECT_URL` (recommandation : session pooler, gratuit).
- Emplacement/nom exact de la migration baseline (`0_init` vs timestamp).
- Forme du script de test round-trip worker et du script `setval`.
- Faut-il un utilisateur DB dédié `prisma` (recommandé par Supabase) ou réutiliser `postgres`.

### Idées différées (HORS scope Phase 19)
- Worker 3ᵉ hôte / déploiement Railway-Fly (Phase 20).
- App déployée Vercel, `@supabase/supabase-js` runtime (Phase 21).
- `pg_dump` cron vers stockage indépendant (backlog).
- Supabase PITR (backlog, backups daily suffisent).
- Refactor async des 9 server actions PDF (HORS scope v6).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **DB-01** | Postgres EU provisionné, historique migrations Prisma baseliné (résolution drift `db push`), `migrate deploy` vert via `DIRECT_URL` :5432 | Stratégie baselining `migrate diff --from-empty` + `migrate resolve --applied` (Prisma docs, HIGH) ; DIRECT_URL = session pooler :5432 IPv4 (Supabase docs, HIGH) ; 30 migrations existantes recensées dans `packages/db/prisma/migrations/` |
| **DB-02** | `DATABASE_URL` poolée (`:6543 ?pgbouncer=true&connection_limit=1`) + `DIRECT_URL` directe câblées, 4 extensions actives (pgcrypto, uuid-ossp, pg_trgm, unaccent), séquences alignées post-restore | Sémantique Supavisor transaction/session (Supabase docs, HIGH) ; `?pgbouncer=true` corrige `prepared statement already exists` (Prisma+Supabase docs, HIGH) ; extensions via dashboard ou `create extension … with schema extensions` (Supabase docs, HIGH) ; `setval` via information_schema (pattern standard) |

## Standard Stack

### Core (déjà présent — rien à installer)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| prisma / @prisma/client | 5.22.0 (figé) | ORM + migrate + client | Stack figée projet ; `directUrl` + `postgresqlExtensions` déjà déclarés |
| Postgres (Supabase) | 15.x (Supabase managed) | Base cloud EU | Provisionné Phase 18, région Irlande |
| Supavisor | (managed) | Connection pooler Supabase | Remplaçant de PgBouncer côté Supabase, protocole compatible `pgbouncer=true` |

### Supporting
| Outil | Purpose | When to Use |
|-------|---------|-------------|
| `psql` (Postgres client) | exécuter le SQL de baseline / `setval` / `create extension` / vérif | Étapes ops manuelles gatées Laurent (destructif = étape séparée) |
| `prisma migrate diff` | générer la migration baseline `--from-empty` | Résolution du drift `db push` (DB-01) |
| `prisma migrate resolve --applied` | marquer la baseline appliquée sans l'exécuter | Empêche `migrate deploy` de re-jouer un SQL déjà présent (base restaurée) |
| `prisma migrate status` | vérifier que `_prisma_migrations` est clean | Preuve du critère #1 |
| tsx | runner scripts TS (round-trip worker test, setval generator) | Déjà dans le repo |

**Installation :** rien. Tout est déjà dans le monorepo (`prisma`, `@prisma/client`, `tsx`, `@supabase/supabase-js@^2.107.0` déjà présent depuis Phase 18).

**Version verification (à confirmer au plan) :** `prisma migrate diff` avec `--from-empty --to-schema` est stable en 5.22. Ne PAS passer en Prisma 6/7 — le preview `postgresqlExtensions` change de statut (voir Pitfall 5).

## Architecture Patterns

### Les deux URLs Supabase (le cœur de DB-02)

**Recommandation vérifiée (docs Supabase « Connect to your database » + guide Prisma) :**

```bash
# DATABASE_URL — Transaction pooler (Supavisor :6543), utilisé par Prisma Client (app + workers)
DATABASE_URL="postgres://postgres.<PROJECT_REF>:<PASSWORD>@aws-<N>-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"

# DIRECT_URL — Session pooler (Supavisor :5432), utilisé par `prisma migrate deploy`
DIRECT_URL="postgres://postgres.<PROJECT_REF>:<PASSWORD>@aws-<N>-eu-west-1.pooler.supabase.com:5432/postgres"
```

**Points de vérité critiques :**
1. **`aws-<N>`** est **variable par projet** (`aws-0`, `aws-1`, …) et **`eu-west-1`** est la région (Irlande). Le sous-domaine EXACT DOIT être copié depuis **Dashboard → Project Settings → Database → Connection string / Connection pooling**. Ne PAS deviner. [VERIFY résolu : le format est confirmé mais la valeur du préfixe est project-specific.]
2. **Username = `postgres.<PROJECT_REF>`** (le project ref suit un point après le user). Supabase recommande un user dédié `prisma.<PROJECT_REF>` (discrétion — voir Pitfall 6).
3. **`?pgbouncer=true`** sur la DATABASE_URL poolée : indispensable, il désactive les prepared statements côté Prisma → supprime `prepared statement "s0" already exists`.
4. **`connection_limit=1`** en transaction mode : commencer à 1, augmenter progressivement seulement si besoin (recommandation Supabase). Le worker Postgres SKIP LOCKED fait de petites transactions courtes → 1 suffit.
5. **`DIRECT_URL` = session pooler :5432, PAS le direct `db.<ref>.supabase.co:5432`.** Le direct endpoint est **IPv6-only** sans l'add-on IPv4 payant ; le session pooler est **IPv4 ET supporte les prepared statements** → parfait pour `migrate deploy` depuis le Mac de Laurent (réseau IPv4). C'est la réponse au flag [VERIFY IPv4 add-on] : **l'add-on IPv4 n'est PAS nécessaire** tant qu'on passe par le session pooler.

### Baselining du drift `db push` (le cœur de DB-01)

La base cloud a été **restaurée d'un dump** (48 tables / 15118 lignes, 2026-07-03) — les tables existent DÉJÀ mais `_prisma_migrations` est vide ou incohérent (drift `db push`). Séquence NON destructive (Prisma « baselining an existing database ») :

```bash
# 1. Générer la migration baseline depuis le schéma actuel (état vide → schéma complet)
mkdir -p packages/db/prisma/migrations/0_init
pnpm dlx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel packages/db/prisma/schema.prisma \
  --script > packages/db/prisma/migrations/0_init/migration.sql

# 2. Marquer la baseline APPLIQUÉE sur le cloud SANS l'exécuter (les tables existent déjà)
DIRECT_URL=<session-pooler-url> pnpm dlx prisma migrate resolve --applied 0_init

# 3. Vérifier
DIRECT_URL=<session-pooler-url> pnpm dlx prisma migrate status
```

**Décision de structure de migrations à trancher au plan :** deux options.
- **Option A — collapse en une seule baseline `0_init`** : `migrate diff --from-empty` produit tout le schéma courant, on `resolve --applied` cette unique migration, et on ARCHIVE les 30 migrations historiques (elles ne correspondent pas à l'état réel `db push`). `migrate status` devient clean instantanément. **Recommandé** — le drift `db push` signifie que les 30 migrations historiques ne reflètent plus l'état réel de la base.
- **Option B — resolve les 30 existantes une à une** (`migrate resolve --applied` × 30) : conserve l'historique mais suppose que l'état DB correspond exactement à la somme des 30 migrations — FAUX ici à cause du `db push` (`TrainingProduct.derouleJson` poussé hors migration, mémoire). Risque de drift résiduel → écarté.

Le critère de succès #1 exige que **`migrate deploy` ait vraiment tourné vert** — donc après la baseline, ajouter/vérifier qu'au moins un `migrate deploy` réel s'exécute (soit une migration neuve de test réversible, soit prouver que `migrate deploy` sur l'état baseliné retourne « No pending migrations » proprement via `DIRECT_URL`:5432 et peuple/valide `_prisma_migrations`).

### Extensions (critère #3)

Le schéma déclare `extensions = [pgcrypto, uuid_ossp(map:"uuid-ossp"), pg_trgm, unaccent]`. Sur Supabase :
- Les 4 sont dans la liste des 50+ extensions pré-configurées (`unaccent` confirmé disponible — flag [VERIFY unaccent] résolu).
- Activation : **Dashboard → Database → Extensions** (toggle) OU en SQL `create extension if not exists unaccent with schema extensions;`.
- **Caveat schema :** sur Supabase les extensions vivent dans le schéma `extensions` (accessible à `public` par défaut via search_path). Le baseline `migrate diff` émettra probablement `CREATE EXTENSION … ` dans `public` — sans conséquence puisque la migration est `resolve --applied` (jamais exécutée). Vérifier au runtime que `pg_trgm`/`unaccent` résolvent (search_path inclut `extensions`).
- **Preuve du critère #3 :** aucun code runtime n'appelle ces fonctions (audit ci-dessous). Il faut un **`$queryRaw` de test** dédié, ex. `SELECT similarity('abc','abd'); SELECT unaccent('éà');` — à inclure dans le script de smoke Phase 19.

### Réalignement des séquences post-restore (critère #4)

Après un restore par `INSERT` (ou `COPY` avec IDs explicites), les séquences `SERIAL`/`BIGSERIAL` ne sont pas avancées → prochain INSERT auto-généré collisionne. Pattern standard (générer les `setval` depuis le catalogue) :

```sql
-- Génère les commandes setval pour toutes les séquences liées à des colonnes
SELECT
  'SELECT setval(' || quote_literal(quote_ident(seq_ns.nspname) || '.' || quote_ident(s.relname)) ||
  ', COALESCE((SELECT MAX(' || quote_ident(a.attname) || ') FROM ' ||
  quote_ident(tab_ns.nspname) || '.' || quote_ident(tab.relname) || '), 1), true);'
FROM pg_class s
JOIN pg_depend d ON d.objid = s.oid AND d.deptype = 'a'
JOIN pg_class tab ON tab.oid = d.refobjid
JOIN pg_attribute a ON a.attrelid = tab.oid AND a.attnum = d.refobjsubid
JOIN pg_namespace seq_ns ON seq_ns.oid = s.relnamespace
JOIN pg_namespace tab_ns ON tab_ns.oid = tab.relnamespace
WHERE s.relkind = 'S';
```

**Caveat pour QualiOF :** le schéma Prisma utilise massivement `@id @default(uuid())` (String UUID) — **pas d'`autoincrement()`** sur les PK principales. Vérifier au plan **combien de séquences existent réellement** (probablement peu : peut-être aucune si tous les IDs sont UUID). Le critère #4 (« INSERT test ne collisionne pas de PK ») pourrait être **trivialement vrai** si toutes les PK sont UUID générées côté Node. À AUDITER : `grep '@default(autoincrement())' schema.prisma`. Si zéro, documenter que le risque de collision de séquence est nul (UUID) et prouver par un INSERT test quand même.

### Anti-Patterns to Avoid
- **`prisma migrate deploy` sur la base restaurée sans baseline** → tente de re-créer des tables existantes → échec ou corruption. TOUJOURS baseliner d'abord.
- **`prisma db push` sur le cloud** → c'est exactement le drift qu'on résout ; interdit sur cloud (le critère #1 exige explicitement « pas juste un db push »).
- **`DIRECT_URL` pointant vers `:6543` (transaction)** → migrations cassent (`prepared statement already exists`, pas de shadow DB). `DIRECT_URL` DOIT être :5432 session.
- **`DATABASE_URL` sans `?pgbouncer=true`** → `prepared statement "s0" already exists` en runtime dès qu'une connexion est recyclée.
- **Deviner le hostname pooler** (`aws-0` par défaut) → le projet peut être sur `aws-1` → `FATAL: Tenant or user not found`. Lire le dashboard.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Résoudre le drift `db push` | script SQL maison qui bricole `_prisma_migrations` | `migrate diff --from-empty` + `migrate resolve --applied` | Prisma calcule le checksum et peuple `_prisma_migrations` correctement ; un INSERT manuel dans `_prisma_migrations` avec mauvais checksum recasse `migrate status` |
| Désactiver les prepared statements | wrapper custom sur PrismaClient | `?pgbouncer=true` dans l'URL | Flag natif Prisma, testé, zéro code |
| Connexion IPv4 vers la base | acheter l'add-on IPv4 (payant) | session pooler :5432 (gratuit, IPv4) | Le session pooler couvre migrations + IPv4 + prepared statements |
| Pool de connexions worker | ioredis/pool maison | Supavisor transaction pooler `connection_limit=1` | Le pooler gère le fan-out ; Prisma Client garde 1 connexion |
| setval par table à la main | lister 40 tables manuellement | requête `pg_depend`/`pg_class` génératrice | Couvre toutes les séquences sans oubli ; mais vérifier d'abord s'il y en a (UUID = probablement aucune) |

**Key insight :** Prisma + Supavisor est un chemin ultra-documenté et stable. Le seul travail « intelligent » réel est **la stratégie de baseline** (collapse vs resolve-30) et **l'audit des transactions interactives** sous transaction pooling — tout le reste est de la config déclarative.

## Common Pitfalls

### Pitfall 1 : Transaction interactive `$transaction(async)` sous transaction pooler
**What goes wrong :** en **transaction mode** (Supavisor :6543), chaque *statement* peut atterrir sur une connexion backend différente. Les `$transaction(async (tx) => …)` interactifs de Prisma tiennent une connexion sur toute la durée du callback — Supavisor gère ça (le `BEGIN…COMMIT` épingle une connexion pour la durée de la transaction), **mais** les transactions longues (LLM/PDF) monopolisent une connexion du pool.
**Audit codebase — 10 usages de `$transaction(async`, tous classés :**

| Fichier | Chemin | Type | Durée | Risque pooler |
|---------|--------|------|-------|---------------|
| `server/actions/sessions-create.ts:170` | Server action (request) | interactive | courte (writes) | OK |
| `server/actions/invoices.ts:68,249,578` | Server action (request) | interactive (avoirs inclus l.578) | courte | OK |
| `server/actions/qualiopi-matrix.ts:467` | Server action (request) | interactive + `tx.$executeRaw` jsonb | courte | OK |
| `server/actions/crud-edits.ts:378` | Server action (request) | interactive | courte | OK |
| `server/actions/preinscription-convert.ts:60` | Server action (request) | interactive | courte | OK |
| `server/actions/opco-submission.ts:309` | Server action (request) | interactive | courte | OK |
| `server/actions/tenant-users.ts:123` | Server action (request) | interactive | courte | OK |
| `server/actions/sessions.ts:850` | Server action (request) | interactive | courte | OK |
| `server/actions/schedule-wizard.ts:180` | Server action (request) | interactive | courte | OK |
| `lib/closure/worker.ts:343` (`bumpAndFinalize`) | **WORKER** | interactive + `isolationLevel:'Serializable'` | courte | ⚠ **Serializable** sous pooler |
| `lib/numbering.ts` (helper, appelé DANS tx invoices) | Server action (request) | reçoit `tx` | courte | OK |

**Verdict :** toutes les transactions interactives sont **courtes** (aucune n'englobe un appel LLM/HTTP/PDF — la génération LLM se fait AVANT ou APRÈS la tx, jamais dedans). **Aucun refactor batch-array n'est requis pour la correction fonctionnelle.** Le seul point de vigilance est `worker.ts:343 bumpAndFinalize` en **`isolationLevel: 'Serializable'`** exécuté avec concurrency=3 : sous transaction pooler, les erreurs de sérialisation (40001) peuvent apparaître différemment → **prouver le round-trip worker (critère #2) inclut ce chemin précis**.
**How to avoid :** garder `?pgbouncer=true&connection_limit=1` ; prouver un round-trip read/write worker RÉEL (le critère #2) qui passe par `bumpAndFinalize`. Si erreur 40001/prepared statement observée sur ce chemin → option de repli : router le worker vers la **session URL** (:5432) via une PrismaClient dédiée worker (le worker n'a pas besoin du fan-out serverless).

### Pitfall 2 : `prepared statement already exists`
**What goes wrong :** DATABASE_URL poolée sans `?pgbouncer=true` → Prisma émet des prepared statements que Supavisor recycle entre clients → collision.
**How to avoid :** `?pgbouncer=true&connection_limit=1` sur DATABASE_URL. C'est LE critère #2. Warning sign : erreur au 2ᵉ hit d'une route, pas au 1ᵉ (connexion recyclée).

### Pitfall 3 : `DIRECT_URL` mal ciblée → migrations cassent
**What goes wrong :** DIRECT_URL vers :6543 (transaction) ou vers un endpoint IPv6-only injoignable depuis le Mac IPv4.
**How to avoid :** DIRECT_URL = session pooler :5432. Warning sign : `migrate deploy` échoue avec `prepared statement` ou timeout DNS/connexion.

### Pitfall 4 : Baseline appliquée sur une base VIDE (ou l'inverse)
**What goes wrong :** si on `resolve --applied` sur une base réellement vide, les tables ne sont jamais créées (Prisma croit la migration jouée). Inversement, `migrate deploy` sur une base pleine tente de recréer.
**How to avoid :** confirmer d'abord l'état réel (`\dt` via psql : les 48 tables sont-elles là ?). Base pleine → `resolve --applied`. Base vide → `migrate deploy` normal. Ici la base est PLEINE (restore 2026-07-03) → `resolve --applied`.

### Pitfall 5 : `postgresqlExtensions` preview cause du drift
**What goes wrong :** le preview `postgresqlExtensions` (déclaré dans le generator) fait que `migrate diff`/`migrate dev` détectent les extensions pré-installées Supabase comme « drift » (non-allowlisted extensions tracking, issue prisma#26379). Prisma a annoncé la dépréciation de ce preview (mi-2025).
**How to avoid :** en Prisma 5.22 le preview fonctionne encore. Comme on baseline (`resolve --applied`, jamais `migrate dev` sur cloud), le drift extension est neutralisé. NE PAS lancer `migrate dev` contre le cloud. Si `migrate status` signale un drift lié aux extensions après baseline, le documenter comme bénin (extensions gérées manuellement côté Supabase). Ne PAS retirer le bloc `extensions` du schéma sans vérifier que rien ne le lit.

### Pitfall 6 : User `postgres` vs user dédié `prisma`
**What goes wrong :** Supabase recommande un user `prisma` avec droits limités (bonne pratique sécurité). Utiliser `postgres` (superuser) marche mais élargit la surface.
**How to avoid :** discrétion Laurent. Pour 2-5 users internes, `postgres` est acceptable en v6 ; documenter la dette « créer user prisma dédié » pour plus tard. Si user dédié : `create user prisma …; grant …; grant createdb …` (le `createdb` est requis par Prisma pour la shadow DB — mais en `migrate deploy` pur, pas de shadow DB nécessaire).

## Code Examples

### Vérifier l'état de la base cloud avant baseline
```bash
# Source: Prisma baselining docs
DIRECT_URL="postgres://postgres.<REF>:<PW>@aws-<N>-eu-west-1.pooler.supabase.com:5432/postgres" \
  pnpm dlx prisma migrate status
# Attendu AVANT baseline : "Database schema is not in sync" / migrations not applied
```

### Round-trip worker prouvant DB-02 critère #2 (script de smoke)
```typescript
// Source: pattern Prisma Client via pooled DATABASE_URL
// tsx script — DATABASE_URL = pooler :6543 ?pgbouncer=true&connection_limit=1
import { prisma } from '@qualiof/db';
// write
const t = await prisma.tenant.findFirstOrThrow();
// lire 2× de suite (déclenche le recyclage de connexion → révèle prepared stmt)
for (let i = 0; i < 5; i++) {
  await prisma.trainingSession.count({ where: { tenantId: t.id } });
}
// prouve : aucune erreur "prepared statement already exists"
```

### Preuve extensions runtime (critère #3)
```typescript
// Source: pg_trgm / unaccent official functions
import { prisma } from '@qualiof/db';
const trg = await prisma.$queryRawUnsafe<{ similarity: number }[]>(
  `SELECT similarity('Dupont','Dupond') AS similarity`,
);
const ua = await prisma.$queryRawUnsafe<{ unaccent: string }[]>(
  `SELECT unaccent('Éléonore') AS unaccent`,
);
// trg[0].similarity > 0 && ua[0].unaccent === 'Eleonore'
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| PgBouncer | Supavisor (protocole compatible) | Supabase 2023+ | `?pgbouncer=true` reste le flag Prisma correct |
| Direct connection `db.<ref>.supabase.co` par défaut | IPv6-only sauf add-on IPv4 payant ; session pooler recommandé pour IPv4/migrations | 2024 (dépréciation IPv4 direct) | `DIRECT_URL` → session pooler, pas direct |
| `postgresqlExtensions` preview géré par Prisma | Dépréciation annoncée (mi-2025), extensions gérées manuellement (SQL/dashboard) | 2025 | Ne pas dépendre du preview pour créer les extensions sur cloud ; les activer via dashboard/SQL |

**Deprecated/outdated :**
- Deviner `aws-0` : le préfixe peut être `aws-1` (ex. us-east-2). Toujours lire le dashboard.
- Add-on IPv4 « obligatoire pour migrer » : FAUX, le session pooler suffit.

## Open Questions

1. **Combien de séquences réelles (autoincrement) dans le schéma ?**
   - Ce qu'on sait : la majorité des PK sont `@default(uuid())` (String). `setval` ne concerne que les colonnes `autoincrement()`.
   - Ce qui est flou : reste-t-il des `Int @default(autoincrement())` (numéros de facture ? — non, ceux-là sont calculés en JS via `numbering.ts`, pas des séquences PG).
   - Recommandation : `grep -c 'autoincrement()' packages/db/prisma/schema.prisma` au plan. Si 0 → critère #4 documenté « pas de séquence, PK UUID, collision impossible » + INSERT test de preuve. Si >0 → générer les `setval`.

2. **La base cloud a-t-elle DÉJÀ un `_prisma_migrations` partiel (du `db push`) ?**
   - Ce qu'on sait : le dump de 2026-07-03 vient du staging ; `db push` ne peuple PAS `_prisma_migrations`.
   - Ce qui est flou : état exact de `_prisma_migrations` sur le cloud restauré.
   - Recommandation : `migrate status` en tout premier (étape 0 du plan). Adapter collapse vs resolve selon le résultat.

3. **Le mot de passe DB Supabase est-il dans `.env.local.cloud-backup` ?**
   - Phase 18 a utilisé les clés SUPABASE_* (storage), pas forcément le password Postgres.
   - Recommandation : Laurent récupère le password DB depuis le dashboard (ou le reset) au moment du câblage des URLs. Étape checkpoint.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| prisma CLI | migrate diff/resolve/status/deploy | ✓ | 5.22.0 (repo) | — |
| @prisma/client | round-trip worker/app | ✓ | 5.22.0 | — |
| psql | SQL baseline/setval/create extension | à vérifier sur le Mac | `psql --version` | Supabase SQL Editor (dashboard) |
| tsx | scripts de smoke | ✓ | 4.21.0 | — |
| Réseau IPv4 vers pooler | migrate deploy + round-trip depuis Mac | ✓ (session pooler IPv4) | — | session pooler couvre IPv4 |
| Projet Supabase EU (DB) | tout | ✓ | `gntlqyscahbgjrmsbzil` Irlande | — |
| Mot de passe DB Postgres | URLs | à récupérer (dashboard) | — | reset password dashboard |

**Missing dependencies with no fallback :** aucune bloquante — le projet Supabase existe, le réseau IPv4 est couvert par le session pooler.
**Missing dependencies with fallback :** `psql` local → sinon Supabase SQL Editor (dashboard) pour le SQL manuel ; password DB → dashboard.

## Validation Architecture

*(nyquist_validation = true dans config.json → section incluse)*

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.8 (`apps/web`, `packages/shared`) |
| Config file | `apps/web/vitest.config.ts` (hermétique, Prisma mocké) |
| Quick run command | `pnpm --filter @qualiof/web exec vitest run <file>` |
| Full suite command | `pnpm --filter @qualiof/web exec vitest run` (~1163 tests) + `pnpm --filter @qualiof/shared exec vitest run` |

**⚠ Nature de la Phase 19 :** c'est une phase **infra/ops** (état de base cloud, URLs, migrations), pas du code métier. Les tests unitaires Vitest sont hermétiques (Prisma mocké) → ils ne prouvent PAS les critères de succès, qui sont **runtime contre la base cloud réelle**. Les preuves des 4 critères sont des **scripts de smoke exécutés contre Supabase** (round-trip, extensions, INSERT test) + `migrate status`, à consigner dans un `19-SMOKE.md` gaté Laurent (comme le 18-SMOKE.md).

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DB-01 | `migrate status` clean, `_prisma_migrations` peuplé, `migrate deploy` vert via :5432 | smoke (cloud) | `prisma migrate status` (DIRECT_URL) | ❌ 19-SMOKE.md à créer |
| DB-02 | round-trip worker via :6543 `?pgbouncer=true` sans prepared stmt | smoke (cloud) | script tsx round-trip (5 hits) | ❌ Wave 0 script |
| DB-02 | 4 extensions résolvent (trigram + unaccent) | smoke (cloud) | `$queryRaw similarity/unaccent` | ❌ Wave 0 script |
| DB-02 | INSERT test après restore sans collision PK (setval) | smoke (cloud) | script tsx INSERT + rollback | ❌ Wave 0 script |

### Sampling Rate
- **Per task commit :** `pnpm --filter @qualiof/web exec tsc --noEmit` (aucune régression type) + Vitest ciblé si code touché.
- **Per wave merge :** suite Vitest complète (baseline 1163/1164 — l'échec `shared-template.test.ts` MIME jpeg/jpg est PRÉ-EXISTANT hors scope).
- **Phase gate :** `19-SMOKE.md` — les 4 critères prouvés contre le cloud réel, gaté Laurent (destructif = étape séparée, `pg_dump` avant tout `setval`/restore).

### Wave 0 Gaps
- [ ] `apps/web/scripts/db-smoke-cloud.ts` — round-trip poolé + preuve extensions + INSERT test (DB-01/DB-02). Runner tsx, lit DATABASE_URL/DIRECT_URL cloud.
- [ ] `packages/db/prisma/migrations/0_init/migration.sql` — baseline générée (`migrate diff --from-empty`).
- [ ] `19-SMOKE.md` — journal des preuves cloud gaté Laurent (calqué sur 18-SMOKE.md).
- [ ] Script/requête `setval` génératrice (si `autoincrement()` présents — sinon note « aucune séquence, PK UUID »).
- [ ] Pas de nouveau framework à installer.

## Project Constraints (from CLAUDE.md)

- **Stack figée** : Next.js 14.2.21 + Prisma 5.22 + BullMQ + (Ollama→OpenRouter). Ne pas migrer Prisma 6/7.
- **`previewFeatures = ["postgresqlExtensions"]`** déclaré dans le generator ; extensions `pgcrypto, uuid_ossp, pg_trgm, unaccent` déclarées dans la datasource — NE PAS retirer sans audit.
- **Multi-tenant** : toute nouvelle server action scope par `tenantId` (les scripts de smoke lisent un tenant existant).
- **RGPD** : PII dans `SensitiveData`/storage — les scripts de smoke ne doivent JAMAIS logger de PII (IDs seulement).
- **Env** : `.env` racine, validé par `packages/shared/src/env.ts` (t3-env fail-loud). `DATABASE_URL` + `DIRECT_URL` déjà requises au boot (Phase 17). Toute nouvelle clé passe par `env.ts` + `turbo.json` globalEnv.
- **GSD Workflow Enforcement** : pas d'édit hors commande GSD.
- **Migrations** : `packages/db/prisma/migrations/` sous git ; `migration_lock.toml` provider postgresql.

## Sources

### Primary (HIGH confidence)
- Context7 `/websites/prisma_io` — PgBouncer/prepared statement, DIRECT_URL, baselining (`migrate diff --from-empty`, `migrate resolve --applied`), migrate/pgbouncer limitations
- https://supabase.com/docs/guides/database/prisma — DATABASE_URL/DIRECT_URL exacts (session :5432 / transaction :6543 `?pgbouncer=true`), user `prisma`
- https://supabase.com/docs/guides/database/connecting-to-postgres — session pooler IPv4 + prepared statements, direct = IPv6-only
- https://supabase.com/docs/guides/troubleshooting/prisma-error-management-Cm5P_o — prepared statement fix, session mode pour migrations, `connection_limit=1`
- https://supabase.com/docs/guides/troubleshooting/supavisor-and-connection-terminology-explained-9pr_ZO — transaction :6543 / session :5432, username `postgres.<REF>`
- https://supabase.com/docs/guides/database/extensions — `unaccent` supporté, `create extension … with schema extensions`, toggle dashboard
- https://supabase.com/docs/guides/platform/ipv4-address — add-on IPv4 (non nécessaire via session pooler)
- Codebase audit (grep) : 10 usages `$transaction(async` classés, 0 usage runtime pg_trgm/unaccent, schema.prisma datasource `directUrl`+extensions déjà présents, 30 migrations existantes

### Secondary (MEDIUM confidence)
- prisma/prisma#22779 (migrations Supavisor transaction mode), #26379 (postgresqlExtensions drift) — corroborent les pitfalls
- Supavisor 1.0 blog (hostname format `aws-<N>-<region>.pooler.supabase.com`)

### Tertiary (LOW confidence)
- Valeur exacte du préfixe pooler (`aws-0` vs `aws-1`) — **DOIT être lue au dashboard**, non déterminable hors-projet.

## Metadata

**Confidence breakdown :**
- Standard stack : HIGH — versions vérifiées dans le repo, aucune install nécessaire
- URLs/pooler (DB-02) : HIGH — docs Supabase + Prisma officielles concordantes ; seule inconnue = préfixe hostname (dashboard)
- Baselining (DB-01) : HIGH — procédure Prisma officielle ; choix collapse vs resolve à trancher au plan selon `migrate status`
- Extensions : HIGH — `unaccent` confirmé Supabase ; nuance : aucun code runtime ne les utilise (preuve = $queryRaw dédié)
- Séquences : MEDIUM — dépend du nombre réel d'`autoincrement()` (probablement 0, UUID) — à auditer au plan
- Transactions interactives : HIGH — 10 usages audités et classés, toutes courtes, seul `bumpAndFinalize` (worker, Serializable) à surveiller

**Research date :** 2026-07-04
**Valid until :** 2026-08-04 (30 j — Supabase/Prisma stables ; surveiller la dépréciation `postgresqlExtensions` si bump Prisma)
