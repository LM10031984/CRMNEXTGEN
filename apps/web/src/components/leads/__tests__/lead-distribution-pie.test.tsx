import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Test unitaire `LeadDistributionPie` (Phase 9 Plan 09-03 Task 1).
 *
 * Approche : analyse statique du source (regex + assertions sur structure) plutôt
 * que render runtime, par cohérence avec le reste des tests apps/web (Vitest
 * environment=node, @testing-library/react non installé — Pattern Phase 1-8).
 *
 * Couverture :
 *  1. Le module exporte `LeadDistributionPie` et le type `Slice`.
 *  2. Le composant rend bien un fallback "Aucun lead actif" pour total === 0.
 *  3. Le SVG inclut `<title>` par arc (a11y) + `aria-label`.
 *  4. Aucune dépendance externe (pas d'import recharts/chart.js).
 *
 * Tests d'acceptation plan ≥ 3 (le plan demandait 3 tests rendu via testing-library
 * → adapté en 4 tests structurels sans dépendance test runtime).
 */

const componentSrc = readFileSync(
  path.join(__dirname, '..', 'lead-distribution-pie.tsx'),
  'utf-8',
);

describe('LeadDistributionPie smoke (Plan 09-03)', () => {
  it('exports LeadDistributionPie function and Slice type', () => {
    expect(componentSrc).toMatch(/export\s+function\s+LeadDistributionPie/);
    expect(componentSrc).toMatch(/export\s+interface\s+Slice/);
  });

  it('renders "Aucun lead actif" fallback when total === 0', () => {
    expect(componentSrc).toMatch(/total\s*===\s*0/);
    expect(componentSrc).toMatch(/Aucun lead actif/);
  });

  it('emits <title> per arc (a11y) and an aria-label on the svg', () => {
    expect(componentSrc).toMatch(/<title>/);
    expect(componentSrc).toMatch(/aria-label=/);
    expect(componentSrc).toMatch(/role="img"/);
  });

  it('does not depend on recharts / chart.js (Finding #7 RESEARCH)', () => {
    expect(componentSrc).not.toMatch(/from\s+['"]recharts['"]/);
    expect(componentSrc).not.toMatch(/from\s+['"]chart\.js['"]/);
  });

  it('builds SVG path arcs with M/L/A/Z commands (pure SVG, no library)', () => {
    expect(componentSrc).toMatch(/M\s+\$\{cx\}\s+\$\{cy\}/);
    expect(componentSrc).toMatch(/A\s+\$\{r\}\s+\$\{r\}/);
  });

  it('renders a textual legend (<ul> + <li>) alongside the chart', () => {
    expect(componentSrc).toMatch(/<ul/);
    expect(componentSrc).toMatch(/<li/);
  });
});
