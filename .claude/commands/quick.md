---
description: Exécute une tâche courte QualiOF en TDD RED→GREEN avec tous les garde-fous du projet (tenantId, AuditLog, revalidatePath, gates)
argument-hint: "[description de la tâche]"
allowed-tools: Bash(pnpm *) Bash(git *) Read Edit Write Grep Glob
---

# Quick task — $ARGUMENTS

Workflow court du projet. Pas de phase GSD, mais les mêmes garde-fous.

## 1. Cadrer (avant d'écrire une ligne)

- Reformule la tâche en une phrase et en **un critère observable** (« la modale
  affiche X », « la facture porte Y »). Si tu ne sais pas l'observer, tu ne sais
  pas la finir.
- Cherche la surface existante avant d'en créer une : ce projet a déjà beaucoup
  de chemins d'écriture. Une nouvelle server action qui double une existante est
  une régression, pas une feature (cf. friction F-01 : un doc affiché 4 fois,
  personne ne sait laquelle fait foi).
- Si la tâche touche facturation ou dossiers OPCO : relis
  `settleInvoiceForParticipant` dans `dossiers-opco.ts` **avant** (règle métier
  en attente d'arbitrage — ne reverse rien au dé-toggle).

## 2. RED

Écris le(s) test(s) qui échouent. Commit `test(<slug>): ... — tests RED`.
Vitest, à côté du code (`__tests__/`). Pas de test qui passe déjà.

## 3. GREEN

Implémente le minimum. Commit `feat(<slug>):` ou `fix(<slug>):`.

### Checklist non négociable pour toute server action

- [ ] `requireRole([...])` en tête, avec le bon niveau (ADMIN/MANAGER pour les
      champs structurants, +COMMERCIAL pour l'opérationnel)
- [ ] **Toute** requête scopée `tenantId` — y compris les `findFirst` de contrôle
- [ ] Validation Zod **avant** tout I/O, schéma dans `packages/shared/src/schemas/`
      (source unique — pas de duplication de règle côté client)
- [ ] Diff `before`/`after` + `AuditLog` dans la **même transaction** que l'écriture
- [ ] No-op si rien n'a changé (pas d'AuditLog vide)
- [ ] `revalidatePath` sur **toutes** les pages qui lisent la donnée, pas juste
      celle d'où vient le clic
- [ ] Retour `{ ok: true } | { ok: false, error }` — jamais de throw pour une
      erreur métier attendue
- [ ] `Decimal` : comparer via `Number()`, sinon l'égalité est toujours fausse
- [ ] Email : passer `context: { tenantId, category, sessionId? }` au mailer
      (le type l'exige, c'est le filet exhaustivité tsc)

## 4. Migrations

**`prisma db push` est INTERDIT** — sur `qualiof_test` comme sur n'importe quelle
base (règle Laurent, 2026-09-10). Une seule voie :

```
pnpm db:migrate            # créer  (alias de db:migrate:local)
pnpm db:deploy             # appliquer (alias de db:deploy:local)
pnpm db:seed               # seeder (alias de db:seed:local)
```

⚠ **N'appelez jamais le CLI Prisma nu** (`pnpm --filter @qualiof/db exec prisma
migrate dev`) : il ne charge pas `.env.local`, et le `.env` racine porte l'URL
**Supabase de production**. Les scripts ci-dessus chargent `.env.local` en
priorité. Un garde-fou (`scripts/assert-db-target.ts`) refuse désormais toute
cible non locale et affiche la base visée — mais ne comptez pas dessus pour
rattraper une commande écrite de travers : lisez la ligne `🛡` qu'il imprime.

Une opération volontaire sur la production se nomme et s'assume :
`SEED_ALLOW_PROD=1 pnpm db:deploy:prod`. Ne posez jamais `SEED_ALLOW_PROD` dans
un fichier `.env` — elle vaut pour une commande, pas pour un environnement.

Pourquoi : `db push` écrit le schéma dans la base **sans laisser de migration**.
L'historique et la base divergent alors en silence, et la production ne reçoit
jamais le changement — le déploiement rejoue `migrations/`, pas le schéma. On ne
s'en aperçoit qu'au premier `P2022` en prod, sur une colonne qui n'existe que sur
la machine où le `db push` a été lancé.

Ce que cette règle n'interdit pas : `prisma generate`, qui ne touche aucune base
(il ne fait que régénérer le client TypeScript).

Toute migration créée doit être appliquée (`migrate deploy`) avant d'écrire dans
la base depuis une branche en avance — sinon l'`INSERT` part avec les défauts
d'enum de la base, pas ceux du schéma.

### Isolement — une base de données par worktree

**Règle (Laurent, 2026-09-10) : un nouveau worktree = une nouvelle base, nommée
`qualiof_dev_<worktree>`.**

Pourquoi. Les worktrees partageaient tous `qualiof_dev`. Chacun y appliquait ses
propres migrations, si bien que la base portait des migrations absentes des
autres branches. Résultat : depuis n'importe quel worktree, `prisma migrate dev`
constatait une dérive et proposait `We need to reset the "public" schema… All
data will be lost` — un reset qui aurait détruit les données locales **et** le
travail des autres worktrees. Constaté le 10/09/2026 sur `files-signature`, qui
voyait deux migrations de `files-chaine`.

Mise en place, à faire à la création du worktree :

```bash
# 1. créer la base et ses extensions (schema.prisma en déclare 4)
docker exec qualiof_postgres psql -U qualiof -d postgres \
  -c "CREATE DATABASE qualiof_dev_<worktree> OWNER qualiof"
docker exec qualiof_postgres psql -U qualiof -d qualiof_dev_<worktree> \
  -c 'CREATE EXTENSION IF NOT EXISTS pgcrypto;
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE EXTENSION IF NOT EXISTS pg_trgm;
      CREATE EXTENSION IF NOT EXISTS unaccent;'

# 2. pointer le .env.local DU WORKTREE dessus (DATABASE_URL et DIRECT_URL)
#    .env.local est gitignoré : il reste propre au worktree, c'est voulu.

# 3. amener le schéma et le référentiel
pnpm db:deploy && pnpm db:seed

# 4. vérifier
cd packages/db && npx dotenv -e ../../.env.local -e ../../.env -- \
  npx prisma migrate status     # attendu : « Database schema is up to date! »
```

Bases en service au 10/09/2026 : `qualiof_dev` (worktree `files/`),
`qualiof_dev_signature` (`files-signature`). Les bases `qualiof_drift*` et
`qualiof_shadow*` sont des jetables de contrôle, à ne pas viser.

À savoir : une base fraîche ne contient que le seed (tenant, 6 financeurs,
catalogue Qualiopi, règles de financement) — **aucune donnée métier**. Un
scénario qui a besoin d'apprenants ou de sessions réels passe par les scripts
`import:*`, qui visent `.env` : les lancer avec `.env.local` en tête, faute de
quoi le garde-fou les arrête.

## 5. Gates — les trois, dans cet ordre

```
pnpm lint
pnpm --filter @qualiof/web exec tsc --noEmit
pnpm test
```

Aucun commit de fin sans les trois verts. Si un test échoue et qu'il échouait
déjà avant ta modif, dis-le explicitement et consigne-le dans
`.planning/*/deferred-items.md` — ne le « répare » pas au passage.

## 6. Rendre compte

Trois lignes : ce qui change pour l'utilisateur, ce qui a été mis de côté, ce
qu'il reste à vérifier à la main.
