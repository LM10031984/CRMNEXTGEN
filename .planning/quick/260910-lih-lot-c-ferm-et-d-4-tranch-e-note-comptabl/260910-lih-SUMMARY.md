# Quick 260910-lih — Lot C fermé, D-4 tranchée

**Date :** 2026-09-10 · **Décisions :** Laurent, sans consultation de l'expert-comptable.
**Nature :** documentation seule. **Aucun code, aucune écriture en base, aucune pièce modifiée.**

## Ce qui a été écrit

**`docs/comptabilite/note-chronologie-factures-2026.md`** — la pièce à produire si
la question est posée. Cinq sections : le constat chiffré (5 ruptures sur 31, tableau nominatif) ;
la cause unique et datée (rattrapage des 4 et 7/09/2026 — les cinq pièces créées ces jours-là,
et elles seules) ; ce qui n'est pas en cause (aucun montant, aucune TVA du fait de l'exonération
261-4-4°, même exercice, aucun tiers lésé) ; la règle corrigée pour l'avenir ; et le motif de
non-régularisation. Inventaire brut copié à côté d'elle.

**Précision tenue dans la note** : le lot B est **spécifié et planifié, pas encore déployé** au
10/09/2026. Une note montrée à un tiers ne peut pas présenter comme fait ce qui est prévu — la
mention de statut est explicite.

## Les deux specs closes

| Spec | Ce qui change |
|---|---|
| `2026-09-10-datation-numerotation-factures.md` | En-tête (statut ARBITRÉE), §5 (état des lieux MESURÉ, tableau des 5 ruptures + cause), §6 (question à Lagean NON POSÉE, remplacée par la note), §7 (lot C barré, FERMÉ), §8 (D-1 tranchée) |
| `2026-09-02-facturation-electronique-pa.md` | §5.7 nouveau (règle financeur pour le lot 2), §9 (D-4 barrée, tranchée) |

Quatre passages de la spec datation devenaient faux une fois le lot C fermé (l'en-tête, §5, §6
et le tableau des lots). Tous alignés : une spec qui se contredit est pire qu'une spec périmée.

## D-4 — le raisonnement consigné

`PayeeParty` (BG-10) ne désigne qu'un bénéficiaire du règlement **différent du vendeur**, cas de
l'affacturage. Ici l'argent va à Start Academy, qui est déjà le vendeur : renseigner BG-10 ferait
croire à une cession de créance. Le champ reste donc **absent**, le buyer reste le client, et le
financeur figure dans les conditions de règlement (BT-20) comme modalité de paiement.

## Décisions encore ouvertes après ce lot

Spec datation : **aucune** (reste le lot B à livrer).
Spec facturation électronique : **D-1** (confirmer Super PDP après lecture de la doc) et **D-5** (ordre des lots).
