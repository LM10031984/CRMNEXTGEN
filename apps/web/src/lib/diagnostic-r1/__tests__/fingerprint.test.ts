import { describe, expect, it } from 'vitest';

import { compareSourceFingerprint, computeSourceFingerprint } from '../fingerprint';

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

const BASE = {
  answers: [{ questionId: 'identity-sales-n1', value: 72, isSkipped: false }],
  participants: [
    {
      id: 'p1',
      displayName: 'Marie D.',
      statut: 'INDEPENDANT',
      caN1: 120_000,
      objectiveCa: null,
      strengths: null,
      includedInProposal: true,
    },
  ],
  rules: RULES,
  scoringVersion: 'bareme-v1-2026-09',
  referentialVersion: '2026-09',
};

describe('Les trois états — arbitrage du 02/09/2026', () => {
  const empreinte = computeSourceFingerprint(BASE);

  it("rend 'unknown' sans empreinte stockée, JAMAIS 'stale'", () => {
    // Le cœur de l'arbitrage : « je ne peux pas vérifier » n'est pas
    // « ce document est faux ». Confondre les deux fait crier au loup sur des
    // documents qui vont peut-être très bien.
    for (const absente of [null, undefined, '']) {
      expect(compareSourceFingerprint(absente, empreinte)).toBe('unknown');
    }
  });

  it("rend 'fresh' quand l'empreinte correspond", () => {
    expect(compareSourceFingerprint(empreinte, empreinte)).toBe('fresh');
  });

  it("rend 'stale' quand les données ont bougé", () => {
    const apres = computeSourceFingerprint({
      ...BASE,
      answers: [{ questionId: 'identity-sales-n1', value: 95, isSkipped: false }],
    });
    expect(compareSourceFingerprint(empreinte, apres)).toBe('stale');
  });
});

describe("Ce que l'empreinte couvre", () => {
  const empreinte = computeSourceFingerprint(BASE);

  it('change quand une réponse change', () => {
    expect(
      computeSourceFingerprint({
        ...BASE,
        answers: [{ questionId: 'identity-sales-n1', value: 95, isSkipped: false }],
      }),
    ).not.toBe(empreinte);
  });

  it('change quand une règle de financement est révisée, sans qu’aucune réponse ne bouge', () => {
    // C'est le cas piège : le plafond passe de 3 000 à 3 200, tous les montants
    // du rapport changent, et personne n'a touché au diagnostic.
    expect(
      computeSourceFingerprint({ ...BASE, rules: { ...RULES, AGEFICE_ANNUAL_CAP: 3200 } }),
    ).not.toBe(empreinte);
  });

  it('change quand le barème de scoring est bumpé', () => {
    expect(computeSourceFingerprint({ ...BASE, scoringVersion: 'bareme-v2-2027-01' })).not.toBe(
      empreinte,
    );
  });

  it('change quand une fiche équipe est retirée de la proposition', () => {
    expect(
      computeSourceFingerprint({
        ...BASE,
        participants: [{ ...BASE.participants[0]!, includedInProposal: false }],
      }),
    ).not.toBe(empreinte);
  });

  it("ne change pas quand l'ordre des réponses change — c'est le contenu qui compte", () => {
    const deux = {
      ...BASE,
      answers: [
        { questionId: 'identity-sales-n1', value: 72, isSkipped: false },
        { questionId: 'identity-revenue-n1', value: 720_000, isSkipped: false },
      ],
    };
    const inverse = { ...deux, answers: [...deux.answers].reverse() };
    expect(computeSourceFingerprint(deux)).toBe(computeSourceFingerprint(inverse));
  });

  it('distingue une réponse passée d’une réponse vide', () => {
    const passee = computeSourceFingerprint({
      ...BASE,
      answers: [{ questionId: 'identity-sales-n1', value: null, isSkipped: true }],
    });
    const vide = computeSourceFingerprint({
      ...BASE,
      answers: [{ questionId: 'identity-sales-n1', value: null, isSkipped: false }],
    });
    expect(passee).not.toBe(vide);
  });
});
