/**
 * Quelle JOURNÉE du catalogue proposer à l'issue du diagnostic.
 *
 * Objectif : générer des leads sur un stand avec un email qui ne ressemble pas
 * à un flyer. Le prospect reçoit UNE journée — pas un parcours de 72 h qu'on ne
 * vend pas sur un salon — et c'est une VRAIE journée du catalogue Start Academy,
 * avec ses objectifs et son déroulé réels. Rien n'est inventé.
 *
 * ⚠ CLASSEMENT À RELIRE PAR LAURENT (établi le 01/09/2026 à partir des titres et
 * objectifs des 36 produits actifs).
 *
 * Clé = `TrainingProduct.code` (stable), jamais le titre (qui se réécrit). Un
 * code absent ou désactivé au moment de l'envoi est ignoré : le diagnostic ne
 * tombe pas en panne parce qu'un produit a bougé.
 *
 * Module NEUTRE : aucun import prisma/auth/React.
 */

import type { ProblematiqueKey } from './questions';

/**
 * Critère de départage À L'INTÉRIEUR d'une problématique.
 *
 * Deux prospects qui tombent sur le même axe ne reçoivent pas la même journée
 * s'ils n'en sont pas au même point : celui qui n'a jamais touché à l'IA reçoit
 * les fondamentaux, celui qui s'en sert déjà reçoit l'outil avancé. C'est ce
 * qui rend le diagnostic crédible — et c'est tiré de leurs réponses, pas d'un
 * tirage au sort.
 */
export type NiveauIa = 'DEBUTANT' | 'INITIE' | 'AVANCE';

export interface JourneeCandidate {
  /** `TrainingProduct.code`. */
  code: string;
  /** Niveaux auxquels cette journée s'adresse. */
  niveaux: NiveauIa[];
  /** Aide-mémoire pour la relecture — le titre réel vient de la base. */
  memo: string;
}

/**
 * Journées éligibles par problématique, dans l'ordre de préférence commerciale.
 * Le résolveur prend la PREMIÈRE qui accepte le niveau du prospect.
 */
export const JOURNEES: Record<ProblematiqueKey, JourneeCandidate[]> = {
  IA_PRODUCTIVITE: [
    { code: 'PROD-0058', niveaux: ['DEBUTANT', 'INITIE'], memo: "8 h — L'IA au service des conseillers immobiliers" },
    { code: 'FRM-0001', niveaux: ['DEBUTANT', 'INITIE'], memo: "8 h — Exploiter la puissance de l'IA dans son activité immobilière" },
    { code: 'FRM-0002', niveaux: ['INITIE', 'AVANCE'], memo: "8 h — Claude d'Anthropic pour les conseillers immobiliers" },
    { code: 'PROD-0663', niveaux: ['AVANCE'], memo: '8 h — Claude Anthropic pour les conseillers immo' },
    { code: 'PROD-0043', niveaux: ['DEBUTANT'], memo: "4 h — L'IA & l'humain : l'harmonie dans l'immobilier" },
  ],

  PROSPECTION_MANDATS: [
    { code: 'PROD-0059', niveaux: ['DEBUTANT', 'INITIE', 'AVANCE'], memo: '8 h — Booster vendeur' },
    { code: 'PROD-0044', niveaux: ['INITIE', 'AVANCE'], memo: "8 h — Vendez mieux avec l'IA" },
  ],

  NOTORIETE_DIGITALE: [
    { code: 'PROD-0044', niveaux: ['DEBUTANT', 'INITIE', 'AVANCE'], memo: "8 h — Vendez mieux avec l'IA (annonces, contenus, suivi vendeur)" },
  ],

  /**
   * ⚠ TROU DE CATALOGUE ASSUMÉ — aucune journée courte de pilotage d'équipe.
   * Les produits « entreprise/agence » existants font 40 h, 88 h et 152 h :
   * impossibles à proposer sur un stand. Le résolveur bascule donc sur l'axe
   * IA productivité, en assumant le décalage plutôt qu'en promettant une
   * journée qui n'existe pas. Une journée « piloter son équipe avec l'IA »
   * serait à créer — c'est un manque commercial, pas un bug.
   */
  MANAGEMENT_EQUIPE: [],
};

/** Axe de repli quand une problématique n'a aucune journée d'une seule journée. */
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
 * Une valeur inconnue retombe sur DEBUTANT : sur un stand, mieux vaut proposer
 * les fondamentaux à quelqu'un d'avancé que l'inverse.
 */
export function niveauDepuisReponses(reponses: Record<string, string>): NiveauIa {
  switch (reponses.usage_ia) {
    case 'REGULIER':
      return 'AVANCE';
    case 'PONCTUEL':
      return 'INITIE';
    case 'ESSAI':
      return 'INITIE';
    case 'JAMAIS':
    default:
      return 'DEBUTANT';
  }
}

/**
 * La journée retenue : un code produit, et la trace de la décision.
 * `replied` = on a basculé d'axe faute de journée courte sur l'axe d'origine.
 */
export interface SelectionJournee {
  code: string;
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
    const exact = candidates.find((c) => c.niveaux.includes(niveau));
    const choisi = exact ?? candidates[0];
    if (choisi) return { code: choisi.code, axeRetenu: axe, replie, niveau };
  }
  return null;
}
