import { describe, expect, it } from 'vitest';
import { FUNDING_RULE_SEEDS } from '@qualiof/shared/diagnostic';
import type { ProposalPricing } from '@qualiof/shared';

import { computeFunding } from '@/lib/financement/funding-engine';
import type { FundingRuleValues } from '@/lib/financement/types';

import { seedPayers } from '../builder';
import {
  computePricing,
  describeCoverageState,
  isRoundingGap,
  ROUNDING_DISCOUNT_REASON,
} from '../pricing';

const RULES = Object.fromEntries(
  FUNDING_RULE_SEEDS.map((s) => [s.key, s.valueNumeric]),
) as FundingRuleValues;

/**
 * La fixture canonique de Laurent (spec §8.2), portée jusqu'au chiffrage.
 *
 * Quatre indépendants dont la production dépasse le seuil : 9 demi-journées de
 * groupe, 72 h conventionnées par personne, 12 096 € HT vendus, 12 000 € pris
 * en charge (plafond), 96 € de reste à charge. C'est le cas qui a servi à
 * trancher D-8 et D-11 ; il doit tomber juste de bout en bout.
 */
function canonique() {
  const participants = [
    { id: 'p1', displayName: 'Marie D.', statut: 'INDEPENDANT' as const, caN1: 120000 },
    { id: 'p2', displayName: 'Julien P.', statut: 'INDEPENDANT' as const, caN1: 95000 },
    { id: 'p3', displayName: 'Sophie L.', statut: 'INDEPENDANT' as const, caN1: 80000 },
    { id: 'p4', displayName: 'Karim B.', statut: 'INDEPENDANT' as const, caN1: 42000 },
  ];
  const funding = computeFunding({
    rules: RULES,
    participants: participants.map((p) => ({
      id: p.id,
      statut: p.statut,
      caN1: p.caN1,
      cfpEligibleBudget: null,
      opcoEligible: null,
      consumedThisYear: null,
      trainings24mFunded: null,
      includedInProposal: true,
    })),
    employeeCount: 0,
    companyOpcoConsumed: null,
    modality: 'PRESENTIEL',
    fundingType: 'COEUR_METIER',
    computedAt: '2026-09-04T08:00:00.000Z',
  });

  const payers = seedPayers({
    funding,
    rules: RULES,
    agencyName: 'Agence témoin',
    participants,
  });

  const pricing: ProposalPricing = {
    payers,
    discount: null,
    modality: 'PRESENTIEL',
    fundingType: 'COEUR_METIER',
  };
  return { funding, pricing };
}

describe('Chiffrage — la fixture canonique de bout en bout', () => {
  const { funding, pricing } = canonique();
  const s = computePricing({ pricing, rules: RULES });

  it('dimensionne 9 demi-journées de groupe', () => {
    expect(funding.halfDays).toBe(9);
  });

  it('porte 72 heures conventionnées par participant, et la même valeur partout', () => {
    expect(funding.conventionedHours).toBe(72);
    expect(s.conventionedHoursMax).toBe(72);
    for (const p of s.payers) {
      expect(p.conventionedHoursPerParticipant).toBe(72);
      for (const l of p.lines) expect(l.conventionedHours).toBe(72);
    }
  });

  it('vend 12 096 € HT et en fait prendre en charge 12 000 €', () => {
    expect(s.totalHt).toBe(12096);
    expect(s.totalCoverage).toBe(12000);
  });

  it('laisse les 96 € du plafond en reste à charge — jamais dans la prise en charge', () => {
    expect(s.remainderBeforeDiscount).toBe(96);
    expect(s.finalRemainder).toBe(96);
    // La prise en charge affichée ne dépasse JAMAIS le plafond annuel.
    for (const p of s.payers) {
      expect(p.coverage).toBeLessThanOrEqual(RULES.AGEFICE_ANNUAL_CAP);
    }
  });

  it('fait un payeur par indépendant — la subrogation se monte par personne', () => {
    expect(s.payers).toHaveLength(4);
    expect(s.payers.every((p) => p.payer.kind === 'INDEPENDANT')).toBe(true);
    // …mais un seul bandeau d'affichage, comme la maquette.
    expect(s.groups).toHaveLength(1);
    expect(s.groups[0]!.payerIds).toHaveLength(4);
  });

  it('reconnaît les 96 € comme un arrondi de parcours offrable en un clic (D-11)', () => {
    expect(isRoundingGap(s.remainderBeforeDiscount, RULES)).toBe(true);
    // Au-delà d'une demi-journée facturée, ce n'est plus un arrondi.
    expect(isRoundingGap(400, RULES)).toBe(false);
  });
});

describe('La remise — uniquement sur le reste à charge', () => {
  const { pricing } = canonique();

  it('ne descend jamais en dessous de zéro : elle est ramenée au reste à charge', () => {
    const s = computePricing({
      pricing: { ...pricing, discount: { amount: 5000, reason: 'Geste', kind: 'COMMERCIALE' } },
      rules: RULES,
    });
    expect(s.discount?.amount).toBe(96);
    expect(s.finalRemainder).toBe(0);
    expect(s.alerts.map((a) => a.code)).toContain('remise_plafonnee_au_reste_a_charge');
  });

  it('ne touche jamais le coût pédagogique — l’assiette des droits reste entière', () => {
    const s = computePricing({
      pricing: { ...pricing, discount: { amount: 96, reason: ROUNDING_DISCOUNT_REASON, kind: 'ARRONDI' } },
      rules: RULES,
    });
    expect(s.totalHt).toBe(12096);
    expect(s.totalCoverage).toBe(12000);
  });

  it('refuse une remise quand il n’y a pas de reste à charge', () => {
    const couvert: ProposalPricing = {
      ...pricing,
      payers: pricing.payers.map((p) => ({
        ...p,
        coverages: [{ funder: 'AGEFICE', label: 'Couverture totale', amount: 3024 }],
      })),
      discount: { amount: 100, reason: 'Geste', kind: 'COMMERCIALE' },
    };
    const s = computePricing({ pricing: couvert, rules: RULES });
    expect(s.discount).toBeNull();
    expect(s.alerts.find((a) => a.code === 'remise_sans_reste_a_charge')?.severity).toBe('blocking');
  });

  it('exige la validation d’un responsable au-delà du seuil, et bloque en dessous de rien', () => {
    // 96 € de reste à charge : 20 € font 20,8 % — au-delà des 15 % du seuil.
    const s = computePricing({
      pricing: { ...pricing, discount: { amount: 20, reason: 'Geste', kind: 'COMMERCIALE' } },
      rules: RULES,
    });
    expect(s.discountPercent).toBeGreaterThan(RULES.DISCOUNT_WARNING_PERCENT);
    expect(s.discountRequiresApproval).toBe(true);
    expect(s.alerts.find((a) => a.code === 'remise_validation_requise')?.severity).toBe('blocking');

    const petite = computePricing({
      pricing: { ...pricing, discount: { amount: 10, reason: 'Geste', kind: 'COMMERCIALE' } },
      rules: RULES,
    });
    expect(petite.discountRequiresApproval).toBe(false);
  });
});

describe('« OFFERT » n’est pas « pris en charge »', () => {
  it('distingue les quatre états de couverture', () => {
    expect(describeCoverageState({ totalHt: 1000, coverage: 1000, discount: 0 })).toBe(
      'fully_covered_by_funding',
    );
    expect(describeCoverageState({ totalHt: 1000, coverage: 900, discount: 100 })).toBe(
      'offered_via_discount',
    );
    expect(describeCoverageState({ totalHt: 1000, coverage: 900, discount: 0 })).toBe(
      'partially_covered',
    );
    expect(describeCoverageState({ totalHt: 1000, coverage: 0, discount: 0 })).toBe('not_covered');
  });

  it('ne bascule pas en « pris en charge » parce qu’une remise a comblé le trou', () => {
    const { pricing } = canonique();
    const s = computePricing({
      pricing: { ...pricing, discount: { amount: 96, reason: 'Arrondi', kind: 'ARRONDI' } },
      rules: RULES,
    });
    expect(s.finalRemainder).toBe(0);
    expect(s.coverageState).toBe('offered_via_discount');
    expect(s.coverageState).not.toBe('fully_covered_by_funding');
  });
});

describe('Garde-fous de calcul', () => {
  it('ramène au prix une prise en charge annoncée au-dessus du montant vendu', () => {
    const pricing: ProposalPricing = {
      payers: [
        {
          id: 'p',
          kind: 'ENTREPRISE',
          name: 'Agence',
          siret: null,
          email: null,
          address: null,
          groupLabel: 'Agence',
          groupNote: '',
          participantIds: [],
          participantCount: 1,
          lines: [{ id: 'l1', description: 'Parcours', halfDays: 1, unitPriceHt: 336 }],
          coverages: [{ funder: 'OPCO_EP', label: 'Enveloppe', amount: 2500 }],
        },
      ],
      discount: null,
      modality: 'PRESENTIEL',
      fundingType: 'COEUR_METIER',
    };
    const s = computePricing({ pricing, rules: RULES });
    expect(s.totalCoverage).toBe(336);
    expect(s.finalRemainder).toBe(0);
    expect(s.alerts.map((a) => a.code)).toContain('prise_en_charge_superieure_au_prix');
  });

  it('est déterministe', () => {
    const { pricing } = canonique();
    expect(computePricing({ pricing, rules: RULES })).toEqual(
      computePricing({ pricing, rules: RULES }),
    );
  });
});
