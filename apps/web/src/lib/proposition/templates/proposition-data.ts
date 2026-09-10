/**
 * Le contrat de données de la proposition.
 *
 * Séparé du rendu, comme pour l'audit : le template ne fait que mettre en
 * forme. Aucun calcul dans le HTML — les montants arrivent déjà arrêtés par
 * `computePricing`, les droits par `computeFunding`.
 */

import type { ProposalContent, ProposalFunding } from '@qualiof/shared';

import type { PricingSynthesis } from '../pricing';

export interface PropositionData {
  /** PROP-NNNN */
  reference: string;
  version: number;
  agencyName: string;
  generatedAt: Date;
  validUntil: Date | null;
  /** Le commercial qui suit le dossier — « votre interlocuteur ». */
  ownerLabel: string;
  of: {
    name: string;
    siret: string | null;
    numDA: string | null;
    address: string | null;
    email: string | null;
    phone: string | null;
  };
  content: ProposalContent;
  /**
   * Les paramètres de tarification, pour que le document dise « 4 h sur site,
   * co-animées par 2 formateurs » sans jamais écrire ces nombres en dur —
   * ce sont des `FundingRule`, révisables sans redéploiement (spec §8.1).
   */
  onsiteHoursPerHalfDay: number;
  trainerCount: number;
  pricing: PricingSynthesis;
  funding: ProposalFunding;
  /** DIAG-NNNN — le rapport d'audit joint, quand il existe. */
  auditReference: string | null;
  /** Devis déjà générés, cités en bas du détail chiffré. */
  quoteNumbers: string[];
  /** « heuristique » ou « llm:<modèle> » — E-3 : jamais silencieux. */
  generationSource: string;
}
