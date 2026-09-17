# Reporté / assumé — les gardes d'écriture, 17/09/2026

## ⛔ L'ORDRE DU VERSEMENT — il conditionne la survie du travail rédactionnel

**Posé le 17/09/2026, en même temps que la garde d'écrasement.**

Depuis aujourd'hui, `import-drive-catalog.ts` ne réécrit plus que ce qu'il a
lui-même écrit : il compare le `contentMd` en base à l'empreinte qu'il y a
laissée (`TrainingModule.contentMdFingerprint`).

**Mais `NULL` veut dire « rien à protéger ici », pas « protégé ».** C'est le bon
défaut — sans lui la colonne aurait gelé les 486 modules le jour de sa naissance.
Sa conséquence ne se voit pas venir :

> Verser du contenu humain sur un module dont l'empreinte est encore `NULL` le
> rend **écrasable par le premier import qui passe** — et celui-ci l'annoncera
> en « **400 mis à jour** », ce qui a l'air d'une bonne nouvelle.

### L'ordre, définitif

| | |
|---|---|
| ① | `import:drive-catalog -- --apply` **en entier** → chaque module porte son empreinte |
| ② | **seulement ensuite** : `ecrire:modules -- --apply` |
| ③ | l'import suivant compare, ne reconnaît plus son texte, **refuse et nomme** |

Inversé, l'ordre ne casse rien bruyamment : **il perd le travail en silence.**

### Ce n'est pas qu'une consigne

Une consigne se perd — celle-ci est aussi une **garde**. `ecrire-modules-rediges.ts`
appelle `ciblesSansEmpreinte` AVANT toute écriture et refuse si une seule de ses
cibles gérées par l'import n'a pas d'empreinte, avec le motif en clair et l'ordre
à suivre. Rougie une fois sur base vierge avant d'être crue :

```
⛔ REFUS — ce versement est lancé TROP TÔT.
   drive:047#20 « Répondre aux avis clients en ligne, positifs comme négatifs » — aucune empreinte
```

Les modules que le script CRÉE n'ont pas de `sourceRef` : l'import ne les connaît
pas, ne les écrira jamais, ils ne sont pas visés. Les confondre ferait refuser un
versement légitime.

### État de la production au 17/09

La colonne **n'existe pas encore en production** : la migration
`20260917120000_module_empreinte_import` est écrite, testée sur bases jetables,
**non poussée**. Tant qu'elle n'est pas déployée, l'étape ① ne peut pas stamper —
donc l'étape ② ne doit pas être lancée en production. La garde le dira d'elle-même.

