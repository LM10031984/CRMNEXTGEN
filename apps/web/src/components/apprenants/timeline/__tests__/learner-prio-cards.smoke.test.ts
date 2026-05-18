import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Smoke test source-regex `LearnerPrioCards` (Phase 9.1 Plan 04 Task 2).
 *
 * Pattern Phase 9 D-Phase9-N : analyse statique du source, environment=node,
 * @testing-library/react non installé.
 *
 * Couverture (5 grep-tests) :
 *  1. exporte LearnerPrioCards
 *  2. les 3 labels FR UI-SPEC (HEURES TOTALES / SESSIONS / HEURES {year})
 *  3. les 3 sub copies (depuis {firstYear} / formées / cette année)
 *  4. tabular-nums utilisé pour les valeurs (cohérence Phase 6 PrioCard)
 *  5. 3 lucide icons (Clock / BookOpen / Calendar) — UI-SPEC wireframe
 */

const componentSrc = readFileSync(
  path.join(__dirname, '..', 'learner-prio-cards.tsx'),
  'utf-8',
);

describe('LearnerPrioCards smoke (Phase 9.1 Plan 04)', () => {
  it('exports LearnerPrioCards function', () => {
    expect(componentSrc).toMatch(/export\s+function\s+LearnerPrioCards/);
  });

  it('contains the 3 UI-SPEC labels uppercase (HEURES TOTALES / SESSIONS / HEURES {year})', () => {
    expect(componentSrc).toMatch(/HEURES TOTALES/);
    expect(componentSrc).toMatch(/SESSIONS/);
    expect(componentSrc).toMatch(/HEURES\s*\$\{|HEURES \{?currentYear\}?|HEURES /);
  });

  it('contains the 3 sub copies (depuis / formées / cette année)', () => {
    expect(componentSrc).toMatch(/depuis/i);
    expect(componentSrc).toMatch(/formées/);
    expect(componentSrc).toMatch(/cette année/);
  });

  it('uses tabular-nums for values (Phase 6 PrioCard pattern)', () => {
    expect(componentSrc).toMatch(/tabular-nums/);
  });

  it('imports the 3 lucide-react icons (Clock / BookOpen / Calendar)', () => {
    expect(componentSrc).toMatch(/from\s+['"]lucide-react['"]/);
    expect(componentSrc).toMatch(/\bClock\b/);
    expect(componentSrc).toMatch(/\bBookOpen\b/);
    expect(componentSrc).toMatch(/\bCalendar\b/);
  });

  it('does not use random hex colors outside palette (UI-SPEC anti-pattern)', () => {
    expect(componentSrc).not.toMatch(/text-\[#[0-9a-f]{6}\]/i);
    expect(componentSrc).not.toMatch(/bg-\[#[0-9a-f]{6}\]/i);
  });
});
