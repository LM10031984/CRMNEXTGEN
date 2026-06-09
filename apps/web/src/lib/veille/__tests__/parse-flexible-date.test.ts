import { describe, it, expect } from 'vitest';
import { parseFlexibleDate } from '../parse-flexible-date';

/**
 * Phase 13 Plan 13-01 Task 0 (Wave 0) — tests RED pour parseFlexibleDate.
 *
 * Couvre VEILLE-01 : "Parser flexibleDate gère 3 formats (DD/MM/YYYY, DD-Mmm-YY, Mmm-YY)".
 *
 * Helper pur : 0 mock, 0 setup. Une fois Task 1 implémente le helper, ces 8 tests
 * doivent passer GREEN.
 */
describe('parseFlexibleDate', () => {
  it('Test 1 — parses "15/03/2024" as Date(2024, 2, 15)', () => {
    const d = parseFlexibleDate('15/03/2024');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2024);
    expect(d!.getMonth()).toBe(2); // mars (0-indexed)
    expect(d!.getDate()).toBe(15);
  });

  it('Test 2 — parses 2-digit year "15/03/24" with 2000 prefix → Date(2024, 2, 15)', () => {
    const d = parseFlexibleDate('15/03/24');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2024);
    expect(d!.getMonth()).toBe(2);
    expect(d!.getDate()).toBe(15);
  });

  it('Test 3 — parses "12-Mar-26" as Date(2026, 2, 12)', () => {
    const d = parseFlexibleDate('12-Mar-26');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(2);
    expect(d!.getDate()).toBe(12);
  });

  it('Test 4 — parses "Jun-23" as Date(2023, 5, 1) (jour=1 par défaut)', () => {
    const d = parseFlexibleDate('Jun-23');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2023);
    expect(d!.getMonth()).toBe(5); // juin
    expect(d!.getDate()).toBe(1);
  });

  it('Test 5 — null input returns null', () => {
    expect(parseFlexibleDate(null)).toBeNull();
  });

  it('Test 6 — empty string returns null', () => {
    expect(parseFlexibleDate('')).toBeNull();
  });

  it('Test 7 — whitespace-only returns null', () => {
    expect(parseFlexibleDate('   ')).toBeNull();
  });

  it('Test 8 — unknown format "abracadabra" returns null', () => {
    expect(parseFlexibleDate('abracadabra')).toBeNull();
  });
});
