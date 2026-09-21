---
quick_id: 260921-b5g
description: La facture ne se date jamais avant la fin de la formation
date: 2026-09-21
status: livré
---

# Quick 260921-b5g — Résumé

## Ce qui a changé

`resolveInvoiceIssueDate` prend désormais deux dates **nommées** et rend la plus
tardive :

```ts
resolveInvoiceIssueDate({ finDeFormation, now }) // = max(now, finDeFormation)
```

Les deux émetteurs de `invoices.ts` lui passent la fin de session —
`participant.session.endDate` pour la facture individuelle, `session.endDate` pour la
facture de groupe. L'échéance, ancrée sur l'émission, suit le plancher sans changer de
règle.

Paramètres nommés et non positionnels parce que la première date de cette fonction a
déjà désigné deux choses opposées : la fin de prestation jusqu'au 10/09, l'horloge de
test ensuite. Un objet interdit la confusion silencieuse.

## Troisième datation de la facture, et pourquoi elle tient

| Date | Règle | Ce qui l'a fait tomber |
|---|---|---|
| 13/08/2026 | La pièce se date de la **fin de prestation** | Numéro attribué au clic, date venue de la session : 5 ruptures de chronologie sur 31 pièces |
| 10/09/2026 (lot B) | La pièce se date du **jour d'établissement** | Laissait facturer une prestation non encore rendue |
| 21/09/2026 (ici) | **max(jour d'établissement, fin de formation)** | — |

Le cas courant — facturer une formation déjà terminée — se comporte exactement comme au
lot B, plancher déjà franchi. Seule l'émission anticipée change de date.

## Le coût, mesuré et rendu visible

Le plancher rouvre la faille inverse : une pièce datée en avant peut précéder en numéro
une pièce datée plus tôt. Un test nommé `⚠ le plancher du 21/09 peut rompre l'invariante
quand on facture AVANT la fin` joue le scénario et l'affirme, pour que personne ne le
découvre dans un contrôle.

La parade n'est pas de revenir en arrière — on ne facture pas avant d'avoir livré — mais
de **ne pas émettre avant la fin de formation**. Garde-fou à l'émission (avertir ou
refuser) = chantier suivant ; la note comptable
`docs/comptabilite/note-chronologie-factures-2026.md` est à reprendre avec lui.

## Vérifications

- 24 tests verts sur `invoice-dates.test.ts` (19) et `numbering.chronology.test.ts` (5).
- Suite web complète : **61 échecs sur 5 fichiers, exactement comme sur `main` sans ce
  correctif** (comparaison faite en mettant les modifications de côté). Aucun échec
  ajouté ; ces 61 échecs locaux tiennent à l'environnement de la machine, la CI étant
  verte sur `main`.
- ESLint propre sur les 4 fichiers.
- `tsc` local inexploitable ici : le client Prisma est partagé avec un autre worktree
  resté sur une branche antérieure, d'où des erreurs `regime` / `priceTotalHT` sur du
  code non touché. La CI typecheck sur le schéma de la branche.

## Suite côté données

Les **7 factures de SES-0111** (FAC-000032 → FAC-000038, 400 € HT chacune, aucune
payée, aucune encaissée) restent datées du 21/09 : elles ont été émises avant ce
correctif. Elles sont les **derniers numéros de la séquence**, ce qui est la seule
situation où les retirer ne laisse pas de trou — la numérotation reprendra à
FAC-000032. Décision et exécution traitées à part, hors de ce correctif de code.
