# Audit blanc RNQ V9 — Start Academy

**Audit officiel :** 03/07/2026 — Samia ZIANI (BCI France) — 1 jour sur site (siège Vence)
**Périmètre :** Audit de renouvellement, RNQ V9, Actions de Formation L. 6313-1-1° uniquement
**Référentiel :** Guide de lecture Qualiopi V.9 — 8 janvier 2024 (Ministère du Travail)
**Méthode :** échantillonnage de dossiers bénéficiaires (Note 1 du plan d'audit : "basé sur dernier BPF")
**Date de cet audit blanc :** 2026-05-30 — réalisé par Claude (Anthropic) à partir BDD QualiOF + start-academy.fr + Drive Start Academy

---

## Synthèse exécutive — Top 5 risques

| # | Risque | Sévérité | Effort fix |
|---|---|---|---|
| **1** | **Site start-academy.fr — 7 items obligatoires Ind 1 manquants** (prérequis, objectifs détaillés, durée, modalités, délais d'accès, tarifs, méthodes péda, modalités évaluation, indicateurs résultats à "0/5") | **NC majeure probable** | 1-2 jours rédaction + publication |
| **2** | **Indicateur 2 (résultats chiffrés)** : le site affiche "0/5" pour les indicateurs de résultats — donnée non publiée alors que requise | **NC mineure → majeure si non corrigée** | 1 jour (calcul depuis BDD QualiOF + publication) |
| **3** | **Indicateur 11 (évaluation des acquis)** : QualiOF génère QCM via IA mais procédure formalisée d'évaluation à présenter | NC majeure si non formalisé | 0.5 jour (formaliser procédure existante) |
| **4** | **Indicateur 21 (compétences formateurs)** : matrice compétences formateurs + CV à jour à vérifier — risque sur "vérification compétences" | NC majeure | 0.5 jour (compiler CV + grille compétences) |
| **5** | **Indicateur 22 (développement compétences salariés)** : Laurent fait des formations continues mais traçabilité à présenter | NC majeure si pas tracé | 0.5 jour (compiler attestations formations Laurent + Lafitte + Ourmières) |

---

## Indicateurs applicables (24/32)

Indicateurs **PAS applicables** à Start Academy (= ne pas y aller, ne pas perdre de temps) :
- **7, 8, 16** : formations certifiantes RNCP/RS — Start Academy ne semble pas en faire actuellement
- **13** : alternance — non applicable
- **14, 15, 20, 29** : spécifiques CFA — non applicable

---

## Critère 1 — Informations publiques (3 indicateurs)

### Ind 1 — Information accessible, détaillée, vérifiable ⚠️ RISQUE FORT

**Niveau attendu :** info accessible + exhaustive + à jour sur 11 items obligatoires (prérequis, objectifs, durée, modalités, délais d'accès, tarifs, contacts, méthodes mobilisées, modalités d'évaluation, accessibilité PSH, conditions d'accès).

**Sanction :** NC mineure si information partielle ; **NC majeure** si absence répétitive.

**État Start Academy (audit live start-academy.fr du 2026-05-30) :**

| Item | Présent ? | Notes |
|---|---|---|
| Logo Qualiopi visible | ✅ | OK |
| NDA (93 06 10481 06) | ✅ | OK |
| Contacts (email, téléphone) | ✅ | OK |
| CGV | ✅ | Footer présent |
| Accessibilité PSH + référent (Julien Lafitte) | ✅ | OK |
| **Prérequis par formation** | ❌ | Aucun détail par formation |
| **Objectifs pédagogiques détaillés** | ❌ | Génériques uniquement |
| **Durée de chaque formation** | ❌ | Non indiquée |
| **Modalités (présentiel/distanciel/mixte)** | ⚠️ | "Sur site" / "nos locaux" sans clarification claire |
| **Délais d'accès** | ❌ | Aucune mention |
| **Tarifs HT** | ❌ | Aucune mention |
| **Méthodes mobilisées (péda)** | ❌ | Vague ("programmes immersifs") |
| **Modalités d'évaluation** | ❌ | Non décrites |

**Action correctrice :** publier une page **catalogue détaillé** par formation avec les 11 items. Données disponibles dans QualiOF (`TrainingProduct`). Possibilité de générer automatiquement via script export. **Délai recommandé : avant 20 juin 2026.**

### Ind 2 — Indicateurs de résultats chiffrés ⚠️ RISQUE FORT

**Niveau attendu :** information chiffrée permettant de suivre les résultats au regard des objectifs.

**Exemples de preuves :** taux satisfaction stagiaires, nb stagiaires, taux abandon, taux retour enquêtes, taux insertion emploi.

**État Start Academy :**
- ✅ QualiOF dispose des données : satisfaction (par session), nb stagiaires (291 SessionParticipant), abandons (Status CANCELLED)
- ❌ Affichage public site web = "0/5" pour tous les indicateurs (visible homepage)
- ⚠️ Calcul fait dans QualiOF (`apps/web/src/app/app/qualiopi-bilan/`) mais pas publié

**Action correctrice :** 
1. Lancer `pnpm dev:full` → ouvrir `/app/qualiopi-bilan` → exporter les KPI (taux satisfaction global, nb stagiaires N-1, taux d'abandon, NPS si dispo)
2. Mettre à jour la page web start-academy.fr avec ces chiffres réels
3. **Délai : avant 20 juin 2026**

### Ind 3 — Formations certifiantes (taux obtention) — N/A

**Statut :** Non applicable si Start Academy ne dispense pas de formation conduisant à une certification RNCP/RS. À confirmer Laurent.

---

## Critère 2 — Identification objectifs + adaptation (Ind 4, 5, 6)

### Ind 4 — Analyse du besoin du bénéficiaire ⚠️ RISQUE MAJEUR

**Niveau attendu :** analyser le besoin en lien avec entreprise/financeur. PSH : prise en compte des besoins en compensation.

**Sanction :** NC majeure si non-respect (même partiel).

**État Start Academy :**
- ✅ Document type `ANALYSE_BESOIN` généré par QualiOF (PedagogicalAsset.kind='ANALYSE_BESOIN') — IA-assisté via Ollama
- ✅ Drive : "C2.4 Fiche d'analyse besoins client" listée dans Check-list Qualiopi START ACADEMY
- ✅ Notre fix 260525-kl5 auto-déclenche la génération à la création de session
- ⚠️ Vérifier que les analyses besoin sont signées/horodatées (auditeur cherchera preuve de réalisation EN AMONT)
- ⚠️ Process PSH : aucune procédure formalisée d'analyse spécifique handicap

**Action correctrice :**
1. Vérifier qu'au moins 5 dossiers échantillon ont leur analyse besoin **datée AVANT la formation**
2. Rédiger micro-procédure "Analyse besoin PSH" (1 page) — modèle dans le guide

### Ind 5 — Objectifs opérationnels et évaluables ⚠️ MAJEUR

**Niveau attendu :** démontrer que les objectifs sont définis et peuvent être évalués.

**État Start Academy :**
- ✅ `TrainingProduct.objectives` (Json) renseigné — verbes Bloom recommandés (Identifier, Expliquer, Utiliser…)
- ✅ Notre fix 260525-pzl + audit antérieur ont structuré objectifs SmartOF
- ⚠️ 25/30 produits ont `priceHT=0` — pas critique pour Ind 5 mais signal qu'il y a du nettoyage à faire
- ⚠️ Quelques objectifs IA peuvent ne pas être assez SMART — à passer en revue

**Action correctrice :** audit qualité des objectifs sur 10 produits "phares" (ceux qui apparaîtront dans l'échantillon). Réécrire si flou.

### Ind 6 — Contenus et modalités adaptés ⚠️ MAJEUR

**Niveau attendu :** démontrer que contenus/modalités sont adaptés aux objectifs et publics.

**État Start Academy :**
- ✅ Programmes DOCX riches dans Drive (`C1.i1 PROGRAMME - 1, 2, 3, 4, 5, 6…`)
- ✅ Déroulé pédagogique dans QualiOF (`DEROULE_PEDAGOGIQUE`)
- ⚠️ **Bug B en cours :** programmes multi-jours IA pas assez détaillés vs DOCX Drive — chantier 6 backlog
- ⚠️ Modalités PSH : à vérifier que chaque programme mentionne accessibilité

**Action correctrice :** terminer le chantier 6 backlog (programmes multi-jours détaillés alignés Drive).

---

## Critère 3 — Adaptation aux publics (Ind 9, 10, 11, 12)

### Ind 9 — Modalités d'accueil et de déroulement formalisées 🟡 MINEURE

**Preuves attendues :** règlement intérieur, livret accueil, convocation, CGV, organigramme, modalités accès PSH.

**État Start Academy :**
- ✅ Convocation auto-générée (QualiOF, chantier 4 livré)
- ✅ Règlement intérieur (Tenant.legalDocs Phase 7)
- ✅ CGV (publiées site)
- ⚠️ **Livret d'accueil** : à vérifier dans Drive (vu "Livret-de-procédure-v202407.pdf" mais c'est un livret formation, pas livret accueil OF)
- ⚠️ Organigramme Start Academy : à vérifier

**Action correctrice :**
1. Vérifier existence livret d'accueil OF (ce n'est PAS le livret formation). Si absent, créer 1 page : équipe + contacts + modalités générales + référent handicap.
2. Mettre à jour organigramme : Laurent (dirigeant) + Julien Lafitte (référent handicap + admin) + Jean-Guy Ourmières (formateur).

### Ind 10 — Adaptation prestation aux publics 🚨 MAJEUR

**Sanction :** NC majeure si non-respect partiel.

**Preuves attendues :** durées/contenus, emplois du temps, inscription par profil, livret de suivi, séquences d'accompagnement, **plans individuels de compensation handicap pour PSH**.

**État Start Academy :**
- ✅ Déroulé pédagogique par produit (DEROULE_PEDAGOGIQUE)
- ✅ Notre fix horaires 260525-pzl assure 9h-13h + 14h-18h conforme
- ⚠️ Plan individuel compensation PSH : à vérifier si déjà accueilli au moins 1 PSH (si oui, doc à présenter)

**Action correctrice :** si au moins 1 PSH dans le BPF dernier exercice, préparer le plan individuel correspondant.

### Ind 11 — Évaluation atteinte objectifs ⚠️ MAJEUR

**Niveau attendu :** processus formalisé d'évaluation existe et est mis en œuvre.

**Preuves :** outils éval acquis (à chaud + à froid), auto-évaluation, taux réussite, livret compétences.

**État Start Academy :**
- ✅ QCM auto-généré par QualiOF (kind='QCM', IA-assistée)
- ✅ Grille observation formateur (GRILLE_OBS_SESSION)
- ✅ Satisfaction à chaud + à froid (DocType `SATISFACTION_CHAUD`/`FROID`)
- ⚠️ **Procédure formalisée d'évaluation manquante** : pas trouvée dans Drive. Le guide dit "La formalisation du processus signifie que la procédure d'évaluation doit être définie ET matérialisée par des outils." → les outils existent, la procédure écrite manque probablement.

**Action correctrice :** rédiger 1 page "Procédure évaluation acquis Start Academy" : QCM en fin + grille observation à mi-parcours + satisfaction à chaud J+0 + à froid J+30. Référencer outils QualiOF. **Critique pour Ind 11.**

### Ind 12 — Mesures contre rupture de parcours 🟡 MINEURE

**Niveau attendu :** mesures formalisées existent et sont mises en œuvre (formations > 2 jours).

**État Start Academy :**
- ✅ **Procédure gestion abandons** existe dans Drive : `C3.i12 - Procédure Gestion des Absences et abandons.docx` (mise à jour 2026-03-15) — pattern V01 vérifié
- ✅ Mail type + questionnaire d'abandon documentés
- ⚠️ Tableau de bord des relances : à présenter si demandé (vérifier que `Lead` ou similaire trace les relances)

**Action correctrice :** vérifier que la procédure 2026 est appliquée pour les 12 derniers mois. Lister 1-2 cas concrets (avec ou sans abandon).

---

## Critère 4 — Moyens pédagogiques et techniques (Ind 17, 18, 19)

### Ind 17 — Moyens humains/techniques adaptés 🟡 MINEURE

**Preuves :** bail/contrat location, registre accessibilité, matériel adéquat, plateaux techniques, CV, contrats sous-traitance, conventions formation.

**État Start Academy :**
- ✅ Siège Vence (BD Jean Maurel)
- ✅ Convention formation auto-générée QualiOF
- ⚠️ **Registre public d'accessibilité du siège** : à vérifier
- ⚠️ Contrats sous-traitance formateurs Lafitte + Ourmières : à vérifier dans Drive

**Action correctrice :**
1. Préparer ou imprimer le registre accessibilité du siège (obligatoire ERP — si pas concerné, justifier)
2. Imprimer 2 contrats sous-traitance formateurs

### Ind 18 — Coordination des intervenants 🟡 MINEURE

**Preuves :** organigramme, liste intervenants, contrats, fiches de poste, planning, CR réunions.

**État Start Academy :**
- ✅ 3 formateurs en BDD (Marx, Lafitte, Ourmières + récents)
- ✅ Notre fix dropdown formateur permet de tracer
- ⚠️ Organigramme + fiches de poste : à compiler

**Action correctrice :** compiler 1 page "Organigramme + fiches de poste 3 formateurs principaux" (peut être généré simplement).

### Ind 19 — Ressources pédagogiques mises à dispo 🟡 MINEURE

**Preuves :** supports cours, fiches pratiques, vidéos, modalités accès, traçabilité accompagnement.

**État Start Academy :**
- ✅ Livret-de-procédure-v202407.pdf (Drive) — preuve d'un support stagiaire
- ⚠️ À vérifier que chaque formation a son livret/support remis aux stagiaires
- ⚠️ Traçabilité de remise : signature stagiaire sur émargement OU mention dans livret

**Action correctrice :** lister pour chaque produit dans QualiOF le ou les livrets associés. Si manquant, créer template.

---

## Critère 5 — Qualification du personnel (Ind 21, 22)

### Ind 21 — Compétences intervenants définies et évaluées 🚨 MAJEUR

**Niveau attendu :** compétences définies en amont + maîtrise vérifiée.

**Preuves :** analyse besoins compétences, modalités recrutement, entretiens pro, **CV**, formations initiales/continues, sensibilisation accueil PSH, plan développement compétences.

**État Start Academy :**
- ⚠️ CV formateurs : à compiler (3 formateurs)
- ⚠️ **Sensibilisation accueil PSH** : à vérifier que chaque formateur a été sensibilisé (attestation ou formation)
- ⚠️ Plan dev compétences interne : à formaliser

**Action correctrice :** créer un classeur "Compétences formateurs" : 1 onglet par formateur avec CV + diplômes + expérience pédagogique + sensibilisation PSH. **CRITIQUE.**

### Ind 22 — Développement compétences salariés 🚨 MAJEUR

**Niveau attendu :** mobilisation de leviers formation/professionnalisation pour l'ensemble du personnel.

**Preuves :** plan développement compétences, entretiens pro, communauté de pairs, **formations continues du personnel**, échanges de pratiques.

**État Start Academy :**
- ⚠️ Formations continues Laurent + Lafitte + Ourmières : à compiler (attestations, certificats)
- ⚠️ Entretiens pro 2 ans : la check-list mentionne "Je leur fais un entretien tous les 2 ans" — à présenter
- ✅ Veille (vu) qui peut compter comme professionnalisation

**Action correctrice :** rassembler dans 1 classeur les attestations de formation continue 2024-2026 des 3 formateurs.

---

## Critère 6 — Investissement environnement professionnel (Ind 23, 24, 25, 26, 27, 28)

### Ind 23, 24, 25 — Veille légale/métier/innovations péda 🟡 MINEURE

**Niveau attendu :** veille mise en place + impact sur prestations + diffusion interne.

**État Start Academy :**
- ✅ **Veille xlsx existante** : `C6.i23-24-25 tableau veille.xlsx` (Drive) avec 15+ sources documentées
- ✅ **Dossier "Critère 6 Veille"** dans Drive
- ✅ **Phase 13 QualiOF** "Veille Qualiopi intégrée" livrée 2026-05-25 (RSS + Ollama, page /app/veille)
- ✅ Veille concurrentielle.docx (Drive)

**Excellent point.** À présenter en démo le jour J : ouvrir `/app/veille` dans QualiOF + xlsx.

**Action correctrice :** rien à faire — c'est un point fort. Préparer juste une démo 2 min pour l'auditrice.

### Ind 26 — Réseau partenaires handicap (Agefiph, Cap emploi, MDPH) 🚨 MAJEUR

**Niveau attendu :** identification d'un réseau de partenaires/experts handicap + modalités de recours.

**État Start Academy :**
- ⚠️ Référent handicap nommé (Julien Lafitte) sur le site ✅
- ⚠️ **Liste partenaires Agefiph + Cap emploi + MDPH région PACA** : à compiler
- ⚠️ Charte engagement accessibilité : à rédiger si absente

**Action correctrice :** créer 1 page "Réseau partenaires handicap PACA" avec contacts Agefiph PACA, Cap emploi 06, MDPH 06, Ressource Handicap Formation. **CRITIQUE.**

### Ind 27 — Sous-traitance / portage 🚨 MAJEUR si concerné

**Niveau attendu :** vérification respect du référentiel par sous-traitant.

**État Start Academy :**
- ⚠️ Si Lafitte + Ourmières sont sous-traitants (et non salariés), **contrat de sous-traitance écrit obligatoire** avec : missions, contenu/sanction formation, moyens, durée, période, montant.
- ⚠️ Vu dans Drive : `Contrat Partenariat Concept.docx` (mais c'est avec un partenaire, pas formateurs)

**Action correctrice :** vérifier statut juridique des 3 formateurs. Si sous-traitants → contrat à jour pour chacun.

### Ind 28 — Partenaires socio-économiques (entreprise) 🟡 MINEURE

**Niveau attendu :** réseau de partenaires entreprises pour formation en situation de travail.

**État Start Academy :**
- ✅ Pas mal de clients enseignes immobilier (Orpi, KW, IAD, Century 21, Laforet, Nestenn, MLS…) → liste à formaliser comme "partenaires socio-éco"

**Action correctrice :** créer 1 page "Liste partenaires réseaux immobilier" = liste des clients-enseignes ≈ partenaires.

---

## Critère 7 — Recueil appréciations/réclamations (Ind 30, 31, 32)

### Ind 30 — Recueil appréciations parties prenantes 🟡 MINEURE

**Niveau attendu :** sollicitation appréciations à fréquence pertinente + dispositifs de relance.

**État Start Academy :**
- ✅ Satisfaction à chaud + à froid auto-générée QualiOF
- ⚠️ **Sollicitation financeurs (AGEFICE/OPCO)** : "au moins 1 fois par an" — à présenter comme tracé
- ⚠️ Webinaires/réunions financeurs : participation à tracer

**Action correctrice :** compiler 1 page "Sollicitations financeurs 2025-2026" : dates des contacts AGEFICE, retours obtenus, webinaires participés.

### Ind 31 — Traitement réclamations 🚨 MAJEUR

**Niveau attendu :** modalités formalisées de traitement.

**État Start Academy :**
- ✅ **Procédure réclamation existante** dans Drive : `C7.i31 - Procédure de réclamation.docx` (mise à jour 2026-03-15)
- ⚠️ Tableau de suivi des réclamations : à présenter (même vide si aucune)

**Action correctrice :** créer un tableau xlsx "Registre des réclamations 2024-2026" (vide acceptable si aucune réclamation, mais doit exister).

### Ind 32 — Mesures d'amélioration 🚨 MAJEUR

**Niveau attendu :** démarche d'amélioration continue.

**Preuves :** identification causes abandon/insatisfaction, plans d'action, mise en œuvre actions spécifiques, tableau de suivi.

**État Start Academy :**
- ⚠️ Check-list Qualiopi mentionne "fiche amélioration à archiver dans plan d'amélioration continue" — à vérifier que c'est rempli
- ⚠️ "Plan d'amélioration continue" : à présenter (registre des améliorations apportées suite à retours/audits)

**Action correctrice :** créer 1 document "Plan amélioration continue Start Academy" listant : 5-10 améliorations 2024-2026 (ex: création QualiOF, refonte programmes IA, mise en place check-list, etc.).

---

## Plan d'action priorisé (5 semaines avant audit)

### Semaine 1 (1-7 juin) — Comblement écarts critiques
- [ ] **Site web Ind 1+2** : créer catalogue détaillé + publier indicateurs résultats chiffrés (CRITIQUE)
- [ ] **Compétences formateurs Ind 21** : compiler CV + diplômes + sensibilisation PSH des 3 formateurs
- [ ] **Réseau partenaires handicap Ind 26** : 1 page contacts Agefiph/Cap emploi/MDPH 06
- [ ] **Procédure évaluation Ind 11** : formaliser en 1 page

### Semaine 2 (8-14 juin) — Procédures et registres manquants
- [ ] **Plan amélioration continue Ind 32** : 1 document
- [ ] **Registre réclamations Ind 31** : 1 tableau xlsx (même vide)
- [ ] **Livret accueil OF Ind 9** : 1 page recto/verso
- [ ] **Organigramme + fiches de poste Ind 18**
- [ ] **Contrats sous-traitance formateurs Ind 27** (si applicable)

### Semaine 3 (15-21 juin) — Programmes et dossiers échantillon
- [ ] **Terminer chantier 6 backlog** : programmes multi-jours détaillés alignés Drive (Ind 6)
- [ ] **Sélectionner 10-15 dossiers bénéficiaires "exemplaires"** prêts à présenter
  - Critères : sessions terminées + pack fin de formation complet + AGEFICE/OPCO bouclé
  - Diversité : auto-entrepreneurs + salariés + 3 produits différents min
- [ ] **Préparer liste "nouveautés depuis dernier audit"** (Note 4 du plan d'audit) :
  - Nouvelle modalité ? Nouveau personnel ? Déménagement ? Nouvelles formations ?

### Semaine 4 (22-28 juin) — Simulation et révision
- [ ] **Simulation orale d'audit** avec Jean-Guy + Julien : revue blanche 1 jour
- [ ] **Demande BPF dernier exercice** prête (Note 1 : "échantillonnage basé sur BPF")
- [ ] **Démo QualiOF prête** : présenter le pack fin de formation 1-clic + module veille comme preuves Ind 23-25
- [ ] **Audit du site web post-corrections** : revérifier Ind 1+2 affichage

### Semaine 5 (29 juin - 2 juillet) — Dernière ligne droite
- [ ] **Print/dossier physique** : avoir tous les documents preuve imprimés ET en version numérique
- [ ] **Logistique siège** : ménage, salle prête, café, plan accès auditrice
- [ ] **Briefing équipe** : qui répond sur quel critère
- [ ] **J-1** : relecture finale de la checklist BCI

---

## Annexes — Inventaire des preuves disponibles (Drive + QualiOF)

### Preuves Drive (vérifiées)
| Fichier Drive | Indicateur(s) couvert(s) |
|---|---|
| Certificat_Qualiopi_start-academy.pdf | Référence |
| `C7.i31 - Procédure de réclamation.docx` (v01 2026-01) | Ind 31 |
| `C3.i12 - Procédure Gestion Absences/abandons.docx` (v01 2026-01) | Ind 12 |
| Check list Qualiopi START ACADEMY.docx (v01 2026-01) | Ind 9, 10, 32 |
| `C6.i23-24-25 tableau veille.xlsx` | Ind 23, 24, 25 |
| `Tableau_recapitulatif_critères_Qualiopi.xlsx` | Suivi global |
| 6 DOCX `C1.i1 PROGRAMME - X.docx` | Ind 6 |
| Livret-de-procédure-v202407.pdf | Ind 19 |
| Dossier "Critère 6 Veille" | Ind 23-25 |
| ~30 dossiers clients (Orpi, KW, IAD, Cafpi, Concept-Sigma, Iconic…) | Échantillon Ind 4-12 |

### Preuves QualiOF (BDD locale)
| Source | Indicateur(s) couvert(s) |
|---|---|
| TrainingProduct.objectives + programMd | Ind 4, 5, 6 |
| Document type=ANALYSE_BESOIN | Ind 4 |
| Document type=DEROULE_PEDAGOGIQUE | Ind 6, 10 |
| Document type=CONVENTION + CONVOCATION | Ind 9, 17 |
| PedagogicalAsset kind=QCM | Ind 11 |
| PedagogicalAsset kind=GRILLE_OBS | Ind 11 |
| Document SATISFACTION_CHAUD/FROID | Ind 30 |
| Document EMARGEMENT + ATTESTATION | Ind 11, 19 |
| AuditLog (toutes opérations tracées) | Traçabilité globale |
| `/app/veille` (Phase 13) | Ind 23-25 (démo) |
| `/app/qualiopi-bilan` | Ind 2, 11 (chiffres résultats) |

---

## Confirmations Laurent 2026-05-30
- ✅ **Aucune formation certifiante RNCP/RS** → Ind 3, 7, 8, 16 définitivement N/A
- ✅ **Lafitte + Ourmières = sous-traitants auto-entrepreneurs** → **Ind 27 APPLICABLE et CRITIQUE** : contrat de sous-traitance écrit obligatoire pour chacun (Marx = dirigeant, pas concerné)
- ⏳ PSH 2024-2026 : à vérifier

## Action immédiate démarrée
- 🚀 **Page publique `/catalogue` dans QualiOF** : codage lancé (résout 80% du Top 1 risque Ind 1)

## Périmètre final confirmé
**21 indicateurs réellement applicables** (sur 32 du référentiel) :
1, 2, 4, 5, 6, 9, 10, 11, 12, 17, 18, 19, 21, 22, 23, 24, 25, 26, **27 (critique sous-traitants)**, 28, 30, 31, 32

---

*Audit blanc généré 2026-05-30 par Claude. Sources : guide RNQ V9 (Ministère du Travail), audit live start-academy.fr, BDD QualiOF, Drive Start Academy (dossier partagé + dossiers procédures).*
