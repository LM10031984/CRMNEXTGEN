# Différé — décisions prises, travail non engagé

Ce fichier ne liste PAS des idées. Il liste des cas **identifiés, compris, et
volontairement non traités**, avec ce qui les rouvrira. Une ligne qui n'a pas de
déclencheur n'a rien à faire ici : elle appartient à un backlog.

---

## D-1 · Deux entreprises sur la même session, avec deux forfaits différents

**Posé le** 16/09/2026.

### Le cas

Une session porte les salariés de DEUX entreprises, chacune ayant négocié son
propre forfait. Chaque convention engage sur son montant, et chaque dossier
financeur doit retrouver CE montant dans son programme.

### Ce qui se passe aujourd'hui

`resoudrePrixProgramme` (`apps/web/src/lib/closure/tarif-programme.ts`) bascule
sur le total UNIQUEMENT quand la session relève d'un seul commanditaire. Avec
deux entreprises, il retombe sur le prix **par stagiaire** — un repli sûr : un
total qui n'en couvrirait qu'une serait faux pour l'autre.

Ce n'est pas un bug, c'est le refus d'inventer. Mais ça ne sert pas le cas.

### Pourquoi c'est différé

Le cas voisin — une session mixte **salariés / auto-entrepreneurs** — a été
tranché autrement le 16/09/2026 : elle se scinde en **deux sessions** (deux
produits, 88 h entreprise et 72 h indépendants) qui partagent dates, salle et
formateur. Tout reste par session, et rien ne bouge dans `programme-core`,
`opco-submission` ni la matrice Qualiopi.

Le même découpage règle mécaniquement une partie du cas à deux entreprises. Ce
qu'il ne règle pas — deux forfaits distincts sous un seul produit — attend une
vraie modélisation du tarif, pas un contournement.

### La forme pressentie

Une ligne **`SessionPricing` par commanditaire** : la session porte N tarifs, un
par organisation, au lieu d'un `pricePerLearner` unique. Le programme, la
convention et la facture liraient tous la même ligne.

⚠ À concevoir, pas à improviser : `pricePerLearner` est lu par la convention, la
facture, l'AGEFICE et l'export comptable. Une seconde source de vérité sur le
tarif qui divergerait de la première coûterait plus cher que le cas qu'elle
résout.

### Ce qui le rouvrira

Une session réelle portant les salariés de deux entreprises à deux forfaits
différents. Pas avant : le découpage en deux sessions couvre ce qu'on rencontre
aujourd'hui.

---

## Antécédent — pourquoi le découpage plutôt que le programme par payeur

Une autre approche avait été instruite le 16/09/2026 : générer **un programme
par groupe de payeur** (`partitionByPayerRule`), un par entreprise plus un pour
les auto-payeurs.

Elle a été **abandonnée** : elle touchait l'identité du document
(`entityType: 'session'` / `entityId: sessionId`), donc l'empreinte de
péremption et la détection « document déjà sorti », plus la sélection de pièce
dans `opco-submission.ts` et l'anti-régression « le PDF Programme est UNIQUE »
de la matrice Qualiopi.

Scinder la session obtient le même résultat sans toucher à rien de tout cela.
Noté ici pour que personne ne la réinstruise en croyant à une piste neuve.
