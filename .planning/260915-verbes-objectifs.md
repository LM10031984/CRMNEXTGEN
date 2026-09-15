# `TITLE_VERBS` — une passe raisonnée, pas une troisième goutte

> # ⛔ PROPOSITION RETIRÉE — 15/09/2026, arbitrage Laurent
>
> **Ne pas appliquer. `TITLE_VERBS` n'est PAS la cause.**
>
> La mesure ci-dessous est juste et reste rejouable, mais elle répondait à la
> mauvaise question. Les deux modules refusés — `BIB-D014` « Appliquer… » et
> « Élaborer… » — **ne sont pas des modules** : l'un a pour tout déroulé
> « - Après-midi : » suivi d'une puce, l'autre une puce unique sans rapport avec
> son titre. Ce sont des résidus de découpage.
>
> Élargir la liste les aurait fait **passer**, et aurait effacé le seul signal
> qui les désignait. C'est §4 quindecies : un garde qui attrape le bon cas par
> le mauvais critère n'attrapera pas le suivant — et le « réparer » le rend
> muet.
>
> Le défaut est dans le DÉROULÉ, pas dans le verbe. Relevé :
> `260915-deroules-releve.md`.
>
> Ce document reste au dépôt comme trace de l'analyse et de son écartement.

**15/09/2026 — analyse conservée pour mémoire.** La liste candidate vit dans
`apps/web/scripts/probe-verbes-objectifs.ts`, qui la MESURE sans rien écrire.
Relevé brut : `260915-verbes-objectifs-releve.txt`, rejouable par
`pnpm --filter @qualiof/web probe:verbes-objectifs:local`.

## Le problème, nommé

`TITLE_VERBS` décide si un titre de module devient un objectif pédagogique. Elle
est **élargie au cas par cas, sur preuve** (§4 nonies). Le procédé est sain une
fois et intenable trois fois :

| Date | Verbes ajoutés | Motif |
|---|---|---|
| 14/09 | `conduire`, `mener`, `repondre` | 2 objectifs légitimes refusés à tort |
| 15/09 | `appliquer`, `elaborer` ? | 2 objectifs légitimes refusés à tort |

`appliquer` et `elaborer` ne sont pas des cas limites : ce sont **littéralement
des verbes de la taxonomie de Bloom**, ceux qu'on enseigne pour RÉDIGER un
objectif pédagogique. Les refuser est un faux négatif évident, et le deuxième en
deux jours.

> **Chaque goutte est un faux négatif déjà payé par une relecture humaine, et
> rien ne dit quand la fuite s'arrête.** Une liste qu'on élargit au
> goutte-à-goutte coûte plus cher qu'elle ne protège.

**L'asymétrie, elle, ne bouge pas.** Un faux positif imprime une coquille sur
une pièce financeur ; ça reste une liste blanche qui penche vers le refus. Ce
qui change, c'est qu'elle penchera pour une RAISON et non par accident de
recensement.

## La reconstruction : trois blocs, pas une liste plate

Le point n'est pas « deux mots de plus ». C'est de donner à la liste une
**structure**, pour que « faut-il ajouter ce verbe ? » ait une réponse de
principe.

| Bloc | Ce qu'il contient | Pourquoi il est stable |
|---|---|---|
| **A — socle taxonomique** (86) | Bloom révisé (Anderson & Krathwohl) et ses déclinaisons françaises, 6 niveaux | Ne se déduit pas de notre corpus |
| **B — acte professionnel** (39) | `vendre`, `prospecter`, `signer`, `relancer`… | Aucune taxonomie ne les porte : elles décrivent l'opération mentale, pas le geste métier |
| **C — non observables** (6) | `savoir`, `maitriser`, `apprendre`, `faire`, `acquerir`, `decouvrir` | **La dette, écrite.** Les référentiels les proscrivent ; ils portent des objectifs rendus aujourd'hui |

Le bloc C est le seul point discutable, et il est délibéré : les retirer
fabriquerait exactement le faux négatif qu'on corrige. Le jour où on solde cette
dette, **c'est le catalogue qu'on réécrit, pas la liste qu'on rabote.**

## Ce que ça change — mesuré sur les 298 modules composables

```
liste actuelle  :  68 verbes        liste candidate : 131 verbes
                                    ajoute 63 · retire 0

objectif rendu tel quel :  75 (25,2 %)  →  81 (27,2 %)
« à rédiger »           : 223 (74,8 %)  → 217 (72,8 %)

① BASCULENT vers objectif : 6
② DOUTEUX parmi eux       : 0
⚠ RÉGRESSENT              : 0
```

### ① Les 6 titres qui basculent — tous de vrais objectifs

| Rayon | Titre | Verbe |
|---|---|---|
| BIB-D014 | Appliquer des techniques de feedback constructif pour guider l'équipe vers l'amélioration continue. | `appliquer` |
| BIB-D014 | Élaborer des activités interactives pour encourager la participation de l'équipe et favoriser la cohésion. | `elaborer` |
| BIB-D016 | Élaborer des stratégies adaptées aux besoins des acquéreurs | `elaborer` |
| BIB-D025 | Concevoir un événement de prestige : Créez un événement professionnel… | `concevoir` |
| BIB-D007 | Proposer des services annexes pour gagner avec les acheteurs | `proposer` |
| BIB-D033 | Différencier les divers types de bases de données utilisées dans l'immobilier. | `differencier` |

**Les six portent un verbe d'action, un objet et une finalité.** Aucun n'est un
groupe nominal déguisé. **C'est le chiffre ② qui décide, et il vaut zéro.**

Réserve honnête, la seule : BIB-D025 traîne une queue d'extraction
(« : Créez un événement professionnel qui marquera les esprits… ») — c'est un
défaut de **découpage**, pas de verbe, et il existe déjà sur des titres admis.

### ⚠ Zéro régression

Aucun titre admis aujourd'hui ne cesserait de l'être : **tout verbe déjà admis
trouve son bloc**. C'était la vérification qui pouvait tuer la proposition.

### Ce que ça NE change pas — et c'est le plus important

**217 titres restent refusés, et ils ont raison de l'être.** Leurs premiers
mots, par fréquence :

```
 18 × synthese     9 × mise        7 × creation     5 × gestion
 16 × introduction 9 × atelier     7 × outils       4 × automatisation
```

Ce sont des **groupes nominaux** — exactement ce que la liste blanche existe
pour refuser. Le fond du problème n'est donc pas la liste des verbes : c'est que
**trois titres de module sur quatre, dans ce catalogue, ne sont pas rédigés
comme des objectifs.** Élargir la liste n'y changera rien, et c'est tant mieux —
un garde qui les accepterait imprimerait « Atelier pratique » sous « le stagiaire
sera capable de ».

## Si la proposition est retenue

1. Reporter les trois blocs dans `composed-programme.ts` à la place de la liste
   plate, commentaires compris.
2. Amender **§4 nonies** : l'asymétrie reste, le **procédé de croissance**
   change — un verbe s'ajoute en nommant son bloc, plus « au cas par cas ».
3. Rejouer la sonde : les chiffres ci-dessus doivent tomber à l'identique.
4. Régénérer le programme de DIAG-R001 — il perdra ses 2 « à rédiger ».
