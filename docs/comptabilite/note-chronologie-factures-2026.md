# Note — chronologie de la numérotation des factures, exercice 2026

> **Objet** : écart constaté entre l'ordre des numéros de facture et l'ordre de leurs
> dates d'émission, sur l'exercice 2026 de Start Academy.
> **Établie le** : 10/09/2026 · **Par** : Laurent Marx, Start Academy
> **Statut** : **constat clos et périmètre arrêté.** La règle est corrigée et en production
> depuis le 10/09/2026. Aucune pièce n'est réécrite.
> **Pièce jointe** : `audit-chronologie-2026-09-10.txt` (inventaire exhaustif, généré par
> l'outil de gestion en lecture seule le 10/09/2026).

---

## 1. Le constat

**Périmètre arrêté au 10/09/2026 : 32 pièces, dernière émise sous l'ancienne règle :
FAC-000031.**

Le parc compte 31 factures (31 451,43 € HT) et 1 avoir (−336,00 € HT), soit 31 115,43 € HT.
La règle de datation ayant été corrigée et mise en production le 10/09/2026 (cf. §4), ce
périmètre est **définitif** : aucune pièce nouvelle ne viendra s'y ajouter. FAC-000031, créée
le 10/09/2026 à 14 h 09 et datée du 05/08/2026, est la dernière facture établie sous
l'ancienne règle.

Sur la séquence des factures (`FAC-`), **5 pièces portent une date d'émission antérieure
à celle de la pièce qui les précède immédiatement dans la numérotation**.

| Numéro | Statut | Date d'émission | Pièce précédente | Sa date | Recul |
|---|---|---|---|---|---|
| FAC-000021 | payée | 23/04/2026 | FAC-000020 | 12/08/2026 | 111 j |
| FAC-000024 | payée | 23/04/2026 | FAC-000023 | 10/06/2026 | 48 j |
| FAC-000025 | émise | 14/04/2026 | FAC-000024 | 23/04/2026 | 9 j |
| FAC-000027 | émise | 10/04/2026 | FAC-000026 | 14/04/2026 | 4 j |
| FAC-000030 | payée | 26/02/2026 | FAC-000029 | 10/04/2026 | 43 j |

La séquence des avoirs (`AVO-`, 1 pièce) ne présente aucun écart. Aucune pièce n'est
dépourvue de date d'émission. Aucun numéro n'est hors format, aucun n'est manquant ni
dupliqué : **la numérotation reste continue et sans trou**, c'est son ordre relatif aux
dates qui est en cause.

## 2. La cause, unique et datée

Les cinq écarts proviennent d'un **seul événement** : la mise en service de l'outil de
gestion et la reprise, les **4 et 7 septembre 2026**, de formations déjà réalisées entre
février et juin 2026.

Le mécanisme est le suivant. L'outil attribuait à chaque facture :

- son **numéro** au moment de l'enregistrement (séquence continue, ordre d'arrivée) ;
- sa **date d'émission** à la date de fin de la prestation facturée.

Tant que les factures étaient établies au fil de l'eau, les deux coïncidaient. En
saisissant en septembre des prestations achevées au printemps, les deux horloges se sont
désolidarisées : un numéro de septembre a reçu une date d'avril.

Les dates de création en base le confirment sans ambiguïté — les cinq pièces concernées
ont toutes été créées les 4 ou 7 septembre 2026, et elles seules. Le détail figure en
pièce jointe, colonne « Date de création ».

**Aucune des cinq pièces n'a été antidatée intentionnellement.** La date portée est la
date réelle de fin de la prestation facturée, laquelle est par ailleurs attestée par la
convention de formation, la feuille d'émargement et l'attestation de fin de formation de
chaque stagiaire.

## 3. Ce qui n'est pas en cause

**Aucun montant.** Les écarts portent exclusivement sur des dates. Aucun montant n'a été
modifié, ni au moment du constat ni depuis. Le total du parc est inchangé : 28 091,43 €
HT, contrôlé au centime.

**Aucune TVA.** L'intégralité de l'activité de Start Academy relève de l'exonération de
l'article **261-4-4° du CGI** (formation professionnelle continue). Toutes les pièces
portent la mention « TVA non applicable en vertu de l'article 261-4-4° du CGI » et un taux
de 0 %. Il n'existe donc **ni TVA collectée, ni TVA déductible, ni décalage d'exigibilité**
susceptible d'être affecté par la date portée.

**Aucun exercice.** Les cinq pièces et leurs prestations se situent toutes à l'intérieur du
même exercice 2026. Le rattachement des produits à l'exercice est identique quelle que soit
celle des deux dates retenue.

**Aucun tiers lésé.** Chaque client a reçu une facture portant la date de fin de sa propre
formation, cohérente avec les autres documents de son dossier.

## 4. La règle, corrigée pour l'avenir

La règle de datation est révisée : **la date d'émission d'une facture devient la date de
son établissement réel**, et la période d'exécution de la prestation cesse d'être portée
par cette date pour figurer là où elle doit l'être — **sur la ligne de facture**, sous la
forme « Formation « … » du 10 au 12 juin 2026 ».

Ce déplacement n'était pas possible auparavant : les factures ne portaient pas de lignes
détaillées. Elles en portent depuis le 10/09/2026.

Conséquence : la numérotation redevient chronologique **par construction**, sans qu'il
faille l'y contraindre. Un contrôle automatique de cet ordre est mis en place et vérifié à
chaque évolution de l'outil, doublé d'une surveillance quotidienne de l'ensemble du parc.
Cette surveillance ne signale que les écarts **postérieurs** au périmètre arrêté ci-dessus :
les cinq écarts constatés étant documentés par la présente note et non régularisables, les
répéter chaque jour ferait perdre à l'alerte toute valeur de signal.

Cette correction est **en production depuis le 10/09/2026**. Toute facture établie à partir
de cette date porte la date de son établissement réel.

## 5. Le passé n'est pas régularisé — et pourquoi

**Décision du 10/09/2026 : aucune des cinq pièces n'est réécrite.**

Une facture émise ne se modifie pas : le code de commerce impose, lorsqu'une correction est
nécessaire, de passer par un avoir puis une refacturation, jamais par une modification de la
pièce d'origine.

Or il n'y a **rien à corriger au fond** : les montants sont exacts, la TVA n'est pas
concernée, l'exercice de rattachement est le même, chaque date portée correspond à une
prestation réellement exécutée à cette date, et la numérotation est continue. Émettre cinq
avoirs et cinq nouvelles factures pour déplacer une date de quelques semaines créerait
**dix pièces comptables supplémentaires** là où il n'y a aujourd'hui aucun enjeu financier
— et rendrait le dossier moins lisible, pas plus.

La présente note et son inventaire joint constituent donc la trace de l'écart, de sa cause,
de son périmètre exact et de sa correction pour l'avenir.

---

## Pièce jointe

`audit-chronologie-2026-09-10.txt` — inventaire exhaustif des 31 pièces, produit le
10/09/2026 par l'outil de gestion. L'outil qui le génère est **en lecture seule** : il ne
peut modifier aucune donnée. L'inventaire est reproductible à l'identique à tout moment.
