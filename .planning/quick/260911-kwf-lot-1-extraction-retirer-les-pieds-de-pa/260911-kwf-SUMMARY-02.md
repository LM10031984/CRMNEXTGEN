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
  - "la RÈGLE : un déroulé de module porte des étapes d'ANIMATION, pas des mentions d'organisme (18 formes fermées)"
  - "TITRES_GABARIT + estTitreGabarit — le COROLLAIRE : un titre ne part qu'avec son bloc"
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
  - ".planning/specs/2026-09-01-chaine-diagnostic-proposition.md"
tech-stack:
  added: []
  patterns:
    - "un déroulé porte des étapes d'ANIMATION : le test d'une ligne est « est-ce que ça se FAIT, à un moment de la séance ? »"
    - "deux listes FERMÉES, deux mécanismes : des PHRASES ligne à ligne, des TITRES structurellement"
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
    - .planning/specs/2026-09-01-chaine-diagnostic-proposition.md
    - .planning/STATE.md
    - .gitignore
decisions:
  - "LA RÈGLE, formulation finale : un déroulé de module porte des ÉTAPES D'ANIMATION, pas des mentions d'organisme. Le titre de section orphelin n'est qu'un COROLLAIRE."
  - "Le test d'une ligne : est-ce que ça se FAIT, à un moment de la séance ? « Mise en situation » se fait, « Présentation visuelle sur support Canva » se constate."
  - "22 lignes retirées dans 4 modules : les 4 du pied de document de drive:058#6, et les 6 de la tête de déroulé de drive:067#1, drive:068#1 et drive:069#1."
  - "Liste FERMÉE pour les titres aussi, jamais « ligne en majuscules » : 17 lignes Faros en capitales sont du contenu légitime."
  - "« Remise des attestations » RESTE — un vrai moment de fin de session, pas de l'administratif d'organisme."
  - "Les 3 lignes MIXTES sont le seul report au lot 2."
  - "Le départage d'une égalité de score essaie preuve > piste, confiance forte > faible, puis le vocabulaire propre du besoin. L'alphabet ne tranche qu'en dernier recours."
  - "La règle de départage n'est PAS bâtie sur le préfixe de domaine des signaux : 42 des 132 signaux n'en ont pas."
  - "moduleMaterial est un champ REQUIS de l'empreinte : un champ optionnel serait un garde-fou qui ne garde pas."
  - "D-29 OUVERTE : faut-il un champ « moyens pédagogiques » au niveau du PRODUIT ? Décision de modèle, elle attend Laurent."
metrics:
  duration: "~2 h 45"
  tasks: 4
  commits: 18
  tests_added: 113
  completed: "2026-09-11"
---

# Quick 260911-kwf — Lot 1 bis : les arbitrages du 11/09 appliqués

Quatre chantiers indépendants : **un déroulé de module porte des étapes
d'animation, pas des mentions d'organisme** — 22 lignes partent dans 4 modules ;
une égalité de score ne se tranche plus à l'alphabet ; l'empreinte de proposition
voit enfin la matière des modules ; trois scripts cessent de mentir sur leur
emplacement et un garde arrête le prochain.

---

# ⚠ À LIRE EN PREMIER

## 1. LA RÈGLE a changé de formulation trois fois — c'est la troisième qui fait foi

> **Un déroulé de module porte des ÉTAPES D'ANIMATION, pas des mentions
> d'organisme.**

Les deux premières formulations (« ces deux phrases-là », puis « le bloc contigu
part entier ») n'en étaient que des cas particuliers. Le **titre de section
orphelin est un COROLLAIRE** : si on retire ce qu'un titre introduisait, le titre
part avec — sinon on crée sciemment un défaut. Ce n'est pas la règle.

**Le test qui tranche une ligne**, consigné dans le code : *est-ce que ça se fait, à
un moment de la séance ?* « Mise en situation : répondre aux objections courantes »
**se fait**. « Présentation visuelle sur support Canva. » **se constate** — c'est un
moyen de l'organisme, qui a sa rubrique ailleurs dans le programme composé.

## 2. 22 lignes retirées dans 4 modules — le texte exact est conservé au §B

| module | programme | avant | après | lignes retirées |
|---|---|---|---|---|
| `drive:058#6` | Booster vendeur | 9 | **5** | 4 (pied de document) |
| `drive:067#1` | Débuter avec l'IA | 32 | **26** | 6 (tête de déroulé) |
| `drive:068#1` | Management et performance augmentés par l'IA | 41 | **35** | 6 |
| `drive:069#1` | IA générative en étude notariale | 41 | **35** | 6 |

`MENTIONS_CANONIQUES` passe de 7 à **18 formes** ; `TITRES_GABARIT` en porte **24**.
Lignes de déroulé du corpus : 3117 → **3095**. **33 déroulés vides inchangés** (pas
34, pas 37) : **aucun module ne s'est vidé**. 64 warnings inchangés, 0 titre modifié,
0 module disparu, 76 programmes / 402 modules.

Sur `drive:058#6`, les 5 puces restantes sont de la vraie pédagogie, **« QUIZZ
Final : (0h30) » comprise** — une activité de séance avec sa durée. Sur les trois
autres, **la première puce est désormais « PROGRAMME DÉTAILLÉ (…) »** : c'est la
borne qui rendait le retrait sûr, tout ce qui précédait était du moyen d'organisme,
tout ce qui suit est de la séance horodatée.

## 3. Le corollaire « titre orphelin » ne change rien d'autre sur le corpus d'aujourd'hui

Relevé aux trois états de l'instantané (avant le lot 1, après le lot 1, maintenant) :
**la seule occurrence d'un titre de gabarit dans un déroulé était celle de
`drive:058#6`**. Ta re-passe des 52 modules disait « 0 orphelin » ; le relevé le
confirme par une autre voie. La règle structurelle sert donc **pour demain** : le
jour où un nouveau document du Drive ramènera son pied de page.

## 4. Le parcours de DIAG-0001 n'a PAS bougé

Vérifié **quatre fois**, après chaque étape :

| contrôle | valeur |
|---|---|
| demi-journées | **6** |
| heures conventionnées | **48 h** |
| coût pédagogique | **8064.00 € HT** |
| Σ devis = Σ proposition | **✅ au centime** |
| `BIB-D034#3` en demi-journée 5 | **oui** |
| `.planning/DIAG-0001-programme-compose.md` | **aucun diff, au bit près** |
| 6 programmes sources | BIB-D017, D034, D037, D008, D047, D012 |
| modules écartés « aucun déroulé » | **108**, inchangé |

`drive:067/068/069` ne sont pas au parcours — conforme à l'attendu.

## 5. PROP-0001 s'affichera « à régénérer » — c'est correct et attendu

L'empreinte couvre maintenant la matière des modules, et le lot 1 a changé
`contentMd` sur 52 modules. **Rien ne se régénère tout seul** : aucun chemin de
régénération n'a été touché, le seul effet est que `isStale` passe à vrai et que le
bandeau existant se lève.

## 6. D-29 est OUVERTE — et elle n'est pas implémentée

Plusieurs lignes retirées sont **spécifiques au programme** (« études de cas réels
issus du marché immobilier », « exercices guidés pas à pas sur la rédaction de
prompts ») alors que la rubrique « Moyens pédagogiques et techniques » du programme
composé se remplit **en générique depuis l'organisme**. On retire donc du spécifique
**sans point de chute**.

La question est posée en **D-29 (ouverte)** dans
`.planning/specs/2026-09-01-chaine-diagnostic-proposition.md` (section narrative
après D-28 + ligne du tableau des décisions), et référencée dans `.planning/STATE.md`
sous « Chantiers identifiés, pas encore planifiés ». **C'est une décision de modèle :
elle te revient et elle attend. Rien dans le code ne l'anticipe.**

---

# §B — Le texte exact retiré, programme par programme

Recopiable tel quel. **C'est la seule trace** si D-29 est tranchée dans le sens d'un
champ produit.

## `drive:058` — Booster vendeur : devenir incontournable auprès des vendeurs

Module `drive:058#6` « Signer + de mandats exclusifs et construire un plan
d'action » — **pied de document**, 9 → 5 puces :

```
- LES MOYENS PÉDAGOGIQUES ET TECHNIQUES
- La formation se déroule en présentiel.
- Les formateurs proposeront des mises en situation professionnelles sur les techniques de prospection, les discours et la posture ainsi que des échanges sur les pratiques actuelles.
- Un livret de formation sera remis à chaque participant en début de formation. Le formateur déroulera sa formation avec une présentation Canva projetée.
```

## `drive:067` — Débuter avec l'intelligence artificielle : les fondamentaux pour être plus efficace

Module `drive:067#1` — **tête de déroulé**, 32 → 26 puces :

```
- La formation se déroule en présentiel.
- Formation interactive orientée pratique.
- Présentation visuelle sur support Canva.
- Démonstrations en direct sur un outil d’intelligence artificielle.
- Exercices guidés pas à pas sur la rédaction de prompts.
- Support pédagogique numérique remis à chaque participant.
```

## `drive:068` — Management et performance augmentés par l'IA

Module `drive:068#1` — **tête de déroulé**, 41 → 35 puces :

```
- La formation se déroule en présentiel.
- Formation orientée pilotage et prise de décision managériale.
- Présentation visuelle sur support Canva.
- Études de cas réels issus du marché immobilier.
- Ateliers d’analyse guidés avec des outils d’intelligence artificielle.
- Support pédagogique numérique remis à chaque participant.
```

## `drive:069` — Découvrir et utiliser l'IA générative (GPT) pour améliorer la productivité en étude notariale

Module `drive:069#1` — **tête de déroulé**, 41 → 35 puces. ⚠ Le déroulé de ce
programme est **identique à celui de `drive:068`** dans le Drive (y compris le titre
de module, « Management et performance augmentés par l'IA ») : c'est un constat
d'extraction, pas une conséquence de ce lot, et il vaut d'être vérifié à la source.

```
- La formation se déroule en présentiel.
- Formation orientée pilotage et prise de décision managériale.
- Présentation visuelle sur support Canva.
- Études de cas réels issus du marché immobilier.
- Ateliers d’analyse guidés avec des outils d’intelligence artificielle.
- Support pédagogique numérique remis à chaque participant.
```

### Les 8 formes distinctes, avec leurs occurrences

| occurrences | forme |
|---|---|
| 3× | Présentation visuelle sur support Canva. |
| 3× | Support pédagogique numérique remis à chaque participant. |
| 2× | Formation orientée pilotage et prise de décision managériale. |
| 2× | Études de cas réels issus du marché immobilier. |
| 2× | Ateliers d'analyse guidés avec des outils d'intelligence artificielle. |
| 1× | Formation interactive orientée pratique. |
| 1× | Démonstrations en direct sur un outil d'intelligence artificielle. |
| 1× | Exercices guidés pas à pas sur la rédaction de prompts. |

Plus « La formation se déroule en présentiel. » (**4×** : les trois modules ci-dessus
+ `drive:058#6`) et les 3 phrases du pied de document de `drive:058#6`.

---

# Les quatre tâches

## ① Le filtre — deux listes fermées, deux mécanismes

`packages/db/scripts/lib/mentions-organisme.ts` :

- **`MENTIONS_CANONIQUES` (18 formes)** — des PHRASES, reconnues ligne à ligne, sur
  la ligne ENTIÈRE normalisée. Jamais de sous-chaîne : les mêmes mots servent de
  vraies étapes (« Évaluation de fin de session : Mini-QCM… » vit à côté de « QCM
  évaluation des acquis ; »).
- **`TITRES_GABARIT` (24 formes)** + `estTitreGabarit()` — des TITRES, reconnus
  **structurellement** pour le corollaire : un titre part quand tout ce qui le suit,
  jusqu'au titre suivant ou à la fin du module, est du boilerplate. **Suivi de
  vraies étapes d'animation, il RESTE.**

Le vocabulaire des titres est **recopié** du gabarit que l'extraction reconnaît déjà
(`BODY_END` + le 4ᵉ motif de `BODY_START`). **Ni `BODY_START` ni `BODY_END` n'a été
touché** — le moindre changement y déplacerait le découpage des 402 modules.

Le commentaire consigne l'origine du défaut : `moyens pedagogiques et techniques` est
un motif de `BODY_START` et n'est dans aucun motif de `BODY_END` ; sur `drive:058` le
corps a démarré plus tôt, donc ce titre de pied de document tombe *à l'intérieur* du
corps et rien ne l'arrête.

**⛔ Le danger écarté, verrouillé par 17 tests** : une heuristique « ligne en
majuscules = titre de gabarit » détruirait le contenu Faros. `JEAN-GUY` (29×),
`LAURENT` (28×), `APPRENANT` (17×), `SOURCES` (4×), `LIVRABLE 001`, `PROMESSE
APPRENANT`, `RÉSULTAT OBSERVABLE`, `DÉCISION DE DIRECTION PÉDAGOGIQUE`,
`SA-ADM-M001`… sont du contenu légitime. `faros:SA-ADM-M001#1` ressort intact, ses
855 lignes comptées.

**Décisions consignées, chacune verrouillée par un `it()` qui la nomme** :

| ligne | décision |
|---|---|
| « Remise des attestations » (×3 formes) | **reste** — un vrai moment de fin de session |
| « QUIZZ Final : (0h30) » | **reste** — une activité de séance avec sa durée |
| les 3 lignes MIXTES (`drive:024#11`, `028#6`, `055#10`) | **reportées au lot 2** — la coupe est un arbitrage de rédaction |
| `faros:SA-ADM-M001#1` en entier | **intact** — il ENSEIGNE le montage du dossier AGEFICE |

**L'import LOCAL** (`import:drive-catalog:local -- --apply`, base `qualiof_dev`),
joué deux fois : 0 créé · 74 mis à jour · 2 ignorés. `drive:047#20` toujours en
**contenu conservé** — la non-régression exigée. Vérification en base, en lecture
seule : `drive:058#6` = 5 lignes, `drive:067/068/069#1` = 26/35/35, les 4 fantômes
vides, `drive:047#20` = 8 lignes (ton texte, protégé).

## ② Le départage — six clés, l'alphabet en dernier

`module-matcher.ts` :

1. le score
2. **`matchSource`** : `signaux` avant `lexique` — une preuve devant une piste
3. **`confidence`** : `forte` avant `faible`
4. **le vocabulaire PROPRE du besoin** : un `matchedTerm` présent dans le `label` du
   besoin passe devant du vocabulaire périphérique
5. `isFoundation`
6. **l'alphabet — dernier recours, et commenté comme tel**

Pourquoi pas littéralement « même famille / même chapitre » : `family` est grossière
et déjà filtrée en amont ; un module ne porte aucun chapitre ; et **42 des 132
signaux n'ont pas de préfixe de domaine** (28 valeurs libres) — une règle bâtie
dessus casserait. Les chiffres sont dans le code pour empêcher qu'on « l'améliore »
en repartant du préfixe. La clé 4 est **stable** : elle ne dépend pas de la taille de
la bibliothèque, contrairement au repesage qui a fait bouger la demi-journée 5.

**Les tests prouvent, ils ne décorent pas.** 5 tests, scores **assertés** :

| test | ce qu'il prouve |
|---|---|
| D017#3 / D034#3 à 5 contre 5 | le cas réel — **mais il passait déjà** sur le code cassé |
| **variante à titres échangés** | c'est le vocabulaire qui tranche, pas l'alphabet |
| preuve > piste | `signaux` devant `lexique`, alors que la piste est socle ET première à l'alphabet |
| forte > faible | sur 40 modules, le seul moyen d'obtenir un poids < 1 |
| l'alphabet en dernier | interdit de supprimer le repli |

**Aucun test existant « réparé »** : les 10 fichiers de `src/lib/proposition` passent
sans modification d'attente.

## ③ L'empreinte voit le déroulé — elle prévient, elle ne régénère rien

Le trou, étroit et réel : les axes et les prix sont **persistés** et le chemin de
lecture les respecte, mais le **texte du déroulé** de chaque module est relu **en
direct** à chaque rendu (`buildWorkspace` → `moduleContent`).

- `ProposalFingerprintInput.moduleMaterial` est **REQUIS** — un champ optionnel
  serait un garde-fou qui ne garde pas. C'est `tsc` qui force les trois appels.
- `moduleMaterialOf(library)` aux **trois** appels (création, `buildWorkspace`,
  `persistAndReprint`), prouvé par un compte à 3 et par `tsc`.
- la clé porte l'identifiant de l'**axe** et les chaînes sont triées : insensible à
  une permutation **dans** un axe, sensible à un déplacement **entre** axes.
- titre et durée sont pris **LIVE** : les valeurs persistées ne bougent jamais seules.
- le `contentMd` est **haché** (SHA-256), pas recopié dans le payload.
- un module du catalogue qu'aucun axe ne retient **n'entre pas** dans l'empreinte.

**⛔ Aucun chemin de régénération touché** : ni `generateComposedProduct`, ni la
génération de PDF, ni un déclenchement automatique.

## ④ Les chemins — et le garde qui arrête le prochain

`packages/db/scripts/lib/corpus-local.ts` (nouveau) : `premierEmplacementPorteur()`
cherche le premier emplacement qui **porte** la matière, avec un lecteur
**injectable** — c'est ce qui permet de tester « existe mais vide » et « illisible »
sans toucher au disque. `candidatsNxtCoach()` : `~/Projects` avant `~/Documents`.
**C'est le seul endroit du dépôt qui nomme encore l'ancien emplacement**, comme
second candidat délibéré.

- `trouverFaros()` refactoré dessus, **comportement constant** : 76/402, diff vide
  hors `extractedAt`.
- `import-diag-catalog.ts` retrouve la matière Agent Incomparable sous
  `~/Projects/nxt-coach/Formation Faros/LIVRAISON_PARCOURS` — **10 entrées**.
  Vérifié par un `tsx` de **lecture seule** ; `import:diag-catalog` n'a **jamais**
  été lancé, ni en prod ni en local.
- `launch-qualiof.sh` / `stop-qualiof.sh` dérivent `PROJECT_DIR` de l'emplacement du
  script (donc marchent depuis n'importe quel worktree), échouent en 1 avec un
  message clair + notification sans `package.json`, et portent `QUALIOF_CHECK_ONLY=1`
  qui les rend testables sans démarrer Docker. La commande AppleScript de la l.40
  portait **aussi** le chemin en dur : elle prend `$PROJECT_DIR`, quoting vérifié par
  simulation du heredoc.

```
$ QUALIOF_CHECK_ONLY=1 bash scripts/launch-qualiof.sh
/Users/laurentmarx/Projects/CRM Next gen/files-chaine

$ QUALIOF_CHECK_ONLY=1 bash <copie hors dépôt>/scripts/launch-qualiof.sh
QualiOF : aucun package.json dans …/faux-depot — le dépôt a bougé ou le script a été copié hors du dépôt.
code de sortie : 1
```

### La mutation du garde — les deux sorties, et la première qui n'en était pas une

**Première tentative : restée VERTE.** Le fichier piégé avait été créé mais **pas
indexé**, et le garde balaie `git ls-files`. Le garde avait raison ; ma mutation
était une décoration. La leçon s'applique d'abord à celui qui l'écrit — elle est
consignée dans `.claude/commands/quick.md`.

**Refaite avec `git add -N`** :

```
AssertionError: Ces scripts portent un chemin /Users/… ou Documents/{CRM Next gen,nxt-coach} en dur.
Dériver le chemin de l'emplacement du script, ou passer par premierEmplacementPorteur() —
pas l'ajouter aux exceptions :
  packages/db/scripts/zz-mutation-chemin.ts
 Tests  1 failed | 3 passed (4)
```

**Après `git rm --cached` + suppression** :

```
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

Le garde a aussi **attrapé mon propre commentaire** dans les deux `.sh`, qui
recopiait l'ancien chemin « pour expliquer » : il a raison, un chemin mort recopié
finit par être relu comme une consigne. Le commentaire a été réécrit sans le chemin.

### Les deux `.app` — CONSTAT, rien écrit hors du dépôt

Les deux bundles appellent les scripts par leur **ancien chemin**, qui n'existe plus.
Ils vivent dans `/Applications`, **hors du dépôt, donc hors de toute revue par
`git diff`** — c'est pour ça qu'on ne les corrige pas ici.

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

Les étapes 2 et 4 ont été jouées dans un répertoire temporaire : `osadecompile` rend
**exactement** la ligne d'origine avec `Documents` remplacé par `Projects`, double
antislash compris. **Les `.app` réels n'ont pas été touchés.**

Si macOS refuse l'écriture dans `/Applications` (Gatekeeper / permissions), le repli
est de garder les `.app` tels quels et de lancer `scripts/launch-qualiof.sh`
directement depuis le dépôt : il est auto-localisant depuis ce lot.

## ⑤ Les deux leçons consignées dans `.claude/commands/quick.md`

Nouvelle section **§4 ter**, à côté de la leçon du garde de couverture :

> **Un test qui n'a jamais rougi n'est pas un test, c'est une décoration.**

avec le cas du jour (l'assertion naïve sur D017#3 qui passait déjà sur le code
cassé), la règle qui en découle (exécuter tout test de contrat contre le code non
corrigé ; asserter une égalité au lieu de la supposer), et le cas vécu de la mutation
restée verte — **la leçon s'applique d'abord à celui qui l'écrit.**

---

# Gates

| gate | référence (après lot 1) | après ce lot |
|---|---|---|
| `pnpm lint` | exit 0 | **exit 0** |
| `pnpm --filter @qualiof/web exec tsc --noEmit` | exit 0 | **exit 0** |
| `pnpm test` | 3039 passés / 2 ignorés · 306 fichiers | **3155 passés / 2 ignorés · 308 fichiers** |

Détail : 202 shared (inchangé) + **179** db (84 avant) + **2774** web (2753 avant).

**+116 au total, dont 113 de ce lot** :

| fichier | avant | après | Δ |
|---|---|---|---|
| `mentions-organisme.test.ts` | 74 | 160 | **+86** |
| `corpus-local.test.ts` | — | 9 | **+9** |
| `fingerprint.test.ts` | 7 | 16 | **+9** |
| `module-matcher.test.ts` | 29 | 34 | **+5** |
| `chemins-en-dur.test.ts` | — | 4 | **+4** |
| `campagne/creneaux.test.ts` | — | — | **+3 — PAS de ce lot** (ton commit `267f401`) |

⚠ **À savoir** : ton commit `267f401 fix(rdv): heures conventionnées retirées de la
page participant` a atterri sur cette branche à 17 h 11, **entre mes commits**. Les
+3 tests web viennent de là, pas de moi. Tout est vert avec, et mes trois derniers
commits sont posés par-dessus.

**Aucun test existant n'est tombé.** Les 2 ignorés sont les mêmes qu'avant.

---

# Déviations du plan

## [Règle 1 — Bug dans le plan] Le verify du plan attendait « 4 modules vides », la donnée en porte 33

Le `verify` automatisé de la tâche ① exigeait `vides === 4`. Mesuré : **33 modules**
ont un `contentMd` vide — 4 vidés par le filtre au lot 1, et **29 qui n'ont jamais eu
de déroulé au Drive** (`drive:047#*`, `drive:061#*`…). Le plan confondait « vidés par
le filtre » et « vides ». Le test porte le bon invariant : **33, et aucun des 4
modules touchés n'est dedans** — c'est ce qui interdit le « module fantôme » qu'on
voulait éviter.

## [Règle 1] « La formation se déroule en présentiel. » n'était pas propre à drive:058#6

Relevé avant d'écrire une ligne : la forme apparaît dans **4 modules**, pas 1. Le
plan l'annonçait unique. C'est ce relevé qui a fait apparaître le bloc de tête de
`drive:067/068/069` — et donc l'arbitrage final.

## [Règle 2 — Fonctionnalité critique manquante] Le cache tsc des scripts sortait de git à chaque lint

`apps/web/tsconfig.scripts.tsbuildinfo` était **suivi par git** : le motif de
`.gitignore` ne couvrait que `tsconfig.tsbuildinfo`. Il se salissait à **chaque
`pnpm lint`** — donc à chaque passage de gate — et aurait pollué tous les diffs et
chaque fusion. C'est exactement le défaut corrigé le 10/09 pour
`apps/web/tsconfig.tsbuildinfo`, avec un fichier de plus. Le motif couvre maintenant
`tsconfig*.tsbuildinfo` des deux côtés, et le fichier est sorti de l'index
(`git rm --cached`, il reste sur le disque). Commit : `b92f334`.

## [Constat] Le rapport d'import ne nomme plus de « déroulé vidé »

La section « Déroulés vidés » a **disparu** par rapport au lot 1, et c'est correct :
elle ne nomme que les **écritures** qui vident un contenu non vide. Le lot 1 les a
déjà vidés en base ; les deux `--apply` suivants n'avaient plus rien à vider. C'est
l'idempotence qui fonctionne, vérifié en base en lecture seule.

## [Constat cosmétique, non corrigé] Le rapport d'import n'est pas déterministe

La ligne « Face à face acheteurs » du tableau des rayons en double alterne l'ordre de
ses deux entrées d'un `--apply` à l'autre (tri instable entre deux clés égales). Sans
effet métier, hors périmètre, **non corrigé** — signalé pour qu'un diff de rapport ne
surprenne pas.

## [Constat à vérifier à la source] `drive:069` porte le déroulé de `drive:068`

`drive:069#1` (étude notariale) porte **le même titre de module et le même déroulé**
que `drive:068#1` (management). Ce n'est **pas** une conséquence de ce lot — les deux
étaient déjà identiques dans l'instantané du lot 1 — mais ça mérite un coup d'œil au
document source.

## [Relevé plus large que le plan] 26 fichiers portent un chemin en dur, pas 18

Le tableau du plan en listait 18. Le balayage du garde en trouve **26**, dont 8
scripts `apps/web` pointant le Drive Google par un chemin absolu. La liste
d'exceptions en porte **23** après correction des 3 fichiers vivants, chacune
vérifiée **non périmée** par un test dédié.

## Piège d'environnement (rappel, tenu)

Tout `tsx scripts/…` hors enveloppe `:local` lit le `.env` du dépôt, **qui pointe la
PROD Supabase**. Les vérifications de lecture seule de ce lot sont passées par
`dotenv -e ../../.env.local -e ../../.env --`, et les fichiers jetables ont été
supprimés avant les gates.

---

# Interdits du plan — tenus

- ⛔ **titres de modules** : aucun touché (0 titre modifié dans les diffs
  d'instantané).
- ⛔ **découpage** : aucun module découpé, les 4 fantômes compris.
- ⛔ **contenu pédagogique** : aucune ligne écrite. Ce lot ne fait que retirer.
- ⛔ **régénération automatique** : aucune proposition, aucun PDF, aucun produit
  composé touché.
- ⛔ **demi-journée 5** : aucun signal, aucun score, aucun poids, aucun module touché
  pour la forcer. `BIB-D034#3` y reste de lui-même.
- ⛔ **`BODY_START` / `BODY_END`** : pas une ligne. Le vocabulaire des titres est
  recopié, pas déplacé.
- ⛔ **D-29 non implémentée** : posée comme question ouverte, rien dans le code ne
  l'anticipe.
- ⛔ **prod** : `import:drive-catalog` uniquement en `:local` ; `import:diag-catalog`
  pas lancé du tout. Aucun merge, aucun push, aucune écriture hors du dépôt.

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
| `722058b` | `docs(260911-kwf):` plan et compte rendu du lot 1 bis |
| `4a56c5b` | `test(pieds-de-page-deroules):` les 8 moyens de drive:067/068/069 — RED (21 échecs) |
| `e0311ab` | `chore(pieds-de-page-deroules):` instantané régénéré — 15 lignes, 3 modules |
| `ff0ea54` | `fix(pieds-de-page-deroules):` un déroulé porte des étapes d'animation |
| _(final)_ | `docs(260911-kwf):` D-29 ouverte, le texte retiré conservé, la leçon de mutation |

---

# Compte rendu en trois lignes

1. **Ce qui change pour toi** : les déroulés remis à un financeur portent désormais
   **des étapes d'animation et rien d'autre** — 22 lignes de moyens et de mentions
   d'organisme parties dans 4 modules, titre de section compris ; une égalité de
   score se tranche sur le vocabulaire du besoin, plus sur l'alphabet ; une
   proposition dont le déroulé a bougé le **dit** au lieu de se taire ; le lanceur de
   bureau et les deux imports ne mentent plus sur leur emplacement, et un garde
   arrête le prochain chemin en dur.
2. **Ce qui est mis de côté** : **D-29** (un champ « moyens pédagogiques » au niveau
   du produit ?) → **ouverte, elle t'attend** ; les 3 lignes mixtes → lot 2 ; les
   titres de modules → lot 2 ; le découpage des 4 fantômes → lot 3 ; les 23 chemins
   en dur de scripts jetables (listés, datés, non réécrits) ; le repointage des deux
   `.app` (hors dépôt, **après** le merge, commande ci-dessus).
3. **Ce qu'il reste à vérifier à la main** : les `git diff` des deux instantanés
   (`4a24cab` 7 lignes, `e0311ab` 15 lignes — rien d'autre), le **§B** pour relire le
   texte retiré avant de trancher D-29, et le constat `drive:069` = `drive:068` au
   document source.

---

## Self-Check: PASSED

Vérifié le 11/09/2026, rien de déclaré qui n'existe :

- les 3 fichiers créés existent et sont suivis par git (`corpus-local.ts`,
  `corpus-local.test.ts`, `chemins-en-dur.test.ts`) ;
- les 18 commits existent dans l'historique de la branche ;
- l'instantané (76/402, 5 puces sur `drive:058#6`, 26/35/35 sur `drive:067/068/069`,
  première puce « PROGRAMME DÉTAILLÉ », 3095 lignes, 33 vides, 64 warnings) et le
  programme composé (6 demi-journées, 8064.00 € HT, `BIB-D034#3` en demi-journée 5)
  sont conformes à ce qui est écrit ci-dessus, **mesurés et non supposés** ;
- le texte du §B est extrait par diff entre l'instantané de `134f9fb` et celui
  d'aujourd'hui, pas recopié à la main ;
- D-29 existe bien aux deux endroits annoncés (spec + `STATE.md`) ;
- les fichiers jetables (`zz-mutation-chemin.ts`, les scripts de vérification) ont
  été supprimés avant les gates ; l'arbre est propre ;
- **aucun stub, aucun placeholder introduit** : ce lot retire des lignes, ajoute des
  règles et des tests. Il n'écrit aucun contenu pédagogique.
