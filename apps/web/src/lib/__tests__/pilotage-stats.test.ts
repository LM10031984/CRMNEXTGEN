/**
 * Tests déterministes des helpers PURS de pilotage-stats (quick 260620-d42 Plan 01 Task 2).
 *
 * ZÉRO appel DB/LLM : uniquement les fonctions pures (répartition saisonnière, KPIs,
 * agrégation mensuelle) sur des fixtures mémoire. Les fetch scopés tenantId (Task 3)
 * ne sont PAS testés ici (I/O Prisma).
 */
import { describe, it, expect } from 'vitest';

import {
  distributeAnnualObjective,
  computeSeasonalityWeights,
  pctAtteint,
  computeKpis,
  aggregateMonthly,
} from '../pilotage-stats';

describe('distributeAnnualObjective', () => {
  it('Test A — saisonnalité : le mois 0 reçoit ~2x la part standard, somme = annual', () => {
    const weights = [2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
    const res = distributeAnnualObjective(120000, weights);
    expect(res).toHaveLength(12);
    // total des poids = 13 ; part mois 0 = 2/13 ; part autres = 1/13.
    const standardPart = 120000 / 13;
    expect(res[0]).toBeCloseTo(standardPart * 2, -1); // ~2x la part standard
    expect(res[1]).toBeCloseTo(standardPart, -1);
    // mois 0 ≈ 2x mois 1.
    expect((res[0] ?? 0) / (res[1] ?? 1)).toBeCloseTo(2, 1);
    expect(res.reduce((a, b) => a + b, 0)).toBe(120000);
  });

  it('Test B — fallback /12 : poids tous nuls => ~10000/mois, somme = annual', () => {
    const res = distributeAnnualObjective(120000, Array(12).fill(0));
    expect(res).toHaveLength(12);
    res.forEach((m) => expect(m).toBe(10000));
    expect(res.reduce((a, b) => a + b, 0)).toBe(120000);
  });

  it('Test C — fallback /12 : weights de mauvaise longueur => réparti /12', () => {
    const resEmpty = distributeAnnualObjective(120000, []);
    expect(resEmpty.reduce((a, b) => a + b, 0)).toBe(120000);
    resEmpty.forEach((m) => expect(m).toBe(10000));

    const resWrong = distributeAnnualObjective(120000, [1, 2, 3]);
    expect(resWrong).toHaveLength(12);
    expect(resWrong.reduce((a, b) => a + b, 0)).toBe(120000);
    resWrong.forEach((m) => expect(m).toBe(10000));
  });

  it('Test D — somme exacte : résidu d arrondi ajouté au dernier mois', () => {
    // annual=100000, 12 poids égaux => 100000/12 = 8333.33 -> round 8333 ×12 = 99996, résidu 4 -> dernier mois.
    const res = distributeAnnualObjective(100000, Array(12).fill(1));
    expect(res.reduce((a, b) => a + b, 0)).toBe(100000); // somme EXACTE
    // les 11 premiers mois sont l arrondi standard, le dernier absorbe le résidu.
    for (let i = 0; i < 11; i++) expect(res[i]).toBe(8333);
    expect(res[11]).toBe(100000 - 8333 * 11);
  });
});

describe('computeSeasonalityWeights', () => {
  it('1 année [10,0,...] => weight[0]=1, reste 0', () => {
    const w = computeSeasonalityWeights([[10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]]);
    expect(w).toHaveLength(12);
    expect(w[0]).toBe(1);
    for (let i = 1; i < 12; i++) expect(w[i]).toBe(0);
  });

  it('agrège plusieurs années position par position puis normalise', () => {
    const w = computeSeasonalityWeights([
      [10, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ]);
    // total mois0=10, mois1=20, global=30 -> w0=1/3, w1=2/3.
    expect(w[0]).toBeCloseTo(1 / 3, 6);
    expect(w[1]).toBeCloseTo(2 / 3, 6);
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });

  it('0 année fournie => Array(12).fill(0)', () => {
    const w = computeSeasonalityWeights([]);
    expect(w).toEqual(Array(12).fill(0));
  });

  it('toutes valeurs nulles => Array(12).fill(0) (pas de div par zéro)', () => {
    const w = computeSeasonalityWeights([Array(12).fill(0), Array(12).fill(0)]);
    expect(w).toEqual(Array(12).fill(0));
  });
});

describe('pctAtteint', () => {
  it('(50000,100000) => 50', () => {
    expect(pctAtteint(50000, 100000)).toBe(50);
  });
  it('(0,0) => 0 (pas de div par zéro)', () => {
    expect(pctAtteint(0, 0)).toBe(0);
  });
  it('(120000,100000) => 120', () => {
    expect(pctAtteint(120000, 100000)).toBe(120);
  });
  it('arrondit (33333,100000) => 33', () => {
    expect(pctAtteint(33333, 100000)).toBe(33);
  });
});

describe('computeKpis', () => {
  it('calcule des valeurs exactes sur fixtures connues', () => {
    const realiseMonthly = [10000, 20000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // YTD = 30000
    const previsionnelMonthly = [0, 0, 5000, 5000, 0, 0, 0, 0, 0, 0, 0, 0]; // restant = 10000
    const kpis = computeKpis({
      realiseMonthly,
      previsionnelMonthly,
      objectifAnnuel: 100000,
      totalRealiseN1: 90000,
    });
    expect(kpis.caRealiseYTD).toBe(30000);
    expect(kpis.objectifAnnuel).toBe(100000);
    expect(kpis.previsionnelRestant).toBe(10000);
    expect(kpis.atterrissageEstime).toBe(40000); // 30000 + 10000
    expect(kpis.ecartVsObjectif).toBe(-60000); // 40000 - 100000
    expect(kpis.pctAtteint).toBe(30); // round(30000/100000*100)
    expect(kpis.totalRealiseN1).toBe(90000);
  });

  it('objectif 0 => pctAtteint 0 (pas de div par zéro)', () => {
    const kpis = computeKpis({
      realiseMonthly: [1000, ...Array(11).fill(0)],
      previsionnelMonthly: Array(12).fill(0),
      objectifAnnuel: 0,
      totalRealiseN1: 0,
    });
    expect(kpis.pctAtteint).toBe(0);
    expect(kpis.caRealiseYTD).toBe(1000);
    expect(kpis.ecartVsObjectif).toBe(1000); // 1000 - 0
  });
});

describe('aggregateMonthly', () => {
  it('bucketise par mois UTC, 2 rows en mars sommées', () => {
    const rows = [
      { startDate: new Date(Date.UTC(2026, 2, 5)), priceHT: 1000 }, // mars = idx 2
      { startDate: new Date(Date.UTC(2026, 2, 20)), priceHT: 500 }, // mars = idx 2
      { startDate: new Date(Date.UTC(2026, 0, 10)), priceHT: 300 }, // jan = idx 0
    ];
    const res = aggregateMonthly(rows);
    expect(res).toHaveLength(12);
    expect(res[2]).toBe(1500);
    expect(res[0]).toBe(300);
    expect(res[1]).toBe(0);
    expect(res.reduce((a, b) => a + b, 0)).toBe(1800);
  });

  it('liste vide => Array(12).fill(0)', () => {
    expect(aggregateMonthly([])).toEqual(Array(12).fill(0));
  });
});
