import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Smoke test source-regex `BatchRegenBar` (Phase 9.1 Plan 03 Task 2).
 *
 * Pattern Phase 9 D-Phase9-N — source-regex, environment=node.
 *
 * Couverture (≥ 6 grep-tests) :
 *   1. exporte BatchRegenBar
 *   2. wire `regenerateBatchParticipantDocs` server action
 *   3. UI-SPEC sticky bottom animation classes (slide-in-from-bottom-4)
 *   4. copies FR EXACTES UI-SPEC (Annuler la sélection / Re-générer les / sélectionné(s))
 *   5. dropdown multi-select des CLOSURE_DOC_KINDS (filter DOC_TYPE_TO_CLOSURE_KIND)
 *   6. conditional render (selectedParticipantsCount === 0 → null)
 */

const src = readFileSync(
  path.join(__dirname, '..', 'batch-regen-bar.tsx'),
  'utf-8',
);

describe('BatchRegenBar — smoke (Phase 9.1 Plan 03 Task 2)', () => {
  it('exports BatchRegenBar function', () => {
    expect(src).toMatch(/export\s+function\s+BatchRegenBar/);
  });

  it('wires regenerateBatchParticipantDocs server action', () => {
    expect(src).toMatch(/regenerateBatchParticipantDocs/);
    expect(src).toMatch(/from\s+['"]@\/server\/actions\/qualiopi-matrix['"]/);
  });

  it('uses sticky bottom + slide-in animation (UI-SPEC §BatchRegenBar)', () => {
    expect(src).toMatch(/fixed\s+bottom/);
    expect(src).toMatch(/slide-in-from-bottom-4/);
  });

  it('copies FR EXACTES UI-SPEC §Copywriting Contract', () => {
    expect(src).toMatch(/Annuler la sélection/);
    expect(src).toMatch(/Re-générer les/);
    expect(src).toMatch(/sélectionné/);
  });

  it('multi-select dropdown filters CLOSURE_DOC_KINDS via DOC_TYPE_TO_CLOSURE_KIND', () => {
    expect(src).toMatch(/DOC_TYPE_TO_CLOSURE_KIND/);
    expect(src).toMatch(/@radix-ui\/react-dropdown-menu/);
  });

  it('conditional render (count === 0 → null hide)', () => {
    expect(src).toMatch(/selectedParticipantsCount/);
    // implicit pattern: if (count === 0) return null OR equivalent guard
    expect(src).toMatch(/===\s*0|<=\s*0/);
  });

  it('uses useTransition + sonner for pending state + feedback', () => {
    expect(src).toMatch(/useTransition/);
    expect(src).toMatch(/from\s+['"]sonner['"]/);
  });
});
