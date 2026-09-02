/**
 * Moteur budget & tarification — types.
 *
 * Spec : `.planning/specs/2026-09-01-chaine-diagnostic-proposition.md` §8.
 *
 * Module PUR : aucun import prisma, next ou react. Il reçoit des nombres et en
 * rend d'autres. C'est ce qui permet de l'afficher en rendez-vous en moins
 * d'une seconde, et de le tester sans base.
 */

import type { FundingRuleKey } from '@qualiof/shared/diagnostic';

/** Valeurs des règles de financement, résolues depuis `FundingRule`. */
export type FundingRuleValues = Record<FundingRuleKey, number>;

/** Un participant appartient à UN régime — jamais deux (spec §8.2). */
export type ParticipantRegime = 'AGEFICE' | 'OPCO_EP' | 'AUCUN';

/**
 * D'où sort le montant de droits affiché. La distinction n'est pas cosmétique :
 * une estimation déclarative ne se présente JAMAIS comme un droit acquis.
 */
export type BudgetSource =
  | 'cfp_verifiee' // CFP réelle lue au CRM — fait foi
  | 'estimation_ca_n1' // proxy commercial du R1, à confirmer
  | 'enveloppe_entreprise' // OPCO EP : le droit est à l'entreprise
  | 'aucun';

export interface FundingParticipantInput {
  id: string;
  statut: 'INDEPENDANT' | 'SALARIE' | 'DIRIGEANT';
  /** Production N-1 déclarée en rendez-vous (indés / dirigeants TNS). */
  caN1: number | null;
  /** `AgeficeProfile.lastCfpEligibleBudget` quand la personne existe au CRM. */
  cfpEligibleBudget: number | null;
  /** Salariés — pré-coché oui (IDCC 1527). */
  opcoEligible: boolean | null;
  /** Déjà consommé sur l'année en cours, en €. */
  consumedThisYear: number | null;
  /** Montant financé sur 24 mois — alimente le levier « droits sous-utilisés ». */
  trainings24mFunded: number | null;
  includedInProposal: boolean;
}

export interface FundingComputeInput {
  rules: FundingRuleValues;
  participants: FundingParticipantInput[];
  /** Effectif salarié de l'entreprise — pilote l'enveloppe OPCO EP. */
  employeeCount: number | null;
  /** Enveloppe OPCO EP déjà consommée sur l'année. */
  companyOpcoConsumed: number | null;
  modality: 'PRESENTIEL' | 'DISTANCIEL';
  /** REGLEMENTAIRE = TRACFIN / non-discrimination / déontologie → 40 €/h. */
  fundingType: 'COEUR_METIER' | 'REGLEMENTAIRE';
  /** Volume imposé par le commercial. Absent → le moteur dimensionne. */
  halfDaysOverride?: number | null;
  /** Horodatage injecté pour rendre le moteur déterministe. */
  computedAt?: string;
}

export type FundingAlertSeverity = 'info' | 'warning' | 'blocking';

export interface FundingAlert {
  code: string;
  label: string;
  severity: FundingAlertSeverity;
  /** `client` = présentable au dirigeant · `internal` = pilotage commercial. */
  audience: 'client' | 'internal';
  context?: Record<string, unknown>;
}

export interface FundingParticipantResult {
  id: string;
  regime: ParticipantRegime;
  /** Droits mobilisables, nets du consommé. */
  budget: number;
  budgetSource: BudgetSource;
  /** Taux horaire applicable à ce participant (€/h conventionnée). */
  hourlyRate: number;
  /** Ce que le volume coûterait sans plafond — sert à expliquer l'écart. */
  coverageUncapped: number;
  /** Prise en charge retenue : jamais au-dessus du plafond ni du prix. */
  coverage: number;
  price: number;
  remainder: number;
}

export interface FundingSynthesis {
  /** Demi-journées de groupe proposées (le groupe avance ensemble). */
  halfDays: number;
  /** Heures sur site — l'assiette du PRIX. */
  onsiteHours: number;
  /**
   * Heures conventionnées — l'assiette du FINANCEMENT, et LA valeur de
   * référence unique : proposition, convention, émargement, attestation et
   * dossier financeur portent ce même nombre (spec §8.1, ligne rouge).
   */
  conventionedHours: number;
  participants: FundingParticipantResult[];
  agefice: { participantCount: number; budget: number; coverage: number };
  opcoEp: {
    participantCount: number;
    /** null = non calculable (plus de 50 salariés) — surtout pas 0. */
    envelope: number | null;
    manualValidationRequired: boolean;
    budget: number;
    coverage: number;
  };
  totalPrice: number;
  totalCoverage: number;
  /** UN seul reste à charge présenté au dirigeant, tous régimes confondus. */
  totalRemainder: number;
  /** Taux de consommation 24 mois, en %. null = non déclaré (≠ zéro). */
  consumptionRate24m: number | null;
  alerts: FundingAlert[];
  computedAt: string;
}
