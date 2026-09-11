---
quick_id: 260911-kwf
phase: quick-260911-kwf
plan: "02"
slug: pieds-de-page-deroules
branch: fix/260911-pieds-de-page-deroules
subsystem: extraction-catalogue
tags: [extraction, drive, qualiopi, composition, empreinte, icloud, chemins]
requires:
  - packages/db/scripts/lib/mentions-organisme.ts
  - packages/db/scripts/data/drive-programmes-catalog.json
provides:
  - "TITRES_GABARIT + estTitreGabarit — la règle STRUCTURELLE : un titre de pied de document ne part qu'avec son bloc"
  - "le départage d'une égalité de score : preuve > piste, confiance, vocabulaire du besoin, PUIS l'alphabet"
  - "ProposalFingerprintInput.moduleMaterial — l'empreinte voit la matière rendue des modules"
  - "packages/db/scripts/lib/corpus-local.ts — premierEmplacementPorteur(), le seul endroit qui nomme l'ancien ~/Documents"
  - "apps/web/src/lib/__tests__/chemins-en-dur.test.ts — le garde des chemins en dur, vérifié par mutation"
affects:
  - "packages/db/scripts/extract-drive-catalog.ts"
  - "packages/db/scripts/import-diag-catalog.ts"
  - "apps/web/src/server/actions/propositions.ts"
  - "scripts/launch-qualiof.sh"
  - "scripts/stop-qualiof.sh"
tech-stack:
  added: []
  patterns:
    - "deux listes FERMÉES, deux mécanismes : des PHRASES reconnues ligne à ligne, des TITRES reconnus structurellement"
    - "un titre de gabarit ne part que si tout ce qu'il introduit est du boilerplate — sinon il reste"
    - "un champ d'empreinte REQUIS plutôt qu'optionnel : c'est tsc qui force les appelants"
    - "chercher le premier emplacement qui PORTE la matière, jamais le premier qui EXISTE"
    - "un garde qui se garde lui-même : recensement non vide + exceptions non périmées + mutation vérifiée"
key-files:
  created:
    - packages/db/scripts/lib/corpus-local.ts
    - packages/db/scripts/__tests__/corpus-local.test.ts
    - apps/web/src/lib/__tests__/chemins-en-dur.test.ts
  modified:
    - packages/db/scripts/lib/mentions-organisme.ts
    - packages/db/scripts/__tests__/mentions-organisme.test.ts
    - packages/db/scripts/data/drive-programmes-catalog.json
    - packages/db/scripts/extract-drive-catalog.ts
    - packages/db/scripts/import-diag-catalog.ts
    - apps/web/src/lib/proposition/module-matcher.ts
    - apps/web/src/lib/proposition/fingerprint.ts
    - apps/web/src/server/actions/propositions.ts
    - scripts/launch-qualiof.sh
    - scripts/stop-qualiof.sh
    - .claude/commands/quick.md
    - .gitignore
decisions:
  - "Le bloc de pied de document part ENTIER : 4 lignes retirées de drive:058#6, pas 2. Un titre de section orphelin suivi d'une phrase isolée dans un déroulé qui part chez un financeur serait un défaut créé sciemment."
  - "La règle est généralisée, pas le cas : un titre de gabarit est retiré quand tout ce qu'il introduit est du boilerplate, et RESTE dès qu'il introduit de la pédagogie."
  - "Liste FERMÉE pour les titres aussi, jamais « ligne en majuscules » : 17 lignes Faros en capitales sont du contenu légitime."
  - "« La formation se déroule en présentiel. » est une MENTION : une modalité appartient aux mentions du programme, pas à un déroulé."
  - "« Remise des attestations » RESTE — un vrai moment de fin de session, pas de l'administratif d'organisme (décision consignée, verrouillée par test)."
  - "Le départage d'une égalité de score essaie preuve > piste, confiance forte > faible, puis le vocabulaire propre du besoin. L'alphabet ne tranche qu'en dernier recours."
  - "La règle de départage n'est PAS bâtie sur le préfixe de domaine des signaux : 42 des 132 signaux n'en ont pas."
  - "moduleMaterial est un champ REQUIS de l'empreinte : un champ optionnel serait un garde-fou qui ne garde pas."
metrics:
  duration: "~2 h"
  tasks: 4
  commits: 13
  tests_added: 94
  completed: "2026-09-11"
---

# Quick 260911-kwf — Lot 1 bis : les arbitrages du 11/09 appliqués

Quatre chantiers indépendants : le bloc de pied de document de `drive:058#6` quitte
le déroulé **avec son titre** et la règle est généralisée ; une égalité de score ne
se tranche plus à l'alphabet ; l'empreinte de proposition voit enfin la matière des
modules ; trois scripts cessent de mentir sur leur emplacement et un garde arrête
le prochain.

---

# ⚠ À LIRE EN PREMIER — ce qui dépasse la lettre de l'arbitrage

## 1. Quatre lignes retirées, pas deux — et c'est un élargissement assumé

Tu avais nommé deux phrases de `drive:058#6`. **J'en ai retiré quatre.** Les quatre
forment un seul bloc contigu en fin de module, introduit par son propre titre :

```
6. - LES MOYENS PÉDAGOGIQUES ET TECHNIQUES        ← le TITRE de la section
7. - La formation se déroule en présentiel.        ← une modalité
8. - Les formateurs proposeront des mises en situation…   ← nommée par toi
9. - Un livret de formation sera remis…                   ← nommée par toi
```

N'en retirer que deux laissait un **titre de section orphelin** suivi d'une phrase
isolée, dans un déroulé qui part chez un financeur : un défaut créé sciemment.
Tu as validé le motif en cours de route et demandé la généralisation.

Les 5 puces restantes sont de la vraie pédagogie, **« QUIZZ Final : (0h30) »
comprise** — c'est une activité de séance avec sa durée, elle n'est dans aucune
forme canonique. Le module garde 5 lignes : **pas de 5ᵉ fantôme**.

## 2. Trois AUTRES modules perdent une ligne — conséquence d'un ensemble fermé

Un ensemble fermé agit sur tout le corpus. « La formation se déroule en
présentiel. » n'était **pas** propre à `drive:058#6` : elle ouvre le même bloc
avalé dans trois autres modules.

| module | avant | après | ce qu'il perd |
|---|---|---|---|
| `drive:058#6` | 9 lignes | **5** | les 4 lignes du bloc |
| `drive:067#1` | 32 lignes | **31** | la seule ligne de modalité |
| `drive:068#1` | 41 lignes | **40** | idem |
| `drive:069#1` | 41 lignes | **40** | idem |

Total : **7 lignes retirées**, pas 4. Aucun de ces modules ne se vide.

**Ce que j'ai laissé dans ces trois modules, et qui attend ton arbitrage** : les
5 autres lignes du même bloc, qui relèvent exactement du même défaut mais que tu
n'as pas nommées — et dont deux sont discutablement de la pédagogie :

- « Formation interactive orientée pratique. »
- « Présentation visuelle sur support Canva. »
- « Support pédagogique numérique remis à chaque participant. »
- « Formation orientée pilotage et prise de décision managériale. »
- « Démonstrations en direct sur un outil d'intelligence artificielle. »
- « Exercices guidés pas à pas sur la rédaction de prompts. »

Les retirer aurait été élargir le périmètre tout seul. Elles sont **laissées et
signalées**, verrouillées par un `it()` qui nomme la limite.

## 3. La règle généralisée ne change RIEN d'autre aujourd'hui

Relevé sur le corpus entier, aux trois états de l'instantané (avant le lot 1, après
le lot 1, maintenant) : **la seule occurrence d'un titre de gabarit dans un déroulé
était celle de `drive:058#6`**. Ta re-passe des 52 modules disait « 0 titre
orphelin » ; le relevé le confirme par une autre voie.

**La régénération après généralisation rend un instantané identique au bit près,
hors `extractedAt`** — je ne l'ai donc pas recommité, pour ne pas noyer la revue
dans une ligne d'horodatage. La règle sert pour demain : le jour où un nouveau
document du Drive ramènera son pied de page.

## 4. Le parcours de DIAG-0001 n'a PAS bougé

Vérifié **trois fois**, après chacune des tâches ①, ② et ③ :

| contrôle | valeur |
|---|---|
| demi-journées | **6** |
| heures conventionnées | **48 h** |
| coût pédagogique | **8064.00 € HT** |
| Σ devis = Σ proposition | **✅ au centime** |
| `BIB-D034#3` en demi-journée 5 | **oui** |
| `.planning/DIAG-0001-programme-compose.md` | **aucun diff, au bit près** |
| 6 programmes sources | BIB-D017, D034, D037, D008, D047, D012 |

Le départage n'a rien changé, et c'est cohérent : depuis le lot 1 les scores ne sont
plus à égalité (`BIB-D034#3` = 10, `BIB-D017#3` = 8). **On ne force rien.**

## 5. PROP-0001 s'affichera « à régénérer » — c'est correct et attendu

L'empreinte couvre maintenant la matière des modules, et le lot 1 a changé
`contentMd` sur 52 modules. L'empreinte de PROP-0001 change donc. C'est le
comportement voulu : brouillon jamais envoyé, sans PDF ni produit composé, et son
déroulé a réellement changé. **Rien ne se régénère tout seul** : aucun chemin de
régénération n'a été touché, le seul effet est que `isStale` passe à vrai et que le
bandeau existant se lève.

---

# Les quatre tâches, et ce qu'elles ont produit

## ① Le bloc de pied de document — deux listes fermées, deux mécanismes

`packages/db/scripts/lib/mentions-organisme.ts` porte désormais :

- **`MENTIONS_CANONIQUES` (10 formes)** — des PHRASES, reconnues ligne à ligne.
  Les 3 phrases du bloc y entrent, dont la modalité, sur ton motif : « c'est une
  modalité, elle appartient aux mentions du programme, pas à un déroulé ».
- **`TITRES_GABARIT` (24 formes)** + `estTitreGabarit()` — des TITRES, reconnus
  **structurellement** : un titre est retiré quand tout ce qui le suit, jusqu'au
  titre suivant ou à la fin du module, est du boilerplate. **Suivi de vraie
  pédagogie, il RESTE.**

Le vocabulaire des titres est **recopié** du gabarit que l'extraction reconnaît
déjà (`BODY_END` + le 4ᵉ motif de `BODY_START`). **Ni `BODY_START` ni `BODY_END`
n'a été touché.**

Le commentaire consigne l'origine du défaut : `moyens pedagogiques et techniques`
est un motif de `BODY_START` et n'est dans aucun motif de `BODY_END` ; sur
`drive:058` le corps a démarré plus tôt, donc ce titre de pied de document tombe
*à l'intérieur* du corps et rien ne l'arrête.

**⛔ Le danger écarté, et verrouillé par 17 tests** : une heuristique « ligne en
majuscules = titre de gabarit » détruirait le contenu Faros. `JEAN-GUY` (29×),
`LAURENT` (28×), `APPRENANT` (17×), `SOURCES` (4×), `LIVRABLE 001`, `PROMESSE
APPRENANT`, `RÉSULTAT OBSERVABLE`, `DÉCISION DE DIRECTION PÉDAGOGIQUE`,
`SA-ADM-M001`… sont du contenu légitime. `faros:SA-ADM-M001#1` ressort intact, ses
855 lignes comptées.

**L'instantané** : 76 programmes / 402 modules, 3117 → **3110** lignes de déroulé,
**64 warnings inchangés**, 0 titre modifié, 0 module disparu, **33 déroulés vides
(pas 34)**.

**L'import LOCAL** (`import:drive-catalog:local -- --apply`, base `qualiof_dev`) :
0 créé · 74 mis à jour · 2 ignorés. `drive:047#20` toujours en **contenu
conservé** — la non-régression exigée. Vérification en base, en lecture seule :
`drive:058#6` = 5 lignes, `drive:067/068/069#1` = 31/40/40, les 4 fantômes vides,
`drive:047#20` = 8 lignes (ton texte, protégé).

## ② Le départage — six clés, l'alphabet en dernier

`module-matcher.ts`, le comparateur :

1. le score
2. **`matchSource`** : `signaux` avant `lexique` — une preuve devant une piste
3. **`confidence`** : `forte` avant `faible`
4. **le vocabulaire PROPRE du besoin** : un `matchedTerm` présent dans le `label`
   du besoin passe devant du vocabulaire périphérique
5. `isFoundation`
6. **l'alphabet — dernier recours, et commenté comme tel**

Pourquoi pas littéralement « même famille / même chapitre » : `family` est
grossière et déjà filtrée en amont ; un module ne porte aucun chapitre ; et **42
des 132 signaux n'ont pas de préfixe de domaine** (28 valeurs libres) — une règle
bâtie dessus casserait. Les chiffres sont dans le code pour empêcher qu'on
« l'améliore » en repartant du préfixe.

La clé 4 est **stable** : elle ne dépend pas de la taille de la bibliothèque,
contrairement au repesage qui a fait bouger la demi-journée 5 au lot 1.

**Les tests prouvent, ils ne décorent pas.** 5 tests, scores **assertés** pour que
l'égalité soit prouvée :

| test | ce qu'il prouve |
|---|---|
| D017#3 / D034#3 à 5 contre 5 | le cas réel — **mais il passait déjà** sur le code cassé |
| **variante à titres échangés** | c'est bien le vocabulaire qui tranche, pas l'alphabet |
| preuve > piste | `signaux` devant `lexique`, alors que la piste est socle ET première à l'alphabet |
| forte > faible | sur 40 modules, le seul moyen d'obtenir un poids < 1 |
| l'alphabet en dernier | interdit de supprimer le repli |

**Aucun test existant « réparé »** : les 10 fichiers de `src/lib/proposition`
passent sans modification d'attente.

## ③ L'empreinte voit le déroulé — elle prévient, elle ne régénère rien

Le trou, étroit et réel : les axes et les prix sont **persistés** et le chemin de
lecture les respecte, mais le **texte du déroulé** de chaque module est relu **en
direct** à chaque rendu (`buildWorkspace` → `moduleContent`). L'empreinte ne le
couvrait pas.

- `ProposalFingerprintInput.moduleMaterial` est **REQUIS** — un champ optionnel
  serait un garde-fou qui ne garde pas. C'est `tsc` qui force les trois appels.
- `moduleMaterialOf(library)` aux **trois** appels (création, `buildWorkspace`,
  `persistAndReprint`), vérifié par un compte à 3 et par `tsc`.
- la clé porte l'identifiant de l'**axe** et les chaînes sont triées : insensible à
  une permutation **dans** un axe, sensible à un déplacement **entre** axes.
- titre et durée sont pris **LIVE**, pas depuis l'axe : les valeurs persistées ne
  bougent jamais seules.
- le `contentMd` est **haché** (SHA-256), pas recopié dans le payload.
- un module du catalogue qu'aucun axe ne retient **n'entre pas** dans l'empreinte —
  sinon le moindre import lèverait le bandeau partout.

**⛔ Aucun chemin de régénération touché** : ni `generateComposedProduct`, ni la
génération de PDF, ni un déclenchement automatique.

## ④ Les chemins — et le garde qui arrête le prochain

`packages/db/scripts/lib/corpus-local.ts` (nouveau) : `premierEmplacementPorteur()`
cherche le premier emplacement qui **porte** la matière, avec un lecteur
**injectable** — c'est ce qui permet de tester « existe mais vide » et
« illisible » sans toucher au disque. `candidatsNxtCoach()` : `~/Projects` avant
`~/Documents`. **C'est le seul endroit du dépôt qui nomme encore l'ancien
emplacement**, comme second candidat délibéré.

- `trouverFaros()` refactoré dessus, **comportement constant** : régénération
  rejouée, 76/402, diff vide hors `extractedAt`.
- `import-diag-catalog.ts` retrouve la matière Agent Incomparable sous
  `~/Projects/nxt-coach/Formation Faros/LIVRAISON_PARCOURS` — **10 entrées**.
  Vérifié par un `tsx` de **lecture seule** ; `import:diag-catalog` n'a **jamais**
  été lancé, ni en prod ni en local.
- `launch-qualiof.sh` / `stop-qualiof.sh` dérivent `PROJECT_DIR` de l'emplacement
  du script (donc marchent depuis n'importe quel worktree), échouent en 1 avec un
  message clair + notification sans `package.json`, et portent
  `QUALIOF_CHECK_ONLY=1` qui les rend testables sans démarrer Docker. La commande
  AppleScript de la l.40 portait **aussi** le chemin en dur : elle prend
  `$PROJECT_DIR`, quoting vérifié par simulation du heredoc.

```
$ QUALIOF_CHECK_ONLY=1 bash scripts/launch-qualiof.sh
/Users/laurentmarx/Projects/CRM Next gen/files-chaine

$ QUALIOF_CHECK_ONLY=1 bash <copie hors dépôt>/scripts/launch-qualiof.sh
QualiOF : aucun package.json dans …/faux-depot — le dépôt a bougé ou le script a été copié hors du dépôt.
code de sortie : 1
```

### La mutation du garde — les deux sorties

**Avec** `packages/db/scripts/zz-mutation-chemin.ts` (indexé par `git add -N`) :

```
AssertionError: Ces scripts portent un chemin /Users/… ou Documents/{CRM Next gen,nxt-coach} en dur.
Dériver le chemin de l'emplacement du script, ou passer par premierEmplacementPorteur() —
pas l'ajouter aux exceptions :
  packages/db/scripts/zz-mutation-chemin.ts
 Tests  1 failed | 3 passed (4)
```

**Après** `git rm --cached` + suppression du fichier :

```
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

Le garde garde. Et il a **attrapé mon propre commentaire** dans les deux `.sh`, qui
recopiait l'ancien chemin « pour expliquer » : il a raison, un chemin mort recopié
finit par être relu comme une consigne. Le commentaire a été réécrit sans le
chemin.

### ⑤ Les deux `.app` — CONSTAT, rien écrit hors du dépôt

Les deux bundles appellent les scripts par leur **ancien chemin**, qui n'existe
plus. Ils vivent dans `/Applications`, **hors du dépôt, donc hors de toute revue
par `git diff`** — c'est pour ça qu'on ne les corrige pas ici et qu'on te remet la
main.

**À jouer APRÈS le merge** (avant, `files/scripts/launch-qualiof.sh` porte encore
l'ancien `PROJECT_DIR` en dur et le repointage ne réparerait rien) :

```bash
# 1. Sauvegarde des deux scripts d'origine
cp "/Applications/QualiOF.app/Contents/Resources/Scripts/main.scpt" ~/Desktop/QualiOF-main.scpt.bak
cp "/Applications/QualiOF Quit.app/Contents/Resources/Scripts/main.scpt" ~/Desktop/QualiOF-Quit-main.scpt.bak

# 2. Recompilation avec le nouveau chemin
osacompile -o /tmp/qualiof-launch.scpt -e 'do shell script "/Users/laurentmarx/Projects/CRM\\ Next\\ gen/files/scripts/launch-qualiof.sh > /tmp/qualiof-launch.log 2>&1 &"'
osacompile -o /tmp/qualiof-stop.scpt   -e 'do shell script "/Users/laurentmarx/Projects/CRM\\ Next\\ gen/files/scripts/stop-qualiof.sh > /tmp/qualiof-stop.log 2>&1"'

# 3. Mise en place — on remplace le SCRIPT dans le bundle, pas le bundle : l'icône et le nom sont conservés
cp /tmp/qualiof-launch.scpt "/Applications/QualiOF.app/Contents/Resources/Scripts/main.scpt"
cp /tmp/qualiof-stop.scpt   "/Applications/QualiOF Quit.app/Contents/Resources/Scripts/main.scpt"

# 4. Vérification — doit afficher Projects, et plus Documents
osadecompile "/Applications/QualiOF.app/Contents/Resources/Scripts/main.scpt"
osadecompile "/Applications/QualiOF Quit.app/Contents/Resources/Scripts/main.scpt"
```

Les étapes 2 et 4 ont été jouées dans un répertoire temporaire : `osadecompile`
rend **exactement** la ligne d'origine avec `Documents` remplacé par `Projects`,
double antislash compris. **Les `.app` réels n'ont pas été touchés.**

Si macOS refuse l'écriture dans `/Applications` (Gatekeeper / permissions), le
repli est de garder les `.app` tels quels et de lancer
`scripts/launch-qualiof.sh` directement depuis le dépôt : il est auto-localisant
depuis ce lot.

## ⑤ bis — la leçon de test consignée

`.claude/commands/quick.md` porte une nouvelle section **§4 ter**, à côté de la
leçon du garde de couverture : **« un test qui n'a jamais rougi n'est pas un test,
c'est une décoration »**, avec le cas du jour — l'assertion naïve sur D017#3 qui
passait déjà sur le code cassé — et la règle qui en découle : exécuter tout test de
contrat contre le code non corrigé, et asserter une égalité au lieu de la supposer.

---

# Gates

| gate | référence (après lot 1) | après ce lot |
|---|---|---|
| `pnpm lint` | exit 0 | **exit 0** |
| `pnpm --filter @qualiof/web exec tsc --noEmit` | exit 0 | **exit 0** |
| `pnpm test` | 3039 passés / 2 ignorés · 306 fichiers | **3133 passés / 2 ignorés · 308 fichiers** |

Détail : 202 shared (inchangé) + **160** db (84 avant) + **2771** web (2753 avant).

**+94 tests, exactement le nombre ajouté** :

| fichier | avant | après | Δ |
|---|---|---|---|
| `mentions-organisme.test.ts` | 74 | 141 | **+67** |
| `corpus-local.test.ts` | — | 9 | **+9** |
| `fingerprint.test.ts` | 7 | 16 | **+9** |
| `module-matcher.test.ts` | 29 | 34 | **+5** |
| `chemins-en-dur.test.ts` | — | 4 | **+4** |

**Aucun test existant n'est tombé.** Les 2 ignorés sont les mêmes qu'avant.

---

# Déviations du plan

## [Règle 1 — Bug dans le plan] Le verify du plan attendait « 4 modules vides », la donnée en porte 33

Le `verify` automatisé de la tâche ① exigeait `vides === 4`. Mesuré : **33 modules**
ont un `contentMd` vide dans l'instantané — 4 vidés par le filtre au lot 1, et
**29 qui n'ont jamais eu de déroulé au Drive** (`drive:047#*`, `drive:061#*`…).
Le plan confondait « vidés par le filtre » et « vides ». Le test porte donc le bon
invariant : **33, et `drive:058#6` n'est pas dedans** — c'est ce qui attrape le
« 5ᵉ fantôme » qu'on voulait interdire.

## [Règle 1] « La formation se déroule en présentiel. » n'était pas propre à drive:058#6

Relevé avant d'écrire une ligne : la forme apparaît dans **4 modules**, pas 1. Le
plan l'annonçait unique. Conséquence assumée et chiffrée au §2 ci-dessus.

## [Règle 2 — Fonctionnalité critique manquante] Le cache tsc des scripts sortait de git à chaque lint

`apps/web/tsconfig.scripts.tsbuildinfo` était **suivi par git** : le motif de
`.gitignore` ne couvrait que `tsconfig.tsbuildinfo`. Il se salissait à **chaque
`pnpm lint`** — donc à chaque passage de gate — et aurait pollué tous les diffs et
chaque fusion, sur un contenu que personne ne relit. C'est exactement le défaut
corrigé le 10/09 pour `apps/web/tsconfig.tsbuildinfo`, avec un fichier de plus. Le
motif couvre maintenant `tsconfig*.tsbuildinfo` des deux côtés, et le fichier est
sorti de l'index (`git rm --cached`, il reste sur le disque).
Commit : `b92f334`.

## [Constat, pas une déviation] Le rapport d'import ne nomme plus de « déroulé vidé »

La section « Déroulés vidés » du rapport a **disparu** par rapport au lot 1, et
c'est correct : elle ne nomme que les **écritures** qui vident un contenu non vide.
Le lot 1 les a déjà vidés en base ; ce second `--apply` n'avait plus rien à vider.
C'est l'idempotence qui fonctionne. Vérifié en base, en lecture seule : les 4
fantômes sont bien à 0 ligne.

## [Relevé plus large que le plan] 26 fichiers portent un chemin en dur, pas 18

Le tableau du plan en listait 18. Le balayage du garde (`git ls-files`, motif
`/Users/<nom>` **ou** `Documents/{CRM Next gen,nxt-coach}`) en trouve **26**, dont
8 scripts `apps/web` pointant le Drive Google par un chemin absolu — des one-shots
déjà joués eux aussi. La liste d'exceptions en porte **23** après correction des 3
fichiers vivants, chacune vérifiée **non périmée** par un test dédié.

## Piège d'environnement (rappel, tenu)

Tout `tsx scripts/…` hors enveloppe `:local` lit le `.env` du dépôt, **qui pointe
la PROD Supabase**. Les deux vérifications de lecture seule de ce lot sont passées
par `dotenv -e ../../.env.local -e ../../.env --`, et les fichiers jetables ont été
supprimés avant les gates.

---

# Interdits du plan — tenus

- ⛔ **titres de modules** : aucun touché (0 titre modifié dans le diff de
  l'instantané).
- ⛔ **découpage** : aucun module découpé, les 4 fantômes compris.
- ⛔ **contenu pédagogique** : aucune ligne écrite. Ce lot ne fait que retirer.
- ⛔ **régénération automatique** : aucune proposition, aucun PDF, aucun produit
  composé touché. L'empreinte prévient, point.
- ⛔ **demi-journée 5** : aucun signal, aucun score, aucun poids, aucun module
  touché pour la forcer. `BIB-D034#3` y reste de lui-même.
- ⛔ **`BODY_START` / `BODY_END`** : pas une ligne. Le vocabulaire des titres est
  recopié, pas déplacé.
- ⛔ **prod** : `import:drive-catalog` et `import:diag-catalog` n'ont **jamais** été
  lancés sans `:local` — `import:diag-catalog` n'a pas été lancé du tout. Aucun
  merge, aucun push, aucune écriture hors du dépôt.

---

# Commits (branche `fix/260911-pieds-de-page-deroules`, PR #60)

| commit | objet |
|---|---|
| `92ae8c9` | `test(pieds-de-page-deroules):` les moyens pédagogiques de drive:058#6 — RED (24 échecs) |
| `4a24cab` | `chore(pieds-de-page-deroules):` instantané régénéré — 7 lignes, 4 modules |
| `35e4fcd` | `fix(pieds-de-page-deroules):` le filtre + les décisions consignées |
| `fd5a9ec` | `test(departage-modules):` l'égalité ne se tranche pas à l'alphabet — RED (3 échecs) |
| `b16bd62` | `test(pieds-de-page-deroules):` un titre ne part qu'avec son bloc — RED (31 échecs) |
| `468d97d` | `fix(pieds-de-page-deroules):` la règle structurelle + les 24 titres de gabarit |
| `84c1e00` | `docs(quick):` un test qui n'a jamais rougi n'est pas un test |
| `df5d450` | `fix(departage-modules):` les six clés, l'alphabet en dernier |
| `00f10b1` | `test(empreinte-proposition):` le déroulé entre dans l'empreinte — RED |
| `e5e8bf2` | `fix(empreinte-proposition):` `moduleMaterial` requis, les 3 appels le fournissent |
| `28156d7` | `test(chemins-icloud):` le corpus local et le garde — RED (2 échecs) |
| `f90ca0e` | `fix(chemins-icloud):` les scripts dérivent leur emplacement, le garde arrête le prochain |
| `b92f334` | `chore(git):` le cache tsc des scripts sort de git |

---

# Compte rendu en trois lignes

1. **Ce qui change pour toi** : les déroulés remis à un financeur ne portent plus
   les moyens pédagogiques de l'organisme, **ni leur titre de section** ; une
   égalité de score se tranche désormais sur le vocabulaire du besoin, plus sur
   l'alphabet ; une proposition dont le déroulé a bougé le **dit** au lieu de se
   taire ; le lanceur de bureau et les deux imports ne mentent plus sur leur
   emplacement, et un garde arrête le prochain chemin en dur.
2. **Ce qui est mis de côté** : les 5 lignes de moyens pédagogiques voisines de
   `drive:067/068/069#1` et les 3 lignes mixtes → **lot 2** ; les titres de modules
   → lot 2 ; le découpage des 4 fantômes → lot 3 ; les 23 chemins en dur de scripts
   jetables (listés, datés, non réécrits) ; le repointage des deux `.app` (hors
   dépôt, **après** le merge, commande ci-dessus).
3. **Ce qu'il reste à vérifier à la main** : le `git diff` de l'instantané
   (`4a24cab` — 7 lignes, 4 modules, rien d'autre), le programme composé de
   DIAG-0001 (demi-journée 5 inchangée), et **l'arbitrage sur les 5 lignes
   voisines** du §2.

---

## Self-Check: PASSED

Vérifié le 11/09/2026, rien de déclaré qui n'existe :

- les 3 fichiers créés existent et sont suivis par git (`corpus-local.ts`,
  `corpus-local.test.ts`, `chemins-en-dur.test.ts`) ;
- les 13 commits existent dans l'historique de la branche ;
- l'instantané (76/402, 5 puces sur `drive:058#6`, 33 vides, 64 warnings) et le
  programme composé (6 demi-journées, 8064.00 € HT, `BIB-D034#3` en demi-journée 5)
  sont conformes à ce qui est écrit ci-dessus, mesurés et non supposés ;
- les fichiers jetables (`zz-mutation-chemin.ts`, les scripts de vérification) ont
  été supprimés avant les gates ; l'arbre ne porte que ce compte rendu et le plan ;
- **aucun stub, aucun placeholder introduit** : ce lot retire des lignes, ajoute
  des règles et des tests. Il n'écrit aucun contenu pédagogique.
