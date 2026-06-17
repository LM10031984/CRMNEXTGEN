import { describe, it, expect } from 'vitest';
import {
  computeQcmStats,
  computeRecoStats,
  extractQcmScore,
  extractRecommandeOui,
  QCM_SUCCESS_THRESHOLD,
} from '../evaluation-stats';

describe('computeQcmStats', () => {
  it('retourne null sans données', () => {
    expect(computeQcmStats([])).toBeNull();
  });

  it('seuil = 70 %', () => {
    expect(QCM_SUCCESS_THRESHOLD).toBe(70);
  });

  it('taux de réussite = % de scores ≥ seuil', () => {
    // 75, 80, 90 réussis ; 60, 65 échoués → 3/5 = 60 %
    const s = computeQcmStats([75, 80, 90, 60, 65])!;
    expect(s.tauxReussite).toBe(60);
    expect(s.nbStagiaires).toBe(5);
  });

  it('score moyen arrondi', () => {
    expect(computeQcmStats([70, 80, 90])!.scoreMoyen).toBe(80);
    expect(computeQcmStats([75, 76])!.scoreMoyen).toBe(76); // 75.5 → 76
  });

  it('exactement au seuil (70) = réussi', () => {
    expect(computeQcmStats([70])!.tauxReussite).toBe(100);
    expect(computeQcmStats([69])!.tauxReussite).toBe(0);
  });
});

describe('computeRecoStats', () => {
  it('retourne null sans données', () => {
    expect(computeRecoStats([])).toBeNull();
  });

  it('taux de recommandation = % de Oui', () => {
    const r = computeRecoStats([true, true, true, false])!;
    expect(r.tauxRecommandation).toBe(75);
    expect(r.nbReponses).toBe(4);
  });
});

describe('extracteurs rawJson', () => {
  it('extractQcmScore lit score numérique', () => {
    expect(extractQcmScore({ score: 83, questions: [] })).toBe(83);
    expect(extractQcmScore({ questions: [] })).toBeNull();
    expect(extractQcmScore(null)).toBeNull();
    expect(extractQcmScore({ score: 'oops' })).toBeNull();
  });

  it('extractRecommandeOui insensible à la casse', () => {
    expect(extractRecommandeOui({ recommandation: 'Oui' })).toBe(true);
    expect(extractRecommandeOui({ recommandation: 'oui' })).toBe(true);
    expect(extractRecommandeOui({ recommandation: 'Non' })).toBe(false);
    expect(extractRecommandeOui({})).toBeNull();
    expect(extractRecommandeOui(null)).toBeNull();
  });
});
