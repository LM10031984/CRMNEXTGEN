import { describe, expect, it } from 'vitest';
import { FUNDING_RULE_SEEDS } from '@qualiof/shared/diagnostic';
import type { ProposalPricing } from '@qualiof/shared';

import type { FundingRuleValues } from '@/lib/financement/types';

import { computePricing } from '../pricing';
import { MENTION_EXONERATION_TVA } from '@/lib/tva-exoneration';

import { buildQuoteDrafts, quotesMatchProposal } from '../quotes';

const RULES = Object.fromEntries(
  FUNDING_RULE_SEEDS.map((s) => [s.key, s.valueNumeric]),
) as FundingRuleValues;

/**
 * Le cas OPTIMO du 11/08/2026, réduit à son squelette : un groupe mixte, des
 * indépendants au dossier individuel AGEFICE et une société qui paye pour ses
 * salariées au titre de l'OPCO EP. C'est le montage qui a fait mouche en vrai,
 * et celui que la maquette systématise.
 */
function optimo(): ProposalPricing {
  const parcours = (halfDays: number) => [
    { id: 'l1', description: 'Parcours co-animé sur site', halfDays, unitPriceHt: 336 },
  ];
  return {
    payers: [
      ...[1, 2, 3, 4].map((n) => ({
        id: `inde-${n}`,
        kind: 'INDEPENDANT' as const,
        name: `Agent ${n}`,
        siret: null,
        email: null,
        address: null,
        groupLabel: 'Indépendants — dossiers individuels AGEFICE',
        groupNote: 'Subrogation, zéro avance',
        participantIds: [`p${n}`],
        participantCount: 1,
        lines: parcours(9),
        coverages: [{ funder: 'AGEFICE' as const, label: 'Plafond annuel', amount: 3000 }],
      })),
      {
        id: 'entreprise',
        kind: 'ENTREPRISE' as const,
        name: 'Agence du Baou SARL',
        siret: '12345678900012',
        email: 'contact@example.test',
        address: '1 rue du Baou\n06140 Vence',
        groupLabel: 'Agence du Baou SARL — salariées (dossier OPCO EP)',
        groupNote: '',
        participantIds: ['s1', 's2', 's3'],
        participantCount: 3,
        lines: parcours(6),
        coverages: [{ funder: 'OPCO_EP' as const, label: 'Enveloppe entreprise', amount: 2500 }],
      },
    ],
    discount: null,
    modality: 'PRESENTIEL',
    fundingType: 'COEUR_METIER',
  };
}

describe('Σ devis = Σ proposition, au centime', () => {
  const pricing = optimo();
  const s = computePricing({ pricing, rules: RULES });
  const drafts = buildQuoteDrafts({ synthesis: s, proposalReference: 'PROP-0001', onsiteHoursPerHalfDay: RULES.HALF_DAY_ONSITE_HOURS });

  it('reproduit exactement le coût pédagogique de la proposition', () => {
    expect(s.totalHt).toBe(4 * 9 * 336 + 3 * 6 * 336);
    expect(drafts.reduce((sum, d) => sum + d.amountHt, 0)).toBe(s.totalHt);
    expect(quotesMatchProposal(drafts, s)).toBe(true);
  });

  it('fait un devis par PAYEUR, pas un par bandeau d’affichage', () => {
    expect(drafts).toHaveLength(5);
    expect(s.groups).toHaveLength(2);
  });

  it('tient au centime sur un prix non rond', () => {
    const centimes: ProposalPricing = {
      ...pricing,
      payers: pricing.payers.map((p) => ({
        ...p,
        lines: p.lines.map((l) => ({ ...l, unitPriceHt: 333.33 })),
      })),
    };
    const sc = computePricing({ pricing: centimes, rules: RULES });
    const dc = buildQuoteDrafts({ synthesis: sc, proposalReference: 'PROP-0002', onsiteHoursPerHalfDay: RULES.HALF_DAY_ONSITE_HOURS });
    expect(quotesMatchProposal(dc, sc)).toBe(true);
  });

  it('porte les mêmes heures conventionnées que la proposition', () => {
    for (const d of drafts) {
      for (const l of d.lines) {
        expect(l.description).toMatch(/h conventionnées par participant/);
      }
    }
    // 9 demi-journées × 4 h × 2 formateurs = 72 h, la valeur de référence unique.
    expect(drafts[0]!.lines[0]!.description).toContain('72 h conventionnées');
    expect(drafts[4]!.lines[0]!.description).toContain('48 h conventionnées');
  });
});

describe('Ce que le devis dit — et ce qu’il ne retranche pas', () => {
  const pricing = optimo();

  it('laisse le coût pédagogique intact malgré la remise, et l’écrit dans les notes', () => {
    const remise: ProposalPricing = {
      ...pricing,
      discount: { amount: 500, reason: 'Offre de lancement', kind: 'COMMERCIALE' },
    };
    const s = computePricing({ pricing: remise, rules: RULES });
    const drafts = buildQuoteDrafts({ synthesis: s, proposalReference: 'PROP-0003', onsiteHoursPerHalfDay: RULES.HALF_DAY_ONSITE_HOURS });

    // Aucune ligne négative : le coût déclaré est l'assiette des droits.
    for (const d of drafts) {
      for (const l of d.lines) expect(l.lineTotalHt).toBeGreaterThan(0);
    }
    expect(drafts.reduce((sum, d) => sum + d.amountHt, 0)).toBe(s.totalHt);
    expect(drafts[0]!.notes).toContain('Offre de lancement');
    expect(drafts[0]!.notes).toContain('ne modifie ni le coût pédagogique');
  });

  it('porte l’exonération de TVA et la réserve d’acceptation des financeurs', () => {
    const s = computePricing({ pricing, rules: RULES });
    const drafts = buildQuoteDrafts({ synthesis: s, proposalReference: 'PROP-0004', onsiteHoursPerHalfDay: RULES.HALF_DAY_ONSITE_HOURS });
    expect(drafts[0]!.notes).toContain(MENTION_EXONERATION_TVA);
    expect(drafts[0]!.notes).toContain('Aucune facturation avant accord de prise en charge');
    for (const d of drafts) for (const l of d.lines) expect(l.vatRate).toBe(0);
  });

  it('n’annonce pas « pris en charge » quand le reste à charge est offert', () => {
    const offert: ProposalPricing = {
      ...pricing,
      discount: { amount: 999999, reason: 'Partenariat', kind: 'COMMERCIALE' },
    };
    const s = computePricing({ pricing: offert, rules: RULES });
    const drafts = buildQuoteDrafts({ synthesis: s, proposalReference: 'PROP-0005', onsiteHoursPerHalfDay: RULES.HALF_DAY_ONSITE_HOURS });
    expect(s.coverageState).toBe('offered_via_discount');
    expect(drafts[0]!.notes).toContain('Reste à charge offert');
    expect(drafts[0]!.notes).not.toContain('Intégralement pris en charge');
  });
});
