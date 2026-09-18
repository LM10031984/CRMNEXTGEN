import { seedContent, seedPricing, type ContentSeedInput, type PayerSeedInput } from './builder';
import { computePricing } from './pricing';
import type { PathMode } from './path-recommendations';

export interface PathPreview {
  mode: PathMode;
  halfDays: number;
  totalHt: number;
  coverage: number;
  remainingBudget: number;
  remainder: number;
  budgets: {
    label: string;
    available: number;
    used: number;
    remaining: number;
    remainder: number;
  }[];
  modules: { id: string; title: string; minutes: number; kind: string; rationale: string }[];
  uncoveredNeeds: string[];
}
const euros = (n: number) => Math.round(n * 100) / 100;

export function buildPathOptions(
  input: ContentSeedInput & Pick<PayerSeedInput, 'participants'>,
): PathPreview[] {
  return (['PRIORITAIRE', 'COMPLET_IA'] as const).map((mode) => {
    const { content, composition } = seedContent({ ...input, pathMode: mode });
    const pricing = seedPricing({
      ...input,
      funding: input.audit.funding,
      halfDaysSold: composition.totalHalfDays,
    });
    const synthesis = computePricing({ pricing, rules: input.rules });
    const funding = input.audit.funding;
    const budgets = synthesis.payers.map((p) => {
      const available =
        p.payer.kind === 'ENTREPRISE'
          ? funding.opcoEp.participantCount > 0 &&
            !funding.opcoEp.manualValidationRequired &&
            funding.modality !== 'DISTANCIEL'
            ? funding.opcoEp.budget
            : 0
          : funding.participants
              .filter((r) => p.payer.participantIds.includes(r.id))
              .reduce((sum, r) => sum + r.budget, 0);
      return {
        label: p.payer.kind === 'ENTREPRISE' ? 'OPCO EP — entreprise' : `AGEFICE — ${p.payer.name}`,
        available,
        used: p.coverage,
        remaining: euros(Math.max(0, available - p.coverage)),
        remainder: p.remainder,
      };
    });
    return {
      mode,
      halfDays: composition.totalHalfDays,
      totalHt: synthesis.totalHt,
      coverage: synthesis.totalCoverage,
      remainingBudget: euros(budgets.reduce((sum, b) => sum + b.remaining, 0)),
      remainder: synthesis.finalRemainder,
      budgets,
      modules: content.axes.flatMap((a) =>
        a.modules.map((m) => ({
          id: m.moduleId,
          title: m.title,
          minutes: m.durationMin,
          kind: m.selection?.kind ?? 'diagnostic',
          rationale: m.selection?.rationale ?? m.needLabel,
        })),
      ),
      uncoveredNeeds: content.uncoveredNeeds ?? [],
    };
  });
}
