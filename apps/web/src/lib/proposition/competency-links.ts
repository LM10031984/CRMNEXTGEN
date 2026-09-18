import { FAROS_WORKSHOPS } from './faros-workshops';

/**
 * Liens relus sur les déroulés du catalogue Drive, le 18/09/2026.
 * Identité = sourceRef, jamais titre/code produit. L'ordre donne les alternatives.
 * Le texte d'un signal n'accorde aucun droit d'entrer dans un programme.
 * Incrémenter la version lorsqu'une relation ou son résultat change.
 */
export const DIAGNOSTIC_SELECTION_VERSION = 'competences-faros-v1-2026-09-18';

export interface CompetencyLink {
  ruleId: string;
  moduleSourceRef: string;
  outcome: string;
  aiUsage: boolean;
  audience: 'conseiller' | 'manager' | 'tous';
}

export const COMPETENCY_LINKS: readonly CompetencyLink[] = [
  ...FAROS_WORKSHOPS.flatMap((w): CompetencyLink[] => w.ruleIds.map((ruleId) => ({
    ruleId, moduleSourceRef: w.sourceRef, outcome: w.outcome, aiUsage: true, audience: ruleId === 'ia-parametree' || ruleId === 'prompts-communs' || ruleId === 'anti-hallucination' ? 'tous' : 'conseiller',
  }))),
  { ruleId: 'sources', moduleSourceRef: 'drive:058#2', outcome: 'Préparer une action de prospection sur de nouveaux canaux locaux.', aiUsage: false, audience: 'conseiller' },
  { ruleId: 'trame', moduleSourceRef: 'drive:006#1', outcome: 'Construire et mettre en pratique une trame d’appel pour obtenir un rendez-vous de découverte.', aiUsage: false, audience: 'conseiller' },
  { ruleId: 'decouverte', moduleSourceRef: 'drive:017#1', outcome: 'Conduire une découverte vendeur structurée avant de présenter une estimation.', aiUsage: false, audience: 'conseiller' },
  { ruleId: 'exclusivite', moduleSourceRef: 'drive:058#6', outcome: 'Présenter les bénéfices de l’exclusivité et traiter les objections du vendeur.', aiUsage: false, audience: 'conseiller' },
  { ruleId: 'defense-du-prix', moduleSourceRef: 'drive:017#3', outcome: 'Défendre une estimation avec des arguments fondés sur les données du marché.', aiUsage: false, audience: 'conseiller' },
  { ruleId: 'prix-au-dessus', moduleSourceRef: 'drive:017#3', outcome: 'Argumenter un prix cohérent avec les données du marché auprès du vendeur.', aiUsage: false, audience: 'conseiller' },
  { ruleId: 'suivi-vendeur', moduleSourceRef: 'drive:058#5', outcome: 'Installer une routine hebdomadaire de comptes rendus et de contacts avec le vendeur.', aiUsage: false, audience: 'conseiller' },
  { ruleId: 'decouverte-acquereur', moduleSourceRef: 'drive:008#1', outcome: 'Conduire une découverte acheteur et adapter ses questions à la situation.', aiUsage: false, audience: 'conseiller' },
  { ruleId: 'decouverte-acquereur', moduleSourceRef: 'drive:059#3', outcome: 'Qualifier le projet acheteur et hiérarchiser les accompagnements.', aiUsage: false, audience: 'conseiller' },
  { ruleId: 'offres-vers-compromis', moduleSourceRef: 'drive:034#3', outcome: 'Traiter les objections de négociation pour parvenir à un accord entre les parties.', aiUsage: false, audience: 'conseiller' },
  { ruleId: 'crm-a-jour', moduleSourceRef: 'drive:058#4', outcome: 'Structurer et segmenter la base vendeurs dans un CRM exploitable.', aiUsage: false, audience: 'conseiller' },
  { ruleId: 'exploitation-base', moduleSourceRef: 'drive:058#4', outcome: 'Segmenter la base vendeurs et programmer un plan de relances adapté.', aiUsage: false, audience: 'conseiller' },
  { ruleId: 'exploitation-base', moduleSourceRef: 'drive:001#1', outcome: 'Segmenter les contacts et préparer une campagne ciblée à partir de la base existante.', aiUsage: false, audience: 'conseiller' },
  { ruleId: 'ia-parametree', moduleSourceRef: 'drive:070#2', outcome: 'Configurer son compte ChatGPT et formuler une première demande contextualisée.', aiUsage: true, audience: 'tous' },
  { ruleId: 'prompts-communs', moduleSourceRef: 'drive:071#3', outcome: 'Construire une bibliothèque de prompts utilisables par l’équipe.', aiUsage: true, audience: 'tous' },
  { ruleId: 'anti-hallucination', moduleSourceRef: 'drive:071#5', outcome: 'Contrôler et améliorer la qualité des productions de ChatGPT.', aiUsage: true, audience: 'tous' },
  { ruleId: 'reunion-equipe', moduleSourceRef: 'drive:060#2', outcome: 'Préparer une réunion immobilière hebdomadaire et son ordre du jour avec l’IA.', aiUsage: true, audience: 'manager' },
  { ruleId: 'indicateurs', moduleSourceRef: 'drive:060#3', outcome: 'Choisir les indicateurs commerciaux et transformer les données en bilan vérifiable avec l’IA.', aiUsage: true, audience: 'manager' },
  { ruleId: 'reporting', moduleSourceRef: 'drive:060#3', outcome: 'Produire un rapport de performance à partir des données de l’équipe avec l’IA.', aiUsage: true, audience: 'manager' },
  { ruleId: 'coaching', moduleSourceRef: 'drive:060#4', outcome: 'Conduire un entretien individuel et préparer un compte rendu avec l’IA.', aiUsage: true, audience: 'manager' },
];
