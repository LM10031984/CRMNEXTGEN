# Triage des produits de formation pré-audit Qualiopi (BCI 03/07/2026)

> Généré le 10/06/2026 · **read-only**, relançable · 1 ligne / produit.
> Les heuristiques **signalent**, elles ne décident pas. Colonnes RÉEL / PRÉINSCRIPTION / DOUBLON à remplir par Laurent.

## ⚠ Pourquoi ce triage AVANT toute génération

Le **programme (`programMd`) est partagé par produit**. Une session **terminée** rattachée à
une **coquille de préinscription** ou à un **doublon** produirait un document Qualiopi **FAUX**
à la racine — peu importe la conformité des prompts.

**Étape suivante (PAS dans ce script)** : pour chaque produit classé PRÉINSCRIPTION ou DOUBLON,
**re-mapper ses sessions vers le produit RÉEL** correspondant, **AVANT T2/T3 et la génération de masse**.

## En-tête — chiffres réels

| Indicateur | Valeur |
| --- | ---: |
| **Total produits** | **32** |
| Réels probables (≥1 session terminée) | 20 |
| **Suspects (≥1 signal ⚠)** | **16** |
| · dont 0 session | 10 |
| · dont programme vide | 6 |
| · dont programme court (< 200 car.) | 0 |
| · dont prix 0/null | 6 |
| · dont quasi-doublon de titre | 8 |
| Origine SmartOF (ExternalIdentity) | 20 |
| Origine ? hors SmartOF (manuel/préinscription) | 12 |

> **Choix consignés** : pas de champ `source`/`origine` direct sur `TrainingProduct` (schema vérifié).
> L'origine est dérivée de `ExternalIdentity(source='smartof')` : « SmartOF » si présent, sinon
> « ? (hors SmartOF) » — on ne peut PAS distinguer « manuel » de « préinscription » côté schema,
> c'est l'objet du classement manuel. Seuils heuristiques : programme court < 200 car.,
> similarité de titre ≥ 0.85 (Levenshtein normalisé sur titre sans accents/casse/ponctuation).

## Produits (suspects en tête)

| Code · id | Titre | Prix HT | Sessions (dont term.) | Programme | Origine | Signal | RÉEL | PRÉINSCRIPTION | DOUBLON |
| --- | --- | ---: | ---: | --- | --- | --- | :---: | :---: | :---: |
| `PROD-0664` · 43e580ff | Cadastre Niveau 1 - Présentiel Collectif | 0,00 € | 0 (0 term.) | vide | ? (hors SmartOF) | ⚠ 0 session · ⚠ programme vide · ⚠ prix 0/null · ⚠ quasi-doublon de PROD-0041 |  |  |  |
| `PROD-0666` · aa6e27cb | Cadastre Niveau 2 - Présentiel collectif | 0,00 € | 0 (0 term.) | vide | ? (hors SmartOF) | ⚠ 0 session · ⚠ programme vide · ⚠ prix 0/null · ⚠ quasi-doublon de PROD-0060 |  |  |  |
| `PROD-0667` · 71ba9536 | Anglais professionnel boosté par l’IA | 0,00 € | 0 (0 term.) | vide | ? (hors SmartOF) | ⚠ 0 session · ⚠ programme vide · ⚠ prix 0/null |  |  |  |
| `PROD-0668` · cada712b | Optimisation des systèmes d’information avec l’IA | 0,00 € | 0 (0 term.) | vide | ? (hors SmartOF) | ⚠ 0 session · ⚠ programme vide · ⚠ prix 0/null |  |  |  |
| `PROD-0669` · 00ce2cc6 | Immobilier : gagnez 2h par jour grâce à l’IA | 0,00 € | 0 (0 term.) | vide | ? (hors SmartOF) | ⚠ 0 session · ⚠ programme vide · ⚠ prix 0/null |  |  |  |
| `PROD-0670` · cf80eb86 | IA générative | 0,00 € | 0 (0 term.) | vide | ? (hors SmartOF) | ⚠ 0 session · ⚠ programme vide · ⚠ prix 0/null |  |  |  |
| `FRM-0001` · cf961a3d | Exploiter La puissance de l'IA dans son activité immobilière | 336,00 € | 0 (0 term.) | 928 car. | ? (hors SmartOF) | ⚠ 0 session |  |  |  |
| `PROD-0001` · 7f4dc9b6 | Maitriser Claude l'intelligence surpuissante d'anthropic pour conseillers Immobilier | 1 008,00 € | 0 (0 term.) | 1249 car. | ? (hors SmartOF) | ⚠ 0 session |  |  |  |
| `PROD-0663` · ec7e597c | Formation Claude anthropic pour les conseillers immo | 336,00 € | 0 (0 term.) | 519 car. | ? (hors SmartOF) | ⚠ 0 session |  |  |  |
| `PROD-0672` · d067e312 | IA appliquée pour agents immobiliers - 16h | 672,00 € | 0 (0 term.) | 1136 car. | ? (hors SmartOF) | ⚠ 0 session |  |  |  |
| `PROD-0041` · 965f33b4 | Cadastre Niveau 1 - Présentiel Collectif | 336,00 € | 4 (4 term.) | 1467 car. | SmartOF | ⚠ quasi-doublon de PROD-0664 |  |  |  |
| `PROD-0042` · 304512f0 | L'intelligence artificielle au service des conseillers immobiliers (72h) | 3 024,00 € | 11 (9 term.) | 2362 car. | SmartOF | ⚠ quasi-doublon de PROD-0066 |  |  |  |
| `PROD-0057` · 681e2d87 | Intégrer l’intelligence artificielle pour gagner en productivité - 105h00 | 2 625,00 € | 4 (4 term.) | 4889 car. | SmartOF | ⚠ quasi-doublon de PROD-0061 |  |  |  |
| `PROD-0060` · 45f98380 | Cadastre Niveau 2 - Présentiel collectif | 336,00 € | 1 (1 term.) | 1248 car. | SmartOF | ⚠ quasi-doublon de PROD-0666 |  |  |  |
| `PROD-0061` · c0ac775f | Intégrer l’intelligence artificielle pour gagner en productivité - 77h00 | 3 080,00 € | 1 (1 term.) | 1887 car. | SmartOF | ⚠ quasi-doublon de PROD-0057 |  |  |  |
| `PROD-0066` · c15f333f | L'intelligence artificielle au service des conseillers immobiliers - 16h | 672,00 € | 10 (7 term.) | 2586 car. | SmartOF | ⚠ quasi-doublon de PROD-0042 |  |  |  |
| `FRM-0002` · a909f661 | Claude d'anthropic pour les conseillers immobiliers | 336,00 € | 1 (0 term.) | 1309 car. | ? (hors SmartOF) |  |  |  |  |
| `PROD-0003` · a3500765 | L’immobilier et sa prospection efficace : Devenir incontournable sur son secteur | 3 000,00 € | 1 (1 term.) | 2356 car. | SmartOF |  |  |  |  |
| `PROD-0043` · 746d646e | Formation l'IA & l'humain : L'harmonie dans l'immobilier | 199,00 € | 2 (0 term.) | 780 car. | SmartOF |  |  |  |  |
| `PROD-0044` · dca6c868 | Vendez mieux avec l’IA | 336,00 € | 1 (1 term.) | 1633 car. | SmartOF |  |  |  |  |
| `PROD-0058` · be193bed | L'IA au service des conseillers immobiliers (8h) | 336,00 € | 3 (3 term.) | 1601 car. | SmartOF |  |  |  |  |
| `PROD-0059` · 96444a7c | Booster vendeur (8h) | 336,00 € | 4 (2 term.) | 2278 car. | SmartOF |  |  |  |  |
| `PROD-0062` · 64528547 | Non discrimination, Tracfin et déontologie | 336,00 € | 7 (6 term.) | 1963 car. | SmartOF |  |  |  |  |
| `PROD-0063` · d61555db | Intégrer l'Intelligence Artificielle dans son entreprise pour  gagner en productivité - 40h | 1 680,00 € | 6 (6 term.) | 3158 car. | SmartOF |  |  |  |  |
| `PROD-0064` · 4f0b6507 | Maitriser l'intelligence artificielle pour booster la performance commerciale - 72h | 3 024,00 € | 4 (3 term.) | 2202 car. | SmartOF |  |  |  |  |
| `PROD-0065` · 25b195c3 | Exploiter l’intelligence artificielle dans l’immobilier pour gagner en productivité - 24h | 1 008,00 € | 6 (6 term.) | 2074 car. | SmartOF |  |  |  |  |
| `PROD-00661` · 60a55c57 | Communication digitale & Stratégie  marketing pour activité événementielle (72h) | 3 024,00 € | 1 (1 term.) | 2379 car. | SmartOF |  |  |  |  |
| `PROD-047` · 8ea4a7db | Formation complète en marketing digital et IA stratégie globale, référencement, création de contenus et gestion de la relation client | 2 978,00 € | 1 (1 term.) | 3348 car. | SmartOF |  |  |  |  |
| `PROD-053` · a8c4ce10 | Cycle complet de prospection, relation client et négociation immobilière | 3 000,00 € | 2 (2 term.) | 21150 car. | SmartOF |  |  |  |  |
| `PROD-055` · c65c9171 | Maîtrise des techniques de vente immobilière | 3 000,00 € | 1 (1 term.) | 5221 car. | SmartOF |  |  |  |  |
| `PROD-0662` · 8fd3fd9c | Maîtriser l’Intelligence Artificielle pour développer son activité | 336,00 € | 5 (5 term.) | 2713 car. | SmartOF |  |  |  |  |
| `PROD-0671` · e9666762 | Tracfin | 168,00 € | 1 (1 term.) | 4481 car. | ? (hors SmartOF) |  |  |  |  |

## Mode d'emploi du classement

1. Pour chaque ligne, cocher **une seule** des 3 colonnes (RÉEL / PRÉINSCRIPTION / DOUBLON).
2. Un produit avec **sessions terminées** + **programme renseigné** + **prix > 0** est
   très probablement RÉEL.
3. Un produit **0 session** ou **programme vide** est très probablement une coquille
   (PRÉINSCRIPTION) ou un DOUBLON.
4. Pour un **quasi-doublon**, identifier lequel des deux est le RÉEL (celui avec sessions
   terminées + programme) ; l'autre sera DOUBLON et ses sessions seront re-mappées.
5. Étape suivante (hors ce script) : re-mapper les sessions des PRÉINSCRIPTION/DOUBLON
   vers le produit RÉEL, **avant** la génération.

## Classement appliqué — 2026-06-12 (validé Laurent)

**6 coquilles 0 € / 0 session / programme vide — toutes `isActive=false` en base.** Déjà inactives : Cadastre N1 43e580ff, Cadastre N2 aa6e27cb, Optimisation SI cada712b. Flaguées ce jour (UPDATE 3) : Anglais 71ba9536, IA générative cf80eb86, Immobilier 2h 00ce2cc6. pg_dump `qualiof-pre-flag-coquilles-20260612-185037`. **Garantie** : un produit `isActive=false` n'apparaît plus dans le sélecteur de création de session (`sessions-create.ts:47 WHERE isActive:true`) → aucune session ne pourra jamais s'y rattacher.

| Produit coquille | Classement | Vrai produit (RÉEL) |
| --- | --- | --- |
| `PROD-0664` 43e580ff Cadastre N1 (0 €) | **DOUBLON** | `PROD-0041` 965f33b4 (336 €, 4 term.) |
| `PROD-0666` aa6e27cb Cadastre N2 (0 €) | **DOUBLON** | `PROD-0060` 45f98380 (336 €, 1 term.) |
| `PROD-0667` 71ba9536 Anglais | **PRÉINSCRIPTION** | — |
| `PROD-0668` cada712b Optimisation SI | **PRÉINSCRIPTION** | — |
| `PROD-0669` 00ce2cc6 Immobilier 2h | **PRÉINSCRIPTION** | — |
| `PROD-0670` cf80eb86 IA générative | **PRÉINSCRIPTION** | — |

**Re-mapping sessions : 0 déplacement** (les 6 coquilles ont 0 session ; les sessions terminées sont déjà sur les vrais produits). Le risque « doc faux à la racine » est donc **nul ET verrouillé** (coquilles inactives).

**Quasi-doublons FAUX (ne pas merger — durées différentes = produits distincts RÉELS)** : `PROD-0042` (72h) ≠ `PROD-0066` (16h) ; `PROD-0057` (105h) ≠ `PROD-0061` (77h). Les 20 produits à sessions terminées = RÉELS. Restants 0-session avec programme (FRM-0001/0002, PROD-0001/0663/0672, PROD-0043) : à confirmer par Laurent (probables PRÉINSCRIPTION, mais non bloquants — aucune session terminée dessus).

## CORRECTION 2026-06-13 — PROD-0662 sur-mergé dé-mergé (re-mapping)

**Mon classement coquilles du 12-06 était FAUX sur 3 produits.** Le croisement base↔export 12-06 a révélé que `PROD-0662` (« Maîtriser l'IA », 35h) regroupait **5 formations DIFFÉRENTES** (Plan 05 reliquat « à éclater »). 3 des « coquilles » que j'avais flaguées `isActive=false` étaient en fait les **vrais produits cibles**, vides uniquement parce que leurs sessions étaient absorbées par PROD-0662 (Case 1 vérifié : 0 session hier ET aujourd'hui, toutes sur PROD-0662).

**Re-map + réactivation appliqués (pg_dump `qualiof-pre-remap-prod0662-...`)** :
| Session | Re-mappée vers | Durée | Produit réactivé |
| --- | --- | --- | --- |
| SES-0055 | `71ba9536` Anglais professionnel | 21h | isActive=true |
| SES-0072 | `cf80eb86` IA générative | 105h | isActive=true |
| SES-0056 | `cada712b` Optimisation SI | 14h (durée corrigée 0→14, source Laurent+export 2j) | isActive=true |
| SES-0090 | reste `PROD-0662` Maîtriser l'IA | 35h | — |
| SES-0084 | **`PROD-0673` créé** « Optimiser son activité immobilière grâce à l'IA » | 40h | isActive=true, programme réel importé |

**Reclassement** : 71ba9536 / cf80eb86 / cada712b = **RÉELS** (plus PRÉINSCRIPTION). Coquilles restantes inactives : 43e580ff + aa6e27cb (DOUBLON Cadastre) + 00ce2cc6 (Immobilier 2h, 0 session base).

**EXCLUSION LOT A — levée le 2026-06-13 (programmes importés)** : les programmes officiels Laurent des 3 produits ont été importés (Anglais 21h cap 5, Optimisation SI 14h cap 5, IA générative 105h cap 25 ; programMd + objectifs + capacité + bloc handicap ; pg_dump `qualiof-pre-import-prog3`, SQL versionné `import-programmes-3.sql`). SES-0055/0056/0072 + SES-0084 ont désormais un **programme réel**. **Prix catalogue posés 2026-06-13** (confirmés par croisement base SP = facturé Laurent) : PROD-0667 Anglais **743,33€** (4460/6), PROD-0668 Optimisation SI **1260€** (7560/6), PROD-0670 IA générative **2625€** (×2=5250). pg_dump `qualiof-pre-prix-catalogue`. → **SES-0055/0056/0072 + SES-0084 = 100% prêtes Lot A** (programme+prix+capacité+durée). ✅ SES-0090/PROD-0662 RÉGLÉ 2026-06-13 : facturé 2100€ TOTAL / 2 stagiaires → 1050€/stagiaire. 2 SP Bianco corrigés 1600→1050, PROD-0662 catalogue 336→1050 (les 336 = reliquat sur-merge). pg_dump `qualiof-pre-ses0090`. **Les 5 sessions re-mappées ont prix + programme + capacité + durée justes.** NB PROD-0673 = vrai produit SmartOF (UID 5a28eafc, nom « ...- 40h »). **FAIT 2026-06-13** : titre aligné « ...- 40h », **ExternalIdentity 5a28eafc re-pointée PROD-0662→PROD-0673**, correction « financier→immobilier » confirmée OK Laurent. pg_dump `qualiof-pre-extid-prod0673`.

## CAUSE RACINE du sur-merge — 8 ExternalIdentity SmartOF sur PROD-0662

L'import SmartOF a mappé **8 produits SmartOF distincts → le seul PROD-0662** (d'où le sur-merge). 1 correcte (be002c64 Maîtriser l'IA), 7 mal pointées. Re-point 5a28eafc fait. **RESTE à re-pointer (proposé, en attente Laurent)** :
| externalId | Produit SmartOF | Cible base correcte |
| --- | --- | --- |
| 23d35170 | Anglais 21h | 71ba9536 (PROD-0667) |
| 3cae3d2b | Optimisation SI | cada712b (PROD-0668) |
| 3dfdfbb8 | IA générative 105h | cf80eb86 (PROD-0670) |
| 8fd6d70b | Tracfin 4h | e9666762 (PROD-0671) |
| 03bdb908 | Immobilier 2h 8h | 00ce2cc6 (coquille inactive) |
| b7be9231 | (absent export 12-06) | à investiguer |
Enjeu : sans re-point, un futur **sync SmartOF re-collapserait** ces produits dans PROD-0662. Non bloquant pour Plan 08/Lot A (produits base déjà corrects).

**FAIT 2026-06-13 — 5 re-points appliqués** (pg_dump `qualiof-pre-extid-5repoints`, 911/911) : 23d35170→PROD-0667, 3cae3d2b→PROD-0668, 3dfdfbb8→PROD-0670, 8fd6d70b→PROD-0671, 03bdb908→PROD-0669. Chaque produit SmartOF pointe désormais vers sa bonne cible base. PROD-0662 ne garde que be002c64 (Maîtriser l'IA, correct) + **b7be9231 (absent export 12-06, à investiguer)** — laissé sur PROD-0662 par défaut. Intégrité base↔SmartOF restaurée (sauf b7be9231) → un futur sync ne re-collapsera plus. NB Optimisation SI : « secteur financier » CONSERVÉ (public cabinets gestion patrimoine/banque/assurance, cohérent — contrairement à PROD-0673 immobilier où corrigé).

**SES-0084 (40h) — TRANCHÉE 2026-06-13 : produit distinct créé.** Le programme officiel fourni par Laurent est **100 % immobilier** (prospection immo, annonces immo, scripts immo, assistant IA immobilier, public agents/mandataires/négociateurs) → réutilisation `d61555db` REFUSÉE (programme générique-entreprise : automatisation/Zapier/marketing, zéro immobilier). Faux ami écarté : `cf961a3d` (8h ≠ 40h). Produit `PROD-0673` créé (40h, 1680€, capacité 25, programme + 8 objectifs, handicap inclus, pg_dump `qualiof-pre-create-prod0673`). ⚠️ 1 correction tracée : « études de cas issus du secteur **financier** » (reliquat template du source) → corrigé en « secteur **immobilier** » (à confirmer Laurent).
