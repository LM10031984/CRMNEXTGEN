/**
 * _create-optimmo-152h.ts — Création idempotente (quick 2026-08-12, validé Laurent) :
 *   - Produit PROD-0674 « Intégrer l'Intelligence Artificielle dans son entreprise
 *     pour gagner en productivité » — 152h / 19 jours, prix de GROUPE intra 4 500 € HT,
 *     programme FIGÉ au produit (19 jours style PROD-0063).
 *   - Organization OPTIMMO SARL (SIRET 43143029700033, enseigne Century 21, OPCO EP).
 *   - Location « Locaux OPTIMMO » 29 bd Simone Veil, 06200 Nice.
 *   - Session SES-0106 07/10/2026 → 02/11/2026 (19 jours ouvrés exacts, aucun férié)
 *     + 38 SessionSlot 9h00-13h00 / 14h00-18h00 (UTC midnight — convention cloud).
 *   - 11 Person (salariées OPTIMMO) + LegalLink SALARIE (CSP consignée dans
 *     LegalLink.function — donnée INTERNE, jamais sur les documents) +
 *     11 SessionParticipant sponsorOrg=OPTIMMO, priceHT 409,09 ×10 + 409,10 ×1
 *     (somme = 4 500,00 exactement), financingMode OPCO (OPCO EP).
 *
 * Pattern canonique : _create-ses-0101.ts. Idempotent (upsert/find-or-create).
 * ⚠ NE génère AUCUN document / email. Création BDD pure (écritures ADDITIVES).
 *
 * Run : cd apps/web && node --import tsx --env-file=../../.env scripts/_create-optimmo-152h.ts
 */
import { prisma, LinkRole, Modality, Prisma } from '@qualiof/db';
import { buildAddress } from '@qualiof/shared';
import { isBusinessDayISO, addBusinessDaysISO } from '../src/lib/business-days';

const TENANT_ID = 'db191440-a144-48d1-93c1-767e6f647f2c';
const PRODUCT_CODE = 'PROD-0674';
const SESSION_CODE = 'SES-0106';
const START_ISO = '2026-10-07';
const EXPECTED_END_ISO = '2026-11-02';
const NB_DAYS = 19;
const TOTAL_GROUP_HT = '4500.00';

// ---------------------------------------------------------------------------
// Produit — contenu Qualiopi complet (modèles : PROD-0063 / PROD-0042).
// Textes SANS contact nominatif parti (Julien LAFITTE remplacé par le contact
// générique OF — cf. replaceDepartedContact, programme-template.ts).
// ---------------------------------------------------------------------------
const TITLE =
  "Intégrer l'Intelligence Artificielle dans son entreprise pour gagner en productivité";

const OBJECTIVES = [
  "Identifier les opportunités d'intégration de l'IA dans les processus clés d'une agence immobilière (transaction, gestion, administratif).",
  "Décrire le fonctionnement et les limites des IA génératives pour en faire un usage professionnel responsable.",
  "Rédiger des prompts efficaces adaptés aux métiers de l'agence (prospection, estimation, annonces, relation client).",
  "Produire des contenus commerciaux et de communication assistés par l'IA (annonces, emails, réseaux sociaux, visuels, vidéos).",
  "Automatiser les tâches répétitives du quotidien de l'agence à l'aide d'outils no-code connectés à l'IA.",
  "Analyser les données de l'agence pour piloter l'activité (tableaux de bord, indicateurs, reporting automatisé).",
  "Appliquer le cadre juridique et éthique en vigueur (RGPD, AI Act, déontologie immobilière) aux usages de l'IA en agence.",
  "Concevoir un plan d'action personnalisé d'intégration de l'IA par poste de travail et en évaluer les résultats dans la durée.",
];

const PREREQUISITES =
  "Aucun prérequis technique. Être à l'aise avec l'utilisation courante d'un ordinateur et d'un smartphone.";

const TARGET_AUDIENCE =
  "Salariés d'agence immobilière : négociateurs / négociatrices, gestionnaires (location, administration de biens), assistants commerciaux et cadres d'agence.";

const PEDAGOGICAL_METHODS =
  "Les formateurs proposeront des mises en situation professionnelles sur les cas concrets de l'agence (prospection, estimation, annonces, gestion locative, relation client) ainsi que des ateliers pratiques sur les outils d'IA et des échanges sur les pratiques actuelles. Chaque participant travaille sur ses propres dossiers et processus métier.";

const EVALUATION_METHODS =
  "- Une liste d'émargement est à signer à la demi-journée ;\n" +
  '- Un certificat de réalisation sera délivré à chaque participant à la fin de la formation\n' +
  '- Une évaluation sous forme de QCM aura lieu en fin de formation.\n' +
  '- Evaluation de la satisfaction stagiaire + évaluation de la montée en compétences étapes par étapes par des mises en situation pratiques.';

const ACCESS_CONDITIONS =
  "Afin de vous inscrire à notre formation, merci de contacter minimum 14 jours avant le début de la formation : formation@start-academy.fr — 06 31 05 63 90.\n" +
  "Une fois votre inscription validée, nous vous adresserons une convention de formation et une convocation vous sera envoyée par mail 7 jours avant le début de la formation. Test de positionnement à réaliser avant d'accéder à la formation.\n" +
  'En cas de subrogation de paiement, un accord du financeur doit nous être parvenu avant le début de la formation.';

const TRAINER_PROFILE =
  "Tous les formateurs de l'équipe Start-Academy ont minimum 8 années d'expérience dans l'immobilier, notamment dans le domaine de la vente de biens, de formation d'agents et de coaching individuel.";

const PEDAGOGICAL_SUPPORT =
  'Un livret de formation sera remis à chaque participant en début de formation. Le formateur déroulera sa formation avec une présentation Canva projetée.';

const PROGRAM_MD = `JOUR 1 - DÉCOUVRIR L'IA ET SES USAGES EN AGENCE IMMOBILIÈRE
8h : Fondamentaux de l'IA et prise en main des assistants
Matin 9h-13h (4h) : Comprendre l'IA générative
• 9h-10h30 : Panorama de l'IA générative - fonctionnement, cas d'usages en agence immobilière
• 10h30-10h45 : Pause
• 10h45-12h : Forces, limites et risques des IA (hallucinations, confidentialité, biais)
• 12h-13h : Pratique - Création et paramétrage des comptes (ChatGPT, Claude), premières requêtes
Après-midi 14h-18h (4h) : Cartographier les usages par poste
• 14h-15h30 : Cartographie des processus de l'agence - transaction, location, gestion, administratif
• 15h30-15h45 : Pause
• 15h45-17h : Atelier - Identification des tâches chronophages par poste (négociation, gestion, encadrement)
• 17h-18h : Pratique - Premiers gains rapides : reformulation d'emails et de courriers types

JOUR 2 - L'ART DU PROMPT APPLIQUÉ AUX MÉTIERS DE L'AGENCE
8h : Rédiger des prompts efficaces et réutilisables
Matin 9h-13h (4h) : Méthode de prompting
• 9h-10h30 : Structure d'un prompt efficace (contexte, rôle, tâche, format, exemples)
• 10h30-10h45 : Pause
• 10h45-12h : Erreurs à éviter, itération et affinage des réponses
• 12h-13h : Pratique - Rédaction de prompts pour les situations quotidiennes de l'agence
Après-midi 14h-18h (4h) : Bibliothèque de prompts de l'agence
• 14h-15h30 : Prompts spécialisés - prospection, estimation, annonces, relation client, gestion locative
• 15h30-15h45 : Pause
• 15h45-17h : Atelier - Construction de la bibliothèque de prompts partagée de l'agence
• 17h-18h : Pratique - Instructions personnalisées et projets par poste de travail

JOUR 3 - PROSPECTION INTELLIGENTE : ANALYSE DE MARCHÉ ET CIBLAGE
8h : Connaître son marché grâce à l'IA
Matin 9h-13h (4h) : Données du marché immobilier
• 9h-10h30 : Exploiter les bases de données publiques (DVF, Etalab) avec l'assistance de l'IA
• 10h30-10h45 : Pause
• 10h45-12h : Analyse de secteur - identification des zones à potentiel de mandats
• 12h-13h : Pratique - Étude de marché du secteur de l'agence assistée par IA
Après-midi 14h-18h (4h) : Ciblage et plan de prospection
• 14h-15h30 : Segmentation des cibles (vendeurs, bailleurs, investisseurs) et argumentaires dédiés
• 15h30-15h45 : Pause
• 15h45-17h : Atelier - Construction d'un plan de prospection mensuel assisté par IA
• 17h-18h : Pratique - Fiches secteur et argumentaires par typologie de biens

JOUR 4 - PROSPECTION INTELLIGENTE : COURRIERS, EMAILS ET SÉQUENCES
8h : Produire ses supports de prospection avec l'IA
Matin 9h-13h (4h) : Écrits de prospection
• 9h-10h30 : Courriers de prospection personnalisés par cible et par secteur
• 10h30-10h45 : Pause
• 10h45-12h : Emails et SMS de prospection - accroches, relances, pige
• 12h-13h : Pratique - Rédaction d'une gamme complète de courriers de prospection
Après-midi 14h-18h (4h) : Séquences et scripts
• 14h-15h30 : Séquences d'emails automatisées et scénarios de relance
• 15h30-15h45 : Pause
• 15h45-17h : Atelier - Scripts d'appels téléphoniques travaillés avec l'IA (pige, boîtage, recommandation)
• 17h-18h : Pratique - Mise en situation d'appels avec préparation IA

JOUR 5 - ESTIMATION ET AVIS DE VALEUR ASSISTÉS PAR L'IA
8h : Préparer et restituer une estimation augmentée
Matin 9h-13h (4h) : Analyse comparative
• 9h-10h30 : Préparation d'une estimation - collecte et synthèse des comparables avec l'IA
• 10h30-10h45 : Pause
• 10h45-12h : Analyse des points forts/faibles d'un bien et positionnement prix
• 12h-13h : Pratique - Estimation complète d'un bien du portefeuille de l'agence
Après-midi 14h-18h (4h) : Avis de valeur et restitution
• 14h-15h30 : Rédaction d'un avis de valeur structuré et argumenté avec l'IA
• 15h30-15h45 : Pause
• 15h45-17h : Atelier - Préparation du rendez-vous de restitution (objections prix, discours)
• 17h-18h : Pratique - Simulation de restitution d'estimation au vendeur

JOUR 6 - ANNONCES ET MISE EN VALEUR DES BIENS
8h : Créer des annonces qui se démarquent
Matin 9h-13h (4h) : Rédaction d'annonces
• 9h-10h30 : Structure d'une annonce efficace - titres, descriptifs, mentions obligatoires
• 10h30-10h45 : Pause
• 10h45-12h : Déclinaison par portail (site agence, portails immobiliers, réseaux sociaux)
• 12h-13h : Pratique - Réécriture d'annonces réelles de l'agence avec l'IA
Après-midi 14h-18h (4h) : Valorisation visuelle
• 14h-15h30 : Retouche et amélioration des photos, home staging virtuel
• 15h30-15h45 : Pause
• 15h45-17h : Atelier - Constitution d'un dossier de présentation de bien complet
• 17h-18h : Pratique - Production des supports pour les biens en portefeuille

JOUR 7 - COMMUNICATION DIGITALE DE L'AGENCE
8h : Animer la présence en ligne avec l'IA
Matin 9h-13h (4h) : Stratégie de contenus
• 9h-10h30 : Ligne éditoriale de l'agence - piliers de contenus et calendrier
• 10h30-10h45 : Pause
• 10h45-12h : Création de posts avec l'IA (Facebook, Instagram, LinkedIn)
• 12h-13h : Pratique - Génération d'un mois de calendrier éditorial
Après-midi 14h-18h (4h) : Visibilité locale
• 14h-15h30 : Avis clients, fiche établissement et notoriété locale travaillés avec l'IA
• 15h30-15h45 : Pause
• 15h45-17h : Atelier - Réponses aux avis et messages types de l'agence
• 17h-18h : Pratique - Publication et programmation des contenus produits

JOUR 8 - CRÉATION VISUELLE ET VIDÉO ASSISTÉES PAR L'IA
8h : Produire des supports visuels professionnels
Matin 9h-13h (4h) : Création graphique
• 9h-10h30 : Prise en main de Canva et des générateurs d'images IA
• 10h30-10h45 : Pause
• 10h45-12h : Chartes, vitrines, flyers et supports de l'agence
• 12h-13h : Pratique - Création des visuels récurrents de l'agence
Après-midi 14h-18h (4h) : Vidéo et audio
• 14h-15h30 : Scripts vidéo avec l'IA - présentation de biens, conseils, portraits d'équipe
• 15h30-15h45 : Pause
• 15h45-17h : Atelier - Tournage et montage assistés (CapCut, outils IA)
• 17h-18h : Pratique - Réalisation d'une vidéo de présentation de bien

JOUR 9 - RELATION CLIENT AUGMENTÉE
8h : Soigner chaque étape du parcours client
Matin 9h-13h (4h) : Rendez-vous vendeur et acquéreur
• 9h-10h30 : Préparation de rendez-vous avec l'IA - dossier, questions, analyse concurrentielle
• 10h30-10h45 : Pause
• 10h45-12h : Comptes rendus de visite et de rendez-vous générés puis personnalisés
• 12h-13h : Pratique - Préparation complète d'un rendez-vous vendeur réel
Après-midi 14h-18h (4h) : Suivi et fidélisation
• 14h-15h30 : Mails de suivi vendeur hebdomadaires, points d'étape et bilans de commercialisation
• 15h30-15h45 : Pause
• 15h45-17h : Atelier - Parcours de fidélisation client (anniversaires de vente, recommandation)
• 17h-18h : Pratique - Mise en place des modèles de suivi de l'agence

JOUR 10 - GESTION LOCATIVE ASSISTÉE PAR L'IA
8h : Gagner du temps sur le quotidien de la gestion
Matin 9h-13h (4h) : Dossiers et courriers de gestion
• 9h-10h30 : Courriers types de gestion locative (relances, régularisations, congés) avec l'IA
• 10h30-10h45 : Pause
• 10h45-12h : Analyse et synthèse de dossiers locataires, préparation des dossiers de candidature
• 12h-13h : Pratique - Production de la bibliothèque de courriers de gestion de l'agence
Après-midi 14h-18h (4h) : Communication propriétaires et locataires
• 14h-15h30 : Comptes rendus de gestion et reporting propriétaires assistés par l'IA
• 15h30-15h45 : Pause
• 15h45-17h : Atelier - Traitement des réclamations et situations délicates avec appui IA
• 17h-18h : Pratique - Cas réels de gestion traités avec les outils du jour

JOUR 11 - BACK-OFFICE ET ADMINISTRATIF AUGMENTÉS
8h : Fiabiliser et accélérer les tâches administratives
Matin 9h-13h (4h) : Documents et dossiers
• 9h-10h30 : Synthèse de documents longs (diagnostics, règlements, PV d'AG) avec l'IA
• 10h30-10h45 : Pause
• 10h45-12h : Préparation et vérification des dossiers de vente et de location
• 12h-13h : Pratique - Synthèses de documents réels de l'agence
Après-midi 14h-18h (4h) : Organisation du back-office
• 14h-15h30 : Modèles de documents internes, checklists et procédures rédigés avec l'IA
• 15h30-15h45 : Pause
• 15h45-17h : Atelier - Formalisation des procédures clés de l'agence
• 17h-18h : Pratique - Classeur de procédures partagé et modèles prêts à l'emploi

JOUR 12 - AUTOMATISATION NO-CODE : PREMIERS WORKFLOWS
8h : Découvrir l'automatisation des processus
Matin 9h-13h (4h) : Fondamentaux no-code
• 9h-10h30 : Introduction aux outils d'automatisation (Make, Zapier) - logique déclencheur/action
• 10h30-10h45 : Pause
• 10h45-12h : Repérage des processus automatisables de l'agence
• 12h-13h : Pratique - Création du premier scénario simple (notification, copie de données)
Après-midi 14h-18h (4h) : Workflows utiles en agence
• 14h-15h30 : Automatisation des emails entrants, alertes et tâches récurrentes
• 15h30-15h45 : Pause
• 15h45-17h : Atelier - Construction d'un workflow de suivi de contacts entrants
• 17h-18h : Pratique - Tests, fiabilisation et documentation du workflow

JOUR 13 - AUTOMATISATION NO-CODE : MINI-AGENTS ET LOGICIEL MÉTIER
8h : Connecter l'IA aux outils de l'agence
Matin 9h-13h (4h) : Scénarios avancés
• 9h-10h30 : Chaîner IA et automatisation - génération de contenus dans les workflows
• 10h30-10h45 : Pause
• 10h45-12h : Connexion avec le logiciel métier et les outils de l'agence (tableurs, agendas, CRM)
• 12h-13h : Pratique - Scénario de rédaction automatique de comptes rendus
Après-midi 14h-18h (4h) : Mini-agents immobiliers
• 14h-15h30 : Conception de mini-agents - qualification de contacts, veille, relances
• 15h30-15h45 : Pause
• 15h45-17h : Atelier - Construction d'un mini-agent adapté à un poste de l'agence
• 17h-18h : Pratique - Recette et mise en service encadrée

JOUR 14 - DONNÉES ET PILOTAGE DE L'AGENCE
8h : Décider avec des indicateurs fiables
Matin 9h-13h (4h) : Indicateurs d'activité
• 9h-10h30 : KPIs d'une agence immobilière - mandats, transformation, délais, satisfaction
• 10h30-10h45 : Pause
• 10h45-12h : Construction de tableaux de bord simples (tableurs assistés par IA)
• 12h-13h : Pratique - Tableau de bord d'activité par poste
Après-midi 14h-18h (4h) : Reporting automatisé
• 14h-15h30 : Rapports périodiques générés avec l'IA - direction, équipe, réseau
• 15h30-15h45 : Pause
• 15h45-17h : Atelier - Automatisation du reporting hebdomadaire de l'agence
• 17h-18h : Pratique - Analyse des données de l'agence et aide à la décision

JOUR 15 - CADRE JURIDIQUE, ÉTHIQUE ET SÉCURITÉ
8h : Utiliser l'IA en conformité
Matin 9h-13h (4h) : Protection des données
• 9h-10h30 : RGPD appliqué à l'agence - données clients, prospection, conservation
• 10h30-10h45 : Pause
• 10h45-12h : Bonnes pratiques de confidentialité avec les IA (données sensibles, secret des affaires)
• 12h-13h : Pratique - Audit des usages IA de l'agence et règles internes
Après-midi 14h-18h (4h) : Réglementation et déontologie
• 14h-15h30 : AI Act et transparence - mentions, vérification humaine, responsabilité
• 15h30-15h45 : Pause
• 15h45-17h : Atelier - Charte d'utilisation de l'IA de l'agence
• 17h-18h : Pratique - Mise en conformité des contenus et process produits en formation

JOUR 16 - MANAGEMENT ET ORGANISATION AUGMENTÉS
8h : Piloter l'équipe avec l'appui de l'IA
Matin 9h-13h (4h) : Organisation du travail
• 9h-10h30 : Préparation et comptes rendus de réunions assistés par l'IA
• 10h30-10h45 : Pause
• 10h45-12h : Plannings, répartition des tâches et priorisation avec l'IA
• 12h-13h : Pratique - Trame de réunion d'agence et suivi des décisions
Après-midi 14h-18h (4h) : Développement des équipes
• 14h-15h30 : Onboarding des nouveaux collaborateurs et supports de formation interne
• 15h30-15h45 : Pause
• 15h45-17h : Atelier - Entretiens individuels et objectifs préparés avec l'IA
• 17h-18h : Pratique - Kit management de l'agence (trames, modèles, rituels)

JOUR 17 - ASSISTANTS IA PERSONNALISÉS PAR POSTE
8h : Construire son assistant métier
Matin 9h-13h (4h) : Conception
• 9h-10h30 : Méthode de conception d'un assistant personnalisé (instructions, connaissances, garde-fous)
• 10h30-10h45 : Pause
• 10h45-12h : Assistants spécialisés - négociation, gestion locative, administratif, direction
• 12h-13h : Pratique - Cahier des charges de l'assistant de son poste
Après-midi 14h-18h (4h) : Construction et tests
• 14h-15h30 : Construction guidée des assistants personnalisés
• 15h30-15h45 : Pause
• 15h45-17h : Atelier - Tests croisés entre participants et affinage des instructions
• 17h-18h : Pratique - Validation et documentation des assistants créés

JOUR 18 - DÉPLOYER L'IA DANS L'AGENCE
8h : Passer des acquis individuels au collectif
Matin 9h-13h (4h) : Processus cibles
• 9h-10h30 : Redéfinition des processus de l'agence intégrant l'IA (avant/après)
• 10h30-10h45 : Pause
• 10h45-12h : Priorisation des chantiers - gains, efforts, risques
• 12h-13h : Pratique - Feuille de route de déploiement de l'agence
Après-midi 14h-18h (4h) : Gouvernance et adoption
• 14h-15h30 : Rôles et référents IA, partage des bibliothèques de prompts et d'automatisations
• 15h30-15h45 : Pause
• 15h45-17h : Atelier - Plan d'accompagnement des équipes et gestion des résistances
• 17h-18h : Pratique - Kit de déploiement (référentiels, accès, règles communes)

JOUR 19 - MISE EN SITUATION FINALE ET PLAN D'ACTION
8h : Consolider et évaluer les acquis
Matin 9h-13h (4h) : Cas pratiques complets
• 9h-10h30 : Mise en situation transversale - du contact entrant à la signature, avec les outils IA
• 10h30-10h45 : Pause
• 10h45-12h : Mise en situation gestion - traitement complet d'un dossier locatif avec IA
• 12h-13h : Pratique - Restitution des travaux par les participants
Après-midi 14h-18h (4h) : Synthèse et validation
• 14h-15h30 : Élaboration du plan d'action individuel à 30/60/90 jours
• 15h30-15h45 : Pause
• 15h45-16h45 : Quiz final (QCM) et correction commentée
• 16h45-17h30 : Évaluation de la satisfaction et bilan collectif de la formation
• 17h30-18h : Remise des certificats de réalisation et perspectives`;

// ---------------------------------------------------------------------------
// OPTIMMO — entreprise commanditaire/payeuse
// ---------------------------------------------------------------------------
const OPTIMMO = {
  legalName: 'OPTIMMO SARL',
  siret: '43143029700033',
  siren: '431430297',
  street: '2 Avenue Saint Sylvestre',
  postalCode: '06100',
  city: 'NICE',
  brandName: 'Century 21',
  network: 'Century 21',
  representative: 'Gilles Blanchon',
  email: 'gilles.blanchon@century21.fr',
  phone: '04 97 14 84 00',
};

const LOC_NAME = 'Locaux OPTIMMO';
const LOC_STREET = '29 Boulevard Simone Veil';
const LOC_CP = '06200';
const LOC_CITY = 'NICE';

// CSP interne (CAD/EMP) → consignée dans LegalLink.function UNIQUEMENT.
interface P {
  firstName: string;
  lastName: string; // MAJUSCULES (convention import-smartof)
  csp: 'Cadre' | 'Employée';
  priceHT: string; // Decimal string — somme = 4500.00 exactement
}

const PARTICIPANTS: P[] = [
  { firstName: 'Caroline', lastName: 'ROZIER', csp: 'Cadre', priceHT: '409.10' },
  { firstName: 'Elisabeth', lastName: 'SAVIGNAC', csp: 'Employée', priceHT: '409.09' },
  { firstName: 'Marianne', lastName: 'PERSICI', csp: 'Cadre', priceHT: '409.09' },
  { firstName: 'Manuella', lastName: 'BARTOLI', csp: 'Employée', priceHT: '409.09' },
  { firstName: 'Agnès', lastName: 'RAGOT', csp: 'Employée', priceHT: '409.09' },
  { firstName: 'Lorena', lastName: 'MICALI', csp: 'Employée', priceHT: '409.09' },
  { firstName: 'Magalie', lastName: 'BOUMENDJEL', csp: 'Employée', priceHT: '409.09' },
  { firstName: 'Evelyne', lastName: 'SISMONDINI', csp: 'Cadre', priceHT: '409.09' },
  { firstName: 'Kellie', lastName: 'CARDOSO-SOUSAN', csp: 'Employée', priceHT: '409.09' },
  { firstName: 'Marie', lastName: 'SIMONNEAU', csp: 'Employée', priceHT: '409.09' },
  { firstName: 'Sabrine', lastName: 'GADER', csp: 'Employée', priceHT: '409.09' },
];

function computeBusinessDays(startIso: string, nbDays: number): string[] {
  const days: string[] = [];
  let cur = startIso;
  if (!isBusinessDayISO(cur)) cur = addBusinessDaysISO(cur, 1);
  days.push(cur);
  while (days.length < nbDays) {
    cur = addBusinessDaysISO(cur, 1);
    days.push(cur);
  }
  return days;
}

async function main() {
  console.log('=== Création OPTIMMO 152h (idempotent) ===\n');

  // Garde-fous préalables
  const sum = PARTICIPANTS.reduce((acc, p) => acc + Math.round(Number(p.priceHT) * 100), 0);
  if (sum !== 450000) throw new Error(`Somme priceHT = ${sum / 100} ≠ 4500.00`);
  const days = computeBusinessDays(START_ISO, NB_DAYS);
  if (days[0] !== START_ISO) throw new Error(`Premier jour ${days[0]} ≠ ${START_ISO}`);
  if (days[days.length - 1] !== EXPECTED_END_ISO)
    throw new Error(`Dernier jour ${days[days.length - 1]} ≠ ${EXPECTED_END_ISO}`);
  console.log(`Garde-fous OK : somme priceHT 4 500,00 € — ${NB_DAYS} jours ouvrés ${days[0]} → ${days[days.length - 1]}\n`);

  // ---- Produit (upsert par tenantId+code) ----
  const productData = {
    tenantId: TENANT_ID,
    title: TITLE,
    durationHours: 152,
    modality: Modality.PRESENTIEL,
    prerequisites: PREREQUISITES,
    targetAudience: TARGET_AUDIENCE,
    objectives: OBJECTIVES as unknown as Prisma.InputJsonValue,
    programMd: PROGRAM_MD,
    pedagogicalMethods: PEDAGOGICAL_METHODS,
    evaluationMethods: EVALUATION_METHODS,
    accessConditions: ACCESS_CONDITIONS,
    trainerProfile: TRAINER_PROFILE,
    pedagogicalSupport: PEDAGOGICAL_SUPPORT,
    // Prix de GROUPE intra-entreprise (11 stagiaires max 12) — PAS un prix par
    // stagiaire. groupFlatPrice porte la sémantique ; priceHT requis > 0 par
    // les générateurs (programme/convention).
    priceHT: new Prisma.Decimal(TOTAL_GROUP_HT),
    vatRate: new Prisma.Decimal(0), // TVA non applicable art. 261-4-4° CGI (régime constaté)
    groupFlatPrice: new Prisma.Decimal(TOTAL_GROUP_HT),
    theme: 'IA',
    capacityMin: 5,
    capacityMax: 25,
    bpfSpecialty: "326 - Informatique, traitement de l'information, réseaux de transmission des données",
    bpfCategory: 'F.3.d - Autres formations professionnelles',
    ageficeEnEntreprise: true, // intra chez le client
    // Contenu rédigé par IA (Claude) le 2026-08-12 → bannière « Brouillon IA »
    // dans l'UI jusqu'à validation par Laurent (bouton Valider sur la fiche).
    aiDraftedAt: new Date(),
  };
  const product = await prisma.trainingProduct.upsert({
    where: { tenantId_code: { tenantId: TENANT_ID, code: PRODUCT_CODE } },
    create: { code: PRODUCT_CODE, ...productData },
    update: productData,
    select: { id: true },
  });
  console.log(`Produit ${PRODUCT_CODE} : ${product.id} (152h / 19j, groupe 4 500 € HT)`);

  // ---- Organization OPTIMMO (find by SIRET, sinon create) ----
  let org = await prisma.organization.findFirst({
    where: { tenantId: TENANT_ID, siret: OPTIMMO.siret },
    select: { id: true },
  });
  const opcoEp = await prisma.opcoCatalog.findFirst({
    where: { code: { in: ['OPCO_EP', 'OPCO EP'] } },
    select: { id: true, code: true },
  });
  if (!org) {
    org = await prisma.organization.create({
      data: {
        tenantId: TENANT_ID,
        legalName: OPTIMMO.legalName,
        legalForm: 'SARL',
        siret: OPTIMMO.siret,
        siren: OPTIMMO.siren,
        address: buildAddress({
          street: OPTIMMO.street,
          postalCode: OPTIMMO.postalCode,
          city: OPTIMMO.city,
        }) as Prisma.InputJsonValue,
        brandName: OPTIMMO.brandName,
        network: OPTIMMO.network,
        representative: OPTIMMO.representative,
        email: OPTIMMO.email,
        phone: OPTIMMO.phone,
        opcoCode: 'OPCO_EP',
        opcoCatalogId: opcoEp?.id ?? null,
        type: 'Client',
      },
      select: { id: true },
    });
    console.log(`Organization créée : OPTIMMO SARL (${org.id})`);
  } else {
    console.log(`Organization réutilisée : OPTIMMO SARL (${org.id})`);
  }

  // ---- Contact Gilles Blanchon rattaché à l'org ----
  const existingContact = await prisma.contact.findFirst({
    where: { organizationId: org.id, lastName: { equals: 'Blanchon', mode: 'insensitive' } },
    select: { id: true },
  });
  if (!existingContact) {
    await prisma.contact.create({
      data: {
        tenantId: TENANT_ID,
        organizationId: org.id,
        firstName: 'Gilles',
        lastName: 'Blanchon',
        email: OPTIMMO.email,
        phone: OPTIMMO.phone,
        function: "Chef d'entreprise",
        isPrimary: true,
        isBillingContact: true,
      },
    });
    console.log('Contact créé : Gilles Blanchon (primary, billing)');
  } else {
    console.log('Contact réutilisé : Gilles Blanchon');
  }

  // ---- Location (find par nom, sinon create) ----
  let location = await prisma.location.findFirst({
    where: { tenantId: TENANT_ID, name: { equals: LOC_NAME, mode: 'insensitive' } },
    select: { id: true },
  });
  if (!location) {
    location = await prisma.location.create({
      data: {
        tenantId: TENANT_ID,
        name: LOC_NAME,
        legalName: OPTIMMO.legalName,
        address: buildAddress({ street: LOC_STREET, postalCode: LOC_CP, city: LOC_CITY }) as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    console.log(`Location créée : ${LOC_NAME} (${LOC_STREET}, ${LOC_CP} ${LOC_CITY})`);
  } else {
    console.log(`Location réutilisée : ${LOC_NAME}`);
  }

  // ---- Session (upsert par code @unique) ----
  const START = new Date(START_ISO + 'T00:00:00.000Z');
  const END = new Date(EXPECTED_END_ISO + 'T00:00:00.000Z');
  const sessionName = `${TITLE} - ${START.toLocaleDateString('fr-FR', { timeZone: 'UTC' })}`;
  const sessionData = {
    tenantId: TENANT_ID,
    productId: product.id,
    name: sessionName,
    status: 'PLANNED' as const,
    startDate: START,
    endDate: END,
    modality: Modality.PRESENTIEL,
    locationId: location.id,
    capacityMax: 25,
    // pricePerLearner volontairement NULL : tarification de GROUPE portée par
    // le produit (groupFlatPrice) et répartie sur les SessionParticipant.priceHT.
  };
  const session = await prisma.trainingSession.upsert({
    where: { code: SESSION_CODE },
    create: { code: SESSION_CODE, ...sessionData },
    update: sessionData,
    select: { id: true },
  });
  console.log(`Session ${SESSION_CODE} : ${session.id} (${START_ISO} → ${EXPECTED_END_ISO})`);

  // ---- SessionSlots : 19 jours × (9h00-13h00 + 14h00-18h00) — drop & recreate ----
  await prisma.sessionSlot.deleteMany({ where: { sessionId: session.id } });
  await prisma.sessionSlot.createMany({
    data: days.flatMap((iso) => {
      const date = new Date(iso + 'T00:00:00.000Z');
      return [
        { sessionId: session.id, date, startTime: '9h00', endTime: '13h00', halfDay: 'morning' },
        { sessionId: session.id, date, startTime: '14h00', endTime: '18h00', halfDay: 'afternoon' },
      ];
    }),
  });
  console.log(`Slots créés : ${days.length * 2} (matin 9h-13h + après-midi 14h-18h)\n`);

  // ---- 11 Personnes + LegalLink SALARIE + inscriptions ----
  let created = 0;
  let reused = 0;
  for (const p of PARTICIPANTS) {
    let person = await prisma.person.findFirst({
      where: {
        tenantId: TENANT_ID,
        firstName: { equals: p.firstName, mode: 'insensitive' },
        lastName: { equals: p.lastName, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (person) {
      reused++;
      console.log(`  ↺ réutilisée : ${p.firstName} ${p.lastName}`);
    } else {
      person = await prisma.person.create({
        data: {
          tenantId: TENANT_ID,
          civility: 'Mme',
          firstName: p.firstName,
          lastName: p.lastName,
          professionalStatus: 'Salarié',
        },
        select: { id: true },
      });
      created++;
      console.log(`  ✓ créée     : ${p.firstName} ${p.lastName} (CSP interne : ${p.csp})`);
    }

    // LegalLink SALARIE → OPTIMMO. CSP consignée dans `function` (interne,
    // n'apparaît sur AUCUN document généré — décision Laurent 12/08).
    await prisma.legalLink.upsert({
      where: {
        personId_organizationId_role: {
          personId: person.id,
          organizationId: org.id,
          role: LinkRole.SALARIE,
        },
      },
      create: {
        personId: person.id,
        organizationId: org.id,
        role: LinkRole.SALARIE,
        function: `Salariée — ${p.csp}`,
        isPrimary: true,
      },
      update: { function: `Salariée — ${p.csp}` },
    });

    // Inscription (find-or-create — pas de clé unique sessionId+personId)
    const enrollment = await prisma.sessionParticipant.findFirst({
      where: { sessionId: session.id, personId: person.id },
      select: { id: true },
    });
    const enrollmentData = {
      sponsorOrgId: org.id,
      priceHT: new Prisma.Decimal(p.priceHT),
      participantType: 'Salarié',
      financingMode: 'OPCO' as const, // OPCO EP (entreprises de proximité)
      billingType: 'STRUCTURE' as const, // facturation à OPTIMMO (payeur personne morale)
    };
    if (enrollment) {
      await prisma.sessionParticipant.update({ where: { id: enrollment.id }, data: enrollmentData });
    } else {
      await prisma.sessionParticipant.create({
        data: {
          sessionId: session.id,
          personId: person.id,
          enrollmentStatus: 'PRE_ENROLLED',
          ...enrollmentData,
        },
      });
    }
  }

  // ---- Vérification finale ----
  const check = await prisma.sessionParticipant.aggregate({
    where: { sessionId: session.id },
    _sum: { priceHT: true },
    _count: true,
  });
  console.log(`\nParticipantes : ${created} créées, ${reused} réutilisées (total ${PARTICIPANTS.length}).`);
  console.log(`Contrôle : ${check._count} inscriptions, somme priceHT = ${check._sum.priceHT} € HT`);
  if (check._count !== 11 || String(check._sum.priceHT) !== '4500') {
    if (String(check._sum.priceHT) !== '4500.00' && String(check._sum.priceHT) !== '4500')
      throw new Error('Contrôle final KO : somme priceHT ≠ 4500.00');
  }
  console.log('Aucun document / email généré. ✅');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
