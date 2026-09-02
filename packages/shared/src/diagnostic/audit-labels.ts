/**
 * Libellés ÉCRITS des questions, pour la restitution du rapport d'audit.
 *
 * Pourquoi un second jeu de libellés : la question du référentiel est celle
 * qu'on POSE à l'oral (« Vous faites quoi, exactement — de la transaction, de
 * la location, de la gestion ? »). Recopiée telle quelle dans un document remis
 * au dirigeant, elle fait ressembler l'audit à un formulaire relu à voix haute.
 *
 * Ici, un intitulé nominal, court, tel qu'il apparaît dans la colonne de gauche
 * du tableau « Ce que vous nous avez dit » de la maquette.
 *
 * Les deux jeux partagent les mêmes IDs, et un test de contrat vérifie qu'aucune
 * question n'est laissée sans libellé écrit.
 */
export const AUDIT_LABELS: Record<string, string> = {
  // Ch.1 — Identité & contexte
  'identity-network': 'Enseigne ou réseau',
  'identity-agencies-count': 'Nombre de points de vente',
  'identity-geo-areas': 'Secteurs couverts',
  'identity-activities': 'Activités exercées',
  'identity-transaction-ancien-percent': "Part de la transaction dans l'ancien",
  'identity-property-types': 'Typologie des biens',
  'identity-sales-n1': 'Ventes réalisées N-1',
  'identity-revenue-n1': "Chiffre d'affaires N-1",
  'identity-revenue-goal': "Objectif de chiffre d'affaires",
  'identity-ambition-3y': 'Ambition à trois ans',

  // Ch.2 — Équipe & financement
  'team-total-count': 'Effectif total',
  'team-employees-count': 'Salariés',
  'team-independents-count': 'Agents commerciaux indépendants',
  'team-assistants-count': 'Assistants / back-office',
  'team-managers-count': 'Encadrement',
  'team-directors-count': 'Direction',
  'funding-trainings-24m': 'Formations suivies sur 24 mois',
  'funding-trainings-24m-detail': 'Détail des formations suivies',
  'funding-agefice-used': 'Droits AGEFICE déjà mobilisés',
  'funding-opco-used': 'OPCO déjà sollicité',
  'funding-rights-known': 'Connaissance des droits ouverts',
  'funding-past-refusals': 'Refus de prise en charge antérieurs',
  'funding-past-refusals-reason': 'Motif du refus',
  'funding-internal-budget': 'Budget formation interne',
  'funding-internal-budget-amount': 'Montant du budget interne',

  // Ch.3 — Prospection
  'prospecting-methods': 'Vos sources de contacts vendeurs',
  'prospecting-who': 'Qui prospecte réellement',
  'perf-contacts-week': 'Contacts vendeurs par semaine',
  'prospecting-contacts-per-month': 'Contacts vendeurs générés par mois',
  'prospecting-hours-per-week': 'Temps de prospection hebdomadaire',
  'perf-rate-rdv': 'Taux de transformation contact → rendez-vous',
  'prospecting-script': "Trame d'appel commune",
  'skill-prospection': "Aisance de l'équipe en prospection",

  // Ch.4 — RDV vendeur
  'seller-meetings-per-month': 'Rendez-vous estimation par mois',
  'perf-rate-estimation': 'Taux de transformation en estimation',
  'seller-meeting-format': 'Format du rendez-vous vendeur',
  'seller-discovery-formalized': 'Découverte vendeur formalisée',
  'estimation-delivery-delay': "Délai de remise de l'estimation",
  'seller-written-valuation': 'Avis de valeur remis par écrit',
  'skill-qualification': 'Qualification du besoin vendeur',
  'skill-estimation': "Maîtrise de l'estimation",
  'skill-objections': 'Traitement des objections',

  // Ch.5 — Mandats & exclusivité
  'mandates-active-stock': 'Mandats actifs en portefeuille',
  'mandates-per-month': 'Mandats rentrés par mois',
  'perf-rate-mandat': 'Taux estimation → mandat',
  'perf-rate-exclusivity': 'Passage du simple à l’exclusivité',
  'mandates-exclusivity-percent': "Part de l'exclusivité dans les rentrées",
  'mandates-price-above-market': 'Attitude face à un prix au-dessus du marché',
  'skill-price-defense': 'Défense du prix de rentrée',
  'mandates-average-duration-months': 'Durée moyenne de commercialisation',

  // Ch.6 — Commercialisation & suivi
  'commercial-followup-frequency': 'Rythme de suivi vendeur',
  'commercial-price-drop-per-month-percent': 'Baisse de prix mensuelle moyenne',
  'commercial-requalification-process': 'Processus de requalification du stock',

  // Ch.7 — Acquéreurs
  'buyers-sources-repartition': 'Origine des contacts acquéreurs',
  'buyers-contacts-per-month': 'Contacts acquéreurs par mois',
  'buyers-discovery-formalized': 'Découverte acquéreur formalisée',
  'buyers-financing-verified': 'Vérification du financement acquéreur',

  // Ch.8 — Visites, offres & transformation
  'visits-per-month': 'Visites par mois',
  'offers-per-month': 'Offres par mois',
  'compromis-per-month': 'Compromis par mois',
  'actes-per-month': 'Actes par mois',
  'chute-compromis-acte-percent': 'Taux de chute compromis → acte',

  // Ch.9 — Base de données & e-réputation
  'db-volume': 'Volume de la base de contacts',
  'db-crm-uptodate': 'Fraîcheur de la base',
  'perf-crm-usage': 'Taux d’utilisation du CRM',
  'db-exploitation': 'Exploitation de la base',
  'google-reviews-count': "Nombre d'avis en ligne",
  'google-reviews-score': 'Note moyenne en ligne',
  'reviews-collection-process': "Processus de collecte d'avis",

  // Ch.10 — Outils & IA
  'tools-metier': 'Logiciel métier',
  'tools-estimation': "Outil d'estimation",
  'tools-pige': 'Outil de pige',
  'tools-portals': 'Portails de diffusion',
  'tools-esignature': 'Signature électronique',
  'tools-ai-usage': "Usages de l'IA en place",
  'tool-chatgpt-usage': 'Usage de ChatGPT',
  'tool-claude-gemini': 'Autres assistants utilisés',
  'tool-team-access': "Accès de l'équipe aux outils",
  'tool-chatgpt-setup': 'Paramétrage des instructions personnalisées',
  'tool-chatgpt-instructions': 'Instructions métier renseignées',
  'tool-prompts-standard': 'Modèles de prompts communs',
  'tool-anti-hallucination': 'Réflexe de vérification des réponses',
  'tool-notebooklm': 'Connaissance de NotebookLM',
  'tool-notebook-created': 'Base documentaire créée',
  'tool-gamma': 'Production de supports (Gamma)',

  // Ch.11 — Management & pilotage
  'mgmt-team-meeting-frequency': "Rythme de réunion d'équipe",
  'exec-manager-reporting': 'Reporting commercial',
  'mgmt-coaching-individual': 'Coaching individuel',
  'exec-week-structure': 'Structuration de la semaine',
  'exec-autonomy': "Autonomie de l'équipe",
  'mgmt-indicators-followed': 'Indicateurs suivis',
  'mgmt-recruitment': 'Recrutement en cours ou prévu',
  'mgmt-top3-difficulties': 'Les trois difficultés citées',
  'mgmt-top3-priorities': 'Les trois priorités citées',
};

/** Le libellé écrit d'une question, avec repli sur la formulation orale. */
export function auditLabelFor(questionId: string, oralQuestion: string): string {
  return AUDIT_LABELS[questionId] ?? oralQuestion;
}
