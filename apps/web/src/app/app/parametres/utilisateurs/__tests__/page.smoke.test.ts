import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Smoke test page Utilisateurs (Phase 8 Plan 08-04 Task 2).
 *
 * Anti-régression sur :
 *  - Guard ADMIN-only (RBAC-01 + D-08 CONTEXT.md)
 *  - Scope multi-tenant `admin.tenantId` (sécurité critique)
 *  - Wiring des composants UI (InviteUserButton, UsersTable)
 *  - Pattern lucide-react import (cohérent BUG-01 audit 2026-05-12)
 *
 * Cf. apps/web/src/app/app/parametres/__tests__/page.smoke.test.ts pour le pattern.
 */

const pageSrc = readFileSync(
  path.join(__dirname, '..', 'page.tsx'),
  'utf-8',
);

describe('users page smoke (Plan 08-04)', () => {
  it('calls requireRole(["ADMIN"]) as first action (gate de sécurité)', () => {
    expect(pageSrc).toMatch(/requireRole\(\['ADMIN'\]\)/);
  });

  it('queries prisma.user.findMany scoped to admin.tenantId (multi-tenant)', () => {
    expect(pageSrc).toMatch(/prisma\.user\.findMany/);
    expect(pageSrc).toMatch(/tenantId:\s*admin\.tenantId/);
  });

  it('renders both InviteUserButton and UsersTable components', () => {
    expect(pageSrc).toMatch(/<InviteUserButton/);
    expect(pageSrc).toMatch(/<UsersTable/);
    // Imports correspondants
    expect(pageSrc).toMatch(/from '@\/components\/users\/invite-user-button'/);
    expect(pageSrc).toMatch(/from '@\/components\/users\/users-table'/);
  });

  it('passes admin.id as currentUserId prop to UsersTable (self-detection)', () => {
    expect(pageSrc).toMatch(/currentUserId=\{admin\.id\}/);
  });

  it('selects only the user fields needed by UsersTable (no over-fetch)', () => {
    // Vérifie qu'on ne fait pas un `select: { *: true }` ou un find sans select
    expect(pageSrc).toMatch(/select:\s*\{/);
    expect(pageSrc).toMatch(/role:\s*true/);
    expect(pageSrc).toMatch(/disabledAt:\s*true/);
    expect(pageSrc).toMatch(/lastLoginAt:\s*true/);
  });

  it('uses dynamic = force-dynamic to skip cache (admin data + sécurité)', () => {
    expect(pageSrc).toMatch(/export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/);
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
    // Liste figée des icônes Lucide effectivement référencées dans la page.
    const lucideCandidates = new Set([
      'UserPlus',
      'Users',
      'Mail',
      'UserCog',
      'History',
      'Settings',
    ]);
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
