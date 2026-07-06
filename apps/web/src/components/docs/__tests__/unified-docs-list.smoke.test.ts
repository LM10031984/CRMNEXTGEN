import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Phase 9.3 Plan 09.3-03 Task 1 — Smoke source-regex `UnifiedDocsList` (NAV-02/NAV-03).
 *
 * Pattern source-regex (clone de doc-status-badge.smoke.test.ts) : analyse
 * statique du source, vitest environment=node, @testing-library NON installé
 * (convention projet).
 *
 * Couverture :
 *  1. exporte UnifiedDocsList
 *  2. réutilise DocStatusBadge (pas de nouvelle pastille)
 *  3. mappe les 3 status present/stub/missing → states GENERATED/MANUAL_OK/MISSING
 *  4. NAV-03 : stub via warning="no_proof" LITTÉRAL + texte « non conforme » (pas via title)
 *  5. cross-nav par ancre : /app/sessions/ + /app/produits/ + /app/parametres (tenant)
 *  6. état vide « Aucun document »
 */

const componentSrc = readFileSync(
  path.join(__dirname, '..', 'unified-docs-list.tsx'),
  'utf-8',
);

describe('UnifiedDocsList smoke (Phase 9.3 Plan 03)', () => {
  it('exports UnifiedDocsList function', () => {
    expect(componentSrc).toMatch(/export\s+function\s+UnifiedDocsList/);
  });

  it('reuses DocStatusBadge (no new pastille component)', () => {
    expect(componentSrc).toMatch(/DocStatusBadge/);
    expect(componentSrc).toMatch(/qualiopi-matrix\/doc-status-badge/);
  });

  it('maps the 3 UnifiedDoc.status to DocStatusState states', () => {
    expect(componentSrc).toMatch(/['"]present['"]/);
    expect(componentSrc).toMatch(/['"]stub['"]/);
    expect(componentSrc).toMatch(/['"]missing['"]/);
    expect(componentSrc).toMatch(/state="GENERATED"/);
    expect(componentSrc).toMatch(/state="MANUAL_OK"/);
    expect(componentSrc).toMatch(/state="MISSING"/);
  });

  it('NAV-03: stub uses warning="no_proof" LITERAL + « non conforme » text (never via title)', () => {
    expect(componentSrc).toMatch(/warning="no_proof"/);
    expect(componentSrc).toMatch(/NON conforme/);
    // Aucune prop `title=` passée au badge (la prop n'existe pas dans le contrat).
    expect(componentSrc).not.toMatch(/<DocStatusBadge[^>]*\btitle=/);
  });

  it('cross-nav par ancre vers les 3 surfaces (sessions / produits / parametres tenant)', () => {
    expect(componentSrc).toMatch(/\/app\/sessions\//);
    expect(componentSrc).toMatch(/\/app\/produits\//);
    expect(componentSrc).toMatch(/\/app\/parametres/);
  });

  it('renders an empty state « Aucun document »', () => {
    expect(componentSrc).toMatch(/Aucun document/);
    expect(componentSrc).toMatch(/length\s*===\s*0/);
  });
});
