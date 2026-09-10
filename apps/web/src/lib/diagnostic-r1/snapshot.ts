/**
 * Recalcul du snapshot d'un diagnostic (`Diagnostic.computedSnapshot`).
 *
 * Pourquoi persister ce qu'on sait recalculer : la synthèse montrée en
 * rendez-vous doit être celle que le rapport d'audit reprendra ensuite. Sans
 * snapshot daté, une règle de financement révisée entre le R1 et le R2 ferait
 * silencieusement changer les chiffres déjà annoncés au dirigeant.
 *
 * Le snapshot porte donc `rulesVersion` : c'est ce qui permettra à
 * `compareSourceFingerprint()` (lot D/E) de détecter une proposition périmée.
 */

import { computeFunding } from '@/lib/financement/funding-engine';
import type { FundingRuleValues, FundingSynthesis } from '@/lib/financement/types';

import { computePipeline, type PipelineSynthesis } from './pipeline';

export interface SnapshotParticipant {
  id: string;
  statut: 'INDEPENDANT' | 'SALARIE' | 'DIRIGEANT';
  caN1: number | null;
  cfpEligibleBudget: number | null;
  opcoEligible: boolean | null;
  consumedThisYear: number | null;
  trainings24mFunded: number | null;
  includedInProposal: boolean;
}

export interface ComputedSnapshot {
  funding: FundingSynthesis;
  pipeline: PipelineSynthesis;
  computedAt: string;
  /** Empreinte des règles utilisées — détecte une révision entre R1 et R2. */
  rulesVersion: string;
}

/**
 * Empreinte stable des règles appliquées. Deux jeux de valeurs identiques
 * donnent la même chaîne ; un plafond révisé la change.
 */
export function fingerprintRules(rules: FundingRuleValues): string {
  return Object.keys(rules)
    .sort()
    .map((k) => `${k}=${rules[k as keyof FundingRuleValues]}`)
    .join('|');
}

export function computeSnapshot(args: {
  rules: FundingRuleValues;
  participants: SnapshotParticipant[];
  answers: Record<string, unknown>;
  employeeCount: number | null;
  companyOpcoConsumed?: number | null;
  computedAt?: string;
}): ComputedSnapshot {
  const computedAt = args.computedAt ?? new Date().toISOString();

  const funding = computeFunding({
    rules: args.rules,
    participants: args.participants,
    employeeCount: args.employeeCount,
    companyOpcoConsumed: args.companyOpcoConsumed ?? null,
    // En R1 on dimensionne toujours sur du présentiel cœur de métier : c'est ce
    // que Start Academy vend. Le distanciel et le réglementaire se choisissent
    // au moment de la proposition (lot E), pas pendant le diagnostic.
    modality: 'PRESENTIEL',
    fundingType: 'COEUR_METIER',
    computedAt,
  });

  const pipeline = computePipeline({ answers: args.answers });

  return { funding, pipeline, computedAt, rulesVersion: fingerprintRules(args.rules) };
}

/**
 * L'effectif salarié servant à choisir l'enveloppe OPCO EP.
 *
 * On préfère le déclaratif du chapitre 2 (`team-employees-count`) au décompte
 * des fiches saisies : en R1 on ne saisit souvent que les personnes à former,
 * alors que l'enveloppe se calcule sur TOUT l'effectif de l'entreprise.
 */
export function resolveEmployeeCount(
  answers: Record<string, unknown>,
  participants: SnapshotParticipant[],
): number | null {
  const declared = answers['team-employees-count'];
  if (typeof declared === 'number' && Number.isFinite(declared)) return declared;
  const parsed = Number(declared);
  if (Number.isFinite(parsed) && String(declared ?? '').trim() !== '') return parsed;
  const counted = participants.filter((p) => p.statut === 'SALARIE').length;
  return counted > 0 ? counted : null;
}
