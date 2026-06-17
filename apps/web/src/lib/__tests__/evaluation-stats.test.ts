import { describe, it, expect } from 'vitest';
import {
  computeQcmStats,
  computeSatisfactionStats,
  extractQcmScore,
  extractRecommandeOui,
  extractNoteGlobale,
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

describe('computeSatisfactionStats', () => {
  it('retourne null sans données', () => {
    expect(computeSatisfactionStats([], [])).toBeNull();
  });

  it('taux de recommandation = % de Oui + note globale moyenne', () => {
    const r = computeSatisfactionStats([true, true, true, false], [90, 80, 100, 70])!;
    expect(r.tauxRecommandation).toBe(75);
    expect(r.noteGlobale).toBe(85); // moyenne 90,80,100,70 = 85
    expect(r.nbReponses).toBe(4);
  });

  it('note globale tolère l\'absence (recommandation seule)', () => {
    const r = computeSatisfactionStats([true, true], [])!;
    expect(r.tauxRecommandation).toBe(100);
    expect(r.noteGlobale).toBe(0);
    expect(r.nbReponses).toBe(2);
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

  it('extractNoteGlobale renvoie null si ratings absents', () => {
    expect(extractNoteGlobale({})).toBeNull();
    expect(extractNoteGlobale(null)).toBeNull();
    expect(extractNoteGlobale({ recommandation: 'Oui' })).toBeNull(); // pas de blocs ratings
  });
});
