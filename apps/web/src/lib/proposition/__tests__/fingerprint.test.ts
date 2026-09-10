import { describe, expect, it } from 'vitest';
import { FUNDING_RULE_SEEDS } from '@qualiof/shared/diagnostic';
import type { ProposalContent, ProposalPricing } from '@qualiof/shared';

import type { FingerprintInput } from '@/lib/diagnostic-r1/fingerprint';
import type { FundingRuleValues } from '@/lib/financement/types';

import { compareSourceFingerprint, computeProposalFingerprint } from '../fingerprint';

const RULES = Object.fromEntries(
  FUNDING_RULE_SEEDS.map((s) => [s.key, s.valueNumeric]),
) as FundingRuleValues;

const DIAGNOSTIC: FingerprintInput = {
  answers: [{ questionId: 'mandates-exclusivity-percent', value: 20, isSkipped: false }],
  participants: [
    {
      id: 'p1',
      displayName: 'Marie D.',
      statut: 'INDEPENDANT',
      caN1: 120000,
      objectiveCa: null,
      strengths: null,
      includedInProposal: true,
    },
  ],
  rules: RULES,
  scoringVersion: 'bareme-v1-2026-09',
  referentialVersion: '2026-09',
};

const PRICING: ProposalPricing = {
  payers: [
    {
      id: 'inde-1',
      kind: 'INDEPENDANT',
      name: 'Marie D.',
      siret: null,
      email: null,
      address: null,
      groupLabel: 'Indépendants',
      groupNote: '',
      participantIds: ['p1'],
      participantCount: 1,
      lines: [{ id: 'l1', description: 'Parcours', halfDays: 9, unitPriceHt: 336 }],
      coverages: [{ funder: 'AGEFICE', label: 'Plafond', amount: 3000 }],
    },
  ],
  discount: null,
  modality: 'PRESENTIEL',
  fundingType: 'COEUR_METIER',
};

const CONTENT: ProposalContent = {
  subtitle: '',
  recipientLabel: '',
  contactLabel: '',
  heard: [],
  heardIntro: '',
  axes: [
    {
      id: 'axe-1',
      label: 'Axe 1',
      title: 'Vente',
      productId: null,
      productCode: 'PROD-055',
      description: '',
      why: 'Exclusivité faible',
      halfDays: 9,
      periodLabel: '',
      matchSource: 'lexique',
    },
  ],
  axesIntro: '',
  planning: [],
  piecesDeadlineNote: '',
  keyPoints: [],
  nextSteps: [],
  legalMention: 'Montants estimatifs.',
};

const BASE = {
  diagnostic: DIAGNOSTIC,
  pricing: PRICING,
  content: CONTENT,
  validUntil: new Date('2026-10-04T00:00:00.000Z'),
};

describe('Anti-péremption de la proposition (§9.3)', () => {
  const empreinte = computeProposalFingerprint(BASE);

  it('est stable : le même contenu rend la même empreinte', () => {
    expect(computeProposalFingerprint(BASE)).toBe(empreinte);
    expect(compareSourceFingerprint(empreinte, computeProposalFingerprint(BASE))).toBe('fresh');
  });

  it('périme quand une réponse du diagnostic change', () => {
    const modifie = {
      ...BASE,
      diagnostic: {
        ...DIAGNOSTIC,
        answers: [{ questionId: 'mandates-exclusivity-percent', value: 45, isSkipped: false }],
      },
    };
    expect(compareSourceFingerprint(empreinte, computeProposalFingerprint(modifie))).toBe('stale');
  });

  it('périme quand une règle de financement est révisée — sans qu’aucune réponse n’ait bougé', () => {
    const modifie = {
      ...BASE,
      diagnostic: {
        ...DIAGNOSTIC,
        rules: { ...RULES, AGEFICE_ANNUAL_CAP: 3500 },
      },
    };
    expect(compareSourceFingerprint(empreinte, computeProposalFingerprint(modifie))).toBe('stale');
  });

  it('périme quand une ligne de prix change', () => {
    const modifie = {
      ...BASE,
      pricing: {
        ...PRICING,
        payers: [
          {
            ...PRICING.payers[0]!,
            lines: [{ id: 'l1', description: 'Parcours', halfDays: 9, unitPriceHt: 300 }],
          },
        ],
      },
    };
    expect(compareSourceFingerprint(empreinte, computeProposalFingerprint(modifie))).toBe('stale');
  });

  it('périme quand une remise est posée', () => {
    const modifie = {
      ...BASE,
      pricing: {
        ...PRICING,
        discount: { amount: 96, reason: 'Arrondi de parcours', kind: 'ARRONDI' as const },
      },
    };
    expect(compareSourceFingerprint(empreinte, computeProposalFingerprint(modifie))).toBe('stale');
  });

  it('périme quand un axe change — le programme promis fait partie du document', () => {
    const modifie = {
      ...BASE,
      content: {
        ...CONTENT,
        axes: [{ ...CONTENT.axes[0]!, halfDays: 6 }],
      },
    };
    expect(compareSourceFingerprint(empreinte, computeProposalFingerprint(modifie))).toBe('stale');
  });

  it('ne qualifie jamais de périmé ce qu’il ne peut pas vérifier', () => {
    expect(compareSourceFingerprint(null, empreinte)).toBe('unknown');
    expect(compareSourceFingerprint(undefined, empreinte)).toBe('unknown');
  });
});
