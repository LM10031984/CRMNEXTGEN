import { describe, it, expect } from 'vitest';
import { signaturePhone } from '../phone';

describe('numéro SMS de signature', () => {
  it.each(['0631056390', '06 31 05 63 90', '06.31.05.63.90', '06-31-05-63-90',
    '+33631056390', '0033631056390', '+33 (0)6 31 05 63 90'])('%s devient international', (input) => {
    expect(signaturePhone(input)).toBe('+33631056390');
  });
  it('accepte les mobiles 07', () => {
    expect(signaturePhone('0731056390')).toBe('+33731056390');
  });
  it('préserve un indicatif étranger explicite', () => {
    expect(signaturePhone('+32 471 12 34 56')).toBe('+32471123456');
  });
  it.each([undefined, '', '063105639', '06310563900', '0131056390', '+33131056390',
    '06abc31056390', '33631056390', '++33631056390', '+3363105639'])('refuse %s', (input) => {
    expect(() => signaturePhone(input)).toThrow('numéro mobile valide');
  });
});
