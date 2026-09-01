/**
 * Trames de programme envoyées au prospect après le diagnostic du stand.
 *
 * ⚠ CONTENU MÉTIER — BROUILLON À VALIDER PAR LAURENT.
 * Ces quatre trames ont été rédigées à partir des `axePedagogique` de
 * `questions.ts`. Elles sont crédibles mais elles n'ont PAS été relues par un
 * formateur. Elles partent chez des prospects : à relire avant d'ouvrir les
 * envois dans Paramètres → Emails.
 *
 * Module NEUTRE : aucun import prisma/auth/React, comme `questions.ts`.
 *
 * Choix assumés :
 *  - objectifs formulés avec des verbes de Bloom (exigence Qualiopi, et de
 *    toute façon la seule façon d'écrire un objectif évaluable) ;
 *  - AUCUN prix affiché. Le tarif dépend du payeur (forfait entreprise ou
 *    tarif par personne) et des droits AGEFICE restants — on ne l'invente pas
 *    dans un email automatique ;
 *  - durée annoncée en heures ET en jours (convention projet : 8 h = 1 jour).
 */

import type { ProblematiqueKey } from './questions';

export interface TrameProgramme {
  /** Intitulé commercial de la journée. */
  intitule: string;
  /** Durée en heures. Convention projet : 8 h = 1 jour (9h-13h / 14h-18h). */
  dureeHeures: number;
  /** À qui la journée s'adresse — repris tel quel dans l'email. */
  public: string;
  /** Objectifs pédagogiques, verbes de Bloom, évaluables. */
  objectifs: string[];
  /** Déroulé de la journée, dans l'ordre. */
  sequences: string[];
}

export const TRAMES: Record<ProblematiqueKey, TrameProgramme> = {
  IA_PRODUCTIVITE: {
    intitule: "Immobilier : reprendre 2 heures par jour grâce à l'IA",
    dureeHeures: 8,
    public:
      "Conseillers, agents commerciaux et dirigeants d'agence. Aucun prérequis technique.",
    objectifs: [
      "Identifier les tâches de son quotidien qui gagnent à être outillées par l'IA générative",
      "Rédiger une annonce, un mail client et un compte rendu de visite à l'aide d'un assistant, et en contrôler la qualité",
      "Construire ses propres modèles de requêtes réutilisables sur ses cas récurrents",
      "Appliquer les règles de confidentialité et de RGPD aux données clients transmises à un assistant",
    ],
    sequences: [
      "Où part réellement votre temps : cartographie d'une semaine type",
      "Prendre en main un assistant : formuler une demande qui donne un résultat utilisable",
      "Atelier rédaction : annonces, mails de relance, comptes rendus de visite",
      "Atelier préparation de rendez-vous : dossier vendeur, argumentaire, objections",
      "Constituer sa bibliothèque de modèles et l'installer dans sa semaine",
      "Confidentialité des données clients : ce qui ne sort jamais de l'agence",
    ],
  },
  PROSPECTION_MANDATS: {
    intitule: 'Rentrer plus de mandats, sans y passer ses journées',
    dureeHeures: 8,
    public: "Conseillers, agents commerciaux et dirigeants d'agence en prise directe avec la prospection.",
    objectifs: [
      'Structurer un plan de prospection hebdomadaire tenable et mesurable',
      'Conduire un entretien de prise de mandat et traiter les objections de prix',
      'Réactiver un portefeuille dormant à partir de critères de priorisation explicites',
      'Provoquer la recommandation client au lieu de l’attendre',
    ],
    sequences: [
      'Diagnostic de son propre flux : d’où viennent réellement vos mandats',
      'Pige et qualification : trier avant d’appeler',
      'L’entretien de prise de mandat, du premier contact à la signature',
      'Objections de prix : les traiter sans casser la relation',
      'Réactivation du portefeuille dormant : méthode et scripts',
      'Générer de la recommandation : le moment, la formulation, le suivi',
    ],
  },
  MANAGEMENT_EQUIPE: {
    intitule: 'Faire progresser son équipe et tenir ses objectifs',
    dureeHeures: 8,
    public: "Dirigeants et directeurs d'agence encadrant une équipe commerciale.",
    objectifs: [
      'Fixer des objectifs individuels mesurables et en organiser le suivi',
      'Animer une réunion commerciale qui produit des décisions',
      'Conduire un entretien de recadrage et un entretien de progression',
      'Structurer le recrutement et l’intégration d’un négociateur',
    ],
    sequences: [
      'Ce que vous pilotez aujourd’hui, et ce que vous subissez',
      'Fixer des objectifs : du chiffre d’agence à l’engagement individuel',
      'La réunion commerciale utile : format, rythme, décisions',
      'Entretien de recadrage : dire les choses sans casser l’envie',
      'Entretien de progression : faire monter un négociateur',
      'Recruter et intégrer : les 90 premiers jours',
      'Tableaux de bord et reporting augmentés par l’IA',
    ],
  },
  NOTORIETE_DIGITALE: {
    intitule: 'Devenir le professionnel le plus visible de son secteur',
    dureeHeures: 8,
    public: "Conseillers, agents commerciaux et dirigeants d'agence. Aucun prérequis technique.",
    objectifs: [
      'Définir une ligne éditoriale de secteur qui parle à des vendeurs',
      'Produire un contenu régulier avec l’appui de l’IA, sans y passer ses soirées',
      'Organiser la collecte et l’exploitation des avis clients',
      'Mesurer le retour réel de sa présence en ligne — estimations, pas abonnés',
    ],
    sequences: [
      'Ce que voit un vendeur de votre secteur quand il cherche un professionnel',
      'Construire sa ligne éditoriale : sujets, ton, fréquence',
      'Atelier production : un mois de contenu en une demi-journée',
      'Avis clients et preuve sociale : les demander, les publier, y répondre',
      'Réseaux sociaux et portails : où être, où ne pas être',
      'Mesurer ce qui rapporte des estimations, et arrêter le reste',
    ],
  },
};

/**
 * « 8 h / 1 jour ».
 *
 * Convention projet, non négociable : 8 h = 1 jour (journée d'émargement
 * 9h-13h / 14h-18h). 16 h = 2 jours, 72 h = 9 jours.
 */
export function formatDuree(heures: number): string {
  const jours = heures / 8;
  const j = Number.isInteger(jours) ? `${jours}` : jours.toFixed(1).replace('.', ',');
  return `${heures} h / ${j} jour${jours > 1 ? 's' : ''}`;
}
