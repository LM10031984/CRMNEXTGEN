# Import de la bibliothèque de modules — Drive (lot I-1)

_Simulation (dry-run) le 2026-09-17 · instantané du 2026-09-14._

> **Cible : PRODUCTION** — hôte `aws-0-eu-west-1.pooler.supabase.com`, project ref `gntlqyscahbgjrmsbzil`.
> Tenant `db191440-a144-48d1-93c1-767e6f647f2c` « Start Academy » · **51 produits** (dont 39 actifs) · **86 modules** avant ce run.

## En un coup d’œil

- **72** rayons créés, **0** mis à jour, **4** écartés
- **400 modules** entrent dans la bibliothèque
- **aucun rayon activé** — corollaire D-19 du 10/09/2026 : ce qui devient vendable est le programme COMPOSÉ (lot I-2), jamais le conteneur importé
- **aucun produit existant modifié** — les doublons écartent le RAYON, jamais le produit vendu (D-19 bis)
- **6** rayon(s) écarté(s) de la reco pour doublon d'un produit vendu (D-19 bis)

## ⛔ Barrière Faros — écartés du versement

Écarté — contenu asynchrone, et l'import ne sait poser que PRESENTIEL. Le champ de modalité n'existe pas encore (barrière Faros, condition ①).

**La raison n'est pas la qualité du contenu.** `SA-ACQ-M003` et `SA-ADM-M001` déclarent « G3 prêt à produire » en v1.0 — ce sont les deux seuls du corpus dans ce cas. Ils sont écartés parce que ce sont des capsules **asynchrones** et que l'import ne sait poser qu'une modalité, `PRESENTIEL`, en dur. Les verser écrirait une **fausse modalité sur une pièce Qualiopi, en production**.

⚠️ **Divergence assumée entre les bases** : la base LOCALE porte déjà ces entrées `faros:` (import du 11/09), la PRODUCTION ne les aura pas. Ce n'est pas un écart à rattraper par un import — cf. `.planning/quick/260916-faros-barriere/deferred-items.md`.

- `faros:SA-ACQ-M003` « Trouver des vendeurs avant les autres » — 1 module(s) NON versé(s).
- `faros:SA-ADM-M001` « AGEFICE - Sécuriser et transmettre sa demande de financement » — 1 module(s) NON versé(s).

## Doublons du catalogue vendu — la version vendue fait foi (D-19 bis)

Ces programmes existent déjà comme produits QualiOF **actifs**. Le produit vendu n’est pas touché — ni sa durée, ni sa page publique « Programme détaillé », qui est l’information préalable remise au client. C’est le RAYON qui s’efface : il reste consultable en base, mais **ses modules sortent du chemin de composition**.

Le lien est posé une fois et n’est jamais recalculé : un dossier Drive renommé ne peut pas réintroduire le doublon. Le délier est une décision de catalogue.

- `drive:020` « Face a face acheteurs » est écarté au profit de `BIB-D008` (`drive:008`) — **arbitrage de Laurent du 11/09/2026** : 008 est le numéro de ce programme dans la numérotation catalogue de Laurent (008 → 074) ; 020 est une copie rangée sous un autre numéro. Le rayon reste en base et reste consultable ; seuls ses modules sortent de la composition.
- `drive:030` « L'immobilier et sa prospection efficace devenir in » fait doublon avec le produit vendu `PROD-0003` : **c'est la version vendue qui fait foi**, les modules du rayon sortent de la reco. Le produit vendu n'est pas touché.
- `drive:046` « Tracfin » fait doublon avec le produit vendu `PROD-0671` : **c'est la version vendue qui fait foi**, les modules du rayon sortent de la reco. Le produit vendu n'est pas touché.
- `drive:053` « Cycle complet de prospection, relation client et n » fait doublon avec le produit vendu `PROD-053` : **c'est la version vendue qui fait foi**, les modules du rayon sortent de la reco. Le produit vendu n'est pas touché.
- `drive:055` « Maitrise des techniques de vente immobilière » fait doublon avec le produit vendu `PROD-055` : **c'est la version vendue qui fait foi**, les modules du rayon sortent de la reco. Le produit vendu n'est pas touché.
- `drive:073` « Optimiser son activité immobilière grâce à l’I » fait doublon avec le produit vendu `PROD-0673` : **c'est la version vendue qui fait foi**, les modules du rayon sortent de la reco. Le produit vendu n'est pas touché.
- `drive:074` « Maîtriser l’Intelligence Artificielle pour dével » fait doublon avec le produit vendu `PROD-0662` : **c'est la version vendue qui fait foi**, les modules du rayon sortent de la reco. Le produit vendu n'est pas touché.

## Détail par rayon

| Source | Action | Code | Modules | Découpage | Heures | Programme |
|---|---|---|---|---|---|---|
| `drive:000` | écarté | `BIB-D000` | 0 | bloc-unique | — | Prompts IA |
| `drive:001` | créé | `BIB-D001` | 4 | horaire | déclarée (« 9 heures (1 journée) ») | Générer de la recommandation |
| `drive:002` | créé | `BIB-D002` | 4 | horaire | somme des modules | Acquisition et traitement de leads vendeurs |
| `drive:003` | créé | `BIB-D003` | 4 | horaire | déclarée (« 9 heures (1 journée) ») | Les leviers de l'estimation |
| `drive:004` | créé | `BIB-D004` | 4 | horaire | déclarée (« 9 heures (1 journée) ») | Jeu de rôle face à face vendeurs |
| `drive:005` | créé | `BIB-D005` | 4 | horaire | déclarée (« 9 heures (1 journée) ») | Le suivi vendeur, L'essentiel pour réussir |
| `drive:006` | créé | `BIB-D006` | 4 | horaire | déclarée (« 9 heures (1 journée) ») | Acquisition et traitement Leads acquéreurs |
| `drive:007` | créé | `BIB-D007` | 4 | horaire | déclarée (« 9 heures (1 journée) ») | Suivi acquéreurs |
| `drive:008` | créé | `BIB-D008` | 4 | horaire | déclarée (« 9 heures (1 journée) ») | Face à face acheteurs |
| `drive:009` | créé | `BIB-D009` | 4 | horaire | déclarée (« 8 heures (1 journée) ») | L'art de la négociation |
| `drive:010` | créé | `BIB-D010` | 2 | liste-imbriquee | déclarée (« 7 heures (1 journée ou 2 demi-journées) ») | Accélérez votre succès en immobilier de la théorie à la |
| `drive:011` | créé | `BIB-D011` | 8 | horaire | déclarée (« 7 heures (1 journée ou 2 demi-journées) ») | Au delà des basics techniques avancées pour instagram |
| `drive:012` | créé | `BIB-D012` | 2 | liste-imbriquee | déclarée (« 5 heures (1 journée ou 2 demi-journées) ») | Basic acheteur |
| `drive:013` | créé | `BIB-D013` | 4 | liste-imbriquee | somme des modules | Basic vendeur |
| `drive:014` | créé | `BIB-D014` | 4 | liste-imbriquee | déclarée (« 7 heures (1 journée ou 2 demi-journées) ») | Boostez, animez et fidélisez les performances de votre équ |
| `drive:015` | créé | `BIB-D015` | 1 | bloc-unique | déclarée (« 7 heures (1 journée) ») | Conquête vendeur |
| `drive:016` | créé | `BIB-D016` | 3 | duree-declaree | déclarée (« 7 heures (1 journée ou 2 demi-journées) ») | Découverte et stratégie pour les acheteurs |
| `drive:017` | créé | `BIB-D017` | 3 | duree-declaree | déclarée (« 7 heures (1 journée ou 2 demi-journées) ») | Découverte vendeur et estimation percutante |
| `drive:018` | créé | `BIB-D018` | 10 | horaire | déclarée (« 14 heures (2 journées ou 4 demi-journées ») | Découvrir le community management et la gestion des réseau |
| `drive:019` | créé | `BIB-D019` | 5 | horaire | déclarée (« 7 heures (1 journée ou 2 demi-journées) ») | E-reputation,référencement experience utilisateur |
| `drive:020` | créé | `BIB-D020` | 4 | liste-imbriquee | déclarée (« 7 heures (1 journée) ») | Face a face acheteurs |
| `drive:021` | créé | `BIB-D021` | 4 | horaire | déclarée (« 7 heures (1 journée) ») | Face à face vendeurs |
| `drive:022` | créé | `BIB-D022` | 3 | liste-imbriquee | déclarée (« 7 heures (1 journée) ») | Forgez votre succès immobilier avec la préparation mentale |
| `drive:023` | créé | `BIB-D023` | 4 | liste-imbriquee | déclarée (« 7 heures (1 journée ou 2 demi-journées) ») | Formation immobilière 360 devenez le maitre de votre succè |
| `drive:024` | créé | `BIB-D024` | 11 | horaire | déclarée (« 7 heures (1 journée ou 2 demi-journées) ») | Formation marketing digital maitrisez la vidéo |
| `drive:025` | créé | `BIB-D025` | 3 | liste-imbriquee | déclarée (« 7 heures (1 journée ou 2 demi-journées) ») | Formation recrutement |
| `drive:026` | créé | `BIB-D026` | 3 | duree-declaree | déclarée (« 7 heures (1 journée ou 2 demi-journées) ») | Génération de leads efficace |
| `drive:027` | créé | `BIB-D027` | 2 | liste-imbriquee | déclarée (« 7 heures (1 journée ou 2 demi-journées) ») | Gestion stratégique des objectifs en immobilier |
| `drive:028` | créé | `BIB-D028` | 6 | horaire | déclarée (« 7 heures (1 journée ou 2 demi-journées) ») | Instagram immobilier Pro |
| `drive:029` | créé | `BIB-D029` | 1 | bloc-unique | déclarée (« 7 heures (1 journée ou 2 demi-journées) ») | L'immobilier et sa prospection efficace |
| `drive:030` | créé | `BIB-D030` | 1 | bloc-unique | déclarée (« 7 heures (1 journée ou 2 demi-journées) ») | L'immobilier et sa prospection efficace devenir incontournab |
| `drive:031` | créé | `BIB-D031` | 3 | duree-declaree | déclarée (« 7 heures (1 journée ou 2 demi-journées) ») | Maitrisez les bases juridiques et analysez son secteur |
| `drive:032` | créé | `BIB-D032` | 10 | horaire | déclarée (« 14 heures (2 journées ou 4 demi-journées ») | Maitrisez votre impact numérique maximisez le référenceme |
| `drive:033` | créé | `BIB-D033` | 2 | liste-imbriquee | déclarée (« 7 heures (1 journée ou 2 demi-journées) ») | Maximisez vos leads et dominez votre base de données |
| `drive:034` | créé | `BIB-D034` | 3 | duree-declaree | déclarée (« 7 heures (1 journée ou 2 demi-journées) ») | Négociation et compromis |
| `drive:035` | créé | `BIB-D035` | 3 | liste-imbriquee | déclarée (« 7 heures (1 journée ou 2 demi-journées) ») | Préparation mentale pour excellence |
| `drive:036` | créé | `BIB-D036` | 10 | horaire | déclarée (« 14 heures (2 journées ou 4 demi-journées ») | Propulsez votre campagne de newsletters |
| `drive:037` | créé | `BIB-D037` | 3 | liste-imbriquee | déclarée (« 3,5 heures (1/2 journée) ») | Transformez vos Mandats et Décrochez des Rendez-vous de Sui |
| `drive:038` | créé | `BIB-D038` | 3 | liste-imbriquee | déclarée (« 7 heures (1 journée) ») | Transformez votre recrutement en un jeu gagnant |
| `drive:039` | créé | `BIB-D039` | 3 | duree-declaree | déclarée (« 7 heures (1 journée ou 2 demi-journées) ») | Vente de mandats exclusifs et gestion des objections |
| `drive:041` | créé | `BIB-D041` | 5 | horaire | somme des modules | Cadastre.com Niveau 1  Les Bases Essentielles pour les Profe |
| `drive:042` | créé | `BIB-D042` | 9 | horaire | somme des modules | Cadastre.com  Prospection et Gestion Avancée pour Agents Co |
| `drive:043` | créé | `BIB-D043` | 9 | horaire | somme des modules | Cadastre.com et IA  Formation Expert Niveau 3 |
| `drive:044` | créé | `BIB-D044` | 1 | bloc-unique | somme des modules | Déontologie |
| `drive:045` | créé | `BIB-D045` | 1 | bloc-unique | somme des modules | Non Discrimination |
| `drive:046` | créé | `BIB-D046` | 1 | bloc-unique | somme des modules | Tracfin |
| `drive:047` | créé | `BIB-D047` | 31 | horaire | somme des modules | Pack Digital 60h |
| `drive:048` | créé | `BIB-D048` | 1 | bloc-unique | somme des modules | Propulsez votre Performance Immobilière avec l'IA |
| `drive:049` | créé | `BIB-D049` | 1 | bloc-unique | somme des modules | Propulsez votre Expertise immobilière avec l’IA -  Annonces |
| `drive:050` | créé | `BIB-D050` | 7 | module | somme des modules | Optimiser l'Immobilier grâce à l'Intelligence Artificielle |
| `drive:051` | écarté | `BIB-D051` | 0 | bloc-unique | — | Intégrer l'intelligence artificielle en entreprise pour gag |
| `drive:052` | créé | `BIB-D052` | 3 | module | déclarée (« 21 heures (3 journées de 7 heures) ») | Maitrisez l'IA en 3 Jours  Boostez productivité et strategi |
| `drive:053` | créé | `BIB-D053` | 44 | horaire | somme des modules | Cycle complet de prospection, relation client et négociatio |
| `drive:054` | créé | `BIB-D054` | 1 | bloc-unique | déclarée (« Programme de formation sur 1 journée de  ») | L'intelligence artificielle au service des conseillers immob |
| `drive:055` | créé | `BIB-D055` | 10 | module | somme des modules | Maitrise des techniques de vente immobilière |
| `drive:056` | créé | `BIB-D056` | 1 | bloc-unique | somme des modules | Vendez Mieux avec l’IA : Suivi Vendeur, Annonces Impactantes |
| `drive:057` | créé | `BIB-D057` | 11 | module | somme des modules | Intégrer l’intelligence artificielle pour gagner en product |
| `drive:058` | créé | `BIB-D058` | 6 | horaire | déclarée (« Une journée ( 8 heures) ») | Booster vendeur : Devenir incontournable auprès des vendeur |
| `drive:059` | créé | `BIB-D059` | 6 | horaire | déclarée (« une journée ( 8 heures) ») | Booster Acheteurs |
| `drive:060` | créé | `BIB-D060` | 5 | horaire | déclarée (« une journée ( 8 heures) ») | IA Manager, Piloter, Motiver et Performer grâce à l'IA |
| `drive:061` | créé | `BIB-D061` | 14 | horaire | somme des modules | Créer et diffuser du contenu à impact sur les réseaux soc |
| `drive:062` | créé | `BIB-D062` | 2 | module | somme des modules | Propulsez la performance de votre entreprise avec l’intellig |
| `drive:063` | créé | `BIB-D063` | 3 | module | déclarée (« 8 heures (1 journée) ») | Non Discrimination, Tracfin et déontotlgie |
| `drive:064` | créé | `BIB-D064` | 3 | module | somme des modules | Exploiter l’intelligence artificielle dans l’immobilier |
| `drive:065` | créé | `BIB-D065` | 10 | horaire | déclarée (« Deux journées (16 heures) ») | L'intelligence artificielle au service des conseillers immob |
| `drive:066` | créé | `BIB-D066` | 10 | module | déclarée (« Programme de formation sur 10 jours (72  ») | Formation Audax - Communication digitale 72h |
| `drive:067` | créé | `BIB-D067` | 1 | bloc-unique | déclarée (« Programme de formation sur 1 demi journé ») | Débuter avec l’intelligence artificielle : les fondamentaux |
| `drive:068` | créé | `BIB-D068` | 1 | bloc-unique | déclarée (« Programme de formation sur 1 journée 8 h ») | Management et performance augmentés par l’IA |
| `drive:069` | créé | `BIB-D069` | 1 | bloc-unique | déclarée (« Programme de formation sur 1 journée 8 h ») | Découvrir et utiliser l’intelligence artificielle générat |
| `drive:070` | créé | `BIB-D070` | 8 | horaire | déclarée (« Une journée (8 heures) ») | Immobilier : gagnez 2h par jour grâce à l’IA - 8h00 |
| `drive:071` | créé | `BIB-D071` | 15 | module | somme des modules | IA générative : consolider les bases, structurer ses usage |
| `drive:072` | créé | `BIB-D072` | 9 | module | somme des modules | IA générative : consolider les bases, structurer ses usage |
| `drive:073` | créé | `BIB-D073` | 5 | module | déclarée (« 40 heures (5 journées de 8h) ») | Optimiser son activité immobilière grâce à l’Intelligenc |
| `drive:074` | créé | `BIB-D074` | 5 | module | déclarée (« 35 heures (5 journées de 7h) ») | Maîtriser l’Intelligence Artificielle pour développer son  |
| `faros:SA-ACQ-M003` | écarté | `BIB-FACQ-M003` | 0 | bloc-unique | — | Trouver des vendeurs avant les autres |
| `faros:SA-ADM-M001` | écarté | `BIB-FADM-M001` | 0 | bloc-unique | — | AGEFICE - Sécuriser et transmettre sa demande de financement |

## Ce qui demande un œil

### `drive:000` — Prompts IA

- Aucun .docx dans le dossier — rien à importer.
- Aucun module extrait — rien à importer.

### `drive:002` — Acquisition et traitement de leads vendeurs

- Module « Identifier et exploiter les sources de g » exclu des sorties client (pige).

### `drive:008` — Face à face acheteurs

- drive:008#1 — titre tranché par Laurent le 14/09/2026 : « Mettre en Pratique des Situations de Découverte du Projet Acheteur-Vendeur » → « Mener une découverte du projet acheteur-vendeur en situation » (capitales de milieu de phrase)

### `drive:010` — Accélérez votre succès en immobilier de la théorie à la

- `drive:010#2` — déroulé entièrement fait de mentions d'organisme — vidé (module fantôme né du pied de page, découpage au lot 3).
- 2 module(s) sans durée lisible — défaut appliqué à l'import.
- 2 module(s) à 60 min par défaut (D-17/D-20).

### `drive:012` — Basic acheteur

- 2 module(s) sans durée lisible — défaut appliqué à l'import.
- drive:012#2 — titre tranché par Laurent le 14/09/2026 : « Pratiquer une découverte acheteur de qualité en questionnant et écoutant activement les besoins des acheteurs : » → « Conduire une découverte acheteur par le questionnement et l’écoute active » (deux-points final, et 108 caractères)
- 2 module(s) à 60 min par défaut (D-17/D-20).

### `drive:013` — Basic vendeur

- 4 module(s) sans durée lisible — défaut appliqué à l'import.
- 4 module(s) à 60 min par défaut (D-17/D-20).

### `drive:014` — Boostez, animez et fidélisez les performances de votre équ

- `drive:014#4` — déroulé entièrement fait de mentions d'organisme — vidé (module fantôme né du pied de page, découpage au lot 3).
- 4 module(s) sans durée lisible — défaut appliqué à l'import.
- 4 module(s) à 60 min par défaut (D-17/D-20).

### `drive:015` — Conquête vendeur

- Aucun découpage reconnu — importé en un seul module, à découper à la main.
- 1 module(s) sans durée lisible — défaut appliqué à l'import.
- 1 module(s) à 60 min par défaut (D-17/D-20).

### `drive:020` — Face a face acheteurs

- 3 module(s) sans durée lisible — défaut appliqué à l'import.
- Écarté de la reco : doublon de `drive:008` (arbitrage du 11/09/2026).
- 3 module(s) à 60 min par défaut (D-17/D-20).

### `drive:022` — Forgez votre succès immobilier avec la préparation mentale

- 3 module(s) sans durée lisible — défaut appliqué à l'import.
- 3 module(s) à 60 min par défaut (D-17/D-20).

### `drive:023` — Formation immobilière 360 devenez le maitre de votre succè

- 4 module(s) sans durée lisible — défaut appliqué à l'import.
- 4 module(s) à 60 min par défaut (D-17/D-20).

### `drive:025` — Formation recrutement

- 3 module(s) sans durée lisible — défaut appliqué à l'import.
- 3 module(s) à 60 min par défaut (D-17/D-20).

### `drive:027` — Gestion stratégique des objectifs en immobilier

- `drive:027#2` — déroulé entièrement fait de mentions d'organisme — vidé (module fantôme né du pied de page, découpage au lot 3).
- 2 module(s) sans durée lisible — défaut appliqué à l'import.
- 2 module(s) à 60 min par défaut (D-17/D-20).

### `drive:029` — L'immobilier et sa prospection efficace

- Aucun découpage reconnu — importé en un seul module, à découper à la main.
- 1 module(s) sans durée lisible — défaut appliqué à l'import.
- Module « L’immobilier et sa prospection efficace  » exclu des sorties client (pige).
- 1 module(s) à 60 min par défaut (D-17/D-20).

### `drive:030` — L'immobilier et sa prospection efficace devenir incontournab

- Aucun découpage reconnu — importé en un seul module, à découper à la main.
- 1 module(s) sans durée lisible — défaut appliqué à l'import.
- Écarté de la reco : doublon de `PROD-0003` (D-19 bis).
- Module « L’immobilier et sa prospection efficace  » exclu des sorties client (pige).
- 1 module(s) à 60 min par défaut (D-17/D-20).

### `drive:033` — Maximisez vos leads et dominez votre base de données

- 2 module(s) sans durée lisible — défaut appliqué à l'import.
- 2 module(s) à 60 min par défaut (D-17/D-20).

### `drive:035` — Préparation mentale pour excellence

- 3 module(s) sans durée lisible — défaut appliqué à l'import.
- 3 module(s) à 60 min par défaut (D-17/D-20).

### `drive:037` — Transformez vos Mandats et Décrochez des Rendez-vous de Sui

- 3 module(s) sans durée lisible — défaut appliqué à l'import.
- drive:037#2 — titre tranché par Laurent le 14/09/2026 : « Préparer un Excellent Dossier de Suivi Vendeur » → « Préparer un dossier de suivi vendeur complet » (capitales de milieu de phrase, et « Excellent » n’est pas évaluable)
- 3 module(s) à 60 min par défaut (D-17/D-20).

### `drive:038` — Transformez votre recrutement en un jeu gagnant

- `drive:038#3` — déroulé entièrement fait de mentions d'organisme — vidé (module fantôme né du pied de page, découpage au lot 3).
- 3 module(s) sans durée lisible — défaut appliqué à l'import.
- 3 module(s) à 60 min par défaut (D-17/D-20).

### `drive:044` — Déontologie

- Aucun découpage reconnu — importé en un seul module, à découper à la main.
- 1 module(s) sans durée lisible — défaut appliqué à l'import.
- 1 module(s) à 60 min par défaut (D-17/D-20).

### `drive:045` — Non Discrimination

- Aucun découpage reconnu — importé en un seul module, à découper à la main.
- 1 module(s) sans durée lisible — défaut appliqué à l'import.
- Classé REGLEMENTAIRE (taux OPCO EP 40 €/h).
- 1 module(s) à 60 min par défaut (D-17/D-20).

### `drive:046` — Tracfin

- Aucun découpage reconnu — importé en un seul module, à découper à la main.
- 1 module(s) sans durée lisible — défaut appliqué à l'import.
- Écarté de la reco : doublon de `PROD-0671` (D-19 bis).
- Classé REGLEMENTAIRE (taux OPCO EP 40 €/h).
- 1 module(s) à 60 min par défaut (D-17/D-20).

### `drive:047` — Pack Digital 60h

- drive:047#20 — titre tranché par Laurent le 14/09/2026 : « Atelier pratique : Simulation de réponse aux avis clients. » → « Répondre aux avis clients en ligne, positifs comme négatifs » (n’est pas un objectif — le moteur refuse de l’inventer et le dit)

### `drive:048` — Propulsez votre Performance Immobilière avec l'IA

- Aucun découpage reconnu — importé en un seul module, à découper à la main.
- 1 module(s) sans durée lisible — défaut appliqué à l'import.
- 1 module(s) à 60 min par défaut (D-17/D-20).

### `drive:049` — Propulsez votre Expertise immobilière avec l’IA -  Annonces

- Aucun découpage reconnu — importé en un seul module, à découper à la main.
- 1 module(s) sans durée lisible — défaut appliqué à l'import.
- 1 module(s) à 60 min par défaut (D-17/D-20).

### `drive:050` — Optimiser l'Immobilier grâce à l'Intelligence Artificielle

- 7 module(s) sans durée lisible — défaut appliqué à l'import.
- Module « Introduction à l’IA et Prospection Vende » exclu des sorties client (pige).
- 7 module(s) à 60 min par défaut (D-17/D-20).

### `drive:051` — Intégrer l'intelligence artificielle en entreprise pour gag

- Aucun .docx dans le dossier — rien à importer.
- Aucun module extrait — rien à importer.

### `drive:052` — Maitrisez l'IA en 3 Jours  Boostez productivité et strategi

- 3 module(s) sans durée lisible — défaut appliqué à l'import.
- 3 module(s) à 60 min par défaut (D-17/D-20).

### `drive:053` — Cycle complet de prospection, relation client et négociatio

- Écarté de la reco : doublon de `PROD-053` (D-19 bis).
- Module « Identifier et exploiter les sources de g » exclu des sorties client (pige).

### `drive:054` — L'intelligence artificielle au service des conseillers immob

- Aucun découpage reconnu — importé en un seul module, à découper à la main.
- 1 module(s) sans durée lisible — défaut appliqué à l'import.
- 1 module(s) à 60 min par défaut (D-17/D-20).

### `drive:055` — Maitrise des techniques de vente immobilière

- 10 module(s) sans durée lisible — défaut appliqué à l'import.
- Écarté de la reco : doublon de `PROD-055` (D-19 bis).
- 10 module(s) à 60 min par défaut (D-17/D-20).

### `drive:056` — Vendez Mieux avec l’IA : Suivi Vendeur, Annonces Impactantes

- Aucun découpage reconnu — importé en un seul module, à découper à la main.
- 1 module(s) sans durée lisible — défaut appliqué à l'import.
- 1 module(s) à 60 min par défaut (D-17/D-20).

### `drive:057` — Intégrer l’intelligence artificielle pour gagner en product

- 11 module(s) sans durée lisible — défaut appliqué à l'import.
- 11 module(s) à 60 min par défaut (D-17/D-20).

### `drive:062` — Propulsez la performance de votre entreprise avec l’intellig

- 2 module(s) sans durée lisible — défaut appliqué à l'import.
- 2 module(s) à 60 min par défaut (D-17/D-20).

### `drive:063` — Non Discrimination, Tracfin et déontotlgie

- 3 module(s) sans durée lisible — défaut appliqué à l'import.
- Classé REGLEMENTAIRE (taux OPCO EP 40 €/h).
- 3 module(s) à 60 min par défaut (D-17/D-20).

### `drive:064` — Exploiter l’intelligence artificielle dans l’immobilier

- 3 module(s) sans durée lisible — défaut appliqué à l'import.
- 3 module(s) à 60 min par défaut (D-17/D-20).

### `drive:066` — Formation Audax - Communication digitale 72h

- 10 module(s) sans durée lisible — défaut appliqué à l'import.
- 10 module(s) à 60 min par défaut (D-17/D-20).

### `drive:067` — Débuter avec l’intelligence artificielle : les fondamentaux

- Aucun découpage reconnu — importé en un seul module, à découper à la main.
- 1 module(s) sans durée lisible — défaut appliqué à l'import.
- 1 module(s) à 60 min par défaut (D-17/D-20).

### `drive:068` — Management et performance augmentés par l’IA

- Aucun découpage reconnu — importé en un seul module, à découper à la main.
- 1 module(s) sans durée lisible — défaut appliqué à l'import.
- 1 module(s) à 60 min par défaut (D-17/D-20).

### `drive:069` — Découvrir et utiliser l’intelligence artificielle générat

- Aucun découpage reconnu — importé en un seul module, à découper à la main.
- 1 module(s) sans durée lisible — défaut appliqué à l'import.
- 1 module(s) à 60 min par défaut (D-17/D-20).

### `drive:071` — IA générative : consolider les bases, structurer ses usage

- 15 module(s) sans durée lisible — défaut appliqué à l'import.
- 15 module(s) à 60 min par défaut (D-17/D-20).

### `drive:072` — IA générative : consolider les bases, structurer ses usage

- 9 module(s) sans durée lisible — défaut appliqué à l'import.
- 9 module(s) à 60 min par défaut (D-17/D-20).

### `drive:073` — Optimiser son activité immobilière grâce à l’Intelligenc

- 5 module(s) sans durée lisible — défaut appliqué à l'import.
- Écarté de la reco : doublon de `PROD-0673` (D-19 bis).
- 5 module(s) à 60 min par défaut (D-17/D-20).

### `drive:074` — Maîtriser l’Intelligence Artificielle pour développer son 

- 5 module(s) sans durée lisible — défaut appliqué à l'import.
- Écarté de la reco : doublon de `PROD-0662` (D-19 bis).
- 5 module(s) à 60 min par défaut (D-17/D-20).

### `faros:SA-ACQ-M003` — Trouver des vendeurs avant les autres

- Aucun découpage reconnu — importé en un seul module, à découper à la main.
- 1 module(s) sans durée lisible — défaut appliqué à l'import.
- Aucun objectif pédagogique lisible.
- Profil diagnostic déclaré : Le Prospecteur en Retrait
- Écarté — contenu asynchrone, et l'import ne sait poser que PRESENTIEL. Le champ de modalité n'existe pas encore (barrière Faros, condition ①).

### `faros:SA-ADM-M001` — AGEFICE - Sécuriser et transmettre sa demande de financement

- Aucun découpage reconnu — importé en un seul module, à découper à la main.
- 1 module(s) sans durée lisible — défaut appliqué à l'import.
- Aucun objectif pédagogique lisible.
- Écarté — contenu asynchrone, et l'import ne sait poser que PRESENTIEL. Le champ de modalité n'existe pas encore (barrière Faros, condition ①).

