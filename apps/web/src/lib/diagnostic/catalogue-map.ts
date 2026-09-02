/**
 * Quelle JOURNÉE proposer à l'issue du diagnostic.
 *
 * Objectif : générer des leads sur un stand avec un email qui ne ressemble pas
 * à un flyer. Le prospect reçoit UNE journée — pas un parcours de 72 h qu'on ne
 * vend pas sur un salon — et c'est une VRAIE journée du catalogue Start Academy,
 * avec ses objectifs et son déroulé réels. Rien n'est inventé.
 *
 * DEPUIS LE 02/09/2026 : chaque axe pointe d'abord sur SA journée Faros
 * (`seed-journees-faros.ts`). C'est ce qui donne à l'email la patte de la
 * maison : le contenu couple l'IA et le métier par construction, puisqu'il vient
 * des capsules « L'Agent Incomparable ». Les journées de l'ancien catalogue
 * restent en second choix — le résolveur y descend si la journée Faros a été
 * désactivée ou supprimée, plutôt que de laisser un prospect sans rien.
 *
 * Le niveau IA du prospect (question 5) ne départage PLUS entre produits : les
 * quatre journées Faros s'adressent au débutant comme à l'utilisateur régulier.
 * Il est passé au modèle, qui l'utilise pour ordonner la journée — le socle en
 * tête pour un débutant, les commandes et les agents pour un habitué.
 *
 * Clé = `TrainingProduct.code` (stable), jamais le titre (qui se réécrit).
 *
 * Module NEUTRE : aucun import prisma/auth/React.
 */

import type { ProblematiqueKey } from './questions';

/**
 * Niveau d'usage de l'IA déduit de la question 5.
 *
 * Ne sert plus à choisir le produit, mais à personnaliser le déroulé dans le
 * prompt du sur-mesure. Conservé ici parce que c'est une lecture des réponses,
 * pas une décision d'assemblage.
 */
export type NiveauIa = 'DEBUTANT' | 'INITIE' | 'AVANCE';

export interface JourneeCandidate {
  /** `TrainingProduct.code`. */
  code: string;
  /** Aide-mémoire pour la relecture — le titre réel vient de la base. */
  memo: string;
}

/**
 * Journées éligibles par problématique, dans l'ordre de préférence.
 *
 * Le premier code est la journée Faros de l'axe. Les suivants sont des replis
 * de continuité de service, essayés dans l'ordre si le précédent est introuvable
 * ou désactivé au moment de l'envoi.
 */
export const JOURNEES: Record<ProblematiqueKey, JourneeCandidate[]> = {
  PROSPECTION_MANDATS: [
    { code: 'FRM-0004', memo: "8 h — J1 Faros : rentrer plus de mandats avec l'IA" },
    { code: 'PROD-0059', memo: '8 h — Booster vendeur (ancien catalogue)' },
    { code: 'PROD-0044', memo: "8 h — Vendez mieux avec l'IA (ancien catalogue)" },
  ],

  IA_PRODUCTIVITE: [
    { code: 'FRM-0005', memo: "8 h — J2 Faros : gagner 5 à 10 heures par semaine grâce à l'IA" },
    { code: 'PROD-0058', memo: "8 h — L'IA au service des conseillers immobiliers (ancien catalogue)" },
    { code: 'FRM-0001', memo: "8 h — Exploiter la puissance de l'IA (ancien catalogue)" },
  ],

  NOTORIETE_DIGITALE: [
    { code: 'FRM-0006', memo: '8 h — J3 Faros : devenir le professionnel le plus visible de son secteur' },
    { code: 'PROD-0044', memo: "8 h — Vendez mieux avec l'IA (ancien catalogue)" },
  ],

  MANAGEMENT_EQUIPE: [
    { code: 'FRM-0007', memo: "8 h — J4 Faros : piloter son agence et son équipe avec l'IA" },
  ],
};

/**
 * Axe de repli, utilisé UNIQUEMENT si un axe se retrouvait sans aucune journée
 * résoluble. Ce n'est plus le cas depuis que les quatre axes ont la leur — mais
 * un produit peut être désactivé un soir de salon, et le prospect doit repartir
 * avec quelque chose plutôt qu'avec rien.
 */
export const REPLI: ProblematiqueKey = 'IA_PRODUCTIVITE';

/**
 * Produits volontairement HORS du diagnostic, avec la raison.
 *
 * Documenté plutôt que simplement omis : sans cette liste, le prochain à
 * reprendre le code croira à un oubli et « corrigera » en les réintégrant.
 */
export const HORS_DIAGNOSTIC: Record<string, string> = {
  'PROD-0041': 'Cadastre N1 — outil métier, sans lien avec le diagnostic',
  'PROD-0060': 'Cadastre N2 — idem',
  'PROD-0671': 'Tracfin — réglementaire, ne se propose pas sur un diagnostic de besoin',
  'PROD-0062': 'Non discrimination / Tracfin / déontologie — réglementaire, idem',
  'PROD-0667': 'Anglais professionnel — hors sujet pour ce public',
  'PROD-c0c85e08': 'Coaching Indiv — intitulé interne, impubliable chez un prospect',
  'PROD-f8be726b': 'Event Sebastien Tedesco — événement, pas une formation catalogue',
  'PROD-7a78c8b2': "L'agence de l'olivier — intra dédiée à un client",
};

/**
 * Niveau IA déduit de la question 5 (« votre usage de l'IA aujourd'hui »).
 * Une valeur inconnue retombe sur DEBUTANT : sur un stand, mieux vaut donner le
 * socle à quelqu'un d'avancé que sauter le socle pour un débutant.
 */
export function niveauDepuisReponses(reponses: Record<string, string>): NiveauIa {
  switch (reponses.usage_ia) {
    case 'REGULIER':
      return 'AVANCE';
    case 'PONCTUEL':
    case 'ESSAI':
      return 'INITIE';
    case 'JAMAIS':
    default:
      return 'DEBUTANT';
  }
}

/**
 * La journée retenue, et la trace de la décision.
 *
 * `codes` est ORDONNÉ : le premier est la journée voulue, les suivants sont les
 * replis à essayer si elle ne se résout pas en base. C'est l'appelant qui tranche,
 * parce que lui seul sait ce qui existe — ce module reste neutre.
 */
export interface SelectionJournee {
  codes: string[];
  axeRetenu: ProblematiqueKey;
  replie: boolean;
  niveau: NiveauIa;
}

export function choisirJournee(
  dominante: ProblematiqueKey,
  reponses: Record<string, string>,
): SelectionJournee | null {
  const niveau = niveauDepuisReponses(reponses);

  for (const [axe, replie] of [
    [dominante, false],
    [REPLI, true],
  ] as const) {
    const candidates = JOURNEES[axe];
    if (candidates.length > 0) {
      return { codes: candidates.map((c) => c.code), axeRetenu: axe, replie, niveau };
    }
  }
  return null;
}
