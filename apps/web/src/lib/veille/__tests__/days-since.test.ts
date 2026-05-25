/**
 * Phase 13 Plan 02 Task 0 (Wave 0) — Tests du helper pur `daysSince`.
 *
 * Helper utilisé par le KPI UI "X jours depuis dernière mise à jour"
 * sur la page `/app/veille` (cf. RESEARCH §2.10).
 *
 * Contrat (cf. 13-02-PLAN.md must_haves.truths) :
 *   - daysSince(null)           → null
 *   - daysSince(Date)           → Math.floor((Date.now() - d.getTime()) / 86_400_000)
 *   - daysSince(date future)    → ≤ 0
 *
 * Implémentation cible : apps/web/src/lib/veille/days-since.ts (Task 1).
 */

import { describe, it, expect } from 'vitest';
import { daysSince } from '../days-since';

const ONE_DAY_MS = 86_400_000;

describe('daysSince', () => {
  it('Test 1 — daysSince(null) retourne null (pas de "dernière revue" connue)', () => {
    expect(daysSince(null)).toBeNull();
  });

  it('Test 2 — daysSince(d-5j) retourne 5 (delta entier)', () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * ONE_DAY_MS);
    expect(daysSince(fiveDaysAgo)).toBe(5);
  });

  it('Test 3 — daysSince(d-12h) retourne 0 (Math.floor sur la fraction de jour)', () => {
    const halfDayAgo = new Date(Date.now() - 0.5 * ONE_DAY_MS);
    expect(daysSince(halfDayAgo)).toBe(0);
  });

  it('Test 4 — daysSince(date future) retourne <= 0 (jamais NaN, jamais positif)', () => {
    const tomorrow = new Date(Date.now() + ONE_DAY_MS);
    const r = daysSince(tomorrow);
    expect(r).not.toBeNull();
    expect(r! <= 0).toBe(true);
  });

  it('Test 5 — daysSince(d-90j) retourne 90 (seuil rouge KPI Qualiopi)', () => {
    const ninetyDaysAgo = new Date(Date.now() - 90 * ONE_DAY_MS);
    expect(daysSince(ninetyDaysAgo)).toBe(90);
  });
});
