import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Smoke test page Distribution leads (Phase 9 Plan 09-04 Task 3).
 *
 * Anti-régression sur :
 *  - Guard ADMIN-only (RBAC-01 + D-08 CONTEXT.md) via `hasRole(user, ['ADMIN'])`
 *  - Scope multi-tenant `user.tenantId` (sécurité critique)
 *  - Wiring composant DistributionLeadsForm (Task 3 source unique)
 *  - Fetch des 3 toggles tenant (autoAssignLeads / notifyOnLeadAssignEmail /
 *    notifyOnLeadAssignBell) qui pilotent la distribution Phase 9
 *  - Pattern lucide-react import (anti-régression BUG-01 audit 2026-05-12)
 *
 * Cf. apps/web/src/app/app/parametres/utilisateurs/__tests__/page.smoke.test.ts
 * pour le pattern source-regex.
 */

const pageSrc = readFileSync(
  path.join(__dirname, '..', 'page.tsx'),
  'utf-8',
);

describe('distribution-leads page smoke (Plan 09-04 Task 3)', () => {
  it('is a Server Component (default async export)', () => {
    expect(pageSrc).toMatch(/export\s+default\s+async\s+function/);
  });

  it('uses dynamic = force-dynamic to skip cache (admin data + sécurité)', () => {
    expect(pageSrc).toMatch(/export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/);
  });

  it('calls validateRequest() + hasRole(user, ["ADMIN"]) as gate de sécurité', () => {
    expect(pageSrc).toMatch(/validateRequest\(/);
    expect(pageSrc).toMatch(/hasRole\(user,\s*\['ADMIN'\]\)/);
  });

  it('redirects to /login if !user and /app if not ADMIN (D-08 pattern)', () => {
    expect(pageSrc).toMatch(/redirect\(['"]\/login['"]\)/);
    expect(pageSrc).toMatch(/redirect\(['"]\/app['"]\)/);
  });

  it('queries prisma.tenant.findUnique scoped to user.tenantId (multi-tenant)', () => {
    expect(pageSrc).toMatch(/prisma\.tenant\.findUnique/);
    expect(pageSrc).toMatch(/where:\s*\{\s*id:\s*user\.tenantId\s*\}/);
  });

  it('selects only the 3 distribution toggles (no over-fetch)', () => {
    expect(pageSrc).toMatch(/autoAssignLeads:\s*true/);
    expect(pageSrc).toMatch(/notifyOnLeadAssignEmail:\s*true/);
    expect(pageSrc).toMatch(/notifyOnLeadAssignBell:\s*true/);
  });

  it('renders <DistributionLeadsForm initial={...}/> (Task 3 wiring)', () => {
    expect(pageSrc).toMatch(/<DistributionLeadsForm/);
    expect(pageSrc).toMatch(/from '@\/components\/parametres\/distribution-leads-form'/);
    expect(pageSrc).toMatch(/initial=\{/);
  });

  it('renders Breadcrumb with Paramètres → Distribution leads', () => {
    expect(pageSrc).toMatch(/<Breadcrumb/);
    expect(pageSrc).toMatch(/Distribution leads/);
  });

  it('does not use any lucide-react JSX symbol that is not imported', () => {
    const importMatch = pageSrc.match(
      /import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/,
    );
    const imported = new Set(
      (importMatch?.[1] ?? '')
        .split(',')
        .map((s) => s.trim())
        .map((s) => (s.includes(' as ') ? s.split(' as ')[1]!.trim() : s)),
    );
    // Liste figée des icônes Lucide candidates dans la page.
    const lucideCandidates = new Set(['Sliders', 'Settings', 'Mail', 'Bell']);
    const jsxOpeningTags = [...pageSrc.matchAll(/<([A-Z][A-Za-z0-9_]*)\b/g)].map(
      (m) => m[1]!,
    );
    const usedFromLucide = jsxOpeningTags.filter((t) => lucideCandidates.has(t));
    const missing = usedFromLucide.filter((t) => !imported.has(t));
    expect(
      missing,
      `lucide-react symbols used in JSX but not imported: ${missing.join(', ')}`,
    ).toEqual([]);
  });
});
