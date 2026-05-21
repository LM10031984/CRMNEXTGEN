import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Smoke test `/app/factures` (Phase 11 Plan 11-08 Task 3 — FACT-01).
 *
 * Pattern source-regex D-Phase9-N (reproduit Phase 9 leads/charge smoke).
 *
 * Anti-régression sur :
 *  - Placeholder Phase pre-11 REMPLACÉ (plus de <Placeholder>)
 *  - Guard validateRequest + hasRole soft-redirect ADMIN/MANAGER/COMPTABLE/LECTEUR
 *  - Wiring helper getInvoicesListData
 *  - 4 composants UI Phase 11 importés
 *  - Empty state "Aucun impayé"
 *  - Parser 4 périodes (this-month / last-month / quarter / year)
 *  - export const dynamic = 'force-dynamic'
 */

const pageSrc = readFileSync(
  path.join(__dirname, '..', 'page.tsx'),
  'utf-8',
);

describe('FacturesPage smoke (Plan 11-08)', () => {
  it('exports a default async Server Component', () => {
    expect(pageSrc).toMatch(/export\s+default\s+async\s+function\s+FacturesPage/);
  });

  it('plus de placeholder Phase pre-11 (Lot 2 post-MVP)', () => {
    expect(pageSrc).not.toMatch(/<Placeholder/);
    expect(pageSrc).not.toMatch(/palier="Lot 2/);
  });

  it('importe les 4 composants UI Phase 11', () => {
    expect(pageSrc).toContain('InvoicesPrioCards');
    expect(pageSrc).toContain('InvoicesFilters');
    expect(pageSrc).toContain('InvoicesListTable');
    expect(pageSrc).toContain('InvoicesExportButton');
    expect(pageSrc).toMatch(/from '@\/components\/invoices\/invoices-prio-cards'/);
    expect(pageSrc).toMatch(/from '@\/components\/invoices\/invoices-filters'/);
    expect(pageSrc).toMatch(/from '@\/components\/invoices\/invoices-list-table'/);
    expect(pageSrc).toMatch(/from '@\/components\/invoices\/invoices-export-button'/);
  });

  it('appelle validateRequest + soft-redirect RBAC (Phase 9 D-Phase9-Q)', () => {
    expect(pageSrc).toContain('validateRequest');
    expect(pageSrc).toMatch(/hasRole\(user,\s*\[/);
    expect(pageSrc).toContain("'ADMIN'");
    expect(pageSrc).toContain("'MANAGER'");
    expect(pageSrc).toContain("'COMPTABLE'");
    expect(pageSrc).toContain("'LECTEUR'");
    expect(pageSrc).toMatch(/redirect\('\/app'\)/);
    expect(pageSrc).toMatch(/redirect\('\/login'\)/);
  });

  it('appelle getInvoicesListData avec filters + page + pageSize', () => {
    expect(pageSrc).toMatch(/getInvoicesListData\(/);
    expect(pageSrc).toContain('pageSize');
    expect(pageSrc).toMatch(/from '@\/server\/actions\/invoices-list'/);
  });

  it("utilise force-dynamic (recompute à chaque request)", () => {
    expect(pageSrc).toMatch(/export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/);
  });

  it('parse 4 périodes (this-month / last-month / quarter / year)', () => {
    expect(pageSrc).toContain("case 'this-month'");
    expect(pageSrc).toContain("case 'last-month'");
    expect(pageSrc).toContain("case 'quarter'");
    expect(pageSrc).toContain("case 'year'");
  });

  it('contient l\'empty state "Aucun impayé"', () => {
    expect(pageSrc).toContain('Aucun impayé');
  });

  it('passe currentRole à InvoicesExportButton (RBAC D-17)', () => {
    expect(pageSrc).toMatch(/<InvoicesExportButton[^>]*currentRole=\{user\.role\}/);
  });
});
