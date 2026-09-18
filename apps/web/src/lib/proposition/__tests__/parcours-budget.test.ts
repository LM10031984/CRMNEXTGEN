import { describe, expect, it } from 'vitest';
import { FUNDING_RULE_SEEDS } from '@qualiof/shared/diagnostic';
import { computeFunding } from '@/lib/financement/funding-engine';
import type { FundingRuleValues, FundingParticipantInput } from '@/lib/financement/types';
import { seedPayers, seedPricing } from '../builder';
import { computePricing } from '../pricing';
import { pathHalfDayLimit } from '../path-recommendations';

const rules = Object.fromEntries(
  FUNDING_RULE_SEEDS.map((s) => [s.key, s.valueNumeric]),
) as FundingRuleValues;
const participants: FundingParticipantInput[] = [
  {
    id: 'i1',
    statut: 'INDEPENDANT',
    caN1: 50000,
    cfpEligibleBudget: 3000,
    opcoEligible: null,
    consumedThisYear: 0,
    trainings24mFunded: null,
    includedInProposal: true,
  },
  {
    id: 'i2',
    statut: 'INDEPENDANT',
    caN1: 50000,
    cfpEligibleBudget: 3000,
    opcoEligible: null,
    consumedThisYear: 0,
    trainings24mFunded: null,
    includedInProposal: true,
  },
  {
    id: 's1',
    statut: 'SALARIE',
    caN1: null,
    cfpEligibleBudget: null,
    opcoEligible: true,
    consumedThisYear: null,
    trainings24mFunded: null,
    includedInProposal: true,
  },
];
function budget(
  halfDaysOverride = 1,
  people = participants,
  fundingType: 'COEUR_METIER' | 'REGLEMENTAIRE' = 'COEUR_METIER',
) {
  return computeFunding({
    rules,
    participants: people,
    employeeCount: 1,
    companyOpcoConsumed: 0,
    modality: 'PRESENTIEL',
    fundingType,
    halfDaysOverride,
  });
}
function price(sold: number, people = participants) {
  return computePricing({
    rules,
    pricing: seedPricing({
      funding: budget(11, people),
      rules,
      participants: people.map((p) => ({ ...p, displayName: p.id })),
      agencyName: 'Test',
      halfDaysSold: sold,
    }),
  });
}

describe('tarif par financeur — heures conventionnées confirmées inchangées', () => {
  it('vend la demi-journée OPCO à 240 €, conserve 336 € pour l’AGEFICE et 8 h conventionnées', () => {
    const funding = budget();
    expect(funding.conventionedHours).toBe(8);
    expect(funding.onsiteHours).toBe(4);
    expect(funding.participants.map((p) => p.price)).toEqual([336, 336, 240]);
    expect(funding.totalRemainder).toBe(0);
    const s = price(1);
    expect(s.payers.map((p) => p.lines[0]!.unitPriceHt)).toEqual([336, 336, 240]);
    expect(s.totalHt).toBe(912);
    expect(s.totalCoverage).toBe(912);
    expect(s.conventionedHoursMax).toBe(8);
  });
  it('ne vend aucune demi-journée quand le parcours est vide', () => {
    expect(price(0).totalHt).toBe(0);
    expect(price(0).halfDaysMax).toBe(0);
  });
  it('recalcule la couverture sur les seules demi-journées vendues', () => {
    const s = price(3);
    expect(s.totalHt).toBe(2736);
    expect(s.totalCoverage).toBe(2736);
    expect(s.alerts.some((a) => a.code === 'prise_en_charge_superieure_au_prix')).toBe(false);
    expect(s.payers[2]!.coverages[0]!.amount).toBe(720);
  });
  it('conserve les plafonds séparés sans transférer le budget OPCO à un indépendant', () => {
    const s = price(10);
    expect(s.totalHt).toBe(9120);
    expect(s.totalCoverage).toBe(8400);
    expect(s.finalRemainder).toBe(720);
    expect(s.payers[0]!.coverage).toBe(3000);
    expect(s.payers[2]!.coverage).toBe(2400);
  });
  it('conserve un seul plafond OPCO entreprise pour plusieurs salariés', () => {
    const p = [participants[2]!, { ...participants[2]!, id: 's2' }];
    const s = price(6, p);
    expect(s.totalHt).toBe(2880);
    expect(s.totalCoverage).toBe(2500);
    expect(s.finalRemainder).toBe(380);
  });
  it('dimensionne le complément pour chaque enveloppe et annonce le vrai reste à charge', () => {
    const funding = budget(9);
    expect(pathHalfDayLimit(funding, rules, 'COMPLET_IA')).toBe(11);
    expect(price(11).totalCoverage).toBe(8500);
    expect(price(11).totalHt).toBe(10032);
    expect(price(11).finalRemainder).toBe(1532);
  });
  it('ne réactive pas la couverture OPCO en distanciel et conserve le tarif applicable', () => {
    const funding = computeFunding({
      rules,
      participants: [participants[2]!],
      employeeCount: 1,
      companyOpcoConsumed: 0,
      modality: 'DISTANCIEL',
      fundingType: 'COEUR_METIER',
      halfDaysOverride: 3,
    });
    const pricing = seedPricing({
      funding,
      rules,
      agencyName: 'Test',
      participants: [{ ...participants[2]!, displayName: 'Test' }],
      halfDaysSold: 2,
    });
    expect(pricing.modality).toBe('DISTANCIEL');
    expect(computePricing({ pricing, rules }).totalCoverage).toBe(0);
    expect(computePricing({ pricing, rules }).totalHt).toBe(480);
  });
  it('ne transfère pas les droits au salarié non éligible', () => {
    const people = [participants[2]!, { ...participants[2]!, id: 's2', opcoEligible: false }];
    const funding = budget(1, people);
    expect(funding.totalPrice).toBe(480);
    const s = price(1, people);
    expect(s.totalHt).toBe(480);
    expect(s.totalCoverage).toBe(240);
  });
  it('lit le taux réglementaire dans les règles plutôt que de figer 240', () => {
    const funding = budget(1, [participants[2]!], 'REGLEMENTAIRE');
    expect(funding.participants[0]!.price).toBe(320);
    const payers = seedPayers({
      funding,
      rules,
      participants: [{ ...participants[2]!, displayName: 'Test' }],
      agencyName: 'Test',
      halfDaysSold: 1,
    });
    expect(payers[0]!.lines[0]!.unitPriceHt).toBe(320);
  });
});
