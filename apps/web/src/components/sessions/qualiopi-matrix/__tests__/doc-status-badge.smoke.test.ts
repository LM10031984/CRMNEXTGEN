import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Smoke test source-regex `DocStatusBadge` (Phase 9.1 Plan 02 Task 3).
 *
 * Pattern Phase 9 D-Phase9-N (lead-distribution-pie.test.tsx) :
 * analyse statique du source (regex + readFileSync) plutôt que render runtime,
 * Vitest environment=node, @testing-library/react non installé.
 *
 * Couverture (6 grep-tests) :
 *  1. exporte DocStatusBadge
 *  2. les 6 états visuels présents (GENERATED / MANUAL_OK / MISSING / NA / RUNNING + warning='no_proof')
 *  3. chaque branche d'état émet un aria-label (a11y exhaustif)
 *  4. importe lucide-react icônes correctes par état (Check / AlertTriangle / X / Minus / Loader2)
 *  5. utilise palette UI-SPEC (emerald-600 solide / emerald-100 soft / amber-100 / red-100 / slate-100 / sky-50)
 *  6. n'utilise pas de couleur hors palette (pas de hex random)
 */

const componentSrc = readFileSync(
  path.join(__dirname, '..', 'doc-status-badge.tsx'),
  'utf-8',
);

describe('DocStatusBadge smoke (Phase 9.1 Plan 02)', () => {
  it('exports DocStatusBadge function', () => {
    expect(componentSrc).toMatch(/export\s+function\s+DocStatusBadge/);
  });

  it('handles the 6 visual states (UI-SPEC Color table)', () => {
    expect(componentSrc).toMatch(/state\s*===\s*['"]GENERATED['"]/);
    expect(componentSrc).toMatch(/state\s*===\s*['"]MANUAL_OK['"]/);
    expect(componentSrc).toMatch(/state\s*===\s*['"]MISSING['"]|MISSING/);
    expect(componentSrc).toMatch(/state\s*===\s*['"]NA['"]/);
    expect(componentSrc).toMatch(/state\s*===\s*['"]RUNNING['"]/);
    expect(componentSrc).toMatch(/warning\s*===\s*['"]no_proof['"]/);
  });

  it('emits an aria-label on every branch (≥ 6 aria-label occurrences)', () => {
    const matches = componentSrc.match(/aria-label=/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(6);
  });

  it('imports the 5 required lucide-react icons', () => {
    expect(componentSrc).toMatch(/from\s+['"]lucide-react['"]/);
    expect(componentSrc).toMatch(/Check/);
    expect(componentSrc).toMatch(/AlertTriangle/);
    expect(componentSrc).toMatch(/\bX\b/);
    expect(componentSrc).toMatch(/Minus/);
    expect(componentSrc).toMatch(/Loader2/);
  });

  it('uses UI-SPEC pastille palette (emerald / amber / red / slate / sky)', () => {
    expect(componentSrc).toMatch(/emerald-600/); // MANUAL_OK + uploaded solid
    expect(componentSrc).toMatch(/emerald-100/); // GENERATED soft
    expect(componentSrc).toMatch(/amber-100/); // warning no_proof
    expect(componentSrc).toMatch(/red-100/); // MISSING
    expect(componentSrc).toMatch(/slate-100/); // NA
    expect(componentSrc).toMatch(/sky-50/); // RUNNING
  });

  it('does not use random hex colors outside palette (UI-SPEC anti-pattern)', () => {
    // text-[#XXXXXX] arbitrary forbidden
    expect(componentSrc).not.toMatch(/text-\[#[0-9a-f]{6}\]/i);
    expect(componentSrc).not.toMatch(/bg-\[#[0-9a-f]{6}\]/i);
  });
});
