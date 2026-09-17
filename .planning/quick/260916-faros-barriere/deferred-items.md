# Reporté / assumé — barrière Faros, 16/09/2026

## ⛔ `pnpm test` est ROUGE, et c'est une décision, pas une régression

`apps/web/src/lib/proposition/__tests__/faros-non-importable.test.ts` — **3 tests
en échec, délibérément.** Tout le reste est vert : 362 fichiers, 3 867 tests.

```
Test Files  1 failed | 363 passed (364)
     Tests  3 failed | 3879 passed | 2 skipped (3884)
```

_Compte actualisé le 16/09 au soir, après la correction de la modalité AGEFICE
(12 tests ajoutés, tous verts). Les trois rouges sont les mêmes, et ce sont les
seuls._

**Pourquoi.** Laurent a arbitré le 16/09 : *aucun contenu Faros n'est importé au
catalogue*. Le test tient cette décision. Il ne se supprime pas ; il se lève en
faisant le travail qu'il décrit.

**Les trois conditions, dans l'ordre où elles doivent tomber :**

| # | Ce que le test exige | État au 16/09 |
|---|---|---|
| ① | `TrainingModule` porte une modalité explicite | le champ n'existe pas (`TrainingProduct` et `TrainingSession` l'ont, pas le module) |
| ② | l'import ne stampe pas `Modality.PRESENTIEL` sur un produit `faros:` | `import-drive-catalog.ts:375` le fait pour TOUS les produits |
| ③ | une unité `faros:` est refusée par `isAnimable` | les deux modules `faros:` sont animables (55 434 et 6 887 car.) |

**Ce que je n'ai PAS fait, et qui n'est pas un oubli** : aucun champ, aucune
migration, aucun import, aucune écriture en base. Le test est la barrière ; le
champ est une décision de Laurent.

## ⚠️ Les deux bases DIVERGENT volontairement — ne pas « réparer » par un import

**Posé le 17/09/2026, en portant la barrière dans l'importeur.**

| Base | Entrées `faros:` |
|---|---|
| LOCALE `qualiof_dev` | **2 produits, 2 modules** — importés le 11/09, avant l'arbitrage |
| PRODUCTION | **aucune**, et c'est voulu |

`import-drive-catalog.ts` refuse désormais tout rayon dont l'origine est
`faros`, avant toute écriture, avec ce motif imprimé dans le dry-run **et** dans
le rapport :

> Écarté — contenu asynchrone, et l'import ne sait poser que PRESENTIEL.
> Le champ de modalité n'existe pas encore (barrière Faros, condition ①).

**La raison n'est pas que le contenu est mauvais.** `SA-ACQ-M003` et
`SA-ADM-M001` déclarent « G3 prêt à produire » en v1.0 — ce sont les deux seuls
du corpus dans ce cas, et c'est précisément pourquoi l'extraction ne voyait
qu'eux (cause A, fermée le 16/09). La raison est qu'on écrirait une **fausse
modalité sur une pièce Qualiopi, en production** : ces deux unités sont des
capsules asynchrones, et l'import ne sait poser que `PRESENTIEL`, en dur.

> **Quelqu'un qui compare les deux bases verra 2 produits en local et 0 en prod.
> C'est l'état voulu. Ce n'est pas un import raté, et ça ne se rattrape pas en
> relançant l'import** — il refusera de nouveau, et il aura raison.

L'écart se referme le jour où les conditions ① et ② du test tombent : un champ
de modalité sur `TrainingModule`, et un import qui cesse de déclarer
`PRESENTIEL` par défaut. Pas avant.

**Où la garde vit, depuis le 17/09** : `packages/db/scripts/lib/barriere-faros.ts`,
une fonction pure appelée par l'importeur **et** par le test. Auparavant la
barrière était une lecture du texte source de l'importeur — elle le décrivait
sans jamais l'empêcher de rien (§4 ter). Le test `④` du fichier
`faros-non-importable.test.ts` est vert : c'est le seul du fichier, et il
vérifie un travail fait, pas une décision en attente.

## Conséquence pour la gate de livraison

Tant que cette barrière est en place, la règle « aucun commit de fin sans les
trois vertes » (`quick.md` §5) se lit : **lint et tsc verts, `pnpm test` vert À
L'EXCEPTION de ce fichier**. Toute AUTRE rougeur reste bloquante.

---

# Différé — la répartition horaire d'une session MIXTE

**Posé le 16/09/2026, en même temps que le refus qu'il remplacera.**

`repartirHeuresAgefice` **refuse** la modalité `MIXTE` : la répartition des heures
entre présentiel et distanciel n'est renseignée nulle part. Mesuré le même jour,
en lecture seule sur la production : **0 module sur 86** porte une répartition
horaire (`presentielCollectifHours`, `distancielSyncHours`,
`distancielAsyncHours` — les trois colonnes sont nulles partout).

Le refus est donc juste **tant qu'il n'existe pas de source**. Son successeur est
nommé :

> **Un champ de répartition sur `TrainingSession`** — trois entiers nullables, et
> la règle « leur somme vaut la durée du produit ». `repartirHeuresAgefice` lit
> ce champ pour `MIXTE`, et ne refuse plus que s'il est vide.

**Condition de levée : la première session MIXTE vendue.** Pas avant — une
migration posée pour un cas qui n'existe pas est une colonne nulle de plus, et
c'est exactement ce qu'on vient de constater sur les quatre colonnes d'heures
existantes.

**Ce qui n'est PAS différé, et qui est fait** : `ELEARNING → foadAsync`,
`DISTANCIEL → foadSync`, la disparition du `default`, et la source unique.

## Une case qui n'est alimentée par rien

`presIndiv` — « Durée ( Présentiel Individuel ) » du Cerfa — vaut **0 pour les
quatre modalités**. Aucune ne la renseigne, et ce n'est pas un oubli de la
correction : il n'existe aujourd'hui aucune prestation en présentiel individuel
au catalogue. La case part donc à zéro sur tous les dossiers.

**Noté, pas inventé.** Le jour où du présentiel individuel se vend, cette case
n'a pas de source non plus — elle rejoindra le même différé que `MIXTE`.
