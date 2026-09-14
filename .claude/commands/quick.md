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

## 5. Gates — les trois, dans cet ordre

```
pnpm lint
pnpm --filter @qualiof/web exec tsc --noEmit
pnpm test
```

Aucun commit de fin sans les trois verts. Si un test échoue et qu'il échouait
déjà avant ta modif, dis-le explicitement et consigne-le dans
`.planning/*/deferred-items.md` — ne le « répare » pas au passage.

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
