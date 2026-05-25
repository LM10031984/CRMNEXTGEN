/**
 * Phase 13 — Veille Qualiopi (VEILLE-01).
 *
 * Parser de date multi-format utilisé pour l'import du xlsx veille Qualiopi.
 * Tolère 3 formats observés dans `C6.i23-24-25tableau veille.xlsx` :
 *   - DD/MM/YYYY ou DD/MM/YY  → ex "15/03/2024", "15/03/24"
 *   - DD-Mmm-YY                → ex "12-Mar-26"
 *   - Mmm-YY                   → ex "Jun-23" (jour=1 par défaut)
 *
 * Retourne `null` sur entrée vide, whitespace seul, ou format inconnu.
 *
 * Helper pur réutilisable depuis :
 *  - Script d'import xlsx `packages/db/scripts/import-veille-from-xlsx.ts`
 *  - UI éventuelle de saisie manuelle (Plan 03)
 */

const MONTH_MAP: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

export function parseFlexibleDate(v: string | null): Date | null {
  if (!v || !v.trim()) return null;
  const s = v.trim();

  // Format DD/MM/YYYY ou DD/MM/YY
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const day = parseInt(m[1]!, 10);
    const month = parseInt(m[2]!, 10) - 1;
    const yy = parseInt(m[3]!, 10);
    const year = yy < 100 ? 2000 + yy : yy;
    return new Date(year, month, day);
  }

  // Format DD-Mmm-YY
  m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (m) {
    const day = parseInt(m[1]!, 10);
    const mon = MONTH_MAP[m[2]!];
    if (mon === undefined) return null;
    const yy = parseInt(m[3]!, 10);
    const year = yy < 100 ? 2000 + yy : yy;
    return new Date(year, mon, day);
  }

  // Format Mmm-YY (jour=1 par défaut)
  m = s.match(/^([A-Za-z]{3})-(\d{2,4})$/);
  if (m) {
    const mon = MONTH_MAP[m[1]!];
    if (mon === undefined) return null;
    const yy = parseInt(m[2]!, 10);
    const year = yy < 100 ? 2000 + yy : yy;
    return new Date(year, mon, 1);
  }

  return null;
}
