# Quick 260910-c1r — Lot C.1 signature : le régime de financement — Résumé

**Livré le 2026-09-10** · branche `feat/signature-docs-signes` · 7 commits, `71034a8` → `03e31c6`

Spec : `.planning/specs/2026-09-04-signature-electronique-docs-signes.md` §3 bis, §4.3, décision D-10.

## En une ligne

« Qui signe quoi » n'est plus un `if` sur un code financeur : c'est une donnée du
catalogue (`OpcoCatalog`), lue par une fonction pure, et la matrice sait enfin
dire `NA` au lieu de `MISSING` pour une pièce qui n'existera jamais.

## Ce qui est fait

| Fichier | Modification |
|---|---|
| `packages/db/prisma/schema.prisma` | `enum SignerRole { DIRIGEANT STAGIAIRE }` + 3 colonnes **nullables** `conventionSigner` / `ageficeSigner` / `assiduiteSigner` sur `OpcoCatalog`. `requiredDocs` **intact**. |
| `packages/db/prisma/migrations/20260910160000_signature_regime_financement/migration.sql` | Migration **additive** : `CREATE TYPE` + 3 `ADD COLUMN`. Aucun `DROP`, aucun `NOT NULL`, aucun backfill. |
| `packages/db/prisma/seed.ts` | Les **6 lignes** du tableau D-10, `null` écrit explicitement, précédées du commentaire qui explique pourquoi AGEFICE est `DIRIGEANT` sur la convention et FI-FPL `null` sur l'assiduité. Boucle `upsert` inchangée (déjà idempotente). |
| `apps/web/src/lib/signature/__tests__/seed-signataires.test.ts` | **6 tests nommés** (un par financeur) + 2 gardes (parseur, `requiredDocs`). 8 au total. |
| `apps/web/src/lib/signature/regime.ts` | Module **pur** (173 lignes) : `resolveRegimeSignature`, `docTypesEnRegime`, `docTypesHorsRegime`, `signataireDe`, `DOC_TYPES_SIGNABLES`. Ni Prisma, ni réseau, ni `async`. |
| `apps/web/src/lib/signature/__tests__/regime.test.ts` | 11 tests : les 7 du plan + `signataireDe` + 3 gardes de source. |
| `apps/web/src/lib/derive-cell-state.ts` | 8ᵉ paramètre **optionnel** `docTypesHorsRegime`, appliqué en dernier recours uniquement. **+18 lignes, 0 ligne déplacée.** |
| `apps/web/src/lib/__tests__/derive-cell-state.test.ts` | 6 tests ajoutés (A–E + E bis), **aucun test existant modifié**. |

Les 6 lignes du seed, telles qu'écrites :

| code | conventionSigner | ageficeSigner | assiduiteSigner |
|---|---|---|---|
| AGEFICE | DIRIGEANT | STAGIAIRE | STAGIAIRE |
| OPCO_EP | DIRIGEANT | null | null |
| ATLAS | DIRIGEANT | null | null |
| CPF | STAGIAIRE | null | null |
| FI-FPL | STAGIAIRE | null | null |
| OPCOMMERCE | DIRIGEANT | null | null |

## Le SQL réel de la migration

```sql
-- CreateEnum
CREATE TYPE "SignerRole" AS ENUM ('DIRIGEANT', 'STAGIAIRE');

-- AlterTable
ALTER TABLE "OpcoCatalog" ADD COLUMN     "ageficeSigner" "SignerRole",
ADD COLUMN     "assiduiteSigner" "SignerRole",
ADD COLUMN     "conventionSigner" "SignerRole";
```

## Écart n°1 — `prisma migrate dev` n'a pas pu être lancé, et pourquoi

Le plan demandait `pnpm --filter @qualiof/db run db:migrate:local`. Lancée, la
commande a répondu :

```
- Drift detected: Your database schema is not in sync with your migration history.
[*] Changed the `PreEnrollment` table
  [+] Added column `submissionAlertedAt`
[*] Changed the `TenantEmailSettings` table
  [+] Added column `proposalSendEnabled`
- The following migration(s) are applied to the database but missing from the local
  migrations directory: 20260910140000_proposition_envoi_email,
  20260910150000_alerte_preinscription_idempotence
? We need to reset the "public" schema at "localhost:5432"
  Do you want to continue? All data will be lost. › (y/N)
```

**Répondu non. Aucune donnée perdue.**

Ces deux migrations appartiennent au worktree `files-chaine` (branche
`chaine/lot-f-campagne-rdv`, commit `e031f17`) — vérifié par `git log --all`.
Les sept worktrees partagent la même base locale `qualiof_dev`, donc `migrate dev`
voulait réinitialiser le travail d'un autre chantier. Refusé : la dérive
préexiste à ce lot et n'en relève pas.

**Chemin retenu, non destructif** — le SQL a été produit **hors ligne** par
`prisma migrate diff --from-schema-datamodel <schéma d'avant> --to-schema-datamodel
<schéma d'après> --script`, qui ne touche aucune base. Sortie identique à ce que
`migrate dev` aurait écrit (recopiée ci-dessus, à l'en-tête FR près).

**Et vérifié pour de bon** par le garde du dépôt `check:schema`, qui rejoue
TOUTES les migrations dans une base jetable puis diffe contre `schema.prisma` :

```
→ réinitialisation de « qualiof_drift »
→ diff entre la base ainsi obtenue et le schéma déclaré

✅ Aucune dérive : le schéma est exactement ce que les migrations produisent.
```

C'est une preuve plus forte que celle qu'aurait donnée `migrate dev` : elle porte
sur les 17 migrations rejouées, pas sur un diff incrémental.

**Reste à faire** : appliquer la migration sur `qualiof_dev`. Elle ne peut pas
l'être tant que la dérive entre worktrees n'est pas réconciliée (soit les deux
migrations de `files-chaine` arrivent ici par un merge, soit chaque worktree
prend sa propre base). Aucun test de ce lot n'en dépend — ils lisent tous des
fichiers ou des objets en mémoire.

## Écart n°2 — le test de puissance n°2 a révélé un test qui ne gardait rien

Détaillé plus bas. En bref : la mutation attendue ne faisait tomber qu'un test au
lieu de deux, parce que dans les six régimes réels `ageficeSigner` et
`assiduiteSigner` portent **toujours la même valeur**. Un test a été ajouté
(commit `aff2e26`) avant de conclure.

## Les 3 tests de puissance — sortie réelle

### Puissance 1 — casser une ligne du seed doit désigner CE financeur

Mutation : `assiduiteSigner: SignerRole.STAGIAIRE` sur **OPCO_EP** (ligne 120).

```
 ❯ src/lib/signature/__tests__/seed-signataires.test.ts (8 tests | 1 failed) 3ms
   × seed OpcoCatalog — régime de signature (spec §3 bis, D-10) > OPCO_EP — DIRIGEANT / null / null 2ms
     → expected 'STAGIAIRE' to be null

 Test Files  1 failed (1)
      Tests  1 failed | 7 passed (8)
```

**Un seul rouge, et il nomme le financeur fautif.** Conforme. Restauré, 8/8 verts.

### Puissance 2 — câbler `COLONNE_PAR_DOCTYPE` de travers doit se voir

Mutation : `ASSIDUITE: 'assiduiteSigner'` → `ASSIDUITE: 'ageficeSigner'`.

**Première passe — le plan attendait les tests 1 et 2 en rouge. Ils sont restés VERTS.**

```
 ❯ src/lib/signature/__tests__/regime.test.ts (10 tests | 1 failed) 5ms
   × … > Test 6 — test de puissance : la même règle mutée change la sortie 3ms
     → expected [ 'CONVENTION' ] to deeply equal [ 'CONVENTION', 'ASSIDUITE' ]

 Test Files  1 failed (1)
      Tests  1 failed | 9 passed (10)
```

Diagnostic : dans les six régimes réels, `ageficeSigner` et `assiduiteSigner`
portent toujours la **même valeur** — `STAGIAIRE`/`STAGIAIRE` chez AGEFICE,
`null`/`null` partout ailleurs. Permuter les deux colonnes ne change donc rien
d'observable. Le test 1 (AGEFICE) et le test 2 (OPCO_EP) ne pouvaient pas voir la
mutation ; seul le test 6, dont la règle mutée est asymétrique, l'a vue. Le moteur
était gardé **par accident d'asymétrie, pas par intention**.

Renfort (commit `aff2e26`) : un test nommé sur une règle aux trois colonnes
**deux à deux distinctes** (`DIRIGEANT` / `STAGIAIRE` / `null`), où n'importe
laquelle des six permutations possibles de la table devient visible.

**Seconde passe, même mutation :**

```
 ❯ src/lib/signature/__tests__/regime.test.ts (11 tests | 2 failed) 5ms
   × … > Test 6 — test de puissance : la même règle mutée change la sortie 3ms
     → expected [ 'CONVENTION' ] to deeply equal [ 'CONVENTION', 'ASSIDUITE' ]
   × … > chaque pièce lit SA colonne — un câblage croisé de COLONNE_PAR_DOCTYPE se voit 0ms
     → expected 'STAGIAIRE' to be null

 Test Files  1 failed (1)
      Tests  2 failed | 9 passed (11)
```

Restauré, 11/11 verts.

### Puissance 3 — remonter le `if` hors régime avant `MANUAL_OK` doit casser la priorité

Mutation : le `if (docTypesHorsRegime?.has(docType))` déplacé en tête de fonction.

```
 ❯ src/lib/__tests__/derive-cell-state.test.ts (25 tests | 3 failed) 6ms
   × lot C.1 … > Test B — hors régime mais un Document existe → reste GENERATED 3ms
     → expected 'NA' to be 'GENERATED'
   × lot C.1 … > Test C — hors régime mais un scan est déposé → reste MANUAL_OK (priorité 1 intacte) 0ms
     → expected 'NA' to be 'MANUAL_OK'
   × lot C.1 … > Test D — hors régime + MANUAL_OK sans preuve → le cas dérogatoire D-01 est intact 1ms
     → expected { state: 'NA' } to deeply equal { state: 'MANUAL_OK', …(1) }

 Test Files  1 failed (1)
      Tests  3 failed | 22 passed (25)
```

Le plan en attendait deux (C et D) ; **trois** sont tombés. Le test B en bonus
prouve qu'un `Document` généré n'est pas masqué non plus. Restauré, 25/25 verts.

## Gates — sortie réelle

```
$ pnpm lint
@qualiof/shared:lint  > tsc --noEmit
@qualiof/db:lint      > tsc --noEmit
@qualiof/web:lint     > next lint
  ./src/app/app/parametres/page.tsx
  226:17  Warning: Image elements must have an alt prop … jsx-a11y/alt-text
  ./src/components/diagnostic-r1/use-autosave.ts
  51:38  Warning: The ref value 'timers.current' will likely have changed … react-hooks/exhaustive-deps

 Tasks:    3 successful, 3 total
```

Les deux `Warning` sont **préexistants** et portent sur des fichiers non touchés
par ce lot. Hors périmètre, non corrigés.

```
$ pnpm test
@qualiof/web:test:  Test Files  258 passed (258)
@qualiof/web:test:       Tests  2414 passed | 2 skipped (2416)

 Tasks:    3 successful, 3 total
```

Il n'y a **pas** de script `typecheck` dans ce dépôt : le `lint` de `@qualiof/db`
et `@qualiof/shared` EST un `tsc --noEmit`.

## Contrôles ciblés du plan

| Contrôle | Résultat |
|---|---|
| `requiredDocs` n'a pas bougé (lignes de données) | ✅ aucune ligne modifiée — seul le mot apparaît, dans un commentaire |
| La migration est additive et rien d'autre | ✅ `CREATE TYPE` + 3 `ADD COLUMN` ; `grep -E "DROP\|NOT NULL\|UPDATE "` → vide |
| Aucun `db push` : schéma et `migrations/` racontent la même histoire | ✅ `git status --short packages/db/prisma/` vide, et `check:schema` rend « Aucune dérive » |
| Le module de régime est pur | ✅ `grep -nE "prisma\|@qualiof/db\|fetch\(\|async "` → vide |

## Périmètre — ce qui n'a délibérément pas été fait

- `sendForSignature`, l'UI d'envoi, le webhook, les emails, le cron `signature-sync` : **lots C.2 et C.3**.
- **La page session n'est pas câblée** sur ces colonnes, et ce n'est pas un oubli (cf. ci-dessous).
- `AGEFICE_ONLY` dans `lib/sessions/participant-phase-items.ts` : même raison.
- `buildMatrixData` ne propage pas le nouveau paramètre : ce helper n'a pas de
  source de régime par participant, lui en inventer une ferait un deuxième chemin.
- `requiredDocs`, la spec et `docs/rgpd/` : non touchés.

## La ligne à reprendre en C.2

**Réconcilier `docTypesHorsRegime` avec la règle élargie `isAgefice` (BUG-11)
avant de câbler la matrice et le bouton d'envoi.**

La page session (`app/app/sessions/[id]/page.tsx`, L. 425-436) dérive aujourd'hui
`isAgefice` par une règle élargie : sponsor AGEFICE **ou** `LegalLink` `EI_SELF`
**ou** une autre organisation rattachée en AGEFICE. C'est le cas Florent
HAUSSWIRTH — sponsor OPCO_EP, mais auto-entrepreneur AGEFICE en parallèle.
Piloter la matrice par le seul `sponsorOrg.opcoCode` ferait passer sa cellule
AGEFICE en `NA` et **supprimerait son dossier de l'écran**.

C.1 livre la **capacité** (`docTypesHorsRegime`), pas le câblage. Trancher
« régime du financeur » vs « double casquette » est une décision à part entière,
à prendre avec le bouton d'envoi sous les yeux.

## Reste ouvert

1. **Appliquer la migration sur `qualiof_dev`** — bloqué par la dérive entre
   worktrees (`files-chaine`), pas par ce lot. Sur Supabase, elle partira
   normalement avec le merge.
2. **Dérive de la base locale partagée** : sept worktrees, une seule base
   `qualiof_dev`. Tout `prisma migrate dev` lancé depuis n'importe lequel d'entre
   eux proposera désormais un reset. À arbitrer une fois (une base par worktree,
   ou synchronisation des migrations).
3. **`apps/web/src/lib/derive-cell-state.ts` n'est pas conforme Prettier** avant
   ce lot (3 `return` à plus de 100 colonnes). Constaté, **non corrigé** : hors
   périmètre, et le plan demandait explicitement de ne rien déplacer dans ce
   fichier. Le reformatage automatique a été annulé pour garder le diff minimal.

## Commits

| Hash | Message |
|---|---|
| `71034a8` | `test(signature-C1)` — six tests nommés gardent « qui signe quoi » par financeur |
| `3db98c3` | `feat(signature-C1)` — « qui signe quoi » devient une donnée du catalogue financeur |
| `74a31b4` | `test(signature-C1)` — le moteur de régime doit lire la donnée, pas un code financeur |
| `435fc66` | `feat(signature-C1)` — un module pur répond « quelles pièces, quel rôle, quelle cible » |
| `aff2e26` | `test(signature-C1)` — un câblage croisé de `COLONNE_PAR_DOCTYPE` devait rester visible |
| `43e8aaa` | `test(signature-C1)` — une pièce hors régime doit rendre NA, pas MISSING |
| `03e31c6` | `feat(signature-C1)` — la matrice sait dire NA pour une pièce hors régime |
