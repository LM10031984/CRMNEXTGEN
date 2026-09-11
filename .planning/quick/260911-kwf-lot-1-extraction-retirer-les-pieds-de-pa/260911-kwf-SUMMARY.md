---
quick_id: 260911-kwf
phase: quick-260911-kwf
plan: "01"
slug: pieds-de-page-deroules
branch: fix/260911-pieds-de-page-deroules
subsystem: extraction-catalogue
tags: [extraction, drive, qualiopi, composition, icloud]
requires:
  - packages/db/scripts/data/drive-programmes-catalog.json
  - apps/web/src/lib/proposition/module-matcher.ts
provides:
  - "packages/db/scripts/lib/mentions-organisme.ts — le filtre des mentions d'organisme, fonctions pures, partagé extraction + import"
  - "garde d'import qui protège la PÉDAGOGIE et non le boilerplate (doitProtegerLeContenu)"
  - "garde anti-instantané-tronqué dans l'extraction"
affects:
  - "packages/db/scripts/extract-drive-catalog.ts"
  - "packages/db/scripts/import-drive-catalog.ts"
  - ".planning/DIAG-0001-programme-compose.md"
tech-stack:
  added: []
  patterns:
    - "ensemble FERMÉ de formes canoniques comparé à la ligne ENTIÈRE normalisée — jamais une recherche de sous-chaîne"
    - "normalisation à l'EXTRACTION, jamais par correction en base"
    - "une source muette fait ÉCHOUER l'extraction plutôt qu'écrire un instantané tronqué"
key-files:
  created:
    - packages/db/scripts/lib/mentions-organisme.ts
    - packages/db/scripts/__tests__/mentions-organisme.test.ts
  modified:
    - packages/db/scripts/extract-drive-catalog.ts
    - packages/db/scripts/import-drive-catalog.ts
    - packages/db/scripts/data/drive-programmes-catalog.json
    - .planning/DIAG-0001-programme-compose.md
    - .planning/STATE.md
decisions:
  - "Le filtre est un ensemble fermé de 7 formes canoniques, pas un motif : c'est ce qui laisse vivre « Évaluation de fin de session : Mini-QCM… » à côté de « QCM évaluation des acquis ; »."
  - "Les 3 lignes mixtes restent : la mention y est soudée à de la pédagogie, et Laurent n'a donné aucun arbitrage de réécriture."
  - "La garde « un import ne vide jamais un contenu écrit » protège la pédagogie, pas le boilerplate : si la base, passée par le même filtre, ne laisse rien, il n'y a rien à protéger."
  - "Le corpus Faros est cherché au premier emplacement qui porte réellement un paquet de livraison — l'existence d'un dossier ne prouve rien depuis qu'iCloud en laisse des vides."
metrics:
  duration: "~35 min"
  tasks: 3
  commits: 4
  tests_added: 74
  completed: "2026-09-11"
---

# Quick 260911-kwf — Lot 1 de l'extraction : les pieds de page sortent des déroulés

Les mentions d'organisme du gabarit Qualiopi (QCM d'évaluation, questionnaire de
satisfaction, états de service des formateurs) ne figurent plus comme puces dans le
`contentMd` des modules : 101 lignes retirées dans 52 modules, à l'EXTRACTION, avec
un filtre pur partagé par l'extraction et l'import.

## Le critère de fin, mesuré

`pnpm --filter @qualiof/web probe:composition:local DIAG-0001` tourne, et
`.planning/DIAG-0001-programme-compose.md` :

| contrôle | avant | après |
|---|---|---|
| mentions sous un module (l. 107-108, BIB-D017) | 2 puces | **parties** ✅ |
| mentions sous un module (l. 159-160, BIB-D012) | 2 puces | **parties** ✅ |
| objectif « chaque moment de satisfaction rencontré » | l. 87 | **présent** (l. 87) ✅ |
| contenu « au moment où le client verbalise sa satisfaction » | l. 177 | **présent** (l. 173) ✅ |
| section « Modalités d'évaluation » et ses 2 lignes | l. 204-205 | **présente** (l. 196-202) ✅ |

Chiffrage **inchangé, au centime** : 6 demi-journées · 48 h conventionnées ·
8064.00 € HT · Σ devis = Σ proposition ✅. Le parcours détaille 6 demi-journées
pour 6 vendues.

## L'instantané régénéré — le `git diff` est la revue

76 programmes · 402 modules, comme avant. Audité programme par programme avant de
committer :

| mesure | valeur |
|---|---|
| lignes de déroulé | 3218 → **3117** (−101) |
| modules touchés | **52** |
| modules vidés | **4** |
| warnings | 60 → **64** |
| modules disparus | **0** |
| titres modifiés | **0** |
| durées / ordres modifiés | **0** |

Import LOCAL (`import:drive-catalog:local -- --apply`, base `qualiof_dev`) :
0 créé · 74 mis à jour · 2 ignorés (les 2 programmes à 0 module, préexistant).
Le rapport nomme bien :

- `drive:047#20` en **contenu conservé** — la non-régression exigée ;
- les 4 fantômes en **déroulé vidé**, chacun nommé.

## Gates

| gate | avant | après |
|---|---|---|
| `pnpm lint` | exit 0 | **exit 0** |
| `pnpm --filter @qualiof/web exec tsc --noEmit` | exit 0 | **exit 0** |
| `pnpm test` | 2965 passés / 2 ignorés · 305 fichiers | **3039 passés / 2 ignorés · 306 fichiers** |

Détail : 202 shared + **84** db (10 avant) + 2753 web. **+74 tests**, exactement le
nombre ajouté. **Aucun test existant n'est tombé.**

---

# ⚠ CE QUI DEMANDE UN ARBITRAGE DE LAURENT

## 1. Une SUBSTITUTION de module sur DIAG-0001 — à dire fort

Le chiffrage n'a pas bougé. **La sélection, si.** Sur la demi-journée 5 :

- **avant** : `BIB-D017#3` « Convaincre le vendeur avec des arguments solides » (120 min)
- **après** : `BIB-D034#3` « Gérer les objections et trouver des solutions de compromis » (150 min)

et par simple arithmétique (150 au lieu de 120 sur 240 min), `BIB-D012#2`
« Pratiquer une découverte acheteur… » (60 min) est repoussé de la demi-journée 5
à la 6.

**La cause est établie, pas supposée.** J'ai rejoué le probe avec l'ancien
instantané : l'ancien parcours revient à l'identique, donc la substitution vient
bien de ce lot. Le mécanisme exact, relevé en instrumentant le matcher :

```
AVANT (bibliothèque de 302 modules composables)
  rank 0  score=12  BIB-D034  « Rédiger des compromis de vente efficaces »
  rank 1  score=10  BIB-D017  « Convaincre le vendeur avec des arguments solides »
  rank 2  score=10  BIB-D034  « Gérer les objections et trouver des solutions de compromis »

APRÈS (bibliothèque de 298 modules composables)
  rank 0  score=12  BIB-D034  « Rédiger des compromis de vente efficaces »
  rank 1  score=10  BIB-D034  « Gérer les objections et trouver des solutions de compromis »
  rank 2  score= 8  BIB-D017  « Convaincre le vendeur avec des arguments solides »
```

Les 4 modules fantômes ont quitté la bibliothèque composable (ils n'ont plus de
déroulé). `discriminationWeights()` mesure le pouvoir discriminant des mots-clés
**sur la bibliothèque du moment** — 298 au lieu de 302 —, un mot a changé de
palier, et le score de `BIB-D017#3` est passé de 10 à 8. L'égalité à 10 qui était
tranchée par l'ordre alphabétique des titres n'existe plus.

Ce n'est pas un bug : c'est le comportement documenté du repesage
(`module-matcher.ts` : « une liste figée redeviendrait fausse au premier import »).
**Mais c'est un arbitrage pédagogique, et il n'est pas à moi.** Le signal de
`BIB-D017#3` parle du **mandat** (« le prix de rentrée se lâche pour ne pas perdre
l'affaire »), ceux de `BIB-D034#3` parlent de la **transformation** (« trop d'offres
ne deviennent pas des compromis »). Pour le besoin « Rentrer des mandats en
exclusivité, au bon prix », l'ancien choix paraît plus sur cible. **Rien n'a été
touché pour le forcer** : corriger exigerait de retoucher la pondération du
moteur, ce que ce lot n'autorise pas.

## 2. Les 3 lignes mixtes — laissées, comme prévu

La mention y est soudée à de la pédagogie dans la même phrase. La retirer en entier
détruirait du contenu ; la réécrire serait un arbitrage que tu n'as pas donné (tu as
dit : suppression pure, aucun arbitrage nécessaire).

| module | ligne laissée |
|---|---|
| `drive:024#11` | « Clôture et questionnaire de satisfaction. Feedback et Questions/Réponses » |
| `drive:028#6` | « Clôture et questionnaire de satisfaction. Feedback et Questions/Réponses » |
| `drive:055#10` | « Clôture de la formation : Résumé des points clés, remise des certificats de formation et évaluation de la satisfaction des participants. » |

**La question** : on coupe la phrase (« Clôture et questionnaire de satisfaction. »
part, « Feedback et Questions/Réponses » reste) ? Aucun de ces 3 modules n'est au
parcours de DIAG-0001, donc rien n'est urgent. Un `it()` nommé « laissées et
signalées » porte la raison dans le code, pour le jour où ce test tombera.

## 3. Les mentions HORS des 3 familles — rencontrées et laissées

Ce sont probablement des mentions d'organisme, mais elles ne sont dans aucune des
trois familles que tu as nommées. Les retirer aurait été élargir le périmètre tout
seul :

- « Remise des attestations » (`drive:062#2`)
- « Remise des attestations de formation »
- « Remise de l'attestation. »
- les MOYENS PÉDAGOGIQUES de `drive:058#6` : « Les formateurs proposeront des mises
  en situation professionnelles… » et « Un livret de formation sera remis à chaque
  participant… Le formateur déroulera sa formation avec une présentation Canva
  projetée. »

## 4. Les 4 modules fantômes — vidés et nommés, découpage au lot 3

Leur déroulé n'était QUE les deux lignes du gabarit. Leur « titre » est en réalité
le dernier objectif de la liste précédente — leur nom le prouve :

| module | titre (= un objectif, pas un module) |
|---|---|
| `drive:010#2` | « Apprendre à réévaluer régulièrement le plan d'action » |
| `drive:014#4` | « Analyser et comprendre les besoins et les attentes » |
| `drive:027#2` | « Mettre en œuvre des changements pour accroître la… » |
| `drive:038#3` | « Mettre en place un suivi régulier et des récompenses » |

Chacun porte un warning sur son programme. Le composeur les écarte déjà des sorties
client (« aucun déroulé pédagogique » : 104 → 108). **Leur découpage est le lot 3**,
volontairement pas touché ici.

## 5. Le titre de `drive:047#20` a regagné son point final

Le programme composé affiche maintenant « Atelier pratique : Simulation de réponse
aux avis clients**.** » (et « clients.. » dans la ligne des objectifs à rédiger).
**Ce n'est pas ce lot** : j'ai vérifié en rejouant l'import avec l'ancien
instantané, le point revient pareil. C'est la conséquence connue de tout `--apply` —
le titre du Drive reprend la main sur le titre normalisé à la main en base, ce que
la RÈGLE GRAVÉE du plan annonçait. **C'est exactement le lot 2**, et il ne se règle
pas en base : il se règle à l'extraction, après que tu aies relu les titres proposés.

---

# Déviations du plan

## [Règle 3 — Blocant] Le corpus Faros avait déménagé : l'extraction a perdu 2 programmes EN SILENCE

- **Trouvé pendant** : tâche 2, étape ④ (régénération de l'instantané).
- **Symptôme** : la première régénération a rendu **74 programmes / 400 modules**
  au lieu de 76/402. Les disparus : `faros:SA-ACQ-M003` et `faros:SA-ADM-M001` —
  dont celui que le plan exige de voir sortir intact.
- **Cause** : `FAROS_DIR` pointait `~/Documents/nxt-coach/Formation Faros`. Le
  dossier a suivi le dépôt hors d'iCloud vers `~/Projects/nxt-coach/Formation
  Faros`, et iCloud a laissé sur place **deux dossiers vides** : l'original vidé et
  un sosie « Formation Faros 2 ». `existsSync` réussissait, `readdirSync` rendait
  zéro paquet, **aucun avertissement**.
- **Correctif** : `trouverFaros()` cherche le premier emplacement qui porte
  réellement un paquet `SA_<FAM>_M<NNN>_…LIVRAISON` ; un `FAROS_DIR` explicite
  reste souverain.
- **Commit** : `5f575d7`.

## [Règle 2 — Fonctionnalité critique manquante] Un instantané tronqué ne s'écrit plus

- **Pourquoi** : ce fichier est commité et le `git diff` sert de revue. Écrire un
  instantané auquel une source entière manque, c'est soumettre à la relecture des
  centaines de suppressions où il faudrait deviner lesquelles sont voulues. Sans ce
  garde, j'aurais committé 74/402 sans le voir.
- **Correctif** : si `drive` ou `faros` rend 0 programme, le script imprime les deux
  chemins et **sort en 1 sans écrire**.
- **Commit** : `5f575d7`.

## [Règle 2] Une écriture qui vide un déroulé se nomme

- La garde d'import protégeait, donc elle rendait compte. Maintenant qu'elle laisse
  passer le cas « la base ne portait que du boilerplate », une nouvelle section du
  rapport (« Déroulés vidés ») **nomme** les modules concernés. Une écriture
  silencieuse là où l'ancien code protégeait aurait été une régression de
  traçabilité.

## Piège d'environnement rencontré (aucune conséquence, mais à savoir)

Un script lancé `pnpm --filter @qualiof/web exec tsx scripts/…` **sans** l'enveloppe
`:local` lit le `.env` du dépôt, **qui pointe la PROD Supabase**. Mon script de
diagnostic jetable est parti dessus et a échoué sur l'erreur de connexion — aucune
écriture, aucun effet. Rejoué avec
`pnpm exec dotenv -e ../../.env.local -e ../../.env --`, puis supprimé. **Tout
`tsx scripts/…` à la main doit porter son `.env.local` explicitement.**

## Hors périmètre — non corrigé, consigné

- Le cache Turbo rejoue encore des logs portant l'ancien chemin
  (`/Users/laurentmarx/Documents/CRM Next gen/…`) pour `@qualiof/shared:lint`.
  Cosmétique, aucun effet sur les gates (exit 0). Se purgera au premier changement
  réel de `packages/shared`.

# Interdits du plan — tenus

- ⛔ **(a) titres** : aucun titre de module touché (0 titre modifié dans le diff de
  l'instantané). Le point final de `drive:047#20` est un effet de l'import, pas une
  écriture de ma part — preuve par rejeu.
- ⛔ **(b) découpage** : aucun module découpé, y compris les 4 fantômes et `BIB-D012`.
- ⛔ **(c) contenu pédagogique** : aucune ligne de pédagogie écrite. Le filtre ne
  fait que retirer.
- ⛔ **prod** : `import:drive-catalog` et `import:diag-catalog` n'ont JAMAIS été
  lancés sans `:local`. Aucun merge, aucun push sur `main`, aucune PR ouverte.

# Commits (branche `fix/260911-pieds-de-page-deroules`)

| commit | objet |
|---|---|
| `2d28afa` | `test(pieds-de-page-deroules):` le filtre — tests RED (74 tests, 6 familles) |
| `47e388b` | `chore(pieds-de-page-deroules):` instantané Drive régénéré (−101 lignes) |
| `5f575d7` | `fix(pieds-de-page-deroules):` le code + le programme composé + les rapports d'import |
| `b6866df` | `docs(state):` le dépôt est sorti d'iCloud |

# Ce qu'il reste à vérifier à la main

1. **Le `git diff` de l'instantané** (`47e388b`) — la revue est à toi : 101 lignes
   en moins, rien d'autre.
2. **`.planning/DIAG-0001-programme-compose.md`** — en particulier la demi-journée 5
   et la substitution du § 1 ci-dessus.
3. **Les 3 arbitrages** : lignes mixtes, « Remise des attestations », substitution
   de module.
4. **Le ménage des résidus iCloud** (46 copies sur le disque, 44 fichiers restés à
   l'ancien emplacement) — aucune dangereuse, aucune suivie par git, en attente de
   ton feu vert.

## Self-Check: PASSED

Vérifié le 11/09/2026, rien de déclaré qui n'existe :

- les 2 fichiers créés existent sur le disque et sont suivis par git ;
- les 4 commits existent dans l'historique (`2d28afa`, `47e388b`, `5f575d7`, `b6866df`) ;
- l'instantané, le programme composé et `STATE.md` sont suivis et commités ;
- le script de diagnostic jetable `apps/web/scripts/zz-debug-candidats.ts` a été
  supprimé avant les gates (l'arbre est propre, `git status` ne liste plus que ce
  SUMMARY).
- aucun stub, aucun placeholder introduit : ce lot RETIRE des lignes, il n'en écrit
  aucune.
