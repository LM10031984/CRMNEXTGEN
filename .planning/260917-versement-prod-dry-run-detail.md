# Dry-run corrigé — versement du catalogue Drive en PRODUCTION, module par module

_Simulation du 17/09/2026, **après** les trois correctifs (barrière Faros dans l’importeur,
résolution des liens en phase 2, cible imprimée). Remplace la version du même jour qui
décrivait 74 rayons dont 2 Faros._

> **Cible : PRODUCTION** — hôte `aws-0-eu-west-1.pooler.supabase.com`, project ref `gntlqyscahbgjrmsbzil`.
> Tenant `db191440-a144-48d1-93c1-767e6f647f2c` « Start Academy » · **51 produits** (dont 39 actifs) · **86 modules** avant ce run.
> Instantané du 14/09/2026. **Aucune écriture** : ce fichier dit ce qui SERAIT écrit.

## Comptes

| | |
|---|---:|
| Rayons à créer | **72** |
| Rayons écartés | **4** — 2 sans module, 2 Faros |
| Rayons déjà présents en prod | **0** |
| Modules à créer | **400** |
| Modules NON versés (Faros) | **2** |
| — dont exclus des sorties client (pige) | 5 |
| — dont sans aucun déroulé (4 modules fantômes) | 33 |
| — dont hors composition (D-19 bis + phase 2) | 70 |
| Rayons activés | **0** — `isActive: false` en dur (D-19) |

### `drive:000` · `BIB-D000` — Prompts IA

**⛔ ÉCARTÉ** — **aucun module extrait du dossier source** : rien à importer.

_Aucun module._

### `drive:001` · `BIB-D001` — Générer de la recommandation

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:001#1` | Utiliser sa base de données pour augmenter sa notoriété | 135 | 485 car. de déroulé |
| `drive:001#2` | Utiliser les réseaux sociaux pour gagner en recommandation | 90 | 492 car. de déroulé |
| `drive:001#3` | Identifier des sources complémentaires pour développer de la recommandation | 120 | 560 car. de déroulé |
| `drive:001#4` | Synthèse et mise en pratique des acquis | 105 | 294 car. de déroulé |

### `drive:002` · `BIB-D002` — Acquisition et traitement de leads vendeurs

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:002#1` | Analyser et segmenter un secteur de prospection | 75 | 518 car. de déroulé |
| `drive:002#2` | Identifier et exploiter les sources de génération de leads vendeurs | 90 | ⛔ **exclu des sorties client** (pige) · 521 car. de déroulé |
| `drive:002#3` | Créer, gérer et entretenir une base de données de prospects | 120 | 472 car. de déroulé |
| `drive:002#4` | Synthèse et mise en pratique des acquis | 105 | 272 car. de déroulé |

### `drive:003` · `BIB-D003` — Les leviers de l'estimation

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:003#1` | Générer du business supplémentaire avec les dossiers d'estimation | 135 | 514 car. de déroulé |
| `drive:003#2` | Apprendre à utiliser les outils adaptés | 90 | 480 car. de déroulé |
| `drive:003#3` | Apporter de la valeur sur les réseaux sociaux | 120 | 521 car. de déroulé |
| `drive:003#4` | Synthèse et mise en pratique des acquis | 105 | 272 car. de déroulé |

### `drive:004` · `BIB-D004` — Jeu de rôle face à face vendeurs

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:004#1` | Mise en pratique du rendez vous R1 en situation réelle | 135 | 239 car. de déroulé |
| `drive:004#2` | Mise en pratique de la remise d’estimation | 90 | 174 car. de déroulé |
| `drive:004#3` | Entrainer sa capacité à signer des mandats et à traiter les objections | 120 | 142 car. de déroulé |
| `drive:004#4` | Mise en pratique du rendez-vous de bilan de commercialisation en situation réelle | 105 | 153 car. de déroulé |

### `drive:005` · `BIB-D005` — Le suivi vendeur, L'essentiel pour réussir

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:005#1` | Apprendre à donner du feedback sur les actions entreprises et les résultats obtenus | 135 | 454 car. de déroulé |
| `drive:005#2` | Renforcer la relation pour gagner des recommandations | 90 | 417 car. de déroulé |
| `drive:005#3` | Présenter et respecter les engagements vis-à-vis du client vendeur | 120 | 465 car. de déroulé |
| `drive:005#4` | Synthèse et mise en pratique des acquis | 105 | 293 car. de déroulé |

### `drive:006` · `BIB-D006` — Acquisition et traitement Leads acquéreurs

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:006#1` | Apprendre à vendre un rendez-vous découverte au téléphone | 135 | 649 car. de déroulé |
| `drive:006#2` | Identifier les clients acheteurs | 90 | 490 car. de déroulé |
| `drive:006#3` | Réaliser une découverte de qualité et installer la relation | 120 | 513 car. de déroulé |
| `drive:006#4` | Synthèse et mise en pratique des acquis | 105 | 297 car. de déroulé |

### `drive:007` · `BIB-D007` — Suivi acquéreurs

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:007#1` | Obtenir le meilleur de chaque lead acheteur | 135 | 530 car. de déroulé |
| `drive:007#2` | Renforcer la relation pour obtenir des recommandations futures | 90 | 466 car. de déroulé |
| `drive:007#3` | Proposer des services annexes pour gagner avec les acheteurs | 120 | 552 car. de déroulé |
| `drive:007#4` | Synthèse et mise en pratique des acquis | 105 | 297 car. de déroulé |

### `drive:008` · `BIB-D008` — Face à face acheteurs

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:008#1` | Mener une découverte du projet acheteur-vendeur en situation | 75 | 185 car. de déroulé |
| `drive:008#2` | Pratiquer les Visites Immobilières en Situation Réelle | 120 | 140 car. de déroulé |
| `drive:008#3` | Simuler des Négociations Immobilières Réalistes | 90 | 146 car. de déroulé |
| `drive:008#4` | Entraîner à la Prise d'Offre et à la Clôture | 105 | 170 car. de déroulé |

### `drive:009` · `BIB-D009` — L'art de la négociation

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:009#1` | Apprendre l'utilisation des questions ouvertes | 135 | 531 car. de déroulé |
| `drive:009#2` | Détecter les signaux d'achat et s'y adapter | 60 | 497 car. de déroulé |
| `drive:009#3` | Trouver les leviers pour conclure une négociation | 120 | 535 car. de déroulé |
| `drive:009#4` | Synthèse et mise en pratique des acquis | 75 | 331 car. de déroulé |

### `drive:010` · `BIB-D010` — Accélérez votre succès en immobilier de la théorie à la pratique

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:010#1` | Adopter une vision optimiste pour surmonter les défis et maintenir une motivation élevée. | 60 *(défaut)* | 51 car. de déroulé |
| `drive:010#2` | Apprendre à réévaluer régulièrement le plan d'action en fonction des résultats obtenus et  | 60 *(défaut)* | ⚠️ **aucun déroulé** — module fantôme né du pied de page · 0 car. de déroulé |

### `drive:011` · `BIB-D011` — Au delà des basics techniques avancées pour instagram

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:011#1` | Introduction | 30 | 85 car. de déroulé |
| `drive:011#2` | Le Personal Branding | 75 | 166 car. de déroulé |
| `drive:011#3` | Définir son client idéal | 60 | 154 car. de déroulé |
| `drive:011#4` | Les bases de la création de contenus | 60 | 115 car. de déroulé |
| `drive:011#5` | Déjeune | 60 | ⚠️ **aucun déroulé** dans l’instantané · 0 car. de déroulé |
| `drive:011#6` | Facebook & Instagram : Une dualité complémentaire | 60 | 186 car. de déroulé |
| `drive:011#7` | Contenu avancé pour Instagram | 60 | 283 car. de déroulé |
| `drive:011#8` | Engagement et Interaction | 60 | 149 car. de déroulé |

### `drive:012` · `BIB-D012` — Basic acheteur

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:012#1` | Attirer les leads acheteurs et les convaincre de planifier un rendez-vous de découverte : | 60 *(défaut)* | 248 car. de déroulé |
| `drive:012#2` | Conduire une découverte acheteur par le questionnement et l’écoute active | 60 *(défaut)* | 2057 car. de déroulé |

### `drive:013` · `BIB-D013` — Basic vendeur

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:013#1` | Optimiser le déroulement des rendez-vous et Identifier les besoins des clients vendeurs. | 60 *(défaut)* | 480 car. de déroulé |
| `drive:013#2` | Maîtriser les outils d'estimation de prix de vente et savoir la présenter efficacement : | 60 *(défaut)* | 268 car. de déroulé |
| `drive:013#3` | Présenter efficacement ses services et savoir se vendre : | 60 *(défaut)* | 285 car. de déroulé |
| `drive:013#4` | Maîtriser la trame des objections : | 60 *(défaut)* | 281 car. de déroulé |

### `drive:014` · `BIB-D014` — Boostez, animez et fidélisez les performances de votre équipe

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:014#1` | Utiliser des outils d'analyse pour identifier les tendances et les opportunités d'améliora | 60 *(défaut)* | 94 car. de déroulé |
| `drive:014#2` | Appliquer des techniques de feedback constructif pour guider l'équipe vers l'amélioration  | 60 *(défaut)* | 94 car. de déroulé |
| `drive:014#3` | Élaborer des activités interactives pour encourager la participation de l'équipe et favori | 60 *(défaut)* | 75 car. de déroulé |
| `drive:014#4` | Analyser et comprendre les besoins et les attentes de l'équipe pour adapter son discours d | 60 *(défaut)* | ⚠️ **aucun déroulé** — module fantôme né du pied de page · 0 car. de déroulé |

### `drive:015` · `BIB-D015` — Conquête vendeur

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:015#1` | Conquête vendeurs | 60 *(défaut)* | 1581 car. de déroulé |

### `drive:016` · `BIB-D016` — Découverte et stratégie pour les acheteurs

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:016#1` | Maîtriser les techniques de découverte des acquéreurs | 120 | 238 car. de déroulé |
| `drive:016#2` | Élaborer des stratégies adaptées aux besoins des acquéreurs | 150 | 296 car. de déroulé |
| `drive:016#3` | Gérer les objections et les attentes des acquéreurs | 150 | 270 car. de déroulé |

### `drive:017` · `BIB-D017` — Découverte vendeur et estimation percutante

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:017#1` | Maîtriser les techniques de découverte vendeur | 120 | 257 car. de déroulé |
| `drive:017#2` | Réaliser des estimations précises et percutantes | 180 | 304 car. de déroulé |
| `drive:017#3` | Convaincre le vendeur avec des arguments solides | 120 | 233 car. de déroulé |

### `drive:018` · `BIB-D018` — Découvrir le community management et la gestion des réseaux sociaux

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:018#1` | Panorama des réseaux sociaux. | 45 | 140 car. de déroulé |
| `drive:018#2` | Le rôle du Community Manager. | 90 | 109 car. de déroulé |
| `drive:018#3` | Choisir le réseau social en fonction de la cible. | 45 | 115 car. de déroulé |
| `drive:018#4` | Création et administration d'une page Facebook. | 75 | 63 car. de déroulé |
| `drive:018#5` | Mise en pratique sur Instagram et LinkedIn. | 75 | 114 car. de déroulé |
| `drive:018#6` | Introduction aux Social Ads. | 90 | 138 car. de déroulé |
| `drive:018#7` | Mise en place d'une campagne publicitaire. | 75 | 100 car. de déroulé |
| `drive:018#8` | Les KPIs en Community Management. | 75 | 86 car. de déroulé |
| `drive:018#9` | Outils de suivi et d'analyse. | 75 | 130 car. de déroulé |
| `drive:018#10` | Cas pratiques. | 45 | 81 car. de déroulé |

### `drive:019` · `BIB-D019` — E-reputation,référencement experience utilisateur

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:019#1` | Introduction à la e-réputation. | 45 | 94 car. de déroulé |
| `drive:019#2` | Outils et méthodes pour surveiller et gérer la e-réputation. | 90 | 123 car. de déroulé |
| `drive:019#3` | Introduction à Google Maps et à la fiche d'établissement. | 45 | 156 car. de déroulé |
| `drive:019#4` | Boostez votre présence avec votre fiche Google Maps. | 45 | 102 car. de déroulé |
| `drive:019#5` | Ateliers de mise en pratique | 105 | 57 car. de déroulé |

### `drive:020` · `BIB-D020` — Face a face acheteurs

**➕ CRÉER** — créé, puis **hors composition** : lien vers `BIB-D008` **résolu en phase 2** (arbitrage de Laurent du 11/09/2026).

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:020#1` | Mettre en Pratique des Situations de Découverte du Projet Acheteur-Vendeur | 75 | hors composition (rayon écarté) · 185 car. de déroulé |
| `drive:020#2` | Pratiquer les Visites Immobilières en Situation Réelle | 60 *(défaut)* | hors composition (rayon écarté) · 155 car. de déroulé |
| `drive:020#3` | Simuler des Négociations Immobilières Réalistes | 60 *(défaut)* | hors composition (rayon écarté) · 146 car. de déroulé |
| `drive:020#4` | Entraîner à la Prise d'Offre et à la Clôture | 60 *(défaut)* | hors composition (rayon écarté) · 170 car. de déroulé |

### `drive:021` · `BIB-D021` — Face à face vendeurs

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:021#1` | Mise en pratique du rendez vous R1 en situation réelle | 75 | 239 car. de déroulé |
| `drive:021#2` | Mise en pratique de la remise d’estimation | 90 | 182 car. de déroulé |
| `drive:021#3` | Entrainer sa capacité à signer des mandats et à traiter les objections | 90 | 142 car. de déroulé |
| `drive:021#4` | Mise en pratique du rendez-vous de bilan de commercialisation en situation réelle | 75 | 153 car. de déroulé |

### `drive:022` · `BIB-D022` — Forgez votre succès immobilier avec la préparation mentale

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:022#1` | Apprendre à gérer son stress au quotidien dans la profession Immobilière | 60 *(défaut)* | 406 car. de déroulé |
| `drive:022#2` | Trouver la Raison Profonde de sa Vocation Immobilière | 60 *(défaut)* | 344 car. de déroulé |
| `drive:022#3` | Connaitre les techniques de préparation Mentale d'un Conseiller Immobilier d'Exception | 60 *(défaut)* | 366 car. de déroulé |

### `drive:023` · `BIB-D023` — Formation immobilière 360 devenez le maitre de votre succès

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:023#1` | Augmenter le pourcentage de mandats exclusifs en immobilier en appliquant des techniques d | 60 *(défaut)* | 468 car. de déroulé |
| `drive:023#2` | Suivre les vendeurs comme un professionnel en appliquant des techniques de suivi proactive | 60 *(défaut)* | 555 car. de déroulé |
| `drive:023#3` | Maîtrisez le suivi des acheteurs grâce à des techniques proactives et professionnelles | 60 *(défaut)* | 313 car. de déroulé |
| `drive:023#4` | Générer : Générer du CA additionnel en créant des offres commerciales attractives et en me | 60 *(défaut)* | 398 car. de déroulé |

### `drive:024` · `BIB-D024` — Formation marketing digital maitrisez la vidéo

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:024#1` | Introduction et Objectifs de la Journée | 15 | 37 car. de déroulé |
| `drive:024#2` | Impacts de la Vidéo sur les réseaux sociaux | 30 | 100 car. de déroulé |
| `drive:024#3` | Outils Vidéos | 30 | 60 car. de déroulé |
| `drive:024#4` | L'Art des Stories | 30 | 94 car. de déroulé |
| `drive:024#5` | Subtilités des Stories | 30 | 243 car. de déroulé |
| `drive:024#6` | Atelier Pratique | 30 | 60 car. de déroulé |
| `drive:024#7` | Introduction aux Réels | 30 | 94 car. de déroulé |
| `drive:024#8` | Création de Réels | 30 | 98 car. de déroulé |
| `drive:024#9` | Astuces Techniques et Stratégie | 30 | 132 car. de déroulé |
| `drive:024#10` | Atelier Pratique | 60 | 52 car. de déroulé |
| `drive:024#11` | Synthèse et Perspectives | 45 | 722 car. de déroulé |

### `drive:025` · `BIB-D025` — Formation recrutement

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:025#1` | Concevoir un événement de prestige : Créez un événement professionnel qui marquera les esp | 60 *(défaut)* | 651 car. de déroulé |
| `drive:025#2` | Préparer soigneusement son intervention en la structurant de manière attrayante et pertine | 60 *(défaut)* | 596 car. de déroulé |
| `drive:025#3` | Convaincre les participants de rejoindre l'entreprise en mettant en avant les avantages et | 60 *(défaut)* | 679 car. de déroulé |

### `drive:026` · `BIB-D026` — Génération de leads efficace

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:026#1` | Comprendre les principes de la génération de leads en immobilier | 120 | 300 car. de déroulé |
| `drive:026#2` | Mettre en place des stratégies de génération de leads | 180 | 351 car. de déroulé |
| `drive:026#3` | Convertir les leads en clients | 120 | 377 car. de déroulé |

### `drive:027` · `BIB-D027` — Gestion stratégique des objectifs en immobilier

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:027#1` | Structurer l'agenda de manière à optimiser la progression vers les objectifs fixés. | 60 *(défaut)* | 330 car. de déroulé |
| `drive:027#2` | Mettre en œuvre des changements pour accroître la performance et les retours des actions e | 60 *(défaut)* | ⚠️ **aucun déroulé** — module fantôme né du pied de page · 0 car. de déroulé |

### `drive:028` · `BIB-D028` — Instagram immobilier Pro

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:028#1` | Introduction | 30 | 85 car. de déroulé |
| `drive:028#2` | Préparation du Terrain - Compte et Profil Instagram | 60 | 379 car. de déroulé |
| `drive:028#3` | Création de Contenu Impactant | 90 | 255 car. de déroulé |
| `drive:028#4` | Planification et Régularité de Contenu | 90 | 308 car. de déroulé |
| `drive:028#5` | Maximiser la Visibilité sur Instagram | 90 | 287 car. de déroulé |
| `drive:028#6` | Synthèse et Perspectives | 60 | 564 car. de déroulé |

### `drive:029` · `BIB-D029` — L'immobilier et sa prospection efficace

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:029#1` | L’immobilier et sa prospection efficace : | 60 *(défaut)* | ⛔ **exclu des sorties client** (pige) · 1450 car. de déroulé |

### `drive:030` · `BIB-D030` — L'immobilier et sa prospection efficace devenir incontournable sur son secteur

**➕ CRÉER** — créé, puis **hors composition** : doublon du produit VENDU `PROD-0003` (D-19 bis), la version vendue fait foi.

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:030#1` | L’immobilier et sa prospection efficace : | 60 *(défaut)* | ⛔ **exclu des sorties client** (pige) · hors composition (rayon écarté) · 1450 car. de déroulé |

### `drive:031` · `BIB-D031` — Maitrisez les bases juridiques et analysez son secteur

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:031#1` | Acquérir les bases juridiques de l'immobilier | 120 | 314 car. de déroulé |
| `drive:031#2` | Objectif 2 : Appliquer les connaissances juridiques dans la pratique professionnelle | 180 | 240 car. de déroulé |
| `drive:031#3` | Objectif 3 : Analyser le secteur immobilier pour une prise de décision éclairée | 120 | 225 car. de déroulé |

### `drive:032` · `BIB-D032` — Maitrisez votre impact numérique maximisez le référencement

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:032#1` | Introduction au référencement internet. | 45 | 108 car. de déroulé |
| `drive:032#2` | Les différentes formes de présence en ligne. | 90 | 94 car. de déroulé |
| `drive:032#3` | Techniques avancées de SEO. | 45 | 103 car. de déroulé |
| `drive:032#4` | Introduction à la e-réputation. | 45 | 94 car. de déroulé |
| `drive:032#5` | Outils et méthodes pour surveiller et gérer la e-réputation. | 105 | 152 car. de déroulé |
| `drive:032#6` | Introduction à Google Maps et à la fiche d'établissement. | 90 | 156 car. de déroulé |
| `drive:032#7` | Optimisation de la fiche Google Maps. | 75 | 102 car. de déroulé |
| `drive:032#8` | Atelier pratique. | 75 | 97 car. de déroulé |
| `drive:032#9` | Étude de cas. | 60 | 78 car. de déroulé |
| `drive:032#10` | Élaboration d'une stratégie digitale. | 60 | 75 car. de déroulé |

### `drive:033` · `BIB-D033` — Maximisez vos leads et dominez votre base de données

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:033#1` | Différencier les divers types de bases de données utilisées dans l'immobilier. | 60 *(défaut)* | 84 car. de déroulé |
| `drive:033#2` | Évaluer la pertinence et l'efficacité des canaux de génération de leads. | 60 *(défaut)* | 718 car. de déroulé |

### `drive:034` · `BIB-D034` — Négociation et compromis

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:034#1` | Maîtriser les techniques de négociation en immobilier | 120 | 261 car. de déroulé |
| `drive:034#2` | Rédiger des compromis de vente efficaces | 150 | 263 car. de déroulé |
| `drive:034#3` | Gérer les objections et trouver des solutions de compromis | 150 | 279 car. de déroulé |

### `drive:035` · `BIB-D035` — Préparation mentale pour excellence

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:035#1` | Cultiver l'Intelligence Émotionnelle et la Conscience de Soi | 60 *(défaut)* | 245 car. de déroulé |
| `drive:035#2` | Mettre en Pratique la Stratégie de Performance Optimale | 60 *(défaut)* | 258 car. de déroulé |
| `drive:035#3` | Passer d'une mentalité de débutant à celle d'un praticien chevronné | 60 *(défaut)* | 1158 car. de déroulé |

### `drive:036` · `BIB-D036` — Propulsez votre campagne de newsletters

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:036#1` | Les bases d'une newsletter efficace. | 45 | 106 car. de déroulé |
| `drive:036#2` | Rédaction de textes pertinents. | 90 | 92 car. de déroulé |
| `drive:036#3` | Introduction au RGPD. | 45 | 75 car. de déroulé |
| `drive:036#4` | Clarification des obligations liées aux newsletters. | 75 | 75 car. de déroulé |
| `drive:036#5` | Meilleures pratiques pour respecter le RGPD. | 75 | 115 car. de déroulé |
| `drive:036#6` | Introduction aux outils de diffusion. | 90 | 113 car. de déroulé |
| `drive:036#7` | Gestion des contacts. | 75 | 74 car. de déroulé |
| `drive:036#8` | Techniques pour favoriser l'ouverture. | 75 | 64 car. de déroulé |
| `drive:036#9` | Délivrabilité et obstacles. | 75 | 75 car. de déroulé |
| `drive:036#10` | Mesure de l'efficacité. | 45 | 97 car. de déroulé |

### `drive:037` · `BIB-D037` — Transformez vos Mandats et Décrochez des Rendez-vous de Suivi avec Succès

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:037#1` | Maitriser le Discours et le Déroulé du Rendez-vous de Suivi pour Convaincre | 60 *(défaut)* | 300 car. de déroulé |
| `drive:037#2` | Préparer un dossier de suivi vendeur complet | 60 *(défaut)* | 342 car. de déroulé |
| `drive:037#3` | Pratiquer et Mettre en Place des Scripts d'Appels pour Décrocher des Rendez-vous de Suivi | 60 *(défaut)* | 311 car. de déroulé |

### `drive:038` · `BIB-D038` — Transformez votre recrutement en un jeu gagnant

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:038#1` | Analyser les avantages et les limites de chaque support. | 60 *(défaut)* | 94 car. de déroulé |
| `drive:038#2` | Mettre en avant les avantages et les opportunités offertes par le poste. | 60 *(défaut)* | 940 car. de déroulé |
| `drive:038#3` | Mettre en place un suivi régulier et des récompenses attractives. | 60 *(défaut)* | ⚠️ **aucun déroulé** — module fantôme né du pied de page · 0 car. de déroulé |

### `drive:039` · `BIB-D039` — Vente de mandats exclusifs et gestion des objections

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:039#1` | Maîtriser la vente de mandats exclusifs | 120 | 275 car. de déroulé |
| `drive:039#2` | Développer des stratégies pour obtenir des mandats exclusifs | 150 | 295 car. de déroulé |
| `drive:039#3` | Gérer efficacement les objections des clients | 150 | 268 car. de déroulé |

### `drive:041` · `BIB-D041` — Cadastre.com Niveau 1  Les Bases Essentielles pour les Professionnels de l'Immobilier

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:041#1` | Découverte des fonctionnalités de Cadastre.com | 75 | 200 car. de déroulé |
| `drive:041#2` | Utilisation des outils de prospection | 90 | 223 car. de déroulé |
| `drive:041#3` | Outils de suivi et gestion de mandats | 120 | 211 car. de déroulé |
| `drive:041#4` | Conseiller efficacement les clients | 75 | 215 car. de déroulé |
| `drive:041#5` | Synthèse et évaluation | 30 | 47 car. de déroulé |

### `drive:042` · `BIB-D042` — Cadastre.com  Prospection et Gestion Avancée pour Agents Confirmés

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:042#1` | Fonctions avancées de Cadastre.com | 135 | 160 car. de déroulé |
| `drive:042#2` | Analyse de marché et prospection avancée | 90 | 122 car. de déroulé |
| `drive:042#3` | Gestion des mandats et reporting avancé | 120 | 165 car. de déroulé |
| `drive:042#4` | Outils de visualisation et d’aide à la décision | 105 | 170 car. de déroulé |
| `drive:042#5` | Révision et questions sur la journée précédente. | 30 | ⚠️ **aucun déroulé** dans l’instantané · 0 car. de déroulé |
| `drive:042#6` | Optimisation de la prospection et techniques de ciblage | 135 | 151 car. de déroulé |
| `drive:042#7` | Ajustement des prix et suivi des performances | 90 | 151 car. de déroulé |
| `drive:042#8` | Étude de cas et mise en situation | 120 | 171 car. de déroulé |
| `drive:042#9` | Synthèse et évaluation des acquis | 105 | 271 car. de déroulé |

### `drive:043` · `BIB-D043` — Cadastre.com et IA  Formation Expert Niveau 3

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:043#1` | Utilisation poussée de Cadastre.com (Module 1) | 180 | 244 car. de déroulé |
| `drive:043#2` | Stratégies de prospection avancée (Module 2) | 75 | 209 car. de déroulé |
| `drive:043#3` | Techniques de présentation et d’argumentaire pour clients premium (Module 3) | 120 | 234 car. de déroulé |
| `drive:043#4` | Synthèse et récapitulation de la première journée | 75 | 165 car. de déroulé |
| `drive:043#5` | Révision et questions sur les apprentissages de la première journée | 30 | ⚠️ **aucun déroulé** dans l’instantané · 0 car. de déroulé |
| `drive:043#6` | Coupler Cadastre.com et IA pour des analyses prédictives (Module 4) | 180 | 246 car. de déroulé |
| `drive:043#7` | Valorisation avancée et conseil stratégique en investissement (Module 5) | 75 | 216 car. de déroulé |
| `drive:043#8` | Automatisation et optimisation de la gestion de portefeuille (Module 6) | 120 | 264 car. de déroulé |
| `drive:043#9` | Synthèse et mise en pratique des acquis | 75 | 76 car. de déroulé |

### `drive:044` · `BIB-D044` — Déontologie

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:044#1` | Programme de Formation en Déontologie pour les Professionnels de l'Immobilier | 60 *(défaut)* | 2156 car. de déroulé |

### `drive:045` · `BIB-D045` — Non Discrimination

**➕ CRÉER**

Classé `REGLEMENTAIRE` (taux OPCO EP 40 €/h).

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:045#1` | Non-Discrimination dans le Secteur Immobilier | 60 *(défaut)* | 2136 car. de déroulé |

### `drive:046` · `BIB-D046` — Tracfin

**➕ CRÉER** — créé, puis **hors composition** : doublon du produit VENDU `PROD-0671` (D-19 bis), la version vendue fait foi.

Classé `REGLEMENTAIRE` (taux OPCO EP 40 €/h).

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:046#1` | Programme de Formation sur la Lutte contre le Blanchiment d'Argent et le Financement du Te | 60 *(défaut)* | hors composition (rayon écarté) · 2036 car. de déroulé |

### `drive:047` · `BIB-D047` — Pack Digital 60h

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:047#1` | Présentation des objectifs de la formation et tour de table. | 30 | ⚠️ **aucun déroulé** dans l’instantané · 0 car. de déroulé |
| `drive:047#2` | Les piliers du marketing digital : SEO, contenu, e-réputation, automatisation. | 60 | ⚠️ **aucun déroulé** dans l’instantané · 0 car. de déroulé |
| `drive:047#3` | Fonctionnement des moteurs de recherche et analyse des facteurs de classement (on-page et  | 105 | 12 car. de déroulé |
| `drive:047#4` | Recherche de mots-clés et optimisation de contenu avec des outils comme SEMrush et Ahrefs. | 90 | ⚠️ **aucun déroulé** dans l’instantané · 0 car. de déroulé |
| `drive:047#5` | Atelier pratique : Création d’un plan SEO pour un site fictif. | 165 | 58 car. de déroulé |
| `drive:047#6` | Audit SEO technique : balises, vitesse, expérience utilisateur. | 90 | ⚠️ **aucun déroulé** dans l’instantané · 0 car. de déroulé |
| `drive:047#7` | Stratégies de création de backlinks et recherche de partenariats. | 105 | 12 car. de déroulé |
| `drive:047#8` | Atelier pratique : Élaboration d’une stratégie de backlinks. | 90 | ⚠️ **aucun déroulé** dans l’instantané · 0 car. de déroulé |
| `drive:047#9` | Étude de cas : Analyse de sites performants. | 165 | 70 car. de déroulé |
| `drive:047#10` | Introduction à Canva et Photoshop pour la création de bannières, infographies et visuels. | 90 | ⚠️ **aucun déroulé** dans l’instantané · 0 car. de déroulé |
| `drive:047#11` | Atelier pratique : Conception de supports visuels pour une campagne fictive. | 105 | 12 car. de déroulé |
| `drive:047#12` | Rédaction de contenus engageants : storytelling et techniques de copywriting. | 90 | ⚠️ **aucun déroulé** dans l’instantané · 0 car. de déroulé |
| `drive:047#13` | Atelier pratique : Création de contenus rédactionnels adaptés à une stratégie marketing. | 165 | 70 car. de déroulé |
| `drive:047#14` | Utilisation d’outils d’intelligence artificielle pour la rédaction (Jasper, ChatGPT). | 90 | ⚠️ **aucun déroulé** dans l’instantané · 0 car. de déroulé |
| `drive:047#15` | Génération de textes optimisés et intégration dans des stratégies marketing. | 105 | 12 car. de déroulé |
| `drive:047#16` | Atelier pratique : Création de contenus visuels et rédactionnels pour une campagne fictive | 90 | ⚠️ **aucun déroulé** dans l’instantané · 0 car. de déroulé |
| `drive:047#17` | Présentation des résultats et feedback collectif. | 165 | 45 car. de déroulé |
| `drive:047#18` | Importance de la e-réputation et son impact sur l’image de marque. | 90 | ⚠️ **aucun déroulé** dans l’instantané · 0 car. de déroulé |
| `drive:047#19` | Outils de suivi de la réputation en ligne : Google Alerts, Mention, ReviewTrackers. | 105 | 12 car. de déroulé |
| `drive:047#20` | Répondre aux avis clients en ligne, positifs comme négatifs | 90 | ⚠️ **aucun déroulé** dans l’instantané · 0 car. de déroulé |
| `drive:047#21` | Gestion de crise en ligne : Préparer des réponses adaptées. | 165 | 69 car. de déroulé |
| `drive:047#22` | Introduction à Tidio : paramétrage initial et connexion au site web. | 90 | ⚠️ **aucun déroulé** dans l’instantané · 0 car. de déroulé |
| `drive:047#23` | Création de scénarios automatisés pour la relation client. | 105 | 12 car. de déroulé |
| `drive:047#24` | Analyse des interactions client : collecte et segmentation des leads. | 90 | ⚠️ **aucun déroulé** dans l’instantané · 0 car. de déroulé |
| `drive:047#25` | Atelier pratique : Mise en place de scénarios avancés avec Tidio. | 165 | 69 car. de déroulé |
| `drive:047#26` | Optimisation des scénarios avancés pour répondre aux besoins spécifiques. | 90 | ⚠️ **aucun déroulé** dans l’instantané · 0 car. de déroulé |
| `drive:047#27` | Intégration des scénarios avec d'autres outils marketing. | 105 | 12 car. de déroulé |
| `drive:047#28` | Atelier pratique : Test et ajustement des scénarios en temps réel. | 90 | ⚠️ **aucun déroulé** dans l’instantané · 0 car. de déroulé |
| `drive:047#29` | Présentation des résultats et feedback collectif. | 165 | 82 car. de déroulé |
| `drive:047#30` | Élaboration d’un plan de communication 360° intégrant SEO, e-réputation, automatisation, e | 90 | ⚠️ **aucun déroulé** dans l’instantané · 0 car. de déroulé |
| `drive:047#31` | Synthèse finale : Présentation des projets réalisés par les participants, QCM de validatio | 135 | ⚠️ **aucun déroulé** dans l’instantané · 0 car. de déroulé |

### `drive:048` · `BIB-D048` — Propulsez votre Performance Immobilière avec l'IA

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:048#1` | Propulsez votre performance immobilière avec l'IA et ChatGPT | 60 *(défaut)* | 1497 car. de déroulé |

### `drive:049` · `BIB-D049` — Propulsez votre Expertise immobilière avec l’IA -  Annonces, Relation Client et Négociation

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:049#1` | Propulsez votre expertise immobilière avec l’IA - Annonces, relation client et négociation | 60 *(défaut)* | 2499 car. de déroulé |

### `drive:050` · `BIB-D050` — Optimiser l'Immobilier grâce à l'Intelligence Artificielle

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:050#1` | Introduction à l’IA et Prospection Vendeurs | 60 *(défaut)* | ⛔ **exclu des sorties client** (pige) · 765 car. de déroulé |
| `drive:050#2` | Visibilité des Biens et Techniques Digitales | 60 *(défaut)* | 607 car. de déroulé |
| `drive:050#3` | Suivi des Acquéreurs et Visites | 60 *(défaut)* | 668 car. de déroulé |
| `drive:050#4` | Négociation et Suivi Contractuel | 60 *(défaut)* | 633 car. de déroulé |
| `drive:050#5` | Vente et Fidélisation des Clients | 60 *(défaut)* | 557 car. de déroulé |
| `drive:050#6` | Conclusion, Plan d’Action et Suivi | 60 *(défaut)* | 753 car. de déroulé |
| `drive:050#7` | Atelier Pratique (5h) | 60 *(défaut)* | 560 car. de déroulé |

### `drive:051` · `BIB-D051` — Intégrer l'intelligence artificielle en entreprise pour gagner en productivité (105h)

**⛔ ÉCARTÉ** — **aucun module extrait du dossier source** : rien à importer.

_Aucun module._

### `drive:052` · `BIB-D052` — Maitrisez l'IA en 3 Jours  Boostez productivité et strategie (21h)

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:052#1` | Comprendre les bases de l’IA et son potentiel | 60 *(défaut)* | 501 car. de déroulé |
| `drive:052#2` | Automatisation et intégration de l’IA dans les processus internes | 60 *(défaut)* | 481 car. de déroulé |
| `drive:052#3` | Plan d’action et perspectives stratégiques | 60 *(défaut)* | 503 car. de déroulé |

### `drive:053` · `BIB-D053` — Cycle complet de prospection, relation client et négociation immobilière

**➕ CRÉER** — créé, puis **hors composition** : doublon du produit VENDU `PROD-053` (D-19 bis), la version vendue fait foi.

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:053#1` | Analyser et segmenter un secteur de prospection | 135 | hors composition (rayon écarté) · 518 car. de déroulé |
| `drive:053#2` | Identifier et exploiter les sources de génération de leads vendeurs | 90 | ⛔ **exclu des sorties client** (pige) · hors composition (rayon écarté) · 521 car. de déroulé |
| `drive:053#3` | Créer, gérer et entretenir une base de données de prospects | 120 | hors composition (rayon écarté) · 472 car. de déroulé |
| `drive:053#4` | Synthèse et mise en pratique des acquis | 105 | hors composition (rayon écarté) · 326 car. de déroulé |
| `drive:053#5` | Générer du business supplémentaire avec les dossiers d'estimation | 135 | hors composition (rayon écarté) · 514 car. de déroulé |
| `drive:053#6` | Apprendre à utiliser les outils adaptés | 90 | hors composition (rayon écarté) · 480 car. de déroulé |
| `drive:053#7` | Apporter de la valeur sur les réseaux sociaux | 120 | hors composition (rayon écarté) · 521 car. de déroulé |
| `drive:053#8` | Synthèse et mise en pratique des acquis | 105 | hors composition (rayon écarté) · 318 car. de déroulé |
| `drive:053#9` | Mise en pratique du rendez-vous R1 en situation réelle | 135 | hors composition (rayon écarté) · 239 car. de déroulé |
| `drive:053#10` | Mise en pratique de la remise d’estimation | 90 | hors composition (rayon écarté) · 174 car. de déroulé |
| `drive:053#11` | Entrainer sa capacité à signer des mandats et à traiter les objections | 120 | hors composition (rayon écarté) · 142 car. de déroulé |
| `drive:053#12` | Mise en pratique du rendez-vous de bilan de commercialisation en situation réelle | 105 | hors composition (rayon écarté) · 195 car. de déroulé |
| `drive:053#13` | Apprendre à donner du feedback sur les actions entreprises et les résultats obtenus | 135 | hors composition (rayon écarté) · 454 car. de déroulé |
| `drive:053#14` | Renforcer la relation pour gagner des recommandations | 90 | hors composition (rayon écarté) · 417 car. de déroulé |
| `drive:053#15` | Présenter et respecter les engagements vis-à-vis du client vendeur | 120 | hors composition (rayon écarté) · 465 car. de déroulé |
| `drive:053#16` | Synthèse et mise en pratique des acquis | 105 | hors composition (rayon écarté) · 408 car. de déroulé |
| `drive:053#17` | Les bases d'une newsletter efficace. | 30 | hors composition (rayon écarté) · 100 car. de déroulé |
| `drive:053#18` | Rédaction de textes pertinents et intégration de médias. | 45 | hors composition (rayon écarté) · 72 car. de déroulé |
| `drive:053#19` | Introduction au RGPD. | 30 | hors composition (rayon écarté) · 124 car. de déroulé |
| `drive:053#20` | Meilleures pratiques pour respecter le RGPD. | 30 | hors composition (rayon écarté) · 41 car. de déroulé |
| `drive:053#21` | Gestion des contacts et outils de diffusion. | 45 | hors composition (rayon écarté) · 122 car. de déroulé |
| `drive:053#22` | Techniques pour favoriser l’ouverture. | 30 | hors composition (rayon écarté) · 51 car. de déroulé |
| `drive:053#23` | Délivrabilité et obstacles. | 45 | hors composition (rayon écarté) · 67 car. de déroulé |
| `drive:053#24` | Mesure de l’efficacité d’une campagne. | 45 | hors composition (rayon écarté) · 109 car. de déroulé |
| `drive:053#25` | Apprendre à vendre un rendez-vous découverte au téléphone | 135 | hors composition (rayon écarté) · 649 car. de déroulé |
| `drive:053#26` | Identifier les clients acheteurs | 90 | hors composition (rayon écarté) · 490 car. de déroulé |
| `drive:053#27` | Réaliser une découverte de qualité et installer la relation | 120 | hors composition (rayon écarté) · 513 car. de déroulé |
| `drive:053#28` | Synthèse et mise en pratique des acquis | 105 | hors composition (rayon écarté) · 339 car. de déroulé |
| `drive:053#29` | Obtenir le meilleur de chaque lead acheteur | 135 | hors composition (rayon écarté) · 530 car. de déroulé |
| `drive:053#30` | Renforcer la relation pour obtenir des recommandations futures | 90 | hors composition (rayon écarté) · 466 car. de déroulé |
| `drive:053#31` | Proposer des services annexes pour gagner avec les acheteurs | 120 | hors composition (rayon écarté) · 552 car. de déroulé |
| `drive:053#32` | Synthèse et mise en pratique des acquis | 105 | hors composition (rayon écarté) · 345 car. de déroulé |
| `drive:053#33` | Mettre en Pratique des Situations de Découverte du Projet Acheteur-Vendeur | 75 | hors composition (rayon écarté) · 185 car. de déroulé |
| `drive:053#34` | Pratiquer les Visites Immobilières en Situation Réelle | 120 | hors composition (rayon écarté) · 140 car. de déroulé |
| `drive:053#35` | Simuler des Négociations Immobilières Réalistes | 90 | hors composition (rayon écarté) · 146 car. de déroulé |
| `drive:053#36` | Entraîner à la Prise d'Offre et à la Clôture | 105 | hors composition (rayon écarté) · 170 car. de déroulé |
| `drive:053#37` | Apprendre l'utilisation des questions ouvertes | 135 | hors composition (rayon écarté) · 531 car. de déroulé |
| `drive:053#38` | Détecter les signaux d'achat et s'y adapter | 90 | hors composition (rayon écarté) · 497 car. de déroulé |
| `drive:053#39` | Trouver les leviers pour conclure une négociation | 120 | hors composition (rayon écarté) · 535 car. de déroulé |
| `drive:053#40` | Synthèse et mise en pratique des acquis | 105 | hors composition (rayon écarté) · 385 car. de déroulé |
| `drive:053#41` | Utiliser sa base de données pour augmenter sa notoriété | 75 | hors composition (rayon écarté) · 485 car. de déroulé |
| `drive:053#42` | Utiliser les réseaux sociaux pour gagner en recommandation | 90 | hors composition (rayon écarté) · 492 car. de déroulé |
| `drive:053#43` | Identifier des sources complémentaires pour développer de la recommandation | 120 | hors composition (rayon écarté) · 560 car. de déroulé |
| `drive:053#44` | Synthèse et mise en pratique des acquis | 105 | hors composition (rayon écarté) · 292 car. de déroulé |

### `drive:054` · `BIB-D054` — L'intelligence artificielle au service des conseillers immobilier

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:054#1` | L'intelligence artificielle au service des conseillers immobilier | 60 *(défaut)* | 1521 car. de déroulé |

### `drive:055` · `BIB-D055` — Maitrise des techniques de vente immobilière

**➕ CRÉER** — créé, puis **hors composition** : doublon du produit VENDU `PROD-055` (D-19 bis), la version vendue fait foi.

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:055#1` | Introduction et Fondamentaux de la Vente | 60 *(défaut)* | hors composition (rayon écarté) · 696 car. de déroulé |
| `drive:055#2` | Techniques de Prospection et Gestion des Leads | 60 *(défaut)* | hors composition (rayon écarté) · 409 car. de déroulé |
| `drive:055#3` | Présentation et Argumentation de Vente | 60 *(défaut)* | hors composition (rayon écarté) · 433 car. de déroulé |
| `drive:055#4` | Techniques de Négociation | 60 *(défaut)* | hors composition (rayon écarté) · 402 car. de déroulé |
| `drive:055#5` | Conclusion de la Vente | 60 *(défaut)* | hors composition (rayon écarté) · 405 car. de déroulé |
| `drive:055#6` | Relation Client et Fidélisation | 60 *(défaut)* | hors composition (rayon écarté) · 480 car. de déroulé |
| `drive:055#7` | Utilisation des Réseaux Sociaux dans la Vente | 60 *(défaut)* | hors composition (rayon écarté) · 521 car. de déroulé |
| `drive:055#8` | Analyse et Amélioration des Performances de Vente | 60 *(défaut)* | hors composition (rayon écarté) · 468 car. de déroulé |
| `drive:055#9` | Études de Cas et Meilleures Pratiques | 60 *(défaut)* | hors composition (rayon écarté) · 410 car. de déroulé |
| `drive:055#10` | Gestion des Objections | 60 *(défaut)* | hors composition (rayon écarté) · 640 car. de déroulé |

### `drive:056` · `BIB-D056` — Vendez Mieux avec l’IA : Suivi Vendeur, Annonces Impactantes & Visuels de Qualité

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:056#1` | LES OBJECTIFS PÉDAGOGIQUES DE FORMATION | 60 *(défaut)* | 1557 car. de déroulé |

### `drive:057` · `BIB-D057` — Intégrer l’intelligence artificielle pour gagner en productivité

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:057#1` | Introduction à l’IA et identification des besoins | 60 *(défaut)* | 134 car. de déroulé |
| `drive:057#2` | Automatisation et outils IA | 60 *(défaut)* | 94 car. de déroulé |
| `drive:057#3` | Communication & contenus IA | 60 *(défaut)* | 92 car. de déroulé |
| `drive:057#4` | Données et reporting | 60 *(défaut)* | 107 car. de déroulé |
| `drive:057#5` | Gestion de projets et d’équipe | 60 *(défaut)* | 91 car. de déroulé |
| `drive:057#6` | CRM et relation client | 60 *(défaut)* | 88 car. de déroulé |
| `drive:057#7` | Prospection & marketing IA | 60 *(défaut)* | 105 car. de déroulé |
| `drive:057#8` | IA, coûts & durabilité | 60 *(défaut)* | 102 car. de déroulé |
| `drive:057#9` | Sécurité & aspects éthiques | 60 *(défaut)* | 97 car. de déroulé |
| `drive:057#10` | Innovations & leadership IA | 60 *(défaut)* | 88 car. de déroulé |
| `drive:057#11` | Synthèse & plan d’action | 60 *(défaut)* | 115 car. de déroulé |

### `drive:058` · `BIB-D058` — Booster vendeur : Devenir incontournable auprès des vendeurs

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:058#1` | Icebreaker & attentes | 30 | 129 car. de déroulé |
| `drive:058#2` | Prospecter autrement pour ne plus être ignoré | 90 | 306 car. de déroulé |
| `drive:058#3` | Générer des leads vendeurs qualifiés | 90 | 297 car. de déroulé |
| `drive:058#4` | Entretenir la base et transformer les contacts en mandats | 90 | 288 car. de déroulé |
| `drive:058#5` | Gagner dans la relation vendeur | 90 | 319 car. de déroulé |
| `drive:058#6` | Signer + de mandats exclusifs et construire un plan d’action | 60 | 366 car. de déroulé |

### `drive:059` · `BIB-D059` — Booster Acheteurs

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:059#1` | Introduction et objectifs de la journée | 30 | 140 car. de déroulé |
| `drive:059#2` | Vendre le rendez-vous découverte à l’acheteur | 90 | 288 car. de déroulé |
| `drive:059#3` | Mieux qualifier pour mieux vendre | 90 | 261 car. de déroulé |
| `drive:059#4` | Organiser des tournées de visites stratégiques | 90 | 277 car. de déroulé |
| `drive:059#5` | Suivi acheteur et levée des objections | 90 | 278 car. de déroulé |
| `drive:059#6` | Mener la négociation vers l’offre | 60 | 302 car. de déroulé |

### `drive:060` · `BIB-D060` — IA Manager, Piloter, Motiver et Performer grâce à l'IA

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:060#1` | Comprendre et utiliser l’IA comme manager | 90 | 298 car. de déroulé |
| `drive:060#2` | Structurer ses réunions d’équipe avec l’IA | 90 | 318 car. de déroulé |
| `drive:060#3` | Suivre, analyser et piloter les performances avec l’IA | 90 | 328 car. de déroulé |
| `drive:060#4` | Mener des entretiens de fin de mois efficaces | 90 | 279 car. de déroulé |
| `drive:060#5` | Objectifs et accompagnement stratégique | 60 | 384 car. de déroulé |

### `drive:061` · `BIB-D061` — Créer et diffuser du contenu à impact sur les réseaux sociaux

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:061#1` | Panorama détaillé des réseaux sociaux majeurs utilisés en entreprise | 90 | 497 car. de déroulé |
| `drive:061#2` | Mise en pratique : étude de cas et exercices concrets | 90 | 236 car. de déroulé |
| `drive:061#3` | Audit IA du profil social de chaque participant | 90 | 295 car. de déroulé |
| `drive:061#4` | Atelier collaboratif : optimisation des profils | 90 | 292 car. de déroulé |
| `drive:061#5` | Synthèse de la journée Retour sur les enseignements clés Préparation des éléments nécessai | 30 | 49 car. de déroulé |
| `drive:061#6` | Définir ses piliers de contenu (information, coulisses, témoignages, produits, vision) Cré | 90 | ⚠️ **aucun déroulé** dans l’instantané · 0 car. de déroulé |
| `drive:061#7` | Écriture des scripts vidéo (courts et longs formats) Utilisation de modèles IA pour optimi | 120 | ⚠️ **aucun déroulé** dans l’instantané · 0 car. de déroulé |
| `drive:061#8` | Session de tournage par groupes de 3 Chaque participant tourne au moins 2 vidéos : 1 conse | 90 | ⚠️ **aucun déroulé** dans l’instantané · 0 car. de déroulé |
| `drive:061#9` | Visionnage collectif, feedback des paires Choix des vidéos à monter Préparation des fichie | 120 | 42 car. de déroulé |
| `drive:061#10` | Démonstration guidée d’un montage simple (avec outils gratuits comme CapCut ou Canva Video | 90 | ⚠️ **aucun déroulé** dans l’instantané · 0 car. de déroulé |
| `drive:061#11` | Montage autonome assisté Chaque participant monte une ou deux vidéos tournées la veille Ex | 120 | ⚠️ **aucun déroulé** dans l’instantané · 0 car. de déroulé |
| `drive:061#12` | Comprendre les spécificités de chaque plateforme pour la diffusion Savoir publier au bon m | 90 | ⚠️ **aucun déroulé** dans l’instantané · 0 car. de déroulé |
| `drive:061#13` | Découvrir les bases de la sponsorisation sur Meta (Facebook/Instagram) Créer un compte Bus | 60 | ⚠️ **aucun déroulé** dans l’instantané · 0 car. de déroulé |
| `drive:061#14` | Présentation des contenus créés Visionnage collectif final (best-of + bêtisier) QCM de val | 60 | ⚠️ **aucun déroulé** dans l’instantané · 0 car. de déroulé |

### `drive:062` · `BIB-D062` — Propulsez la performance de votre entreprise avec l’intelligence artificielle

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:062#1` | Comprendre l’IA générative et apprendre à la maîtriser | 60 *(défaut)* | 1166 car. de déroulé |
| `drive:062#2` | Intégrer l’IA dans ses usages professionnels | 60 *(défaut)* | 1121 car. de déroulé |

### `drive:063` · `BIB-D063` — Non Discrimination, Tracfin et déontotlgie

**➕ CRÉER**

Classé `REGLEMENTAIRE` (taux OPCO EP 40 €/h).

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:063#1` | NON-DISCRIMINATION DANS L’ACCÈS AU LOGEMENT | 60 *(défaut)* | 536 car. de déroulé |
| `drive:063#2` | DÉONTOLOGIE IMMOBILIÈRE | 60 *(défaut)* | 499 car. de déroulé |
| `drive:063#3` | TRACFIN ET LUTTE CONTRE LE BLANCHIMENT | 60 *(défaut)* | 790 car. de déroulé |

### `drive:064` · `BIB-D064` — Exploiter l’intelligence artificielle dans l’immobilier

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:064#1` | Fondamentaux et cas d’usage IA dans l’immobilier | 60 *(défaut)* | 523 car. de déroulé |
| `drive:064#2` | Automatisation & productivité | 60 *(défaut)* | 616 car. de déroulé |
| `drive:064#3` | Communication, marketing & suivi vendeur IA | 60 *(défaut)* | 827 car. de déroulé |

### `drive:065` · `BIB-D065` — L'intelligence artificielle au service des conseillers immobiliers - 8h00

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:065#1` | Introduction à l’IA et à ChatGPT (enrichi) | 120 | 471 car. de déroulé |
| `drive:065#2` | Présentation de Gamma.app pour les présentations vendeurs | 90 | 176 car. de déroulé |
| `drive:065#3` | Prospection immobilière avec l’IA | 90 | 210 car. de déroulé |
| `drive:065#4` | Workflow complet de prospection | 120 | 136 car. de déroulé |
| `drive:065#5` | Synthèse Jour 1 | 30 | 92 car. de déroulé |
| `drive:065#6` | Optimisation de la relation vendeur avec l’IA | 150 | 225 car. de déroulé |
| `drive:065#7` | Création d’annonces et visuels | 90 | 154 car. de déroulé |
| `drive:065#8` | Gestion des projets dans ChatGPT et structuration des dossiers | 90 | 194 car. de déroulé |
| `drive:065#9` | Synthèse stratégique et mise en pratique | 120 | 145 car. de déroulé |
| `drive:065#10` | Conclusion | 30 | 78 car. de déroulé |

### `drive:066` · `BIB-D066` — Formation Audax - Communication digitale 72h

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:066#1` | Identité, message, storytelling (8h) | 60 *(défaut)* | 280 car. de déroulé |
| `drive:066#2` | Instagram + Facebook + LinkedIn (8h) | 60 *(défaut)* | 263 car. de déroulé |
| `drive:066#3` | Collecte d’emails + QR Codes + formulaires (7h) | 60 *(défaut)* | 153 car. de déroulé |
| `drive:066#4` | Email marketing avec Brevo (7h) | 60 *(défaut)* | 149 car. de déroulé |
| `drive:066#5` | Vidéo : tournage & montage CapCut (7h) | 60 *(défaut)* | 186 car. de déroulé |
| `drive:066#6` | Création visuelle + IA Gemini 3 + Canva (7h) | 60 *(défaut)* | 203 car. de déroulé |
| `drive:066#7` | Programmation & analyse avec Metricool (7h) | 60 *(défaut)* | 146 car. de déroulé |
| `drive:066#8` | Rédaction & IA avec ChatGPT (7h) | 60 *(défaut)* | 140 car. de déroulé |
| `drive:066#9` | Modules pratiques (7h) | 60 *(défaut)* | 231 car. de déroulé |
| `drive:066#10` | Système Marketing Autonome (7h) | 60 *(défaut)* | 241 car. de déroulé |

### `drive:067` · `BIB-D067` — Débuter avec l’intelligence artificielle : les fondamentaux pour être plus efficace

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:067#1` | Débuter en intelligence artificielle : les fondamentaux pour être plus efficace | 60 *(défaut)* | 1123 car. de déroulé |

### `drive:068` · `BIB-D068` — Management et performance augmentés par l’IA

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:068#1` | Management et performance augmentés par l’IA | 60 *(défaut)* | 1756 car. de déroulé |

### `drive:069` · `BIB-D069` — Découvrir et utiliser l’intelligence artificielle générative (GPT) pour améliorer la productivité en étude notariale

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:069#1` | Management et performance augmentés par l’IA | 60 *(défaut)* | 1756 car. de déroulé |

### `drive:070` · `BIB-D070` — Immobilier : gagnez 2h par jour grâce à l’IA - 8h00

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:070#1` | \| Accueil & mise en confiance | 30 | 285 car. de déroulé |
| `drive:070#2` | \| Comprendre l’IA et ChatGPT (sans jargon) | 90 | 477 car. de déroulé |
| `drive:070#3` | \| Écrire plus vite et mieux au quotidien | 90 | 346 car. de déroulé |
| `drive:070#4` | \| Pause déjeuner | 60 | ⚠️ **aucun déroulé** dans l’instantané · 0 car. de déroulé |
| `drive:070#5` | \| Prospection & crédibilité marché | 90 | 341 car. de déroulé |
| `drive:070#6` | \| Rendez-vous vendeur & image pro | 75 | 323 car. de déroulé |
| `drive:070#7` | \| Suivi client, annonces & administratif | 60 | 299 car. de déroulé |
| `drive:070#8` | \| Synthèse & plan d’action personnel | 45 | 251 car. de déroulé |

### `drive:071` · `BIB-D071` — IA générative : consolider les bases, structurer ses usages et gagner en autonomie – 105h

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:071#1` | Fondamentaux de l’IA et cadrage | 60 *(défaut)* | 306 car. de déroulé |
| `drive:071#2` | Comprendre le fonctionnement des IA génératives | 60 *(défaut)* | 283 car. de déroulé |
| `drive:071#3` | Bases solides du prompting | 60 *(défaut)* | 256 car. de déroulé |
| `drive:071#4` | ChatGPT : usages professionnels fondamentaux | 60 *(défaut)* | 240 car. de déroulé |
| `drive:071#5` | ChatGPT : usages avancés et qualité des livrables | 60 *(défaut)* | 235 car. de déroulé |
| `drive:071#6` | IA et organisation personnelle du dirigeant | 60 *(défaut)* | 229 car. de déroulé |
| `drive:071#7` | Création de contenus avec l’IA | 60 *(défaut)* | 193 car. de déroulé |
| `drive:071#8` | IA et communication d’entreprise | 60 *(défaut)* | 227 car. de déroulé |
| `drive:071#9` | Identifier les tâches à automatiser | 60 *(défaut)* | 212 car. de déroulé |
| `drive:071#10` | Introduction aux automatisations simples | 60 *(défaut)* | 180 car. de déroulé |
| `drive:071#11` | IA, données et reporting | 60 *(défaut)* | 205 car. de déroulé |
| `drive:071#12` | Sécurité, RGPD et usage responsable | 60 *(défaut)* | 197 car. de déroulé |
| `drive:071#13` | Déployer l’IA dans son entreprise | 60 *(défaut)* | 184 car. de déroulé |
| `drive:071#14` | Autonomie et veille IA | 60 *(défaut)* | 189 car. de déroulé |
| `drive:071#15` | Synthèse et plan d’action final | 60 *(défaut)* | 212 car. de déroulé |

### `drive:072` · `BIB-D072` — IA générative : consolider les bases, structurer ses usages et gagner en autonomie – 72h

**➕ CRÉER**

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:072#1` | Fondamentaux de l’IA et cadrage | 60 *(défaut)* | 381 car. de déroulé |
| `drive:072#2` | Comprendre le fonctionnement des IA génératives | 60 *(défaut)* | 287 car. de déroulé |
| `drive:072#3` | Bases solides du prompting | 60 *(défaut)* | 262 car. de déroulé |
| `drive:072#4` | ChatGPT : usages professionnels | 60 *(défaut)* | 236 car. de déroulé |
| `drive:072#5` | Organisation, contenus et communication avec l’IA | 60 *(défaut)* | 236 car. de déroulé |
| `drive:072#6` | Identifier et structurer les automatisations | 60 *(défaut)* | 220 car. de déroulé |
| `drive:072#7` | IA, données et aide à la décision | 60 *(défaut)* | 233 car. de déroulé |
| `drive:072#8` | Sécurité, RGPD et déploiement en entreprise | 60 *(défaut)* | 251 car. de déroulé |
| `drive:072#9` | Autonomie, veille et plan d’action final | 60 *(défaut)* | 297 car. de déroulé |

### `drive:073` · `BIB-D073` — Optimiser son activité immobilière grâce à l’Intelligence Artificielle - 40h

**➕ CRÉER** — créé, puis **hors composition** : doublon du produit VENDU `PROD-0673` (D-19 bis), la version vendue fait foi.

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:073#1` | Comprendre l’IA et ses applications dans l’immobilier | 60 *(défaut)* | hors composition (rayon écarté) · 1163 car. de déroulé |
| `drive:073#2` | Utiliser l’IA pour la prospection immobilière | 60 *(défaut)* | hors composition (rayon écarté) · 778 car. de déroulé |
| `drive:073#3` | Créer des contenus immobiliers avec l’IA | 60 *(défaut)* | hors composition (rayon écarté) · 706 car. de déroulé |
| `drive:073#4` | Automatiser son activité immobilière avec l’IA | 60 *(défaut)* | hors composition (rayon écarté) · 685 car. de déroulé |
| `drive:073#5` | Mettre en place une stratégie IA dans son activité immobilière | 60 *(défaut)* | hors composition (rayon écarté) · 665 car. de déroulé |

### `drive:074` · `BIB-D074` — Maîtriser l’Intelligence Artificielle pour développer son activité

**➕ CRÉER** — créé, puis **hors composition** : doublon du produit VENDU `PROD-0662` (D-19 bis), la version vendue fait foi.

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `drive:074#1` | Comprendre l’IA et ses applications dans l’assurance | 60 *(défaut)* | hors composition (rayon écarté) · 812 car. de déroulé |
| `drive:074#2` | Utiliser ChatGPT pour gagner du temps | 60 *(défaut)* | hors composition (rayon écarté) · 541 car. de déroulé |
| `drive:074#3` | Communication et marketing avec l’IA | 60 *(défaut)* | hors composition (rayon écarté) · 485 car. de déroulé |
| `drive:074#4` | IA pour la prospection et la relation client | 60 *(défaut)* | hors composition (rayon écarté) · 386 car. de déroulé |
| `drive:074#5` | Mettre l’IA en pratique dans son activité | 60 *(défaut)* | hors composition (rayon écarté) · 377 car. de déroulé |

### `faros:SA-ACQ-M003` · `BIB-FACQ-M003` — Trouver des vendeurs avant les autres

**⛔ ÉCARTÉ** — **barrière Faros** : contenu asynchrone, et l'import ne sait poser que PRESENTIEL. Le champ de modalité n'existe pas encore (condition ①). Ni le rayon ni ses modules n'entrent en prod.

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `faros:SA-ACQ-M003#1` | LIVRABLE 003 | 60 *(défaut)* | ⛔ **NON VERSÉ** — barrière Faros · 6887 car. de déroulé |

### `faros:SA-ADM-M001` · `BIB-FADM-M001` — AGEFICE - Sécuriser et transmettre sa demande de financement

**⛔ ÉCARTÉ** — **barrière Faros** : contenu asynchrone, et l'import ne sait poser que PRESENTIEL. Le champ de modalité n'existe pas encore (condition ①). Ni le rayon ni ses modules n'entrent en prod.

| sourceRef du module | Titre | Durée | Sort |
|---|---|---:|---|
| `faros:SA-ADM-M001#1` | LIVRABLE 001 | 60 *(défaut)* | ⛔ **NON VERSÉ** — barrière Faros · 55434 car. de déroulé |

