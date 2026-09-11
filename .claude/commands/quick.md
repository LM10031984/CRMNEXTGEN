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
pnpm --filter @qualiof/db exec prisma migrate dev --name <slug>   # créer
pnpm --filter @qualiof/db exec prisma migrate deploy              # appliquer
```

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
