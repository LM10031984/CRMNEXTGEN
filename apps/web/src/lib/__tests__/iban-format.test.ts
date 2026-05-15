import { describe, it, expect } from 'vitest';
import { formatIban } from '../iban-format';

/**
 * Tests Phase 7 Plan 07-04 Task 1 — helper formatIban.
 *
 * Spec : voir <behavior> du plan 07-04-PLAN.md L172-176.
 */

describe('formatIban', () => {
  it('Test 1 — IBAN compact 27 chars → espaces tous les 4 chars', () => {
    expect(formatIban('FR7612345678901234567890123')).toBe(
      'FR76 1234 5678 9012 3456 7890 123',
    );
  });

  it('Test 2 — null → chaîne vide (tolérance)', () => {
    expect(formatIban(null)).toBe('');
  });

  it('Test 3 — IBAN déjà formaté est idempotent', () => {
    expect(formatIban('FR76 1234 5678 9012 3456 7890 123')).toBe(
      'FR76 1234 5678 9012 3456 7890 123',
    );
  });

  it("Test 4 — chaîne vide → chaîne vide", () => {
    expect(formatIban('')).toBe('');
  });

  it('Test 5 — undefined → chaîne vide (défense en profondeur)', () => {
    expect(formatIban(undefined)).toBe('');
  });

  it('Test 6 — casse mixte normalisée en MAJUSCULES', () => {
    expect(formatIban('fr7612345678901234567890123')).toBe(
      'FR76 1234 5678 9012 3456 7890 123',
    );
  });
});
