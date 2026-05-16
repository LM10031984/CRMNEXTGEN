import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Smoke test `/app/leads/[id]/page.tsx` (Phase 9 Plan 09-03 Task 3 — LEAD-01).
 *
 * Anti-régression sur :
 *  - validateRequest + redirect si pas user.
 *  - Scope multi-tenant via `tenantId: user.tenantId`.
 *  - notFound() si lead introuvable.
 *  - Wiring ReassignLeadButton + LeadStatusSelect (composants Task 1).
 *  - Lucide-react import cohérent (anti BUG-01).
 *
 * Pattern emprunté à `apps/web/src/app/invitation/[token]/__tests__/page.smoke.test.ts`.
 */

const pageSrc = readFileSync(path.join(__dirname, '..', 'page.tsx'), 'utf-8');

describe('lead detail page smoke (Plan 09-03)', () => {
  it('exports a default async Server Component', () => {
    expect(pageSrc).toMatch(/export\s+default\s+async\s+function\s+LeadDetailPage/);
  });

  it("uses `dynamic = 'force-dynamic'` (fresh detail data)", () => {
    expect(pageSrc).toMatch(/export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/);
  });

  it('uses validateRequest + redirect to /login when no user', () => {
    expect(pageSrc).toMatch(/validateRequest\(/);
    expect(pageSrc).toMatch(/redirect\('\/login'\)/);
  });

  it('queries prisma.lead.findFirst scoped to tenantId: user.tenantId', () => {
    expect(pageSrc).toMatch(/prisma\.lead\.findFirst/);
    expect(pageSrc).toMatch(/tenantId:\s*user\.tenantId/);
  });

  it('calls notFound() if lead is null (404 if not in tenant)', () => {
    expect(pageSrc).toMatch(/notFound\(\)/);
  });

  it('renders ReassignLeadButton + LeadStatusSelect (Task 1 components)', () => {
    expect(pageSrc).toMatch(/<ReassignLeadButton/);
    expect(pageSrc).toMatch(/<LeadStatusSelect/);
    expect(pageSrc).toMatch(/from '@\/components\/leads\/reassign-lead-button'/);
    expect(pageSrc).toMatch(/from '@\/components\/leads\/lead-status-select'/);
  });

  it('renders Breadcrumb (Phase 5 UX-10) with leads/ + prospectName path', () => {
    expect(pageSrc).toMatch(/<Breadcrumb/);
    expect(pageSrc).toMatch(/from '@\/components\/ui\/breadcrumb'/);
  });

  it('does not use any lucide-react JSX symbol that is not imported (anti BUG-01)', () => {
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
      'Mail',
      'Phone',
      'Building2',
      'User',
      'Trophy',
    ]);
    const jsxOpeningTags = [...pageSrc.matchAll(/<([A-Z][A-Za-z0-9_]*)\b/g)].map(
      (m) => m[1]!,
    );
    const usedFromLucide = jsxOpeningTags.filter((t) => lucideCandidates.has(t));
    const missing = usedFromLucide.filter((t) => !imported.has(t));
    expect(missing, `lucide-react JSX used but not imported: ${missing.join(', ')}`).toEqual([]);
  });
});
