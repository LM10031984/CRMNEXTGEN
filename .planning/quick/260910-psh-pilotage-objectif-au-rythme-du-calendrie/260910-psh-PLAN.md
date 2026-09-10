# Quick 260910-psh — Pilotage : trois lectures de plus

**Demande Laurent (2026-09-10).** Après audit du calcul existant (« il annonce 253 k€
d'atterrissage mais il compte les sessions en cours ? »), trois chantiers retenus
sur quatre proposés :

1. l'objectif au rythme du calendrier ;
2. Vendu / Facturé / Encaissé ;
3. les analyses par axe.

**Écarté par Laurent pour l'instant : l'assainissement du CA.** Les montants
affichés ici contiennent donc toujours les sessions en brouillon (69 576 €) et les
pré-inscrits jamais confirmés (76 419 €, dont 38 251 € dans le « réalisé »). Deux
des trois vues rendent ce biais visible — c'est le seul endroit où on en reparlera.

## Ce que le calcul actuel fait (audité sur la base, 10/09/2026)

`SessionParticipant.priceHT` agrégé par mois de **début de session**, coupé en deux
par une seule condition — la session est-elle finie ?

| | Règle | Montant |
|---|---|---|
| Réalisé YTD | `startDate ∈ 2026` et `endDate < maintenant` | 191 406 € |
| Prévisionnel | les mêmes, `endDate ≥ maintenant` | 62 360 € |
| Atterrissage | l'addition | 253 766 € |

Sessions en cours (commencées, pas finies) aujourd'hui : **aucune**. Le mécanisme
existe pourtant : une session bascule d'un panier à l'autre d'un bloc, à sa date
de fin, jamais au prorata.

## 1. L'objectif au rythme du calendrier

Aujourd'hui « % atteint » compare le réalisé YTD à l'objectif **annuel** : au 10
septembre, 55 % ne dit pas si on est en avance ou en retard.

- `objectifADate(objectifMensuel, date)` — cumul des mois révolus + prorata du
  mois en cours (jours écoulés / jours du mois). La saisonnalité est déjà
  calculée (`distributeAnnualObjective` sur les 3 années précédentes), on la lit.
- `pctObjectifADate` = réalisé YTD ÷ objectif à date.
- `projectionAuRythme` = réalisé YTD ÷ part de l'année déjà due. À distinguer de
  l'atterrissage : l'un extrapole le **rythme constaté**, l'autre additionne le
  **carnet de commandes**. Les deux ensemble encadrent la fin d'année.
- Division par zéro : objectif absent ou part nulle → `null`, jamais 0 %.

## 2. Vendu / Facturé / Encaissé

Trois réalités, trois séries mensuelles, sur la même année.

| Série | Source | 2026 constaté |
|---|---|---|
| Vendu | `SessionParticipant.priceHT` (réalisé + prévisionnel) | 253 766 € |
| Facturé | `Invoice.amountHT`, par `issueDate` | 31 115 € |
| Encaissé | `InvoicePayment.amount`, par `receivedAt` | 17 696 € |

Deux points vérifiés en base avant d'écrire :
- **les avoirs portent déjà un `amountHT` négatif** (l'unique avoir : −336 €) : on
  les additionne, on ne les soustrait pas une deuxième fois ;
- **l'encaissement se lit sur `InvoicePayment.receivedAt`**, pas sur
  `Invoice.paidAt` : c'est la date où l'argent arrive, et les 10 lignes de
  paiement existantes totalisent exactement les `amountPaid` des factures.

Statuts comptés comme facturés : `ISSUED · PAID · PARTIAL · OVERDUE · CREDIT_NOTE`
— exclus : `DRAFT` (pas partie) et `CANCELLED`. ⚠️ La carte « CA du mois » de la
page Factures, elle, ignore `OVERDUE` : deux définitions coexistent. Aucune
facture n'est en retard aujourd'hui, donc l'écart est nul — à trancher plus tard,
hors de ce lot.

Deux écarts affichés, qui sont les vraies questions : **reste à facturer**
(vendu − facturé) et **reste à encaisser** (facturé − encaissé).

## 3. Les analyses par axe

Sur l'année choisie, à partir de la même base d'inscrits :

- **par produit** (code + titre : deux produits IA portent presque le même nom) ;
- **par formateur** (formateur principal ; 2 sessions n'en ont aucun → « non
  attribué », affiché et pas caché) ;
- **par financeur** : l'axe est `sponsorOrg.opcoCode` (AGEFICE 116 inscrits,
  OPCO_EP 66, sans OPCO 26) et **pas** `financingMode`, renseigné sur 41 inscrits
  sur 208 — s'appuyer dessus donnerait un camembert faux aux deux tiers ;
- **taux de remplissage** : inscrits ÷ `capacityMax` (35 % en moyenne) ;
- **top clients** : commanditaires par CA, avec la part du top 3 (concentration) ;
- **entonnoir** pré-inscrit → confirmé → présent, en nombre ET en euros : c'est
  lui qui montre les 38 251 € de pré-inscrits assis sur des sessions terminées.

## Découpage (un commit par bloc)

1. `lib/pilotage/objectif-rythme.ts` (pur) + cartes KPI.
2. `lib/pilotage/flux-financiers.ts` (pur + fetch) + bloc Vendu/Facturé/Encaissé.
3. `lib/pilotage/axes.ts` (pur + fetch) + blocs d'analyse.

## Tests (RED d'abord)

Helpers purs testés en isolation : prorata du mois en cours, objectif absent,
saisonnalité vide (repli uniforme), avoir négatif, mois sans donnée, division par
zéro partout. Puis vérification sur la base réelle que chaque total tombe sur les
montants audités ci-dessus.

## Gates

`pnpm lint` · `tsc --noEmit` · `pnpm test` — les trois verts avant chaque commit.
