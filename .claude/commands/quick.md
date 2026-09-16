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
base (règle Laurent, 2026-09-10), y compris « juste pour aligner la base de test
avant de lancer les tests ». Une seule voie :

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
la machine où le `db push` a été lancé. Le chemin réellement utilisé en production
(`migrate deploy`, lancé par `.github/workflows/deploy.yml` à chaque push `main`)
n'est alors jamais exercé avant d'atteindre Supabase.

Aggravant : `db push` réclame `--accept-data-loss` dès qu'une contrainte se
resserre, et le réflexe est de l'ajouter pour « débloquer ». C'est une destruction
silencieuse que personne ne relit.

L'inverse existe aussi, et il est plus sournois : une migration peut créer un
objet que le schéma ne déclare pas. Rien ne le signale — la base est juste,
l'appli marche, les tests passent — et le premier `migrate dev` venu génère un
`DROP`. C'est arrivé à l'index GIN `AgeficePointAccueil.departmentsServed`, resté
deux jours ainsi (constat du 10/09).

Ce que cette règle n'interdit pas : `prisma generate`, qui ne touche aucune base
(il ne fait que régénérer le client TypeScript).

Toute migration créée doit être appliquée (`migrate deploy`) avant d'écrire dans
la base depuis une branche en avance — sinon l'`INSERT` part avec les défauts
d'enum de la base, pas ceux du schéma.

**Environnement non interactif** (agent, CI), où `migrate dev` refuse de tourner :
générer le SQL avec `prisma migrate diff --from-migrations --to-schema-datamodel
--script`, écrire le dossier de migration à la main, puis `migrate deploy`.
Jamais `db push` comme raccourci.

**Avant de livrer** : `pnpm --filter @qualiof/db run check:schema` doit être vert
— base jetable, migrations rejouées pour de vrai, diff VIDE. Ce garde tourne
aussi en CI. S'il rougit, c'est le schéma ou la migration qui ment, pas lui.

- La migration générée se **commit avec le code** qui en dépend, jamais après.
- Base de test repartie de zéro : `prisma migrate reset`, qui rejoue l'historique —
  c'est justement ce qu'on veut vérifier.
- Ne jamais pointer une commande Prisma sur `DATABASE_URL` depuis le poste : c'est
  Supabase de production. Les migrations partent par la CI, pas à la main.
  **La seule exception est la base d'APERÇU** (`qualiof-apercu`, pooler `aws-1`,
  jamais `aws-0`) : elle doit recevoir migrations et seed pour que Laurent puisse
  relire une PR sur des données réelles. On y va en surchargeant explicitement
  `DATABASE_URL`/`DIRECT_URL` sur la ligne de commande, jamais en lisant le `.env`
  du dépôt — qui, lui, pointe la production.

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

## 4 bis. Les scripts sont du code de production — ils sont vérifiés

**Un garde-fou qui ne garde pas est pire que pas de garde-fou, parce qu'on lui
fait confiance.** C'est la même famille que l'index GIN et que le `db push` en
CI, et le troisième cas est arrivé le 11/09/2026.

`apps/web/scripts/**` n'était couvert par aucun `tsconfig` : `include` ne prenait
que `src/**`. `packages/db/scripts/**` non plus. On lançait pourtant
`tsc --noEmit` avant chaque livraison, et on croyait le dépôt vérifié — alors que
**soixante-et-onze scripts écrivant en base** ne l'étaient pas, dont les deux
imports qui construisent tout le catalogue.

Ce que la couverture a révélé en s'ouvrant, en une seule passe :

- une création `SessionTrainer` sans son champ obligatoire `role` — elle
  échouait à l'exécution ;
- un `Json` nullable passé à `null` au lieu de `Prisma.JsonNull` dans l'importeur
  SmartOF — il aurait planté sur la première personne sans adresse ;
- de l'arithmétique sur des `Decimal` dans un **rapprochement de trésorerie**,
  qui « marchait » par coercition en chaîne ;
- un classeur vide qui importait silencieusement zéro ligne en annonçant un
  succès ;
- deux assertions de type (`as never` sur les arguments, `as Array<…>` sur le
  résultat) qui se neutralisaient en masquant une requête incomplète ;
- et l'origine du signalement : un mapping en quatre exemplaires dont deux
  avaient décroché, qui a fait rendre à une sonde **un parcours vide en
  annonçant 9 demi-journées**, sur un dossier réel.

Aucun de ces défauts n'était subtil. Ils étaient simplement hors de portée du
seul outil qui les aurait vus.

**La règle** : tout script qui écrit en base est couvert par un `tsconfig`.

- `apps/web` : `tsconfig.scripts.json`, branché sur `pnpm lint` (il reste hors
  du `tsconfig.json` du build — `next build` n'a pas à type-vérifier des scripts
  Node, ça ralentirait sans rien protéger de plus).
- `packages/db` : `scripts/**/*` est dans l'`include` du `tsconfig.json`.

**Et le garde se garde lui-même** : `src/lib/__tests__/scripts-sous-tsc.test.ts`
balaie le dépôt et échoue si un dossier de scripts écrivant en base apparaît hors
couverture. Sans lui, la prochaine application naîtrait avec le même trou, et on
recommencerait à faire confiance à un `tsc` qui ne regarde pas.

**Corollaire, pour le jour où une duplication se présente** : le mapping
« ligne Prisma → type du moteur » vit à UN seul endroit
(`src/server/proposition-library.ts`). Dupliquer un mapping dans un dossier non
vérifié, c'est se garantir une divergence muette.

## 4 ter. Un test qui n'a jamais rougi n'est pas un test

**Un test qui n'a jamais rougi n'est pas un test, c'est une décoration.**

> **Et la formulation la plus claire qu'on en ait eue** (12/09/2026, troisième
> chute) : **on surveille un ÉCART entre deux sources. Importer la valeur
> supprime l'écart au lieu de le détecter.**
>
> C'est pour ça qu'un garde qui vérifie que deux fichiers s'accordent doit lire
> le FICHIER, pas importer sa constante. Le jour où l'import remplace la
> lecture, le test ne peut plus échouer — et il devient vert pour la pire des
> raisons : il ne regarde plus rien.

Même famille que §4 bis — un garde-fou auquel on fait confiance et qui ne garde
rien —, et le troisième cas est arrivé le 11/09/2026, sur le départage des
modules à égalité de score.

Le défaut : une égalité de score se tranchait à l'ORDRE ALPHABÉTIQUE des titres,
et ça avait changé le module programmé en demi-journée 5 d'un dossier réel.
L'assertion naïve, celle qui vient spontanément :

```ts
// à égalité de score, BIB-D017#3 sort premier
expect(axe.candidates[0]!.moduleId).toBe('m-d017');
```

**Elle passait déjà sur le code cassé.** Le repli alphabétique place
« Convaincre le vendeur… » avant « Gérer les objections… » : le test mesurait
l'alphabet en croyant mesurer la règle. Il serait resté vert en cachant le bug,
et il serait resté vert si on avait supprimé la correction.

Ce qui donne sa valeur au test, c'est la **variante discriminante** : les mêmes
modules, les mêmes signaux, mais les titres ÉCHANGÉS, de sorte que le module
qu'on veut voir sortir premier porte le titre alphabétiquement dernier. Là, le
test rougit contre le code non corrigé — donc il prouve quelque chose.

**La règle** : pour tout test de contrat, exécute-le contre le code NON corrigé
avant d'écrire le correctif, et consigne le nombre d'échecs. En TDD c'est
mécanique (le commit `test(...): … — tests RED` porte ce compte) ; hors TDD,
c'est à faire à la main. Si un test passe avant la correction, ce n'est pas une
bonne nouvelle : c'est qu'il ne teste pas ce qu'on croit.

Corollaire, pour les tests bâtis sur une égalité : **ASSERTE l'égalité**, ne la
suppose pas. Un départage testé sur deux candidats qu'on croyait à égalité, et
qui ne l'étaient pas, ne teste aucun départage.

### L'exemple canonique : comparer deux SURFACES, pas une constante

Le 15/09/2026, le référent handicap. Le catalogue public annonçait « Jean-Guy
Ourmières », le programme composé annonçait « Start Academy · formation@… » —
l'organisme. Deux pièces du même OF, deux référents, et **aucune n'est fausse
prise isolément**.

Le garde naïf, celui qui vient spontanément :

```ts
expect(programme.accessibility).toContain(REFERENT_HANDICAP.nom);
```

Il passe dès qu'on corrige la surface qu'on regarde — et il aurait laissé les
deux diverger à nouveau au prochain repli. Il importe la valeur des deux côtés :
**il supprime l'écart au lieu de le détecter.**

Le garde qui tient :

```ts
const duCatalogue = resolveOfConfig(null).handicapReferent;   // surface 1
expect(duCatalogue.trim().length).toBeGreaterThan(0);          // elle dit quelque chose
expect(programme.accessibility).toContain(duCatalogue);        // surface 2 s'y accorde
```

Il ne sait pas qui est le référent, et **c'est exactement pour ça qu'il marche** :
il mesure l'accord entre deux chemins de résolution indépendants. Le jour où
l'un change, il rougit en nommant les deux côtés.

> **Quand deux surfaces doivent dire la même chose, le test compare les deux
> surfaces. Il n'importe la valeur d'aucune.**

### Le cas vécu, plus instructif que la formule

La première tentative de mutation sur le garde des chemins en dur est restée
**VERTE** — le fichier piégé avait été créé mais pas indexé, et le garde balaie
`git ls-files`. Le garde avait raison, la mutation était une décoration. Refaite
avec `git add -N`, elle a rougi en nommant le fichier, puis reverdi après retrait.
**La leçon s'applique d'abord à celui qui l'écrit.**

### Un garde sur la PRÉSENCE d'un appel est une décoration

Corollaire du même piège, relevé le 12/09/2026 — **deuxième fois de la semaine
qu'un garde écrit pour attraper « le garde qui ne garde rien » en était un
lui-même.**

Le garde cherchait un `auditLog.create(` **quelconque** dans chaque chemin de
création de produit. **Trois fichiers sur six étaient VERTS avant tout
correctif** : ils journalisent déjà leurs personnes et leurs organisations. Le
test mesurait la présence d'un import, pas la trace du produit.

Durci en exigeant `entity: 'TrainingProduct'`, il restait une décoration pour
`crud-edits.ts` : le fichier contenait déjà un tel bloc — celui de
`products.validate_ai_draft` — **cinq cents lignes sous** la fonction visée. Un
balayage de source ne distingue pas l'appel d'une opération de l'appel d'une
AUTRE opération dans le même fichier.

**La règle** : un garde doit porter sur l'appel **de ce chemin-là**, pas sur sa
présence dans le fichier. Quand le balayage de source ne peut pas le prouver —
et c'est le cas dès que deux opérations du même type cohabitent — il faut un
test qui **appelle** le code. Et dans les deux cas, la mutation contre le code
d'origine est ce qui tranche : un garde qui ne rougit pas contre le défaut
qu'il prétend attraper ne l'attrape pas.

### Retourner une règle : on RENVERSE le test, on ne le supprime pas

Quand un arbitrage inverse une règle, le test qui la tenait devient rouge. La
tentation est de l'effacer — après tout, il teste une règle morte.

**Il se renverse.** L'assertion devient son contraire, et le commentaire garde
l'ANCIENNE assertion, la date du renversement et son motif.

Cas du 15/09/2026 : `dit les deux durées dans le déroulé, sans jamais en laisser
une nue` devient `n'affiche aucune des deux durées — mais les porte toutes les
deux`. Trois choses sont sauvées, qu'une suppression aurait perdues :

- **la trace de l'ancienne règle** — sans quoi la prochaine session la
  réintroduira de bonne foi, croyant corriger un oubli ;
- **le fond qui survit** — ici « une heure ne s'affiche jamais sans dire
  laquelle elle est » reste vrai ; seule son application change ;
- **la preuve que le renversement était voulu** — un test supprimé ne dit pas
  s'il gênait ou s'il avait tort.

> Un test rouge après un arbitrage n'est pas un déchet : c'est la règle
> précédente qui demande ce qu'elle devient.

## 4 quater. Un relevé dit ce qu'il a CHERCHÉ, pas seulement ce qu'il a trouvé

Trois incidents en trois jours, et ce n'est pas trois incidents : **c'est une
seule règle, ratée de trois façons.**

| Ce qu'on annonçait | Ce qui n'allait pas | Coût |
|---|---|---|
| « 32 codes `PROD-` » | **un compte de PRÉFIXES** — les 7 `FRM-*` étaient invisibles au motif | « 32 → 34 » lu comme deux créations, alors qu'aucun produit n'avait été créé |
| « 41 codes » | **un compte sans sa POPULATION** — 41 publiés contre 51 en base, les deux justes | deux relevés à refaire |
| « public visé : 0 fiche » | **un compte au mauvais MOTIF** — on cherchait « public visé », le titre réel était `## Public` | 5 fiches déclarées saines, elles ne l'étaient pas |

Les trois donnent un nombre **exact** et **faux d'intention**. Et les trois
rassurent : zéro, ou un petit écart explicable.

> **La règle : un relevé porte sa date, sa commande exacte, la liste en clair,
> la population nommée — ET le motif qu'il a employé.** Sans le motif, on ne
> peut pas distinguer « il n'y a rien » de « je n'ai pas su le chercher ».

### Le corollaire côté code : un motif qui répond à deux choses n'est pas un motif

Même famille, même jour. Un parseur cherchait `/méthodes|moyens/i` pour
remplir la colonne des **méthodes pédagogiques**. Les programmes portent deux
rubriques voisines — « Modalités pédagogiques » et « Moyens et supports
pédagogiques » — et le motif attrapait la seconde.

**Le script s'apprêtait à écrire un support dans la colonne des méthodes.**
Du texte valide, au mauvais endroit, sans qu'aucune erreur ne se lève. C'est la
forme la plus dangereuse du défaut, parce que **rien ne proteste**.

La réponse tient en deux lignes de code : le titre se reconnaît **en entier**,
et **deux titres qui répondent au même motif arrêtent tout**. Une ambiguïté
tranchée au hasard est une écriture qu'on ne peut pas relire.

### Une technique : la FORME comme traceur

Quand deux sources écrivent la même information sous deux **formes**
différentes — casse, ponctuation, accent — la forme dit laquelle a produit le
rendu, **sans lire une ligne de code**.

Cas fondateur (12/09/2026) : fallait-il croire que le `programMd` d'un produit
était rendu sur la page publique ? Le `programMd` écrit « Julien **LAFITTE** »
en capitales ; la constante du catalogue écrivait « Julien **Lafitte** ». Sur la
page : `Julien` 58 fois, **`LAFITTE` zéro fois**. Les 58 venaient donc toutes de
la constante, et le `programMd` n'était pas rendu. Une seule commande, aucune
lecture de code, aucune supposition.

À chercher dès qu'on se demande « d'où vient ce texte ? ».

### Le pendant : une CONSIGNE dit ce qu'elle COUVRE

Un relevé dit ce qu'il a cherché. Une consigne dit ce qu'elle nomme — et rien
de plus.

Cas du 15/09/2026. Laurent tranche **une** ligne : l'accroche de durée en tête
du programme composé, « 48 h conventionnées (24 h sur site, co-animation) », qui
part. Six titres de demi-journée portaient la même construction — « 4 h sur site
(8 h conventionnées) ». Je les ai retirés aussi, au motif que c'était « la même
phrase ».

**C'était le même MOTIF, pas la même DÉCISION.** Et la décision qu'il aurait
fallu demander avait une autre réponse : la durée d'une demi-journée reste,
parce que c'est ce que le dirigeant bloque dans son agenda. L'intrus était le
mot « conventionnées », pas le chiffre.

> **Une consigne porte sur ce qu'elle nomme. Ce qu'elle ne nomme pas se
> redemande** — même quand le motif semble identique, surtout quand il semble
> identique.

Le coût des deux erreurs n'est pas le même, et c'est ce qui tranche : demander
coûte une phrase, étendre coûte un aller-retour et une correction déjà
commitée. C'est aussi pourquoi l'extension ne se rattrape pas « en expliquant »
— elle se rattrape en n'ayant pas eu lieu.

**Le signe qui doit alerter** : se dire « c'est la même chose ailleurs ».
Quatre fois sur cinq c'est vrai, et la cinquième est celle qui coûte. Le
recensement se REND — « j'ai trouvé six autres occurrences du même motif,
est-ce qu'elles suivent ? » — il ne s'applique pas.

## 4 quater bis. Une décision s'attache à une IDENTITÉ, jamais à un LIBELLÉ

**Elle gouverne les trois règles de registre qui suivent, et elle a coûté plus
cher qu'aucune autre cette semaine.**

Un libellé s'améliore. C'est même son destin : un titre de module mal écrit
finit par être réécrit, et c'est une bonne chose. Le jour où quelqu'un le fait,
**un registre keyé sur ce libellé se vide en silence** — pas d'erreur, pas de
test rouge, juste des décisions qui cessent de s'appliquer.

### Le cas fondateur, et il est à charge (16/09/2026)

`RATTACHEMENTS_VALIDES` désignait ses modules par `{ programme, module: titre }`.
Le 14/09, quatre titres ont été réécrits — **sur arbitrage de Laurent, et par le
bon chemin** (`TITRES_TRANCHES`, keyé lui sur `sourceRef#order`, avec une garde
sur le texte source).

**Quatre de ses sept décisions ont cessé de s'appliquer.** Ses arbitrages ont
été détachés en appliquant ses arbitrages. Et les deux consommateurs du registre
étaient touchés : le rapport, qui ne les affichait plus, **et le script
d'écriture en base**, qui les aurait sautées.

C'est resté muet **quatre jours**. Ce qui l'a révélé n'est pas une relecture :
c'est le registre lui-même, le jour où il a su dire ce qu'il avait perdu.

### Les deux moitiés — la seconde n'est pas un confort

> **① La clé est l'identité stable** — `drive:NNN#i`, jamais le titre, jamais un
> code lisible. Le libellé reste dans le registre, nommé pour ce qu'il est
> (`titreAuMomentDeLaDecision`) : il sert à RELIRE, pas à désigner.
>
> **② Le registre SIGNALE ses décisions orphelines au lancement.** Sans ②, ① ne
> se vérifie jamais : un `sourceRef` mal saisi ne désigne rien, en silence,
> exactement comme un titre périmé.

**Un registre qui ne sait pas dire ce qu'il a perdu n'est pas un registre.**

### Ce que le signalement doit dire

La population qu'il a cherchée, pas seulement l'échec (§4 quater, §4 octies).
« Introuvable » envoie chercher au mauvais endroit : un module peut être au
catalogue et **hors de la population animable** parce que son déroulé est vide.
Le premier lancement du garde, le 16/09, a justement trouvé ce cas — et le
message dit désormais « ne figure pas parmi les 336 unités animables — soit le
module a quitté le catalogue, soit son déroulé est vide ».

### L'état du dépôt au 16/09/2026

| Registre | Ce qu'il attache | Clé | Orphelines |
|---|---|---|---|
| `titres-tranches.ts` | un titre retenu à un module | `sourceRef#order` | garde sur le texte source |
| `RAYONS_TRANCHES` | un rayon effacé au rayon qui fait foi | `drive:NNN` | — |
| `arbitrages-rattachement.ts` | un refus/confirmation à un couple besoin × module | `needCode` × `sourceRef` | `arbitragesOrphelins()` |
| `refus-rattachement.ts` | un refus à un couple douleur × module | `ruleId` × `sourceRef` | `refusOrphelins()` |
| `rattachements-valides.ts` | un module retenu à une douleur | `sourceRef` | `resoudreCibles()` |

**Le seul appariement par libellé qui subsiste** est celui des deux décisions
portant sur un PRODUIT vendu pris comme un tout : il n'a pas d'identité de
module, il n'y a rien d'autre où s'accrocher. Il est commenté comme tel à
l'endroit où il vit — une exception nommée n'est pas une dette oubliée.

## 4 quinquies. Une valeur ABSENTE ne s'imprime jamais comme une valeur POSITIVE

**Troisième occurrence du même défaut en une semaine, relevée le 14/09/2026.**
Ce n'est pas trois bugs : c'est une règle, ratée trois fois.

| Ce que l'ÉCRAN montre | Ce que le DOCUMENT imprime |
|---|---|
| `contactLabel` vide | un nom — celui du propriétaire de la proposition |
| `consumedThisYear` jamais demandé | « **Aucun** financement engagé déclaré sur l'exercice en cours — 0 € » |
| colonne Qualiopi nulle | un texte générique |

Dans les trois cas, **l'écran dit « vide » et le document dit quelque chose.**
Le commercial relit un formulaire où il ne manque rien, et le client — ou le
financeur — reçoit une affirmation que personne n'a formulée.

> **La règle : ce que l'écran montre vide ne doit rien imprimer, ou l'écran
> doit montrer ce qui sera imprimé. Jamais l'un sans l'autre.**

### Pourquoi c'est plus grave qu'une omission

Le cas de la déduction est le pire des trois, et il mérite d'être compris.
Le document n'**omettait** pas l'information : il en **affirmait l'absence**,
sur une pièce qui part au financeur. « Aucun financement engagé déclaré »
énonce un constat. On ne l'avait jamais fait.

C'est la même famille que le motif qui répond à deux choses (§4 quater) :
**rien ne proteste.** Le tableau est cohérent, les totaux tombent juste, et il
est faux.

### Ce que ça donne en code

`?? 0` et `|| ''` écrasent « je ne sais pas » et « il n'y en a pas » en un seul
état. Le **calcul** n'a souvent pas d'autre choix que de retomber sur zéro — le
**document**, lui, doit dire lequel des deux il décrit :

```ts
const declaree = input.consumedThisYear !== undefined;  // l'état, séparé
const consumed = input.consumedThisYear ?? 0;           // le calcul, inchangé
```

Et quand un total repose sur une valeur inconnue, **il se nomme comme un
plafond**, pas comme un montant. Un montant mobilisable annoncé sans déduire ce
qui est déjà engagé est exactement la « mention trompeuse de financement » que
le référentiel Qualiopi sanctionne.

### Le corollaire de test

Un test qui porte sur l'OBJET ne prouve rien sur le DOCUMENT. Au premier jet du
correctif, `buildFundingSection` posait bien `amountLabel: '—'`, les six tests
étaient verts — et **le gabarit imprimait toujours « − 0 € »**, parce qu'il
ignorait le champ. Le contrôle doit porter sur ce que le lecteur lit.

### La règle immédiate : arrêter l'hémorragie avant d'éponger

Recensement du 14/09/2026, motif : toute fonction `export function render*Html`
sous `apps/web/src/lib` (hors pieds de page), vérifiée si son nom apparaît dans
un `*.test.ts(x)` quelconque.

> **16 documents sur 26 — 62 % — ne sont rendus par AUCUN test.**

Dont le **devis**, le **programme Qualiopi**, l'**attestation** et le
**certificat**. Plusieurs ont pourtant des tests : sur leurs fonctions de
**préparation de données**.

Éponger est un chantier. Mais la dette doit cesser de croître **aujourd'hui** :

> **Tout NOUVEAU test qui affirme quelque chose d'un document client ou
> financeur porte sur le HTML RENDU, jamais sur l'objet de préparation.**

Sans exception, et sans attendre que le chantier existe. Un test d'objet reste
utile pour la logique — il ne compte simplement pas comme une preuve du document.

**Corollaire pour choisir par où éponger** : on trie par EXPOSITION, pas par
facilité. Une pièce que le financeur lit et qui porte des chiffres calculés par
le système transforme un défaut de rendu en **dossier refusé**, pas en coquille.

## 4 sexies. Une base s'identifie par son CONTENU, jamais par son nom

**Vécu le 14/09/2026**, en cherchant la prod pour une lecture autorisée.

Le MCP Supabase listait trois projets. L'un s'appelait **`academia-crm`** — le
nom du CRM. C'était le candidat évident, et **ce n'était pas la prod** : la
table `Tenant` n'y existe pas. Un `SELECT` sur un nom plausible aurait rendu une
erreur ; sur un schéma voisin, il aurait rendu des **chiffres faux sans erreur**.

Pire : le MCP **ne voyait pas la prod du tout**. Le projet réel
(`gntlqyscahbgjrmsbzil`, pooler `aws-0-eu-west-1`) appartient à un autre compte.
Se fier à la liste d'un outil, c'est prendre son périmètre pour le monde.

> **La règle : avant toute lecture ou écriture, prouve la base par un marqueur
> de son CONTENU, et recoupe-le avec une valeur déjà consignée.**

### Le marqueur canonique de la prod QualiOF

```sql
SELECT t.id, t.name, (SELECT count(*) FROM "TrainingProduct") AS produits
FROM "Tenant" t WHERE t.id = 'db191440-a144-48d1-93c1-767e6f647f2c';
```

Attendu — **les deux ensemble**, jamais l'un seul :

| Marqueur | Valeur | Recoupement |
|---|---|---|
| `Tenant.name` | `Start Academy` | l'identifiant est dans tout le dossier |
| `count(TrainingProduct)` | **51** | STATE.md « la base en porte 51 » |

Le tenant seul ne suffit pas : une base d'aperçu restaurée le porte aussi. Le
compte de produits seul ne suffit pas : il bouge. **Les deux qui concordent,
oui** — et l'un d'eux vient d'une source écrite avant la question.

### Ne jamais confondre les trois bases

| Base | Hôte | Reconnaissance |
|---|---|---|
| **PROD** | `aws-0-eu-west-1.pooler.supabase.com` | tenant + 51 produits |
| **APERÇU** | `aws-1`, projet `qualiof-apercu` | schéma identique, données de démo |
| **LOCALE** | `localhost:5432/qualiof_dev*` | une base par worktree (§4) |

`aws-0` et `aws-1` sont **deux grappes différentes**, et un chiffre d'écart dans
un nom d'hôte est la seule chose qui sépare la production de l'aperçu.

### Et pour LIRE : le lanceur en lecture seule, jamais le client nu

Savoir quelle base on vise ne suffit pas — il reste à ne pas pouvoir y écrire
par accident. **Toute lecture d'une base qu'on n'a pas le droit d'écrire passe
par `db:query:prod` / `db:query:local`**, jamais par un `PrismaClient` monté à
la main dans un script jetable.

```bash
pnpm --filter @qualiof/db run db:query:prod  <fichier.sql>   # production
pnpm --filter @qualiof/db run db:query:local <fichier.sql>   # locale
```

Il imprime sa cible, puis tourne dans une transaction `SET TRANSACTION READ ONLY`
terminée par `ROLLBACK`. Trois verrous en série : le fichier SQL est refusé s'il
contient un mot-clé d'écriture ; la connexion passe par `DIRECT_URL` (`:5432`),
pas par la poolée (`:6543`) qui ne tient pas les transactions interactives ; et
Postgres lui-même rejette tout ordre d'écriture qui aurait franchi le premier.

**Pourquoi une commande et pas une consigne.** « Ne fais pas de `UPDATE` en prod »
dépend de l'attention de celui qui tape ; `SET TRANSACTION READ ONLY` n'en dépend
pas. C'est le même raisonnement que `assert-db-target.ts` pour les migrations :
**un garde qui rend l'erreur impossible vaut mieux qu'une consigne qui la
déconseille** — et il tient les jours de fatigue, qui sont ceux qui comptent.

Le corollaire, en lisant : une sonde dit sur quelle base elle a tourné (§4
terdecies), et le lanceur l'imprime pour elle. Un inventaire sans sa cible en
tête n'est pas un inventaire, c'est un nombre.

## 4 septies. Un document client ne se note jamais lui-même

**Arbitrage de Laurent, 14/09/2026**, et il va plus loin que le défaut qui l'a
déclenché.

Le défaut : la proposition annonçait « **audit complet** joint » sur un
diagnostic LÉGER. Chaîne en dur, aucune lecture de la variante.

La correction évidente — lire la variante et écrire « audit **léger** joint » —
**aurait été pire que le bug**. « Léger » dit au dirigeant qu'il a reçu la
version au rabais. Or il n'a **aucune raison de savoir qu'il existe deux
variantes** : ce découpage est notre affaire, pas la sienne.

> **La règle : aucun texte destiné au client ou au financeur ne qualifie le
> niveau, la version ou la complétude de la prestation. Ces mots servent en
> interne et s'arrêtent à la porte.**

L'écran a le droit de porter « Diagnostic léger » — c'est un outil de travail.
La pièce remise, non. Elle dit **« rapport de diagnostic joint »**, pour les deux
variantes.

**Le document se NOMME, il ne se CLASSE pas.**

### Ce que ça interdit, concrètement

« complet », « léger », « simplifié », « intégral », « version 2 », « essentiel »,
« premium », « standard », et tout comparatif implicite — dès qu'ils portent sur
ce qu'on vend ou ce qu'on remet.

### La forme du test qui la garde

Le contrat ne porte **pas** sur « quel mot pour quelle variante » : il porte sur
l'**absence de tout qualificatif**, dans les deux cas, plus l'égalité stricte des
deux rendus. Écrit autrement, il aurait laissé passer « audit léger joint ».

## 4 octies. Un refus nomme son CRITÈRE et la VALEUR qu'il a lue

**Troisième fois de la semaine**, et c'est ce qui en fait une règle.

| Refus | Ce qu'il disait | La vraie raison |
|---|---|---|
| geste commercial (14/09) | « au-delà d'une demi-journée facturée, c'est une négociation » | le reste à charge valait **0**, pas 400 € |
| objectif pédagogique (14/09) | « le titre ne dit pas ce que le stagiaire saura faire » | le **verbe** n'était pas dans la liste blanche |
| navigation de chapitre (14/09) | *rien du tout* | une file d'attente sans borne |

Les trois ont envoyé chercher au mauvais endroit. Le deuxième a coûté le plus
cher : Laurent a réécrit quatre titres, trois ont été refusés, et le message
décrivait un défaut que ces titres n'avaient pas. Quelqu'un qui lit ça réécrit
**indéfiniment un titre déjà bon**.

> **La règle : un refus nomme le critère qui a échoué ET la valeur qu'il a lue.
> Un refus qui récite sa seule raison connue est une fausse piste.**

En pratique : `« Atelier pratique : … » (mot lu : « atelier »)` plutôt que
« ce titre ne convient pas ». Le lecteur sait alors quoi changer.

**Testable par mutation** : retirer la mention du critère doit faire rougir un
test qui lit le DOCUMENT rendu, pas l'objet (§4 quinquies).

## 4 nonies. Une liste blanche est ASYMÉTRIQUE, et c'est voulu

Corollaire du précédent, parce que la tentation après un faux refus est
d'ouvrir la vanne.

`TITLE_VERBS` (66 infinitifs, `composed-programme.ts`) décide si un titre de
module peut devenir un objectif pédagogique. Elle refuse beaucoup. C'est le
comportement recherché :

| | Coût |
|---|---|
| **faux négatif** — un bon titre marqué « à rédiger » | une relecture humaine |
| **faux positif** — un titre creux accepté comme objectif | « Maîtriser « Suivi » » **imprimé sur une pièce financeur** |

> **La liste DOIT pencher vers le refus. On l'élargit au cas par cas, sur
> PREUVE, jamais par principe.**

La preuve, c'est une mesure : le 14/09/2026, `conduire`, `mener` et `repondre`
ont été ajoutés après avoir compté ce qu'ils changeaient — **5 modules**, dont
**2 objectifs légitimes refusés à tort**. Pas « ce sont des verbes, ajoutons-les ».

### Le procédé qui va avec

**Toute proposition de titre soumise à Laurent est validée contre `TITLE_VERBS`
AVANT de lui être présentée.** S'il faut élargir la liste, on le dit dans la
même proposition.

Sinon on dépense l'attention de quelqu'un pour un résultat qui sera refusé —
c'est arrivé le 14/09 sur quatre titres, dont trois ont dû revenir.

## 4 decies. Un garde qui gêne : sépare les familles, ne desserre pas le seuil

Le 14/09/2026, `mentions-organisme.test.ts` comptait **tous** les warnings de
l'instantané (64) pour surveiller une seule chose : qu'aucun module ne soit
nouvellement vidé. Quatre traces d'arbitrage de titre l'ont fait passer à 68.

Le réflexe — écrire `68` — l'aurait rendu **aveugle** : un module réellement
vidé se serait ensuite caché derrière un arbitrage de titre, et le garde serait
resté vert pour la pire des raisons.

> **Quand un garde légitime gêne, on EXCLUT la famille étrangère et on la compte
> à part. Le seuil ne bouge pas.**

Le garde en ressort **plus serré** qu'avant : il surveille désormais deux
populations nommées au lieu d'un total qui mélangeait tout. C'est §4 ter
appliqué à l'envers — au lieu de constater après coup qu'un garde ne garde rien,
on l'empêche de le devenir.

## 4 undecies. Un point d'extension sans appelant correct est un TROU

`resolveQualiopiMentions` offrait un paramètre `contact`, documenté en toutes
lettres « **le contact référent handicap** ». **Les quatre appelants lui
passaient autre chose** : trois l'organisme (`of.name / of.email / of.phone`),
le test un littéral — « Julien LAFITTE », qui n'est le référent de rien.

Ce n'était pas de la souplesse. C'était une **branche jamais exercée
correctement qui avait l'air d'une fonctionnalité**, et qui a produit, sur une
pièce Qualiopi, une raison sociale là où l'indicateur 26 exige une personne.

> **La règle : un paramètre optionnel qu'aucun appelant ne remplit correctement
> se RETIRE. Il ne se documente pas mieux.**

Mieux documenter aurait laissé le trou ouvert pour le cinquième appelant. Le
retirer le referme structurellement : la valeur vient de sa source unique, et
plus personne ne peut se tromper en la passant.

**Le test qui révèle le cas** : si écrire le test oblige à inventer une valeur
pour un paramètre — un nom de personne, une adresse — c'est que ce paramètre
n'a pas de source légitime chez l'appelant. Il n'en a pas besoin.

## 4 duodecies. `??` ne protège que de `null` et `undefined`

Cinquième membre de la famille « une absence se présente comme une présence »,
trouvé le 15/09/2026 en extrayant la résolution du nom d'agence :

```ts
[d.lead.firstName, d.lead.lastName].filter(Boolean).join(' ') ?? d.reference
```

`.join()` rend **toujours** une chaîne. Avec deux `null`, elle rend `''` — qui
n'est **pas** nullish. Le repli sur la référence du dossier ne pouvait donc
**JAMAIS** se déclencher, et un dossier sans nom sortait en **chaîne vide** sur
une pièce client.

> **Toute gauche de `??` qui est une chaîne CONSTRUITE — `join`, `concat`,
> template, `replace`, `trim` sur du non-nullable — est suspecte. Une chaîne
> construite n'est jamais nullish ; elle est vide.**

Le bon geste est une chaîne de candidats et le premier **non vide** :

```ts
for (const c of candidats) { const v = c?.trim(); if (v) return v; }
return d.reference;
```

### Le balayage du 15/09/2026, et ce qu'il a vraiment trouvé

**Motif** : un `??` dont la gauche porte `.join(` / `.concat(` / `.trim()` /
`.replace(` / un template. **Population** : `apps/web/src`, `apps/web/scripts`,
`packages/*/src`, `packages/db/scripts`, hors `__tests__`.

**25 occurrences brutes — mais le compte brut trompe.** `x?.trim() ?? ''` est
SAIN : la gauche y vaut `undefined`, pas `''`. Le relevé utile est le
classement :

| Catégorie | Compte | Mécanisme |
|---|---|---|
| **le `??` est MORT** | 2 | la gauche ne peut jamais être nullish |
| **une chaîne vide gagne avant le repli** | 5 | `replace` qui vide, pas de `trim` |
| sain | 18 | `?.trim() ?? ''`, `?? null` dans les imports |

Et les **sept** ne sont pas sept défauts : c'est **la même résolution du nom
d'agence, dupliquée**, avec cinq comportements différents pour la même question.
Voir §4 bis — dupliquer un mapping garantit la divergence.

### Le patron, et il vaut pour tous les balayages

> **Un balayage qui compte des OCCURRENCES compte des symptômes. Celui qui
> compte des CAUSES trouve souvent qu'il n'y en a qu'une.**

Ici : 25 occurrences, puis 7 après classement par mécanisme, puis **1** après
avoir regardé ce que les 7 avaient en commun. Le chiffre qui décide de l'action
n'est aucun des deux premiers.

Le geste qui fait la différence est le **tableau par mécanisme** — pas la liste.
Une liste de 25 lignes se lit comme un chantier ; trois catégories nommées se
lisent comme une décision. Et tant qu'on n'a pas nommé le mécanisme, on ne sait
pas si on regarde 25 problèmes ou un seul, recopié.

À faire donc systématiquement : **classer avant de compter, et compter les
causes avant d'annoncer un volume.**

## 4 terdecies. Une RÉFÉRENCE n'est pas une IDENTITÉ entre deux bases (§5.4 étendue)

`DIAG-0001` désigne **« Agence des Oliviers », 4 fiches** en local, et
**« BATI BATI OURMIERES », 3 fiches** en production. Deux dossiers, deux UUID,
deux clients — une seule référence.

Même cause que `PROD-0681` qui désignait deux produits : **chaque base séquence
de son côté**. §5.4 disait « un code produit n'est pas une adresse » ; ça vaut
pour toute référence lisible par un humain, dans toute base.

Le coût, le 15/09 : un programme composé a été rendu à Laurent pour relecture
sans dire d'où il venait. Sa revue tient sur la FORME — un module à 33 puces,
des prérequis affirmés, un référent erroné — mais **tout ce qui est propre au
client concernait une autre agence que la sienne**.

> **La règle : toute sonde ou tout script qui nomme un dossier DIT dans sa
> sortie sur quelle base il a tourné.** Un relevé dit ce qu'il a cherché — et
> **où**.

En pratique : le nom de la base et l'hôte en tête de sortie, et l'**identifiant
technique** à côté de la référence lisible. C'est l'UUID qui tranche, jamais le
`DIAG-NNNN`.

## 4 quaterdecies. Un garde qui crie au loup finit débranché

Pendant de §4 ter. Là-bas, un garde était vert parce qu'il ne regardait plus
rien. Ici, il regarde tout — et c'est l'autre façon de ne plus rien garder.

Cas fondateur (15/09/2026), le balayage des données personnelles avant import
d'un dossier réel. Il faut arrêter sur un nom de personne glissé dans une
réponse en texte libre — « j'en ai parlé à Sophie ». Le motif le plus couvrant
est évident : **tout mot capitalisé en milieu de phrase**. Il n'aurait laissé
passer aucun prénom.

Il aurait aussi arrêté sur `Septeo`, `Netty` et `ChatGPT`. À chaque import. Sur
un corpus où les réponses parlent de logiciels, l'alarme serait devenue le cas
NORMAL — et un opérateur qui voit la même alarme à chaque passage apprend en
trois fois à la faire taire sans la lire. Le garde le plus couvrant du dépôt
aurait fini derrière un `--force` permanent.

> **Le calibrage d'un garde se juge sur la CRÉDIBILITÉ de son alarme, pas sur sa
> couverture théorique. Un garde désarmé protège moins qu'un garde étroit.**

Ce qui a été retenu à la place : un **vocabulaire** de prénoms usuels. Il
attrape « Sophie » et « Marc », il ignore « Netty ». Il est plus étroit sur le
papier — un prénom rare lui échappe — et strictement plus protecteur en vrai,
parce qu'il reste branché. Relevé du 15/09 : 37 réponses balayées, **0
trouvaille**, aucune alarme dépensée pour rien.

### Le réglage, en une ligne

**Large à la DÉTECTION, strict à l'ACTION.** Les deux moitiés comptent :

- large, parce qu'un faux positif coûte trente secondes de lecture quand un faux
  négatif coûte une donnée personnelle en base — c'est §4 nonies, l'asymétrie ;
- mais **l'action reste l'arrêt, jamais la correction automatique**. Le script
  rend ce qu'il a trouvé et attend un arbitrage. Caviarder tout seul du texte
  métier en abîmerait le sens — et c'est §4 quater : une ambiguïté tranchée au
  hasard est une écriture qu'on ne peut plus relire.

### Le test qui révèle le cas

Avant d'élargir un motif, se demander **sur quoi il va crier dans le corpus
réel, et à quelle fréquence**. Si la réponse est « souvent, et légitimement »,
le motif est trop large — non pas parce qu'il se trompe, mais parce que
personne ne le lira plus.

## 4 quindecies. Un garde qui attrape le bon cas par le MAUVAIS CRITÈRE n'attrapera pas le suivant

Cas fondateur, 15/09/2026, et il a failli coûter cher **parce que le garde avait
raison**.

Deux modules de `BIB-D014` ont été programmés dans un parcours client. Le
refus d'objectif les a signalés : « le titre doit commencer par un verbe d'action
reconnu », `appliquer` et `elaborer` n'y étaient pas.

Les deux modules ne valaient effectivement rien — l'un a pour tout déroulé
« - Après-midi :\n- Animer des réunions commerciales », l'autre une puce unique
sans rapport avec son titre. **Le garde a désigné les bons modules.**

Mais son critère parlait du **VERBE**. Or `appliquer` et `élaborer` sont des
verbes de la taxonomie de Bloom, ceux qu'on enseigne pour rédiger un objectif :
le critère était faux, et il est tombé juste par coïncidence.

### Ce que la coïncidence a failli produire

Le correctif « évident » était de reconstruire la liste des verbes. Il était
mesuré, il ne cassait rien — et **il aurait fait PASSER les deux modules**. Le
seul signal qui désignait deux résidus de découpage aurait été réparé en
silence, et le parcours client les aurait gardés avec un objectif bien formé
par-dessus.

> **La règle : quand un garde attrape un vrai défaut, vérifier que son CRITÈRE
> désigne bien CE défaut. S'ils ne coïncident pas, il y a deux choses à faire,
> pas une — et les confondre en supprime une.**

### Le test qui révèle le cas

**À quoi ressemblerait le PROCHAIN cas ?** Un module aussi corrompu, mais
intitulé « Maîtriser la relation client », serait passé sans un bruit :
`maitriser` est dans la liste depuis toujours. Le garde avait donc, sur le
défaut réel, un rappel proche de **zéro** — il n'en attrapait que la fraction
qui portait par hasard un verbe absent.

Un garde dont on ne sait pas dire ce qu'il RATE n'est pas évalué, il est
seulement observé les jours où il sonne.

### Et le vrai garde, alors

Il se pose là où vit le défaut. Ici : `isAnimable` exige un déroulé **non vide**
— il n'exige pas un déroulé qui **tienne debout**. C'est ce seuil-là qu'il faut
poser, sur mesure et non sur intuition (relevé `probe-deroules.ts`,
15/09/2026 : 7 modules dont le déroulé n'est QUE de l'horaire, 25 à une seule
puce, sur 298 composables).

## 4 sexdecies. Un commentaire qui énonce un fait MÉTIER doit être vérifiable

Un commentaire qui explique du CODE se vérifie en lisant le code d'à côté. Un
commentaire qui énonce un fait du MÉTIER — qui reçoit ce document, ce que le
financeur exige, ce qu'un contrôle regarde — ne se vérifie nulle part. Il est
donc cru.

Cas fondateur, 15/09/2026. `composed-programme.ts` portait, dans son bloc de
doctrine :

> « Le programme s'attache à la convention et **part au financeur**. »

**C'est faux.** Le programme composé est une pièce client. Et la phrase n'a pas
seulement traîné : elle a été **lue et appliquée deux fois en deux jours**, par
deux lecteurs différents, chacun en tirant des contraintes d'indicateur qui ne
concernaient pas ce document. Écrite dans le code, elle était devenue **la
source** — plus consultée que la spec, parce qu'elle était sous les yeux.

> **La règle : un commentaire qui énonce un fait métier cite sa source — une
> décision datée, une section de spec — ou il ne l'énonce pas.** « Part au
> financeur » se remplace par « destinataires : cf. spec §9.6 », et le fait
> vit à UN endroit.

### Pourquoi c'est pire qu'une spec fausse

Une spec fausse se corrige une fois. Un commentaire faux se **recopie** : il
voyage avec la fonction qu'on déplace, il inspire le test qu'on écrit à côté, et
il survit aux relectures parce qu'il a l'air d'expliquer. Les trois lecteurs
suivants hériteront de l'erreur sans jamais voir la spec.

### Le test qui révèle le cas

Relire ses propres commentaires en se demandant : **« si c'est faux, qu'est-ce
qui me le dirait ? »** Si la réponse est « rien », le commentaire énonce un fait
métier sans source — il cite, ou il se tait.

### Et quand le document a déjà menti : on CITE, on ne remplace pas

Le pendant, pour un document qui décrit un ÉTAT et que l'état a dépassé.

Cas du 16/09/2026. L'ordre de marche du 14/09 portait « ⚠ **Ces propositions ne
sont PAS appliquées** » à propos de quatre titres de modules. Les quatre étaient
en base depuis, sous la formulation proposée. Le réflexe est de réécrire la
ligne.

**Il ne faut pas.** La correction se pose À CÔTÉ de la phrase d'origine, qui est
citée, et elle porte sa date :

> **L'effacer aurait produit un document juste aujourd'hui et faux sur son
> passé.**

Ce qu'on perd en effaçant, et qu'on ne récupère jamais : la trace de ce qui
était vrai quand la décision suivante a été prise. Quelqu'un qui relit un
arbitrage du 14/09 doit pouvoir savoir ce que son auteur avait sous les yeux —
sinon l'arbitrage devient incompréhensible, et on le rejoue.

C'est la même mécanique que « on RENVERSE le test, on ne le supprime pas »
(§4 ter) : l'ancienne assertion reste en commentaire avec la date et le motif du
renversement. Un document se corrige comme un test se renverse.

**En pratique** : un bloc daté, la phrase d'origine entre guillemets, ce qui a
changé, et la commande ou le relevé qui l'établit. Trois lignes, et le document
cesse de mentir sans se mettre à mentir sur lui-même.

## 4 septdecies. Une règle qui vit dans le CODE ne protège que son fichier

Même jour, même dossier, et c'est le thème de la semaine dans sa forme la plus
pure.

`creneaux.ts` distingue depuis toujours deux lectures de la durée, et les
NOMME :

```ts
decrireDureeProduitParticipant()  // heures sur site      → /rdv/[token], public
decrireDureeProduit()             // + heures conventionnées → /app/campagnes, interne
```

La règle « le vocabulaire dépend du destinataire » était donc **déjà trouvée,
déjà comprise, déjà appliquée** — une fois, dans un fichier, sous la forme de
deux fonctions bien nommées. Et **écrite nulle part.**

Résultat : le programme composé, écrit trois mois plus tard par quelqu'un qui
n'avait pas ouvert `creneaux.ts`, a mélangé les deux unités sur une pièce
client. La règle n'avait protégé que le fichier où elle était née.

> **Une décision qui vit dans une paire de fonctions ne protège que le fichier
> où elle est née. Ce qui généralise, c'est la spec.**

### Comment on la repère

Une belle paire de fonctions dont les NOMS portent une distinction métier —
`…Participant` / `…Admin`, `…Client` / `…Interne`, `public…` / `…Complet` — est
presque toujours une règle non écrite. Elle a coûté une réflexion à quelqu'un ;
elle mérite trois lignes de spec, et le commentaire du fichier y renvoie.

C'est le corollaire de §4 bis (dupliquer un mapping garantit la divergence) :
ici on n'a pas dupliqué, on a **sous-diffusé**. Les deux défauts ont la même
racine — une seule définition, mais introuvable depuis ailleurs.

### Troisième occurrence en une semaine — et la conclusion n'est pas « documenter »

**16/09/2026.** Avant d'appliquer la règle d'unité d'affichage aux pièces
contractuelles, on a relevé ce que chacune disait déjà. Verdict : **les cinq
étaient déjà justes.** La convention rendait `48 heures (6 journées de 8
heures)` — l'unité du financeur, exactement — depuis toujours, et **la spec
l'ignorait**.

| Occurrence | Où la règle vivait | Ce que ça a coûté |
|---|---|---|
| `creneaux.ts` | deux fonctions nommées, participant vs interne | le programme composé a mélangé les unités |
| `convention-template.ts` | `formatDuree`, `%7` et `%8` | on a failli « corriger » une pièce juste |
| `invoice-snapshot.ts` | convention n°1, quantité 1 / unité C62 | — (trouvée à temps) |

Et **quatrième, le même jour** : le commentaire d'`InvoiceLine.unit` explique
pourquoi le code `HUR` est refusé — *« le prix de QualiOF est une place de
formation, pas un tarif horaire ; mettre la durée en quantité avec l'unité HUR
ferait dire à la facture un prix unitaire que personne n'a négocié »*. C'est la
doctrine d'unité de Laurent, écrite dans la facturation électronique **avant
d'être énoncée**. Elle a servi de réponse à la vérification aval du devis : la
règle neuve n'avait rien à démontrer, elle était déjà tenue, et là encore par
écrit au mauvais endroit.

> **Quand une pièce fait quelque chose de juste que la spec ignore, ce n'est
> pas la pièce qui a raison par hasard : c'est quelqu'un qui a su et qui n'a pas
> écrit.**

La nuance compte. « Il faut documenter » est un vœu ; ceci est un **constat sur
la provenance** — il y a eu une décision, elle a été prise correctement, et elle
est restée dans un fichier. Le savoir existe, il est simplement **rangé au
mauvais endroit**. On ne le crée pas, on le **déplace**.

### La méthode qui en découle

> **Avant d'appliquer une règle neuve, on relève qui la respectait déjà.**

Le relevé coûte une demi-heure et rapporte trois choses :

1. **il évite de « corriger » ce qui était juste** — le risque n'est pas
   théorique, `formatDuree` était sur la liste des pièces à changer ;
2. **il dit où la règle était déjà comprise**, donc qui l'avait trouvée et ce
   qu'il savait de plus que la spec ;
3. **il transforme la règle neuve en CONSTAT** : elle ne s'impose plus au
   dépôt, elle nomme ce que le dépôt fait déjà — et une règle qui décrit se
   discute mieux qu'une règle qui prescrit.

### Et le geste inverse : poser le patron AVANT la divergence

Les quatre occurrences ci-dessus ont été trouvées **après** que la divergence a
coûté quelque chose. Le 16/09, le libellé de volume a été extrait en
`libelleVolumeClient()` alors qu'il n'existait encore qu'en **deux littéraux
identiques** — avant, donc, qu'ils ne se mettent à différer.

C'est la première fois de la semaine que le patron est posé sur une duplication
qui n'a **pas encore** divergé. Le signe qui l'a déclenché est simple et vaut
comme règle : **deux littéraux identiques qui portent une règle métier sont une
fonction qui n'a pas encore été écrite.** Ne pas attendre le troisième.

## 5. Gates — les trois, dans cet ordre

```
pnpm lint
pnpm --filter @qualiof/web exec tsc --noEmit
pnpm test
```

Aucun commit de fin sans les trois verts. Si un test échoue et qu'il échouait
déjà avant ta modif, dis-le explicitement et consigne-le dans
`.planning/*/deferred-items.md` — ne le « répare » pas au passage.

### Un gate dont le code de sortie est AVALÉ n'est pas un gate

Cas du 15/09/2026, et c'est §4 ter appliqué à la ligne de commande.

```bash
pnpm run test 2>&1 | tail -4 && git commit …     # ❌
```

Le `&&` lit le code de sortie du **pipeline**, donc celui de `tail` — qui vaut
`0` quoi qu'il arrive. La suite était **rouge**, six tests, et le commit est
parti quand même. Le pipe ne « raccourcit » pas la sortie : **il remplace le
verdict.**

> **La règle : un gate se lance SEUL et son code de sortie se lit.** Pour
> abréger l'affichage sans perdre le verdict : `${PIPESTATUS[0]}`, ou relancer
> la commande nue.

Même famille que le garde qui ne garde rien : ici, ce n'est pas le test qui a
cessé de regarder, c'est **celui qui lisait le test**.

## 5 ter. Le rapprochement métier ne se valide pas par une gate

**Étape du processus, pas aveu de faiblesse.** Tant que la bibliothèque n'est
pas mûre, **un programme composé se relit par un humain du métier, dossier par
dossier, avant d'être proposé à un client.** C'est une étape, elle se planifie,
et elle a un coût connu — vingt minutes de Laurent par dossier.

### Pourquoi aucune gate ne peut la remplacer

Cas fondateur, 16/09/2026. « Rédiger des compromis de vente efficaces » était
proposé sur le besoin « Transformer visites et offres en actes ». Le
rapprochement est **lexicalement parfait** : le module parle de vente, le besoin
aussi. Il est **sémantiquement faux** : la douleur porte sur le suivi de la
réception des pièces entre l'offre et l'acte, et **un conseiller ne rédige pas
un compromis** — c'est le notaire.

Aucun test n'aurait pu l'attraper, et pas par négligence : il fallait **savoir
ce que fait un conseiller immobilier**. Ce n'est pas une information qui vit
dans le dépôt.

> **Une gate vérifie une règle qu'on a su formuler. Elle ne vérifie jamais une
> règle qu'on ne connaît pas encore.** Le métier n'est pas encore entièrement
> écrit ; la relecture est le seul endroit où il entre.

### Ce que la relecture produit, et qui la rend rentable

Elle ne jette pas un rapprochement : elle **écrit une règle**. Le refus entre au
registre (`arbitrages-rattachement.ts`) avec son motif intégral, keyé sur le
`sourceRef` — l'identité stable qui survit à un ré-import. Le moteur ne le
repropose plus jamais, **même si le catalogue bouge**.

Chaque relecture rend donc la suivante plus courte. C'est ce qui distingue cette
étape d'une corvée permanente : **elle se résorbe.**

### Quand elle s'arrêtera

Quand le registre cessera de se remplir. Tant qu'une relecture sur deux produit
un refus, la bibliothèque n'est pas mûre — et le relevé des appuis uniques
(`probe-homonymes.ts`) dit pourquoi : **87 % des rapprochements ne tiennent que
par un seul mot.** Un rapprochement à appui unique n'a pas de second témoin ;
si ce mot se trompe de sens, rien ne le rattrape.

## 5 bis. Une PR verte peut ne rien faire — vérifie sa BASE

Deux pièges de fusion, tous deux rencontrés le 12/09/2026, et qu'aucune gate
n'attrape : les trois portes (lint, tsc, tests) portent sur le CONTENU d'une
branche, jamais sur sa destination.

### ① Une PR verte sur une base déjà fusionnée est verte parce qu'elle ne fait rien

La #61 visait `chore/260911-scripts-sous-tsc`. Cette branche avait été
fusionnée le matin même par la #58. La PR était **MERGEABLE, CLEAN, checks
verts** — et la fusionner n'aurait porté **aucune ligne** à `main` : elle
comparait sa branche à une cible qui n'était plus la trajectoire du dépôt.

Le vert ne mesurait pas le travail, il mesurait le vide.

**Le réflexe** : avant toute fusion, lire la BASE de la PR, pas seulement son
état. `gh pr view <n> --json baseRefName,mergeStateStatus`. Une base qui n'est
ni `main` ni une PR ouverte est un signal, pas un détail.

### ② Supprimer une branche de base FERME la PR qui s'empilait dessus

La #63 était empilée sur la #61. Fusionner la #61 avec `--delete-branch` a
**fermé la #63** — GitHub ferme une PR dont la branche de base disparaît. Et
elle ne se rouvre pas : `gh pr reopen` échoue (« Could not open the pull
request »), et rebaser sa cible échoue aussi (« Cannot change the base branch
of a closed pull request »).

Le travail n'est pas perdu — les commits vivent sur la branche `head` — mais
il faut **rouvrir une PR neuve** vers `main`, et la relecture déjà faite est
à refaire.

**Le réflexe** : quand une PR en porte une autre, ou bien fusionner **sans**
`--delete-branch`, ou bien **recibler la PR empilée sur `main` AVANT** de
fusionner sa base.

### La règle derrière les deux pièges

**Une pile de PR n'est pas un état, c'est une dépendance vivante.** On ne
supprime pas une base, et on ne fusionne pas une pile sans avoir rebasé
l'étage du dessus d'abord.

Le travail n'était pas perdu — reconstruire la #69 a simplement coûté plus que
la précaution : intégrer `main`, rejouer les trois gates, rouvrir, réattendre
la CI, et refaire relire ce qui l'avait déjà été.

## 6. Rendre compte

Trois lignes : ce qui change pour l'utilisateur, ce qui a été mis de côté, ce
qu'il reste à vérifier à la main.
