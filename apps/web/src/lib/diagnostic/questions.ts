/**
 * Contenu du diagnostic express — stand Start Academy, 25 ans du MLS.
 *
 * Module NEUTRE : zéro import prisma/auth/React. C'est du contenu métier, pas
 * du code — il est ici pour que Laurent puisse le relire et le corriger sans
 * ouvrir un composant.
 *
 * Contrainte de conception : le formulaire est rempli DEBOUT, sur un stand
 * bruyant, sur téléphone. D'où 8 questions fermées à 4 choix, aucune saisie
 * libre, aucun scroll horizontal. Objectif : 90 secondes montre en main.
 *
 * Les questions ne servent pas qu'à orienter : elles qualifient aussi le lead
 * (rôle, taille d'équipe, formation déjà suivie dans l'année ⇒ droits AGEFICE
 * restants). C'est ce qui rend l'atterrissage dans le CRM réellement utile.
 */

/**
 * Les quatre problématiques vers lesquelles un diagnostic peut router.
 *
 * Elles collent au catalogue Start Academy existant — on ne promet pas une
 * journée qu'on ne sait pas animer. `IA_PRODUCTIVITE` correspond au programme
 * « Immobilier : gagnez 2h par jour grâce à l'IA » (8h), déjà écrit.
 */
export type ProblematiqueKey =
  | 'IA_PRODUCTIVITE'
  | 'PROSPECTION_MANDATS'
  | 'MANAGEMENT_EQUIPE'
  | 'NOTORIETE_DIGITALE';

export interface Problematique {
  key: ProblematiqueKey;
  /** Titre affiché au prospect, à la première personne — c'est SON problème. */
  titre: string;
  /** Une phrase de restitution : « voilà ce qu'on a compris de vous ». */
  accroche: string;
  /** Cadre le modèle : sur quoi la journée doit porter, et rien d'autre. */
  axePedagogique: string;
}

export const PROBLEMATIQUES: Record<ProblematiqueKey, Problematique> = {
  IA_PRODUCTIVITE: {
    key: 'IA_PRODUCTIVITE',
    titre: "Reprendre 2 heures par jour grâce à l'IA",
    accroche:
      "Votre temps part dans des tâches répétitives qui ne rentrent aucun mandat : rédaction, comptes rendus, relances, administratif.",
    axePedagogique:
      "Outiller le quotidien du professionnel de l'immobilier avec l'IA générative : rédaction d'annonces et de mails, comptes rendus de visite, préparation de rendez-vous, suivi client. Cas pratiques sur les outils réellement utilisables en agence, pas de théorie sur l'IA.",
  },
  PROSPECTION_MANDATS: {
    key: 'PROSPECTION_MANDATS',
    titre: 'Rentrer plus de mandats, sans y passer ses journées',
    accroche:
      "Votre enjeu est en amont : sans flux régulier de mandats rentrés, tout le reste s'écroule.",
    axePedagogique:
      "Structurer la rentrée de mandats : pige et qualification, discours de prise de mandat, traitement des objections prix, réactivation du portefeuille dormant, génération de recommandation. L'IA intervient comme accélérateur de la méthode, jamais comme substitut.",
  },
  MANAGEMENT_EQUIPE: {
    key: 'MANAGEMENT_EQUIPE',
    titre: 'Faire progresser son équipe et tenir ses objectifs',
    accroche:
      "Votre performance ne dépend plus de vous seul mais de ce que votre équipe produit — et de votre capacité à la piloter.",
    axePedagogique:
      "Piloter une équipe immobilière : fixation et suivi d'objectifs, animation de réunion commerciale utile, entretien de recadrage et de progression, recrutement et intégration d'un négociateur. Tableaux de bord et reporting augmentés par l'IA.",
  },
  NOTORIETE_DIGITALE: {
    key: 'NOTORIETE_DIGITALE',
    titre: 'Devenir le professionnel le plus visible de son secteur',
    accroche:
      "Vos concurrents occupent le terrain numérique de votre secteur — et captent des vendeurs qui auraient pu vous appeler.",
    axePedagogique:
      "Construire une visibilité locale qui rapporte des estimations : ligne éditoriale de secteur, production de contenu régulière assistée par l'IA, avis clients et preuve sociale, exploitation des réseaux sociaux et des portails. Mesure du retour, pas de la vanité.",
  },
};

/** Poids d'une réponse sur chaque problématique. Absent = 0. */
export type Poids = Partial<Record<ProblematiqueKey, number>>;

export interface DiagnosticChoix {
  value: string;
  label: string;
  poids: Poids;
}

export interface DiagnosticQuestion {
  id: string;
  label: string;
  /** Précision courte sous la question, quand l'intitulé seul prête à confusion. */
  aide?: string;
  choix: DiagnosticChoix[];
}

/**
 * Les 8 questions, dans l'ordre d'affichage.
 *
 * Le poids n'est pas uniforme : Q3 (temps perdu), Q7 (priorité déclarée) et Q6
 * (origine des affaires) portent le diagnostic. Q1/Q2 modulent le management —
 * un conseiller seul ne doit jamais tomber sur une journée de management, même
 * s'il coche « faire progresser mon équipe » par erreur. Q5 module l'IA.
 */
export const QUESTIONS: DiagnosticQuestion[] = [
  {
    id: 'role',
    label: "Aujourd'hui, vous êtes plutôt…",
    choix: [
      {
        value: 'DIRIGEANT',
        label: "Dirigeant ou directeur d'agence",
        poids: { MANAGEMENT_EQUIPE: 3, NOTORIETE_DIGITALE: 1 },
      },
      {
        value: 'CONSEILLER',
        label: 'Conseiller immobilier salarié',
        poids: { PROSPECTION_MANDATS: 2, IA_PRODUCTIVITE: 1 },
      },
      {
        value: 'AGENT_CO',
        label: 'Agent commercial indépendant',
        poids: { PROSPECTION_MANDATS: 2, NOTORIETE_DIGITALE: 2 },
      },
      {
        value: 'AUTRE',
        label: 'Autre métier (syndic, gestion locative, mandataire)',
        poids: { IA_PRODUCTIVITE: 2 },
      },
    ],
  },
  {
    id: 'equipe',
    label: 'Combien de personnes travaillent avec vous ?',
    choix: [
      { value: 'SEUL', label: 'Je travaille seul', poids: { PROSPECTION_MANDATS: 2, IA_PRODUCTIVITE: 1 } },
      { value: 'DE_2_A_5', label: 'De 2 à 5', poids: { MANAGEMENT_EQUIPE: 1 } },
      { value: 'DE_6_A_15', label: 'De 6 à 15', poids: { MANAGEMENT_EQUIPE: 3 } },
      { value: 'PLUS_DE_15', label: 'Plus de 15', poids: { MANAGEMENT_EQUIPE: 4 } },
    ],
  },
  {
    id: 'temps_perdu',
    label: "Sur une semaine type, qu'est-ce qui vous coûte le plus de temps ?",
    choix: [
      {
        value: 'PROSPECTION',
        label: 'La prospection et la pige',
        poids: { PROSPECTION_MANDATS: 4 },
      },
      {
        value: 'REDACTION',
        label: 'La rédaction : annonces, mails, comptes rendus',
        poids: { IA_PRODUCTIVITE: 4 },
      },
      {
        value: 'SUIVI',
        label: 'Le suivi et la relance des clients',
        poids: { IA_PRODUCTIVITE: 2, PROSPECTION_MANDATS: 2 },
      },
      {
        value: 'PILOTAGE',
        label: "L'animation et le pilotage de l'équipe",
        poids: { MANAGEMENT_EQUIPE: 4 },
      },
    ],
  },
  {
    id: 'mandats',
    label: 'Sur les 6 derniers mois, vos mandats rentrés sont…',
    choix: [
      { value: 'BAISSE', label: 'En baisse', poids: { PROSPECTION_MANDATS: 4 } },
      { value: 'STABLE', label: 'Stables', poids: { PROSPECTION_MANDATS: 1, NOTORIETE_DIGITALE: 1 } },
      { value: 'HAUSSE', label: 'En hausse', poids: { IA_PRODUCTIVITE: 2, MANAGEMENT_EQUIPE: 1 } },
      {
        value: 'NON_SUIVI',
        label: 'Je ne les suis pas précisément',
        poids: { MANAGEMENT_EQUIPE: 2, PROSPECTION_MANDATS: 1 },
      },
    ],
  },
  {
    id: 'usage_ia',
    label: "Votre usage de l'intelligence artificielle aujourd'hui ?",
    choix: [
      { value: 'JAMAIS', label: "Je n'en utilise pas", poids: { IA_PRODUCTIVITE: 3 } },
      {
        value: 'ESSAI',
        label: "J'ai essayé une ou deux fois, sans suite",
        poids: { IA_PRODUCTIVITE: 3 },
      },
      {
        value: 'PONCTUEL',
        label: "Je m'en sers de temps en temps",
        poids: { IA_PRODUCTIVITE: 1, NOTORIETE_DIGITALE: 1 },
      },
      {
        value: 'REGULIER',
        label: 'Je m’en sers toutes les semaines',
        poids: { NOTORIETE_DIGITALE: 2, MANAGEMENT_EQUIPE: 1 },
      },
    ],
  },
  {
    id: 'origine_affaires',
    label: "D'où viennent vos affaires, principalement ?",
    choix: [
      {
        value: 'TERRAIN',
        label: 'Pige et prospection terrain',
        poids: { PROSPECTION_MANDATS: 3 },
      },
      {
        value: 'RECOMMANDATION',
        label: 'Recommandation et bouche-à-oreille',
        poids: { PROSPECTION_MANDATS: 2, NOTORIETE_DIGITALE: 2 },
      },
      {
        value: 'DIGITAL',
        label: 'Portails et réseaux sociaux',
        poids: { NOTORIETE_DIGITALE: 4 },
      },
      {
        value: 'PARTAGE',
        label: 'Partage de mandats entre confrères (MLS, AMEPI)',
        poids: { NOTORIETE_DIGITALE: 2, MANAGEMENT_EQUIPE: 1 },
      },
    ],
  },
  {
    id: 'priorite',
    label: 'Si vous pouviez régler UN seul point dans les 6 mois ?',
    aide: 'Celui qui changerait vraiment votre année.',
    choix: [
      { value: 'MANDATS', label: 'Rentrer plus de mandats', poids: { PROSPECTION_MANDATS: 5 } },
      {
        value: 'TEMPS',
        label: 'Gagner du temps sur tout ce qui ne vend pas',
        poids: { IA_PRODUCTIVITE: 5 },
      },
      {
        value: 'EQUIPE',
        label: 'Faire progresser mon équipe',
        poids: { MANAGEMENT_EQUIPE: 5 },
      },
      {
        value: 'VISIBILITE',
        label: 'Être plus visible que mes concurrents',
        poids: { NOTORIETE_DIGITALE: 5 },
      },
    ],
  },
  {
    id: 'formation_annee',
    // Question commerciale, pas pédagogique : elle ne pèse sur aucune
    // problématique. Elle sert à préparer l'appel de relance (droits AGEFICE
    // encore ouverts sur l'année en cours ?).
    label: 'Avez-vous suivi une formation professionnelle cette année ?',
    choix: [
      { value: 'OUI', label: 'Oui', poids: {} },
      { value: 'NON', label: 'Non', poids: {} },
      { value: 'INCONNU', label: 'Je ne sais pas', poids: {} },
    ],
  },
];

/** Questions qui pèsent sur le diagnostic — le reste est de la qualification. */
export const QUESTIONS_SCORANTES = QUESTIONS.filter((q) =>
  q.choix.some((c) => Object.keys(c.poids).length > 0),
);
