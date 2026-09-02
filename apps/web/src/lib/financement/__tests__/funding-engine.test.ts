import { describe, expect, it } from 'vitest';

import { computeFunding } from '../funding-engine';
import type { FundingComputeInput, FundingParticipantInput } from '../types';

/**
 * Le moteur budget est la démonstration du R1 : c'est le moment où le dirigeant
 * voit, en direct, ce qu'il peut mobiliser. Il doit donc être juste ET
 * défendable — un montant annoncé au-dessus d'un plafond est exactement la
 * « mention trompeuse de financement » que le référentiel Qualiopi sanctionne.
 *
 * Les fixtures ci-dessous sont celles validées par Laurent (spec §8.2).
 */

const RULES = {
  AGEFICE_THRESHOLD_CA_N1: 7000,
  AGEFICE_ANNUAL_CAP: 3000,
  AGEFICE_ANNUAL_CAP_REDUCED: 600,
  AGEFICE_HOURLY_PRESENTIEL: 42,
  AGEFICE_HOURLY_DISTANCIEL: 35,
  AGEFICE_LEAD_DAYS_MIN: 15,
  AGEFICE_INDEMNITY_MIN: 700,
  AGEFICE_INDEMNITY_MAX: 800,
  OPCO_EP_ENVELOPE_LT_11: 2500,
  OPCO_EP_ENVELOPE_11_TO_50: 4500,
  OPCO_EP_RATE_REGLEMENTAIRE: 40,
  OPCO_EP_RATE_COEUR_METIER: 30,
  PRICE_PER_HOUR_PER_PARTICIPANT: 84,
  HALF_DAY_ONSITE_HOURS: 4,
  TRAINER_COUNT_DEFAULT: 2,
  CONSUMPTION_LEVER_PERCENT: 30,
  DISCOUNT_WARNING_PERCENT: 15,
  PROPOSAL_VALIDITY_DAYS: 30,
};

function indé(id: string, caN1: number | null, over: Partial<FundingParticipantInput> = {}) {
  return {
    id,
    statut: 'INDEPENDANT' as const,
    caN1,
    cfpEligibleBudget: null,
    opcoEligible: null,
    consumedThisYear: null,
    trainings24mFunded: null,
    includedInProposal: true,
    ...over,
  };
}

function salarié(id: string, over: Partial<FundingParticipantInput> = {}) {
  return {
    id,
    statut: 'SALARIE' as const,
    caN1: null,
    cfpEligibleBudget: null,
    opcoEligible: true,
    consumedThisYear: null,
    trainings24mFunded: null,
    includedInProposal: true,
    ...over,
  };
}

function input(over: Partial<FundingComputeInput> = {}): FundingComputeInput {
  return {
    rules: RULES,
    participants: [],
    employeeCount: 0,
    companyOpcoConsumed: null,
    modality: 'PRESENTIEL',
    fundingType: 'COEUR_METIER',
    computedAt: '2026-09-02T12:00:00.000Z',
    ...over,
  };
}

describe('Fixture canonique — 4 agents indépendants au-dessus du seuil', () => {
  const result = computeFunding(
    input({
      participants: [
        indé('p1', 120_000),
        indé('p2', 95_000),
        indé('p3', 80_000),
        indé('p4', 42_000),
      ],
    }),
  );

  it('dimensionne 9 demi-journées de groupe', () => {
    expect(result.halfDays).toBe(9);
  });

  it('cumule 36 demi-journées-participant', () => {
    expect(result.halfDays * result.participants.length).toBe(36);
  });

  it('porte 72 heures conventionnées — 36 h sur site × 2 formateurs', () => {
    expect(result.onsiteHours).toBe(36);
    expect(result.conventionedHours).toBe(72);
  });

  it('facture 12 096 € HT (36 demi-journées-participant × 336 €)', () => {
    expect(result.totalPrice).toBe(12_096);
  });

  it('annonce 12 000 € de prise en charge — plafonnée, jamais 12 096 €', () => {
    expect(result.totalCoverage).toBe(12_000);
    // 72 h × 42 € = 3 024 €/agent, mais le plafond annuel est de 3 000 €.
    expect(result.participants.every((p) => p.coverageUncapped === 3024)).toBe(true);
    expect(result.participants.every((p) => p.coverage === 3000)).toBe(true);
  });

  it("laisse 96 € de reste à charge — l'écart de plafond, visible et non dissimulé", () => {
    expect(result.totalRemainder).toBe(96);
    expect(result.totalPrice - result.totalCoverage).toBe(result.totalRemainder);
  });

  it('signale que le plafond mord, pour que le commercial puisse en parler', () => {
    expect(result.alerts.map((a) => a.code)).toContain('agefice_plafond_atteint');
  });

  it("marque les droits comme ESTIMÉS tant que la CFP n'est pas connue", () => {
    expect(result.participants.every((p) => p.budgetSource === 'estimation_ca_n1')).toBe(true);
    expect(result.alerts.map((a) => a.code)).toContain('agefice_estimation_non_acquise');
  });
});

describe("Seuil d'éligibilité AGEFICE", () => {
  it("un agent sous 7 000 € de production N-1 n'ouvre aucun droit estimé", () => {
    const r = computeFunding(input({ participants: [indé('p1', 5_000)] }));
    expect(r.participants[0]!.budget).toBe(0);
    expect(r.participants[0]!.budgetSource).toBe('aucun');
  });

  it('exactement 7 000 € ne suffit pas — le seuil est strict', () => {
    const r = computeFunding(input({ participants: [indé('p1', 7_000)] }));
    expect(r.participants[0]!.budget).toBe(0);
  });

  it("un CA N-1 inconnu ne vaut pas zéro : c'est une donnée manquante, et ça se dit", () => {
    const r = computeFunding(input({ participants: [indé('p1', null)] }));
    expect(r.participants[0]!.budget).toBe(0);
    expect(r.alerts.map((a) => a.code)).toContain('agefice_ca_n1_manquant');
  });

  it('la CFP connue au CRM fait foi et remplace le seuil déclaratif', () => {
    // Production N-1 confortable, mais la CFP réelle ouvre l'enveloppe réduite :
    // c'est la CFP qui gagne — sinon on promet 3 000 € qui n'existent pas.
    const r = computeFunding(
      input({ participants: [indé('p1', 120_000, { cfpEligibleBudget: 600 })] }),
    );
    expect(r.participants[0]!.budget).toBe(600);
    expect(r.participants[0]!.budgetSource).toBe('cfp_verifiee');
    expect(r.alerts.map((a) => a.code)).not.toContain('agefice_estimation_non_acquise');
  });

  it('une CFP à 0 ferme le droit, même avec une grosse production déclarée', () => {
    const r = computeFunding(
      input({ participants: [indé('p1', 200_000, { cfpEligibleBudget: 0 })] }),
    );
    expect(r.participants[0]!.budget).toBe(0);
    expect(r.participants[0]!.budgetSource).toBe('cfp_verifiee');
  });

  it("déduit ce qui a déjà été consommé sur l'année", () => {
    const r = computeFunding(
      input({ participants: [indé('p1', 120_000, { consumedThisYear: 1_200 })] }),
    );
    expect(r.participants[0]!.budget).toBe(1_800);
  });

  it('ne descend jamais sous zéro quand le consommé dépasse le plafond', () => {
    const r = computeFunding(
      input({ participants: [indé('p1', 120_000, { consumedThisYear: 5_000 })] }),
    );
    expect(r.participants[0]!.budget).toBe(0);
  });
});

describe("Enveloppe OPCO EP — c'est l'entreprise qui a des droits, pas le salarié", () => {
  it('moins de 11 salariés : 2 500 € pour toute l’entreprise', () => {
    const r = computeFunding(
      input({ participants: [salarié('s1'), salarié('s2')], employeeCount: 4 }),
    );
    expect(r.opcoEp.envelope).toBe(2_500);
  });

  it('de 11 à 50 salariés : 4 500 €', () => {
    const r = computeFunding(input({ participants: [salarié('s1')], employeeCount: 25 }));
    expect(r.opcoEp.envelope).toBe(4_500);
  });

  it('au-delà de 50 salariés : aucun montant inventé, une validation manuelle', () => {
    const r = computeFunding(input({ participants: [salarié('s1')], employeeCount: 80 }));
    expect(r.opcoEp.envelope).toBeNull();
    expect(r.opcoEp.manualValidationRequired).toBe(true);
    expect(r.opcoEp.coverage).toBe(0);
    expect(r.alerts.map((a) => a.code)).toContain('opco_ep_effectif_superieur_50');
  });

  it("déduit l'enveloppe déjà consommée par l'entreprise", () => {
    const r = computeFunding(
      input({ participants: [salarié('s1')], employeeCount: 4, companyOpcoConsumed: 1_000 }),
    );
    expect(r.opcoEp.budget).toBe(1_500);
  });

  it('applique 30 €/h sur du cœur de métier et 40 €/h sur du réglementaire', () => {
    const coeur = computeFunding(
      input({ participants: [salarié('s1')], employeeCount: 4, fundingType: 'COEUR_METIER' }),
    );
    const regl = computeFunding(
      input({ participants: [salarié('s1')], employeeCount: 4, fundingType: 'REGLEMENTAIRE' }),
    );
    expect(regl.participants[0]!.hourlyRate).toBe(40);
    expect(coeur.participants[0]!.hourlyRate).toBe(30);
  });

  it("en distanciel l'OPCO EP ne prend rien en charge, et le dit", () => {
    const r = computeFunding(
      input({ participants: [salarié('s1')], employeeCount: 4, modality: 'DISTANCIEL' }),
    );
    expect(r.opcoEp.coverage).toBe(0);
    expect(r.participants[0]!.coverage).toBe(0);
    expect(r.alerts.map((a) => a.code)).toContain('opco_ep_distanciel_non_pris_en_charge');
  });

  it("ne dépasse jamais l'enveloppe : le surplus part en reste à charge, sans arbitrer", () => {
    // 6 salariés sur un volume qui coûterait bien plus que 2 500 € : le moteur
    // plafonne et signale. Répartir, réduire ou assumer est une décision humaine.
    const r = computeFunding(
      input({
        participants: [1, 2, 3, 4, 5, 6].map((i) => salarié(`s${i}`)),
        employeeCount: 6,
        halfDaysOverride: 10,
      }),
    );
    expect(r.opcoEp.coverage).toBeLessThanOrEqual(2_500);
    expect(r.totalRemainder).toBeGreaterThan(0);
    expect(r.alerts.map((a) => a.code)).toContain('opco_ep_enveloppe_depassee');
  });
});

describe('Les deux régimes sont séparés en calcul et consolidés en affichage', () => {
  const r = computeFunding(
    input({
      participants: [indé('p1', 90_000), indé('p2', 85_000), salarié('s1'), salarié('s2')],
      employeeCount: 6,
    }),
  );

  it('range chaque participant dans un seul régime', () => {
    const regimes = Object.fromEntries(r.participants.map((p) => [p.id, p.regime]));
    expect(regimes).toEqual({ p1: 'AGEFICE', p2: 'AGEFICE', s1: 'OPCO_EP', s2: 'OPCO_EP' });
  });

  it('expose deux dossiers distincts', () => {
    expect(r.agefice.participantCount).toBe(2);
    expect(r.opcoEp.participantCount).toBe(2);
    expect(r.agefice.coverage + r.opcoEp.coverage).toBe(r.totalCoverage);
  });

  it('ne présente au dirigeant QU’UN reste à charge', () => {
    expect(r.totalRemainder).toBe(r.totalPrice - r.totalCoverage);
    expect(r.totalRemainder).toBeGreaterThanOrEqual(0);
  });

  it('rappelle que ce sont deux dossiers administratifs distincts', () => {
    expect(r.alerts.map((a) => a.code)).toContain('deux_dossiers_distincts');
  });
});

describe('Groupe multi-structures, type OPTIMO', () => {
  const r = computeFunding(
    input({
      participants: [
        indé('agent1', 110_000),
        indé('agent2', 88_000),
        indé('agent3', 61_000),
        // Dirigeant TNS : finançable, mais sa CFP n'est pas connue → sous réserve.
        { ...indé('dirigeant', 150_000), statut: 'DIRIGEANT' as const },
        salarié('assistante'),
        salarié('negociateur', { opcoEligible: false }),
      ],
      employeeCount: 8,
      companyOpcoConsumed: 500,
    }),
  );

  it('finance le dirigeant TNS sur le régime AGEFICE, sous réserve de sa CFP', () => {
    const dirigeant = r.participants.find((p) => p.id === 'dirigeant')!;
    expect(dirigeant.regime).toBe('AGEFICE');
    expect(r.alerts.map((a) => a.code)).toContain('agefice_dirigeant_sous_reserve_cfp');
  });

  it("écarte du financement un salarié déclaré non éligible, sans l'écarter de la formation", () => {
    const nego = r.participants.find((p) => p.id === 'negociateur')!;
    expect(nego.regime).toBe('AUCUN');
    expect(nego.coverage).toBe(0);
    expect(nego.price).toBeGreaterThan(0);
  });

  it("déduit le consommé de l'enveloppe entreprise", () => {
    expect(r.opcoEp.budget).toBe(2_000);
  });

  it('ne fait jamais payer deux fois : Σ prix = Σ prise en charge + Σ reste à charge', () => {
    const sommePrix = r.participants.reduce((s, p) => s + p.price, 0);
    const sommeCouv = r.participants.reduce((s, p) => s + p.coverage, 0);
    const sommeRac = r.participants.reduce((s, p) => s + p.remainder, 0);
    expect(sommePrix).toBe(r.totalPrice);
    expect(sommeCouv).toBe(r.totalCoverage);
    expect(sommeRac).toBe(r.totalRemainder);
    expect(sommePrix).toBe(sommeCouv + sommeRac);
  });
});

describe('Participants écartés de la proposition', () => {
  it("ne compte ni le prix ni les droits d'un participant décoché", () => {
    const r = computeFunding(
      input({
        participants: [indé('p1', 90_000), indé('p2', 90_000, { includedInProposal: false })],
      }),
    );
    expect(r.participants).toHaveLength(1);
    expect(r.participants[0]!.id).toBe('p1');
  });
});

describe('Taux de consommation des droits sur 24 mois', () => {
  it('signale des droits sous-utilisés en dessous de 30 %', () => {
    const r = computeFunding(
      input({
        participants: [
          indé('p1', 90_000, { trainings24mFunded: 400 }),
          indé('p2', 90_000, { trainings24mFunded: 0 }),
        ],
      }),
    );
    // 400 € consommés sur 2 × 2 × 3 000 = 12 000 € théoriquement mobilisables.
    expect(r.consumptionRate24m).toBeCloseTo(3.33, 1);
    expect(r.alerts.map((a) => a.code)).toContain('droits_sous_utilises');
  });

  it('reste muet quand rien n’a été déclaré — une absence n’est pas un zéro', () => {
    const r = computeFunding(input({ participants: [indé('p1', 90_000)] }));
    expect(r.consumptionRate24m).toBeNull();
    expect(r.alerts.map((a) => a.code)).not.toContain('droits_sous_utilises');
  });
});

describe('Garde-fous structurels', () => {
  it('ne renvoie jamais une prise en charge supérieure au prix de vente', () => {
    const r = computeFunding(input({ participants: [indé('p1', 90_000)], halfDaysOverride: 1 }));
    expect(r.totalCoverage).toBeLessThanOrEqual(r.totalPrice);
    expect(r.totalRemainder).toBeGreaterThanOrEqual(0);
  });

  it('ne renvoie jamais une prise en charge supérieure au plafond du régime', () => {
    const r = computeFunding(input({ participants: [indé('p1', 90_000)], halfDaysOverride: 50 }));
    expect(r.participants[0]!.coverage).toBeLessThanOrEqual(3_000);
  });

  it('tient sans participant : zéro partout, aucune exception', () => {
    const r = computeFunding(input({ participants: [] }));
    expect(r.halfDays).toBe(0);
    expect(r.totalPrice).toBe(0);
    expect(r.totalCoverage).toBe(0);
    expect(r.totalRemainder).toBe(0);
  });

  it('respecte le volume imposé par le commercial — le moteur propose, il n’impose pas', () => {
    const r = computeFunding(input({ participants: [indé('p1', 90_000)], halfDaysOverride: 4 }));
    expect(r.halfDays).toBe(4);
    expect(r.onsiteHours).toBe(16);
    expect(r.conventionedHours).toBe(32);
  });

  it('est déterministe : deux appels identiques donnent le même résultat', () => {
    const arg = input({ participants: [indé('p1', 90_000), salarié('s1')], employeeCount: 5 });
    expect(computeFunding(arg)).toEqual(computeFunding(arg));
  });

  it("est rapide — la synthèse s'affiche en rendez-vous, pas après un café", () => {
    const participants = Array.from({ length: 30 }, (_, i) => indé(`p${i}`, 50_000 + i));
    const t0 = performance.now();
    for (let i = 0; i < 200; i += 1) computeFunding(input({ participants }));
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
