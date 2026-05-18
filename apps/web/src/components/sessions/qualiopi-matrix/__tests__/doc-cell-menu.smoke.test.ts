import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Smoke test source-regex `DocCellMenu` (Phase 9.1 Plan 02 Task 3).
 *
 * Pattern Phase 9 D-Phase9-N (lead-distribution-pie.test.tsx).
 *
 * Couverture (6 grep-tests) :
 *  1. exporte DocCellMenu
 *  2. readOnly → trigger disabled + aria-disabled
 *  3. imports Radix DropdownMenu + 5 icônes lucide (action set complet)
 *  4. séparateur entre groupes (R6 mitigation RESEARCH)
 *  5. copies FR EXACTES UI-SPEC §Copywriting Contract (Générer/Re-générer/etc.)
 *  6. wires les 3 server actions (regenerateParticipantDoc, deleteDocument, markDocStatus)
 */

const componentSrc = readFileSync(
  path.join(__dirname, '..', 'doc-cell-menu.tsx'),
  'utf-8',
);

describe('DocCellMenu smoke (Phase 9.1 Plan 02)', () => {
  it('exports DocCellMenu function', () => {
    expect(componentSrc).toMatch(/export\s+function\s+DocCellMenu/);
  });

  it('readOnly renders disabled trigger with aria-disabled', () => {
    expect(componentSrc).toMatch(/readOnly/);
    expect(componentSrc).toMatch(/aria-disabled/);
    expect(componentSrc).toMatch(/Lecture seule/);
  });

  it('imports Radix DropdownMenu and 5+ lucide action icons', () => {
    expect(componentSrc).toMatch(/from\s+['"]@radix-ui\/react-dropdown-menu['"]/);
    expect(componentSrc).toMatch(/MoreVertical/);
    expect(componentSrc).toMatch(/Sparkles/); // Générer
    expect(componentSrc).toMatch(/RefreshCw/); // Re-générer
    expect(componentSrc).toMatch(/Upload/); // Téléverser
    expect(componentSrc).toMatch(/Trash2/); // Supprimer
    expect(componentSrc).toMatch(/AlertTriangle/); // Marquer sans preuve
  });

  it('renders DropdownMenu.Separator between groups (R6 mitigation)', () => {
    expect(componentSrc).toMatch(/DropdownMenu\.Separator/);
  });

  it('uses exact French copywriting from UI-SPEC §Copywriting Contract', () => {
    expect(componentSrc).toContain('Générer');
    expect(componentSrc).toContain('Re-générer');
    expect(componentSrc).toContain('Téléverser le PDF signé');
    expect(componentSrc).toContain('Télécharger le PDF');
    expect(componentSrc).toContain('Supprimer le document');
    expect(componentSrc).toContain('Marquer signé sans preuve');
  });

  it('wires the 3 server actions from qualiopi-matrix module', () => {
    expect(componentSrc).toMatch(/regenerateParticipantDoc/);
    expect(componentSrc).toMatch(/deleteDocument/);
    expect(componentSrc).toMatch(/markDocStatus/);
    expect(componentSrc).toMatch(/['"]@\/server\/actions\/qualiopi-matrix['"]/);
  });
});
