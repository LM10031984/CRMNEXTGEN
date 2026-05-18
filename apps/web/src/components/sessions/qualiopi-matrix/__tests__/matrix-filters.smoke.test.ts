import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Smoke test source-regex `MatrixFilters` (Phase 9.1 Plan 03 Task 2).
 *
 * Pattern Phase 9 D-Phase9-N — source-regex, environment=node.
 *
 * Couverture (≥ 6 grep-tests) :
 *   1. exporte MatrixFilters + DEFAULT_MATRIX_FILTERS + MatrixFilterState type
 *   2. utilise useLocalStorageState avec clé `qualiof-matrix-filters-${sessionId}` (R5)
 *   3. copies FR EXACTES UI-SPEC §Copywriting Contract
 *   4. Réinitialiser les filtres (CTA conditionnel)
 *   5. role="switch" + aria-checked pour incompleteOnly toggle
 *   6. default state shape
 */

const src = readFileSync(
  path.join(__dirname, '..', 'matrix-filters.tsx'),
  'utf-8',
);

describe('MatrixFilters — smoke (Phase 9.1 Plan 03 Task 2)', () => {
  it('exports MatrixFilters function + DEFAULT_MATRIX_FILTERS', () => {
    expect(src).toMatch(/export\s+function\s+MatrixFilters/);
    expect(src).toMatch(/export\s+const\s+DEFAULT_MATRIX_FILTERS/);
  });

  it('uses useLocalStorageState with sessionId-scoped key (R5 mitigation)', () => {
    expect(src).toMatch(/useLocalStorageState/);
    expect(src).toMatch(/qualiof-matrix-filters-/);
    // template literal interpolation present
    expect(src).toMatch(/\$\{sessionId\}/);
  });

  it('copies FR EXACTES UI-SPEC §Copywriting Contract', () => {
    expect(src).toMatch(/Trier/);
    expect(src).toMatch(/Statut OPCO/);
    expect(src).toMatch(/Financement/);
    expect(src).toMatch(/Incomplets uniquement/);
  });

  it('renders "Réinitialiser les filtres" link', () => {
    expect(src).toMatch(/Réinitialiser les filtres/);
  });

  it('uses role="switch" + aria-checked for incompleteOnly toggle', () => {
    expect(src).toMatch(/role=['"]switch['"]/);
    expect(src).toMatch(/aria-checked/);
  });

  it('declares default filter state shape (sort, opcoFilter, financingFilter, incompleteOnly)', () => {
    expect(src).toMatch(/sort:\s*['"]name-asc['"]/);
    expect(src).toMatch(/opcoFilter:\s*['"]all['"]/);
    expect(src).toMatch(/financingFilter:\s*['"]all['"]/);
    expect(src).toMatch(/incompleteOnly:\s*false/);
  });

  it('imports Radix DropdownMenu for the dropdowns', () => {
    expect(src).toMatch(/@radix-ui\/react-dropdown-menu/);
  });
});
