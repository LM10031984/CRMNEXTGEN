import { describe, it, expect } from 'vitest';
import { detectNameDivergences, editDistance } from '../name-divergence';

/**
 * Quick 260908-lrj. Cas déclencheur (Laurent, 08/09) : l'OCR a lu
 * « EL GUERTIJ » là où la pièce dit « EL GUERTIT ».
 */

const CNI = "la carte d'identité";
const CFP = "l'attestation URSSAF";

describe('editDistance', () => {
  it('mesure une substitution de lettre', () => {
    expect(editDistance('elguertit', 'elguertij')).toBe(1);
  });

  it('abandonne au-delà du plafond au lieu de calculer inutilement', () => {
    expect(editDistance('dupont', 'martinez-lafarge', 3)).toBeGreaterThan(3);
  });

  it('chaînes identiques → 0', () => {
    expect(editDistance('rousseau', 'rousseau')).toBe(0);
  });
});

describe('detectNameDivergences', () => {
  it('cas témoin EL GUERTIT / EL GUERTIJ → signalé comme erreur de lecture probable', () => {
    const d = detectNameDivergences(
      { label: CNI, firstName: 'Houssain', lastName: 'EL GUERTIJ' },
      { label: CFP, firstName: 'Houssain', lastName: 'EL GUERTIT' },
    );
    expect(d).toHaveLength(1);
    expect(d[0]!.field).toBe('nom');
    expect(d[0]!.looksLikeOcrTypo).toBe(true);
    expect(d[0]!.message).toContain('EL GUERTIJ');
    expect(d[0]!.message).toContain('EL GUERTIT');
    expect(d[0]!.message).toContain('probable erreur de lecture');
  });

  it('deux noms franchement différents → signalé, mais pas comme une faute de lecture', () => {
    const d = detectNameDivergences(
      { label: CNI, lastName: 'ROUSSEAU' },
      { label: CFP, lastName: 'MARTINEZ' },
    );
    expect(d[0]!.looksLikeOcrTypo).toBe(false);
    expect(d[0]!.message).toContain('même personne');
  });

  it('accents, casse et tirets ne sont pas des divergences', () => {
    expect(
      detectNameDivergences(
        { label: CNI, firstName: 'Stéphane', lastName: 'JEAN-DOAT' },
        { label: CFP, firstName: 'STEPHANE', lastName: 'jean doat' },
      ),
    ).toEqual([]);
  });

  it('une valeur absente ne déclenche rien (la pièce ne la portait pas)', () => {
    expect(
      detectNameDivergences(
        { label: CNI, firstName: 'Houssain', lastName: null },
        { label: CFP, firstName: 'Houssain', lastName: 'EL GUERTIT' },
      ),
    ).toEqual([]);
  });

  it('signale le nom ET le prénom quand les deux divergent', () => {
    const d = detectNameDivergences(
      { label: CNI, firstName: 'Jean', lastName: 'DUPONT' },
      { label: CFP, firstName: 'Jeanne', lastName: 'DUPOND' },
    );
    expect(d.map((x) => x.field).sort()).toEqual(['nom', 'prénom']);
  });

  it('pièces concordantes → aucun signalement', () => {
    expect(
      detectNameDivergences(
        { label: CNI, firstName: 'Houssain', lastName: 'EL GUERTIT' },
        { label: CFP, firstName: 'Houssain', lastName: 'EL GUERTIT' },
      ),
    ).toEqual([]);
  });
});
