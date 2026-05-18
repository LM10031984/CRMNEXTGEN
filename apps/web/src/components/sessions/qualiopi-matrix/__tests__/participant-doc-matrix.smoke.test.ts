import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Smoke test source-regex `ParticipantDocMatrix` (Phase 9.1 Plan 03 Task 1).
 *
 * Pattern Phase 9 D-Phase9-N (source-regex, environment=node).
 *
 * Couverture (≥ 7 grep-tests) :
 *   1. exporte ParticipantDocMatrix
 *   2. dérive l'état via deriveCellState (Plan 01)
 *   3. importe les 3 atomes Plan 02 (DocStatusBadge + DocCellMenu)
 *   4. importe MATRIX_DOC_TYPES + DOC_TYPE_LABELS (Plan 01)
 *   5. detecte readOnly via userRole (ADMIN/MANAGER) — D-11
 *   6. inclut productDocs (Bug P0 anti-régression : 1 PDF / N statuts)
 *   7. titre section "Documents participants"
 *   8. légende UI-SPEC (Prêt / Sans preuve / Manquant / Non applicable)
 *   9. monte MatrixRow (composant ligne)
 */

const src = readFileSync(
  path.join(__dirname, '..', 'participant-doc-matrix.tsx'),
  'utf-8',
);

describe('ParticipantDocMatrix — smoke (Phase 9.1 Plan 03)', () => {
  it('exports ParticipantDocMatrix function', () => {
    expect(src).toMatch(/export\s+function\s+ParticipantDocMatrix/);
  });

  it('derives cell state via deriveCellState helper (Plan 01)', () => {
    expect(src).toMatch(/deriveCellState/);
    expect(src).toMatch(/from\s+['"]@\/lib\/derive-cell-state['"]/);
  });

  it('imports MATRIX_DOC_TYPES + DOC_TYPE_LABELS (Plan 01)', () => {
    expect(src).toMatch(/MATRIX_DOC_TYPES/);
    expect(src).toMatch(/DOC_TYPE_LABELS/);
  });

  it('detects readOnly via user role check (D-11)', () => {
    // readOnly = !['ADMIN','MANAGER'].includes(userRole)
    expect(src).toMatch(/readOnly/);
    expect(src).toMatch(/ADMIN/);
    expect(src).toMatch(/MANAGER/);
  });

  it('reads productDocs (Bug P0 anti-régression — 1 PDF / N statuts)', () => {
    expect(src).toMatch(/productDocs/);
  });

  it('renders section title "Documents participants"', () => {
    expect(src).toMatch(/Documents participants/);
  });

  it('renders legend (Prêt / Sans preuve / Manquant / Non applicable)', () => {
    expect(src).toMatch(/Prêt/);
    expect(src).toMatch(/Sans preuve/);
    expect(src).toMatch(/Manquant/);
    expect(src).toMatch(/Non applicable/);
  });

  it('mounts MatrixRow + MatrixFilters + BatchRegenBar', () => {
    expect(src).toMatch(/MatrixRow/);
    expect(src).toMatch(/MatrixFilters/);
    expect(src).toMatch(/BatchRegenBar/);
  });

  it('uses hasAgeficeParticipant to include AGEFICE column conditionally', () => {
    expect(src).toMatch(/hasAgeficeParticipant/);
    expect(src).toMatch(/AGEFICE/);
  });
});
