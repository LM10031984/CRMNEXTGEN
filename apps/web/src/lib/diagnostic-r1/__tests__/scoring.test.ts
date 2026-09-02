import { describe, expect, it } from 'vitest';

import { computeRatios } from '../ratios';
import { computeScoring, SCORING_VERSION } from '../scoring';

/**
 * Un score se justifie ou n'existe pas. Ces tests protègent surtout une chose :
 * qu'une agence qui a répondu vite ne soit pas notée comme une agence qui va
 * mal. Confondre « je ne sais pas » et « zéro » rendrait tout l'audit faux.
 */

const AGENCE_SAINE = {
  'identity-transaction-ancien-percent': 85,
  'identity-sales-n1': 72,
  'identity-revenue-n1': 720_000,
  'team-total-count': 6,
  'team-employees-count': 2,
  'team-independents-count': 4,
  'prospecting-contacts-per-month': 100,
  'prospecting-who': 'tous',
  'prospecting-methods': ['pige', 'terrain', 'recommandation', 'reseaux_sociaux'],
  'prospecting-script': 'yes',
  'seller-meetings-per-month': 30,
  'seller-discovery-formalized': 'yes',
  'seller-written-valuation': 'yes',
  'mandates-per-month': 15,
  'mandates-exclusivity-percent': 45,
  'mandates-price-above-market': 'jamais',
  'skill-price-defense': 'yes',
  'commercial-followup-frequency': 'hebdomadaire',
  'commercial-requalification-process': 'yes',
  'buyers-financing-verified': 'yes',
  'buyers-discovery-formalized': 'yes',
  'visits-per-month': 60,
  'offers-per-month': 40,
  'compromis-per-month': 30,
  'actes-per-month': 28,
  'google-reviews-count': 40,
  'reviews-collection-process': 'yes',
  'db-crm-uptodate': 'oui',
  'db-exploitation': ['relance', 'nursing'],
  'tools-esignature': 'yes',
  'tool-chatgpt-setup': 'yes',
  'tool-prompts-standard': 'yes',
  'tool-anti-hallucination': 'yes',
  'tool-team-access': 'yes',
  'mgmt-team-meeting-frequency': 'hebdomadaire',
  'mgmt-coaching-individual': 'yes',
  'mgmt-indicators-followed': ['ca', 'mandats', 'visites'],
  'exec-manager-reporting': 'yes',
  'funding-rights-known': 'yes',
  'funding-trainings-24m': 'yes',
  'funding-past-refusals': 'no',
};

const AGENCE_EN_DIFFICULTE = {
  ...AGENCE_SAINE,
  'prospecting-who': 'personne',
  'prospecting-script': 'no',
  'seller-discovery-formalized': 'no',
  'mandates-exclusivity-percent': 8,
  'skill-price-defense': 'no',
  'mandates-price-above-market': 'toujours',
  'commercial-followup-frequency': 'jamais',
  'commercial-requalification-process': 'no',
  'buyers-financing-verified': 'no',
  'buyers-discovery-formalized': 'no',
  'offers-per-month': 6,
  'compromis-per-month': 2,
  'actes-per-month': 1,
  'tool-chatgpt-setup': 'no',
  'tool-prompts-standard': 'no',
  'tool-anti-hallucination': 'no',
  'tool-team-access': 'no',
  'mgmt-coaching-individual': 'no',
  'mgmt-indicators-followed': [],
};

function score(answers: Record<string, unknown>) {
  const { ratios } = computeRatios({ answers, participants: [] });
  return computeScoring({ answers, ratios });
}

describe('Le barème dans son ensemble', () => {
  it('porte une version, pour que deux audits restent comparables', () => {
    expect(score(AGENCE_SAINE).version).toBe(SCORING_VERSION);
    expect(SCORING_VERSION).toMatch(/^bareme-v\d+-\d{4}-\d{2}$/);
  });

  it('note les 11 chapitres', () => {
    expect(score(AGENCE_SAINE).chapters.map((c) => c.chapter)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
  });

  it('sépare nettement une agence qui tourne d’une agence en difficulté', () => {
    const saine = score(AGENCE_SAINE).global!;
    const difficile = score(AGENCE_EN_DIFFICULTE).global!;
    expect(saine).toBeGreaterThan(75);
    expect(difficile).toBeLessThan(45);
    expect(saine - difficile).toBeGreaterThan(30);
  });

  it('reste dans les bornes 0-100, chapitre par chapitre comme en global', () => {
    for (const answers of [AGENCE_SAINE, AGENCE_EN_DIFFICULTE]) {
      const s = score(answers);
      expect(s.global).toBeGreaterThanOrEqual(0);
      expect(s.global).toBeLessThanOrEqual(100);
      for (const c of s.chapters) {
        if (c.score === null) continue;
        expect(c.score, `chapitre ${c.chapter}`).toBeGreaterThanOrEqual(0);
        expect(c.score, `chapitre ${c.chapter}`).toBeLessThanOrEqual(100);
      }
    }
  });

  it('ne laisse jamais un dépassement de repère compenser un chapitre en ruine', () => {
    // Exclusivité à 90 % (le triple du repère) ne doit pas remonter le global
    // au-dessus de ce que valent les autres chapitres.
    const exceptionnel = score({ ...AGENCE_EN_DIFFICULTE, 'mandates-exclusivity-percent': 90 });
    expect(exceptionnel.chapters.find((c) => c.chapter === 5)!.score).toBeLessThanOrEqual(100);
    expect(exceptionnel.global!).toBeLessThan(60);
  });
});

describe("Ce qu'on ignore n'est pas noté", () => {
  it('rend un score null sur un chapitre dont aucune question n’a de réponse', () => {
    const s = score({ 'identity-sales-n1': 72 });
    const ch10 = s.chapters.find((c) => c.chapter === 10)!;
    expect(ch10.score).toBeNull();
    expect(ch10.coverage).toBe(0);
  });

  it("ne fait pas chuter le score d'une agence qui a simplement répondu vite", () => {
    // Même agence, mais seules trois questions du chapitre 10 sont renseignées.
    const complet = score(AGENCE_SAINE);
    const partiel = score({
      ...AGENCE_SAINE,
      'tool-anti-hallucination': undefined,
      'tool-team-access': undefined,
      'tools-esignature': undefined,
    });
    const avant = complet.chapters.find((c) => c.chapter === 10)!;
    const apres = partiel.chapters.find((c) => c.chapter === 10)!;
    expect(apres.score).toBe(avant.score); // les réponses restantes sont toutes bonnes
    expect(apres.coverage).toBeLessThan(avant.coverage);
  });

  it('affiche la couverture à côté du score, pour qu’on sache ce qu’il vaut', () => {
    const s = score(AGENCE_SAINE);
    for (const c of s.chapters) {
      expect(c.coverage).toBeGreaterThanOrEqual(0);
      expect(c.coverage).toBeLessThanOrEqual(100);
    }
    expect(s.chapters.find((c) => c.chapter === 3)!.coverage).toBe(100);
  });

  it('rend un global null quand rien n’est évaluable', () => {
    expect(score({}).global).toBeNull();
  });
});

describe('Le détail qui justifie le score', () => {
  it('expose une ligne par règle, avec son poids et sa note', () => {
    const ch5 = score(AGENCE_EN_DIFFICULTE).chapters.find((c) => c.chapter === 5)!;
    expect(ch5.breakdown.length).toBeGreaterThan(0);
    for (const b of ch5.breakdown) {
      expect(b.rule).toBeTruthy();
      expect(b.note).toBeTruthy();
      expect(b.weight).toBeGreaterThan(0);
    }
  });

  it('permet de répondre à « pourquoi ce score ? » sur un cas concret', () => {
    // Exclusivité à 8 % contre un repère de 30 % → environ 27 % d'atteinte.
    const ch5 = score(AGENCE_EN_DIFFICULTE).chapters.find((c) => c.chapter === 5)!;
    const exclu = ch5.breakdown.find((b) => b.rule === 'exclusivite')!;
    expect(exclu.earned).toBe(27);
  });
});

describe('Déterminisme', () => {
  it('deux calculs identiques donnent le même score', () => {
    expect(score(AGENCE_SAINE)).toEqual(score(AGENCE_SAINE));
  });
});
