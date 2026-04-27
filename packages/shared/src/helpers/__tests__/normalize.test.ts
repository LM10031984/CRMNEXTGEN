import { describe, it, expect } from 'vitest';
import { normalizeName, normalizeEmail, organizationLooksLikePerson, personDedupKey } from '../normalize';

describe('normalizeName', () => {
  it('normalise les accents', () => {
    expect(normalizeName('Bergé')).toBe('berge');
    expect(normalizeName('BIANCO Pascal')).toBe('bianco pascal');
  });
  it('gère les espaces multiples', () => {
    expect(normalizeName('  Pascal   BIANCO  ')).toBe('pascal bianco');
  });
});

describe('normalizeEmail', () => {
  it('lowercase et trim', () => {
    expect(normalizeEmail(' Pascal@Bianco.FR ')).toBe('pascal@bianco.fr');
  });
});

describe('organizationLooksLikePerson', () => {
  it('détecte le cas EI Pascal BIANCO', () => {
    expect(organizationLooksLikePerson('BIANCO Pascal — EI', 'Pascal', 'Bianco')).toBe(true);
    expect(organizationLooksLikePerson('Pascal BIANCO', 'Pascal', 'Bianco')).toBe(true);
    expect(organizationLooksLikePerson('SAS BIANCO INVEST', 'Pascal', 'Bianco')).toBe(false);
    expect(organizationLooksLikePerson('DUSAUSSOY Grégory', 'Grégory', 'Dusaussoy')).toBe(true);
  });
});

describe('personDedupKey', () => {
  it('utilise email s\'il existe', () => {
    expect(
      personDedupKey({ firstName: 'Pascal', lastName: 'Bianco', email: 'pascal@gmail.com' }),
    ).toBe('email:pascal@gmail.com');
  });
  it('fallback sur nom+prénom+date naissance', () => {
    expect(
      personDedupKey({ firstName: 'Pascal', lastName: 'Bianco', birthDate: '1972-05-12' }),
    ).toBe('bianco|pascal|1972-05-12');
  });
});
