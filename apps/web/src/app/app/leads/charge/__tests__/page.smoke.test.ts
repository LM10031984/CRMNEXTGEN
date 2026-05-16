import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Smoke test `/app/leads/charge` (Phase 9 Plan 09-03 Task 2 — LEAD-02).
 *
 * Anti-régression sur :
 *  - Guard ADMIN+MANAGER (RBAC Phase 8).
 *  - Scope multi-tenant `user.tenantId`.
 *  - Wiring helper `getCommercialsWithKpis` (Plan 09-01) + composants Task 1.
 *  - 4 PrioCard KPI globaux présents (totalLeadsActifs / wonThisMonth / conversion / avgDays).
 *  - lucide-react import cohérent (anti-régression BUG-01 audit 2026-05-12).
 *
 * Pattern emprunté à `apps/web/src/app/app/parametres/utilisateurs/__tests__/page.smoke.test.ts`.
 */

const pageSrc = readFileSync(path.join(__dirname, '..', 'page.tsx'), 'utf-8');

describe('leads charge page smoke (Plan 09-03)', () => {
  it('exports a default async Server Component', () => {
    expect(pageSrc).toMatch(/export\s+default\s+async\s+function\s+LeadsChargePage/);
  });

  it('uses validateRequest + hasRole guard for ADMIN+MANAGER', () => {
    expect(pageSrc).toMatch(/validateRequest\(/);
    expect(pageSrc).toMatch(/hasRole\(user,\s*\['ADMIN',\s*'MANAGER'\]\)/);
    // Si pas ADMIN+MANAGER → redirect('/app')
    expect(pageSrc).toMatch(/redirect\('\/app'\)/);
  });

  it("uses `dynamic = 'force-dynamic'` (KPI temps réel + sécurité)", () => {
    expect(pageSrc).toMatch(/export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/);
  });

  it('consumes getCommercialsWithKpis(user.tenantId) (Plan 09-01)', () => {
    expect(pageSrc).toMatch(/getCommercialsWithKpis/);
    expect(pageSrc).toMatch(/user\.tenantId/);
  });

  it('renders LeadLoadTable + LeadDistributionPie components (Task 1)', () => {
    expect(pageSrc).toMatch(/<LeadLoadTable/);
    expect(pageSrc).toMatch(/<LeadDistributionPie/);
    expect(pageSrc).toMatch(/from '@\/components\/leads\/lead-load-table'/);
    expect(pageSrc).toMatch(/from '@\/components\/leads\/lead-distribution-pie'/);
  });

  it('renders 4 PrioCardLocal instances (Phase 6 Dashboard pattern, ≥ 5 occurrences avec la définition)', () => {
    const count = (pageSrc.match(/PrioCardLocal/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(5);
  });

  it('computes 4 global KPIs (totalLeadsActifs / totalWonThisMonth / conversionGlobale / avgDaysGlobal)', () => {
    expect(pageSrc).toMatch(/totalLeadsActifs/);
    expect(pageSrc).toMatch(/totalWonThisMonth/);
    expect(pageSrc).toMatch(/conversionGlobale/);
    expect(pageSrc).toMatch(/avgDaysGlobal/);
  });

  it('renders Breadcrumb with Leads → Vue de charge path', () => {
    expect(pageSrc).toMatch(/<Breadcrumb/);
    expect(pageSrc).toMatch(/from '@\/components\/ui\/breadcrumb'/);
    expect(pageSrc).toMatch(/Vue de charge/);
  });

  it('does not use any lucide-react JSX symbol that is not imported (BUG-01 anti-régression)', () => {
    const importMatch = pageSrc.match(
      /import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/,
    );
    const imported = new Set(
      (importMatch?.[1] ?? '')
        .split(',')
        .map((s) => s.trim())
        .map((s) => (s.includes(' as ') ? s.split(' as ')[1]!.trim() : s)),
    );
    const lucideCandidates = new Set([
      'Users',
      'Trophy',
      'TrendingUp',
      'Clock',
      'BarChart3',
      'Megaphone',
    ]);
    const jsxOpeningTags = [...pageSrc.matchAll(/<([A-Z][A-Za-z0-9_]*)\b/g)].map(
      (m) => m[1]!,
    );
    const usedFromLucide = jsxOpeningTags.filter((t) => lucideCandidates.has(t));
    const missing = usedFromLucide.filter((t) => !imported.has(t));
    expect(missing, `lucide-react JSX used but not imported: ${missing.join(', ')}`).toEqual([]);
  });
});
