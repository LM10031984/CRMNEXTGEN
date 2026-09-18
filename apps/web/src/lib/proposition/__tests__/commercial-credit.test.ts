import { describe, expect, it } from 'vitest';
import { FUNDING_RULE_SEEDS } from '@qualiof/shared/diagnostic';
import type { FundingRuleValues } from '@/lib/financement/types';
import { computePricing } from '../pricing';
import { buildQuoteDrafts } from '../quotes';
import { commercialCreditPlan } from '../commercial-credit';
const rules = Object.fromEntries(FUNDING_RULE_SEEDS.map((s) => [s.key, s.valueNumeric])) as FundingRuleValues;
function synthesis(amount: number, remainders = [696, 696, 140]) {
  return computePricing({ rules, pricing: { modality: 'PRESENTIEL', fundingType: 'COEUR_METIER',
    discount: { amount, reason: 'Complément métier IA offert par avoir', kind: 'COMMERCIALE' },
    payers: remainders.map((r, i) => ({ id: `p${i}`, name: `Payeur ${i}`, kind: 'INDEPENDANT', groupLabel: 'Test', groupNote: '',
      siret: null, address: null, email: null, participantIds: [`p${i}`], participantCount: 1,
      lines: [{ id: 'l', description: 'Parcours', halfDays: 1, unitPriceHt: 4000 }],
      coverages: [{ funder: 'AGEFICE', label: 'Droits', amount: 4000 - r }],
    })) } });
}
describe('geste commercial matérialisé par avoir par payeur', () => {
  it('prépare exactement le reste à charge offert sans retrancher les lignes de vente', () => {
    const s = synthesis(1532);
    expect(commercialCreditPlan(s).map((p) => p.amountHt)).toEqual([696, 696, 140]);
    const drafts = buildQuoteDrafts({ synthesis: s, proposalReference: 'PROP-TEST', onsiteHoursPerHalfDay: 4 });
    expect(drafts.reduce((n, d) => n + d.amountHt, 0)).toBe(s.totalHt);
    expect(drafts[0]!.notes).toContain('Avoir commercial à émettre');
    expect(drafts[0]!.notes).toContain('696');
    expect(drafts[0]!.notes).not.toContain('1 532');
  });
  it('répartit une remise partielle au prorata avec une somme exacte au centime', () => {
    const plan = commercialCreditPlan(synthesis(0.01, [1, 1, 1]));
    expect(plan.map((p) => p.amountHt)).toEqual([0.01, 0, 0]);
    expect(commercialCreditPlan(synthesis(10, [10, 0, 30])).map((p) => p.amountHt)).toEqual([2.5, 0, 7.5]);
  });
  it('ne prépare jamais d’avoir au-delà du reste à charge de son payeur', () => {
    const plan = commercialCreditPlan(synthesis(999999, [20.01, 0, 0.02]));
    expect(plan.map((p) => p.amountHt)).toEqual([20.01, 0, 0.02]);
  });
  it('ne prépare aucun montant sans geste commercial', () => {
    const s = synthesis(0); s.discount = null;
    expect(commercialCreditPlan(s).every((p) => p.amountHt === 0)).toBe(true);
  });
});
