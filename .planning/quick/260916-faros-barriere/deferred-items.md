# Reporté / assumé — barrière Faros, 16/09/2026

## ⛔ `pnpm test` est ROUGE, et c'est une décision, pas une régression

`apps/web/src/lib/proposition/__tests__/faros-non-importable.test.ts` — **3 tests
en échec, délibérément.** Tout le reste est vert : 362 fichiers, 3 867 tests.

```
Test Files  1 failed | 362 passed (363)
     Tests  3 failed | 3867 passed | 2 skipped (3872)
```

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

## Conséquence pour la gate de livraison

Tant que cette barrière est en place, la règle « aucun commit de fin sans les
trois vertes » (`quick.md` §5) se lit : **lint et tsc verts, `pnpm test` vert À
L'EXCEPTION de ce fichier**. Toute AUTRE rougeur reste bloquante.
