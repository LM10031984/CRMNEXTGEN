/**
 * Tests déterministes (sans DB ni LLM) du barème /5 ajouté à
 * `aggregateSatisfactions` (quick 260619-jy5).
 *
 * Barème dédié colonne K Qualiopi de Laurent : Très bien=5, Bien=4, Moyen=3, Mauvais=2.
 * On vérifie aussi la NON-RÉGRESSION de globalScore / recommandationRate /
 * satisfactionFavorableRate (barème % 0-100 inchangé).
 */

import { describe, it, expect } from 'vitest';
import { aggregateSatisfactions } from '../satisfaction-session-template';
import type { RatingValue, SatisfactionChaudContent } from '../satisfaction-chaud-template';

/**
 * Fabrique un SatisfactionChaudContent complet : toutes les clés des 4 sections
 * agrégées (organisation 4, moyens 4, pedagogie 8, groupe 4) reçoivent `rating`.
 * `benefice` est rempli mais EXCLU de l'agrégation (SECTION_CRITERIA l'ignore).
 */
function makeContent(rating: RatingValue): SatisfactionChaudContent {
  return {
    organisation: {
      communication: rating,
      delai: rating,
      duree: rating,
      engagements: rating,
    },
    moyens: {
      cadre: rating,
      locaux: rating,
      supports: rating,
      materiel: rating,
    },
    pedagogie: {
      difficulte: rating,
      articulation: rating,
      theorique: rating,
      pratique: rating,
      rythme: rating,
      approche: rating,
      ecoute: rating,
      animation: rating,
    },
    groupe: {
      ambiance: rating,
      nombre: rating,
      heterogeneite: rating,
      attention: rating,
    },
    benefice: {
      adequation: rating,
      utilite: 'Utile',
    },
    recommandation: 'Oui',
    remarques: null,
  };
}

describe('aggregateSatisfactions — noteSur5 (barème /5 colonne K)', () => {
  it('contents vide → noteSur5 === 0 (et globalScore === 0)', () => {
    const agg = aggregateSatisfactions([]);
    expect(agg.noteSur5).toBe(0);
    expect(agg.globalScore).toBe(0);
  });

  it("tous 'Très bien' → noteSur5 === 5.0 (et globalScore === 100, non-régression)", () => {
    const agg = aggregateSatisfactions([makeContent('Très bien')]);
    expect(agg.noteSur5).toBe(5);
    expect(agg.globalScore).toBe(100);
    expect(agg.satisfactionFavorableRate).toBe(100);
    expect(agg.recommandationRate).toBe(100);
  });

  it("moitié 'Très bien' / moitié 'Bien' (2 contents) → noteSur5 === 4.5", () => {
    const agg = aggregateSatisfactions([makeContent('Très bien'), makeContent('Bien')]);
    expect(agg.noteSur5).toBe(4.5);
  });

  it("tous 'Moyen' → noteSur5 === 3.0", () => {
    const agg = aggregateSatisfactions([makeContent('Moyen')]);
    expect(agg.noteSur5).toBe(3);
  });

  it("tous 'Mauvais' → noteSur5 === 2.0", () => {
    const agg = aggregateSatisfactions([makeContent('Mauvais')]);
    expect(agg.noteSur5).toBe(2);
  });

  it('arrondi à 1 décimale : mix TB/Bien/Moyen → moyenne /5 arrondie', () => {
    // 3 contents : TB(5) + Bien(4) + Moyen(3) → moyenne = 4.0
    const agg = aggregateSatisfactions([
      makeContent('Très bien'),
      makeContent('Bien'),
      makeContent('Moyen'),
    ]);
    expect(agg.noteSur5).toBe(4);
  });
});
