# Les déroulés de la bibliothèque — trois mesures avant tout correctif

**15/09/2026.** Rien n'est corrigé, rien n'est retiré, rien n'est redécoupé.
Sonde `apps/web/scripts/probe-deroules.ts`, 100 % lecture, rejouable par
`pnpm --filter @qualiof/web probe:deroules:local`. Sortie brute :
`260915-deroules-releve.txt`.

---

## (a) `BIB-D014` — un découpage qui a mal tourné, pas un bloc unique

`drive:014`, motif d'extraction **`liste-imbriquee`** — pas `bloc-unique`. Les
17 programmes en bloc unique portent **1 module**, celui-ci en porte **4**. Le
découpeur a donc cru réussir.

| # | Titre | Déroulé |
|---|---|---|
| 1 | Utiliser des outils d'analyse pour identifier les tendances… | `- Mettre en place des coachings et des jeux de rôle…` |
| 2 | **Appliquer des techniques de feedback constructif…** | `- Après-midi :` `- Animer des réunions commerciales…` |
| 3 | **Élaborer des activités interactives…** | `- Prendre la parole devant son équipe avec assurance…` |
| 4 | Analyser et comprendre les besoins et les attentes de l'équipe… | *(vide — module fantôme né du pied de page, vidé au lot 3)* |

**Le défaut n'est pas la minceur : c'est le DÉCALAGE.** Aucun des trois déroulés
ne correspond à son titre. Le document source portait deux listes — les
objectifs pédagogiques d'un côté, le déroulé horaire de l'autre — et
l'extraction les a **agrafées deux à deux**. Le « - Après-midi : » resté en tête
du module 2 est la pièce à conviction : c'est un séparateur de la seconde liste,
pas un contenu.

Le module 4 le confirme : il a un titre et **aucun** déroulé, parce que la liste
des titres était plus longue que celle des contenus.

> Un module dont le contenu appartient à un autre module est **plus dangereux**
> qu'un module vide : le vide se voit, le décalage se lit comme du contenu.

## (b) Le signal demandé, et ce qu'il vaut

Population mesurée : les **298 composables** — ceux qu'`isAnimable` laisse
passer aujourd'hui. (490 en bibliothèque, 406 après retrait pige /
non-diffusables / doublons.)

### Distribution du nombre de puces

```
 1 puce   :  25   8,4 %
 2 puces  :  52  17,4 %      ≤ 2 puces = 77 modules, 25,8 %
 3 puces  :  61  20,5 %
 4 puces  :  46  15,4 %
 5 puces  :  39  13,1 %
 6+ puces :  75  25,2 %
```

### Le signal « premier élément = fragment d'horaire »

| Signal | Compte |
|---|---|
| première puce = fragment d'horaire seul | **49** |
| fragment d'horaire n'importe où | 73 |
| union avec « ≤ 2 puces » | 118 (39,6 %) |

**⚠ Pris seul, ce signal ne discrimine pas.** `BIB-D071` le porte **quatorze
fois** avec 6 à 9 puces de vrai contenu ; `BIB-D049` avec 46 puces ; `BIB-D050`,
`BIB-D052`, `BIB-D048`, `BIB-D072` de même. Chez eux, « Matin : » ou
« 9h00 – 13h00 » est un **intertitre dans un déroulé réel**, pas un résidu.

Le refuser coûterait 49 modules pour en viser une poignée — §4 quaterdecies,
l'alarme cesserait d'être crédible.

### Les deux signatures qui, elles, discriminent

| Signature | Compte | Qui |
|---|---|---|
| **déroulé fait UNIQUEMENT de fragments d'horaire** | **7** | `BIB-D047` ×7 — le déroulé est le mot « Après-midi », rien d'autre |
| **horaire en tête ET ≤ 2 puces** | **8** | les 7 ci-dessus + `BIB-D014` « Appliquer… » |

C'est §4 decies appliqué : on **sépare les familles** au lieu de desserrer le
seuil. L'horaire et la minceur sont deux choses ; c'est leur conjonction qui
accuse.

**Restent hors filet** : `BIB-D014` « Élaborer… » (1 puce, sans horaire) et les
décalages titre/contenu de `BIB-D010`, `BIB-D033`, `BIB-D038`. Aucun compteur ne
les voit.

## (c) Pourquoi le moteur les a jugés animables

```ts
export function isAnimable(m): boolean {
  const contenu = (m.contentMd ?? '').trim();
  if (contenu.length === 0) return false;          // ← le seul vrai test
  return normalize(contenu) !== normalize(m.needIdentification ?? '');
}
```

**Il teste le vide LITTÉRAL.** « - Après-midi : » n'est pas vide, donc c'est un
déroulé. La règle 4 dit « une étiquette n'est pas un contenu » ; le code dit
« une chaîne non vide est un contenu ». L'écart entre les deux est exactement
la population mesurée ci-dessus.

### Ce que coûterait chaque seuil

| Seuil | Composables restants | Coût |
|---|---|---|
| aujourd'hui — déroulé non vide | 298 | — |
| **A** · refuser le déroulé 100 % horaire | 291 | −7 |
| **A + B** · + horaire en tête ET ≤ 2 puces | 290 | −8 |
| **A + B + C** · + refuser 1 puce | 272 | −26 |
| refuser tout horaire en tête | 249 | −49 |
| refuser ≤ 2 puces | 221 | −77 |

### Le seuil que le constat désigne : **A + B + C**, −26 modules (8,7 %)

- **A** ne se discute pas : un déroulé qui n'est qu'un horaire n'est pas un
  contenu allégé, c'est l'absence de contenu déguisée en contenu.
- **B** est la conjonction, pas l'un des deux signaux : elle ne touche qu'un
  module de plus et épargne les 41 déroulés réels qui portent un intertitre.
- **C** — refuser la puce unique — est le seul qui attrape `BIB-D014`
  « Élaborer… ». Il coûte 18 modules de plus, dont certains sont honnêtes
  (`BIB-D041` « Synthèse et évaluation » → « Révision des concepts abordés »).
  **C'est le point à arbitrer** : 18 modules minces retirés pour 1 résidu
  attrapé. L'asymétrie de §4 nonies dit de le faire — un module creux programmé
  chez un client coûte plus qu'un module honnête écarté.

**Les deux seuils au-delà sont à écarter** : −49 et −77 frappent massivement du
contenu réel. Ce serait desserrer le problème, pas le viser.

### Et ce qu'aucun seuil ne corrigera

Le **décalage titre/contenu** ne se voit dans aucun compteur : il faut comparer
le sens du titre et celui du déroulé. `BIB-D010`, `BIB-D033`, `BIB-D038`,
`BIB-D014` ×3 le portent. Un seuil sur `isAnimable` est un **plancher**, pas une
réparation : la réparation est au découpage, dans `extract-drive-catalog.ts`.

---

## Conséquence sur le parcours de DIAG-R001

Le besoin **« Piloter par les chiffres et animer l'équipe »** n'était couvert que
par les deux modules `BIB-D014`. Les deux retirés, **il devient NON COUVERT** —
et c'est la vérité : aucun module de la bibliothèque ne parle de *piloter par
les chiffres*, les deux qui y répondaient parlaient d'animation d'équipe.

Il rejoint la liste des douleurs à écrire. Le parcours passerait de 6 à 5
demi-journées, portant les droits non consommés de 4 032 € à 5 040 €.
