import { describe, expect, it } from 'vitest';
import { FUNDING_RULE_SEEDS } from '@qualiof/shared/diagnostic';
import type { ProposalContent, ProposalModule, ProposalPricing } from '@qualiof/shared';

import type { FingerprintInput } from '@/lib/diagnostic-r1/fingerprint';
import type { FundingRuleValues } from '@/lib/financement/types';

import {
  compareSourceFingerprint,
  computeProposalFingerprint,
  moduleMaterialOf,
} from '../fingerprint';

/**
 * Un module retenu dans un axe — ce que la proposition PERSISTE de lui.
 *
 * Volontairement distinct de sa matière LIVE (voir `LIVE` plus bas) : c'est tout
 * l'enjeu du lot 1 bis. Le document affiche le déroulé relu en direct au
 * catalogue, pas celui recopié ici.
 */
function moduleAxe(moduleId: string, title: string): ProposalModule {
  return {
    moduleId,
    title,
    sourceCode: 'BIB-D017',
    sourceTitle: 'Catalogue diagnostic',
    needLabel: 'Rentrer des mandats en exclusivité',
    durationMin: 90,
    quotes: [],
    signal: null,
    confidence: 'faible',
  };
}

/** La matière LIVE des modules, telle que `buildWorkspace` la relit à chaque rendu. */
const LIVE = [
  { moduleId: 'm-a', title: 'Convaincre le vendeur', durationMin: 120, contentMd: '- Étape A' },
  { moduleId: 'm-b', title: 'Gérer les objections', durationMin: 150, contentMd: '- Étape B' },
];

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
      modules: [moduleAxe('m-a', 'Convaincre le vendeur'), moduleAxe('m-b', 'Gérer les objections')],
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
  moduleMaterial: moduleMaterialOf(LIVE),
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

// ─────────────────────────────────────────────────────────────────────────────
// La matière RENDUE des modules entre dans l'empreinte (lot 1 bis, 11/09/2026)
// ─────────────────────────────────────────────────────────────────────────────
//
// LE TROU que ces tests ferment, et ce n'est pas une hypothèse : le TEXTE du
// déroulé est relu EN DIRECT à chaque rendu (`buildWorkspace` → `moduleContent`),
// alors que l'empreinte ne couvrait que le diagnostic, les prix et les axes
// (`id | productId | title | halfDays`). Un import pouvait donc changer ce que
// l'écran affiche sans lever le bandeau « Régénérer » — et le lot 1 vient de
// changer `contentMd` sur 52 modules.
//
// ⚠ Ligne rouge : l'empreinte PRÉVIENT, elle ne régénère JAMAIS rien.

describe('la matière rendue des modules entre dans l’empreinte', () => {
  const empreinte = computeProposalFingerprint(BASE);

  it('est stable : deux calculs identiques rendent la même empreinte', () => {
    expect(computeProposalFingerprint(BASE)).toBe(empreinte);
    expect(compareSourceFingerprint(empreinte, computeProposalFingerprint(BASE))).toBe('fresh');
  });

  it('périme quand le contentMd d’un module change — à axes, prix et durées constants', () => {
    const modifie = {
      ...BASE,
      moduleMaterial: moduleMaterialOf([
        LIVE[0]!,
        { ...LIVE[1]!, contentMd: '- Étape B, réécrite au catalogue' },
      ]),
    };
    expect(compareSourceFingerprint(empreinte, computeProposalFingerprint(modifie))).toBe('stale');
  });

  it('périme quand un contentMd est vidé', () => {
    const modifie = {
      ...BASE,
      moduleMaterial: moduleMaterialOf([LIVE[0]!, { ...LIVE[1]!, contentMd: null }]),
    };
    expect(compareSourceFingerprint(empreinte, computeProposalFingerprint(modifie))).toBe('stale');
  });

  it('périme quand le TITRE d’un module change en base', () => {
    const modifie = {
      ...BASE,
      moduleMaterial: moduleMaterialOf([
        LIVE[0]!,
        { ...LIVE[1]!, title: 'Gérer les objections et trouver des compromis' },
      ]),
    };
    expect(compareSourceFingerprint(empreinte, computeProposalFingerprint(modifie))).toBe('stale');
  });

  it('périme quand la DURÉE d’un module change en base', () => {
    const modifie = {
      ...BASE,
      moduleMaterial: moduleMaterialOf([LIVE[0]!, { ...LIVE[1]!, durationMin: 120 }]),
    };
    expect(compareSourceFingerprint(empreinte, computeProposalFingerprint(modifie))).toBe('stale');
  });

  it('périme quand un module a DISPARU de la bibliothèque — c’est déjà une dérive', () => {
    const modifie = { ...BASE, moduleMaterial: moduleMaterialOf([LIVE[0]!]) };
    expect(compareSourceFingerprint(empreinte, computeProposalFingerprint(modifie))).toBe('stale');
  });

  it('l’ORDRE des modules dans un axe ne compte pas — la composition est la même', () => {
    const modifie = {
      ...BASE,
      content: {
        ...CONTENT,
        axes: [
          {
            ...CONTENT.axes[0]!,
            modules: [
              moduleAxe('m-b', 'Gérer les objections'),
              moduleAxe('m-a', 'Convaincre le vendeur'),
            ],
          },
        ],
      },
    };
    expect(computeProposalFingerprint(modifie)).toBe(empreinte);
  });

  it('mais DÉPLACER un module d’un axe à l’autre périme — c’est un autre document', () => {
    const axe2 = { ...CONTENT.axes[0]!, id: 'axe-2', label: 'Axe 2', modules: [] };
    const avant = {
      ...BASE,
      content: { ...CONTENT, axes: [CONTENT.axes[0]!, axe2] },
    };
    const apres = {
      ...BASE,
      content: {
        ...CONTENT,
        axes: [
          { ...CONTENT.axes[0]!, modules: [moduleAxe('m-a', 'Convaincre le vendeur')] },
          { ...axe2, modules: [moduleAxe('m-b', 'Gérer les objections')] },
        ],
      },
    };
    expect(
      compareSourceFingerprint(
        computeProposalFingerprint(avant),
        computeProposalFingerprint(apres),
      ),
    ).toBe('stale');
  });

  it('un module de la bibliothèque qu’aucun axe ne retient n’entre PAS dans l’empreinte', () => {
    // L'empreinte couvre ce que le DOCUMENT affiche, pas le catalogue entier :
    // sinon le moindre import lèverait le bandeau sur toutes les propositions.
    const modifie = {
      ...BASE,
      moduleMaterial: moduleMaterialOf([
        ...LIVE,
        { moduleId: 'm-z', title: 'Module hors parcours', durationMin: 60, contentMd: '- Rien' },
      ]),
    };
    expect(computeProposalFingerprint(modifie)).toBe(empreinte);
  });
});
