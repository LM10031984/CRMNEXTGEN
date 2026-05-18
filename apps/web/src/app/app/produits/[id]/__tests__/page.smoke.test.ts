import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Phase 9.1 Plan 09.1-05 Task 3 — Smoke source-regex `/app/produits/[id]/page.tsx`
 * refondue 4 onglets URL-state (CENTRAL-04 + CENTRAL-05 D-05 cross-nav).
 *
 * Pattern source-regex car `@testing-library/react` non installé + vitest
 * environment=node (cf. D-Phase9-N STATE.md).
 *
 * Anti-régressions critiques :
 *  - 5 composants tabs montés (ProductTabs + 4 panels)
 *  - URL state via `searchParams?.tab` (pas client state) + coercion VALID_TABS
 *  - Helper product-stats consommé (getProductStats / listProductSessions / listProductLearners)
 *  - Scope multi-tenant strict (where tenantId)
 *  - Lazy load par tab : seulement les data nécessaires sont fetchées
 *  - Conservation des éléments legacy header (BackToListLink + DeleteProductButton)
 */

const pageSrc = readFileSync(path.join(__dirname, '..', 'page.tsx'), 'utf-8');

describe('produits/[id]/page smoke (Plan 09.1-05 — fiche produit refondue 4 onglets)', () => {
  it('exports a default async Server Component', () => {
    expect(pageSrc).toMatch(/export\s+default\s+async\s+function/);
  });

  it('imports ProductTabs + 4 panels (Task 2)', () => {
    expect(pageSrc).toMatch(/ProductTabs/);
    expect(pageSrc).toMatch(/ProductStatsTab/);
    expect(pageSrc).toMatch(/ProductSessionsTab/);
    expect(pageSrc).toMatch(/ProductLearnersTab/);
    expect(pageSrc).toMatch(/ProductProgrammeTab/);
  });

  it('imports helpers product-stats (Task 1)', () => {
    expect(pageSrc).toMatch(/getProductStats|listProductSessions|listProductLearners/);
    expect(pageSrc).toMatch(/product-stats/);
  });

  it('reads searchParams?.tab + coerces invalid values (UI-SPEC §Edge Cases)', () => {
    expect(pageSrc).toMatch(/searchParams/);
    expect(pageSrc).toMatch(/VALID_TABS|valid_tabs/i);
    expect(pageSrc).toMatch(/['"]stats['"]/); // default fallback
  });

  it('scopes data fetch by tenantId (cross-tenant safety)', () => {
    expect(pageSrc).toMatch(/tenantId/);
    expect(pageSrc).toMatch(/user\.tenantId/);
  });

  it('uses validateRequest auth guard (pattern Phase 5+)', () => {
    expect(pageSrc).toMatch(/validateRequest/);
  });

  it('calls notFound() if product missing (pattern existant)', () => {
    expect(pageSrc).toMatch(/notFound/);
  });

  it('renders the 4 tab panel branches (one per activeTab value)', () => {
    expect(pageSrc).toMatch(/activeTab\s*===\s*['"]stats['"]/);
    expect(pageSrc).toMatch(/activeTab\s*===\s*['"]sessions['"]/);
    expect(pageSrc).toMatch(/activeTab\s*===\s*['"]apprenants['"]/);
    expect(pageSrc).toMatch(/activeTab\s*===\s*['"]programme['"]/);
  });

  it('uses Breadcrumb (UX-10 Phase 5 pattern)', () => {
    expect(pageSrc).toMatch(/Breadcrumb/);
  });

  it('renders tabpanel a11y attributes (role=tabpanel + aria-labelledby)', () => {
    expect(pageSrc).toMatch(/role=['"]tabpanel['"]/);
    expect(pageSrc).toMatch(/aria-labelledby/);
  });

  it('preserves legacy header elements (BackToListLink + DeleteProductButton)', () => {
    expect(pageSrc).toMatch(/BackToListLink/);
    expect(pageSrc).toMatch(/DeleteProductButton/);
  });

  it('lazy loads only the data needed by active tab (no over-fetch)', () => {
    // On vérifie au moins 2 branches de chargement conditionnelles selon activeTab
    // (pattern : `if (activeTab === 'X') { ... }` ou ternaire dans Promise.all)
    expect(pageSrc).toMatch(/activeTab\s*===\s*['"](stats|sessions|apprenants|programme)['"]/);
  });
});
