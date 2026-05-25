import { describe, it, expect } from 'vitest';
import { numberToFrenchWords } from '../number-to-french-words';

describe('numberToFrenchWords', () => {
  // Cas Kristin AGEFICE : doit matcher "trois mille vingt quatre"
  it('matches AGEFICE Kristin format', () => {
    expect(numberToFrenchWords(3024)).toBe('trois mille vingt quatre');
  });

  it('handles zero and small numbers', () => {
    expect(numberToFrenchWords(0)).toBe('zéro');
    expect(numberToFrenchWords(1)).toBe('un');
    expect(numberToFrenchWords(15)).toBe('quinze');
    expect(numberToFrenchWords(19)).toBe('dix neuf');
  });

  it('handles French quirks 70/71/80/81/90/91', () => {
    expect(numberToFrenchWords(70)).toBe('soixante dix');
    expect(numberToFrenchWords(71)).toBe('soixante et onze');
    expect(numberToFrenchWords(72)).toBe('soixante douze');
    expect(numberToFrenchWords(80)).toBe('quatre vingts');
    expect(numberToFrenchWords(81)).toBe('quatre vingt un');
    expect(numberToFrenchWords(90)).toBe('quatre vingt dix');
    expect(numberToFrenchWords(91)).toBe('quatre vingt onze');
  });

  it('handles "et un" liaison for 21/31/41/51/61', () => {
    expect(numberToFrenchWords(21)).toBe('vingt et un');
    expect(numberToFrenchWords(31)).toBe('trente et un');
    expect(numberToFrenchWords(61)).toBe('soixante et un');
  });

  it('handles "cents" plural terminal rule', () => {
    expect(numberToFrenchWords(100)).toBe('cent');
    expect(numberToFrenchWords(200)).toBe('deux cents');
    expect(numberToFrenchWords(201)).toBe('deux cent un');
    expect(numberToFrenchWords(280)).toBe('deux cent quatre vingts');
  });

  it('handles "mille" invariable', () => {
    expect(numberToFrenchWords(1000)).toBe('mille');
    expect(numberToFrenchWords(1024)).toBe('mille vingt quatre');
    expect(numberToFrenchWords(2000)).toBe('deux mille');
    expect(numberToFrenchWords(200_000)).toBe('deux cent mille');
  });

  it('truncates decimals (AGEFICE shows euros only in words)', () => {
    expect(numberToFrenchWords(3024.5)).toBe('trois mille vingt quatre');
    expect(numberToFrenchWords(3024.99)).toBe('trois mille vingt quatre');
  });

  it('handles millions', () => {
    expect(numberToFrenchWords(1_000_000)).toBe('un million');
    expect(numberToFrenchWords(2_000_000)).toBe('deux millions');
  });
});
