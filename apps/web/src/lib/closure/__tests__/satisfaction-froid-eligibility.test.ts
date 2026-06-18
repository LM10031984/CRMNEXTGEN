import { describe, it, expect } from 'vitest';

import { isFroidEligible } from '../satisfaction-froid-eligibility';

describe('isFroidEligible', () => {
  // Test 6 — limite stricte ≥90 jours calendaires.
  it('applique une limite stricte à 90 jours calendaires', () => {
    const endDate = new Date('2026-01-01T00:00:00Z');
    expect(isFroidEligible(endDate, new Date('2026-03-31T00:00:00Z'))).toBe(false); // 89 j
    expect(isFroidEligible(endDate, new Date('2026-04-01T00:00:00Z'))).toBe(true); // 90 j
    expect(isFroidEligible(endDate, new Date('2026-04-02T00:00:00Z'))).toBe(true); // 91 j
  });

  // Test 7 — SES-0087 : fin 2026-05-11, aujourd'hui ~2026-06-18 (~38 j) → froid sauté.
  it('saute le froid pour SES-0087 (session terminée depuis < 90j)', () => {
    expect(
      isFroidEligible(new Date('2026-05-11T00:00:00Z'), new Date('2026-06-18T00:00:00Z')),
    ).toBe(false);
  });
});
