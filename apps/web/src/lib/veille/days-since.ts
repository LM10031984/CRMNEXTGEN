/**
 * Phase 13 — Veille Qualiopi (VEILLE-02).
 *
 * KPI veille "X jours depuis dernière revue" — utilisé par le badge UI page `/app/veille`
 * (cf. RESEARCH §2.10).
 *
 * Helper pur testable sans mock Date.now (les tests utilisent des deltas relatifs).
 *
 * Contrat :
 *   - daysSince(null)             → null   (pas de "dernière revue" connue)
 *   - daysSince(d, d ≥ now)       → ≤ 0    (jamais NaN)
 *   - daysSince(d, d < now)       → Math.floor((now - d) / 86_400_000)
 *
 * Seuils UI Qualiopi attendus (Plan 03 — badge couleur) :
 *   <  30  → vert
 *   30-89  → ambre
 *   ≥ 90   → rouge (≥ 90j = source jamais revue depuis 3 mois)
 */

const ONE_DAY_MS = 86_400_000;

export function daysSince(date: Date | null): number | null {
  if (!date) return null;
  return Math.floor((Date.now() - date.getTime()) / ONE_DAY_MS);
}
