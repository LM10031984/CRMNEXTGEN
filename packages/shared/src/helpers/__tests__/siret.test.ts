import { describe, it, expect } from 'vitest';
import { isValidSiret, isValidSiren, sirenFromSiret, cleanSiret } from '../siret';

describe('SIRET', () => {
  it('valide un SIRET correct', () => {
    expect(isValidSiret('81423718600030')).toBe(true); // depuis Airtable Aurélie Bergé
    expect(isValidSiret('88087175100017')).toBe(true); // Marc BARRIERE
  });

  it('rejette un SIRET malformé', () => {
    expect(isValidSiret('123')).toBe(false);
    expect(isValidSiret('12345678901234')).toBe(false);
    expect(isValidSiret('6037870C01')).toBe(false); // SIRET avec lettre depuis SmartOF
    expect(isValidSiret(null)).toBe(false);
    expect(isValidSiret(undefined)).toBe(false);
  });

  it('nettoie un SIRET avec espaces', () => {
    expect(cleanSiret('882 665 102')).toBe('882665102');
    expect(cleanSiret('814 237 186 00030')).toBe('81423718600030');
  });

  it('extrait le SIREN depuis un SIRET', () => {
    expect(sirenFromSiret('81423718600030')).toBe('814237186');
  });

  it('valide un SIREN correct', () => {
    expect(isValidSiren('814237186')).toBe(true);
  });
});
