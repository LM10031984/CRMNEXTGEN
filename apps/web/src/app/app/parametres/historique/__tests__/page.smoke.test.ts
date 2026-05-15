import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Smoke test page Historique (Phase 8 Plan 08-05 Task 2).
 *
 * Anti-régression sur :
 *  - Guard ADMIN-only (RBAC-05 + D-08 CONTEXT.md)
 *  - Scope multi-tenant via `buildAuditWhere(sp, admin.tenantId)` (sécurité critique)
 *  - Wiring des composants UI (AuditLogFilters, AuditDiffModal)
 *  - Pagination (PAGE_SIZE constant + skip/take)
 *  - Pattern lucide-react import vs JSX usage (BUG-01 audit 2026-05-12)
 *
 * Cf. apps/web/src/app/app/parametres/utilisateurs/__tests__/page.smoke.test.ts
 * pour le pattern (cohérent avec Plan 08-04).
 */
const pageSrc = readFileSync(
  path.join(__dirname, '..', 'page.tsx'),
  'utf-8',
);

describe('historique page smoke (Plan 08-05)', () => {
  it('Test 1 — calls requireRole(["ADMIN"]) as first action (gate de sécurité)', () => {
    expect(pageSrc).toMatch(/requireRole\(\['ADMIN'\]\)/);
  });

  it('Test 2 — uses buildAuditWhere helper (centralise le scope tenantId)', () => {
    expect(pageSrc).toMatch(/buildAuditWhere\(sp, admin\.tenantId\)/);
    expect(pageSrc).toMatch(
      /from\s*['"]@\/lib\/build-audit-where['"]/,
    );
  });

  it('Test 3 — queries auditLog with findMany + count (in parallel via Promise.all)', () => {
    expect(pageSrc).toMatch(/prisma\.auditLog\.findMany/);
    expect(pageSrc).toMatch(/prisma\.auditLog\.count/);
    expect(pageSrc).toMatch(/Promise\.all/);
  });

  it('Test 4 — renders AuditLogFilters and AuditDiffModal client components', () => {
    expect(pageSrc).toMatch(/<AuditLogFilters/);
    expect(pageSrc).toMatch(/<AuditDiffModal/);
    expect(pageSrc).toMatch(
      /from\s*['"]@\/components\/audit\/audit-log-filters['"]/,
    );
    expect(pageSrc).toMatch(
      /from\s*['"]@\/components\/audit\/audit-diff-modal['"]/,
    );
  });

  it('Test 5 — paginates with PAGE_SIZE constant (skip + take)', () => {
    expect(pageSrc).toMatch(/PAGE_SIZE\s*=\s*50/);
    expect(pageSrc).toMatch(/take:\s*PAGE_SIZE/);
    expect(pageSrc).toMatch(/skip:\s*page\s*\*\s*PAGE_SIZE/);
  });

  it('Test 6 — uses dynamic = force-dynamic (admin data + sécurité)', () => {
    expect(pageSrc).toMatch(
      /export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/,
    );
  });

  it('Test 7 — orders by createdAt desc (plus récent en haut)', () => {
    expect(pageSrc).toMatch(/orderBy:\s*\{\s*createdAt:\s*['"]desc['"]/);
  });

  it('Test 8 — selects users for the filter dropdown scoped to admin.tenantId', () => {
    expect(pageSrc).toMatch(/prisma\.user\.findMany/);
    expect(pageSrc).toMatch(/tenantId:\s*admin\.tenantId/);
  });

  it('Test 9 — does not use any lucide-react JSX symbol that is not imported', () => {
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
      'History',
      'Filter',
      'Eye',
      'RotateCcw',
      'ChevronLeft',
      'ChevronRight',
    ]);
    const jsxOpeningTags = [...pageSrc.matchAll(/<([A-Z][A-Za-z0-9_]*)\b/g)].map(
      (m) => m[1]!,
    );
    const usedFromLucide = jsxOpeningTags.filter((t) =>
      lucideCandidates.has(t),
    );
    const missing = usedFromLucide.filter((t) => !imported.has(t));
    expect(
      missing,
      `lucide-react symbols used in JSX but not imported: ${missing.join(', ')}`,
    ).toEqual([]);
  });
});
