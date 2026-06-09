import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Smoke test page /app/veille (Phase 13 Plan 13-03 Task 0/1 — VEILLE-02).
 *
 * Anti-régression sur :
 *  - Guard auth via `validateRequest()` (page disponible pour ADMIN/MANAGER/LECTEUR — pas requireRole)
 *  - URL state `?tab=indic_23|indic_24|indic_25|indic_26|inbox` validé serveur via parseTab
 *  - Defense-in-depth D-03 : si LECTEUR + tab=inbox → redirect côté serveur
 *  - Multi-tenant : tous les findFirst/findMany scopés par `tenantId: user.tenantId`
 *  - Helper `shouldShowInbox` extrait (testable en isolation cf. veille-inbox.rbac.test.ts)
 *  - Wiring composants client : VeilleTabsClient, VeilleTable, VeilleInbox, DaysSinceBadge,
 *    AddVeilleDialog, ExportPdfButton
 *  - Pattern lucide-react import vs JSX usage (BUG-01 audit 2026-05-12)
 *
 * Pattern file-read regex cohérent avec `parametres/historique/__tests__/page.smoke.test.ts`.
 */
const pageSrc = readFileSync(path.join(__dirname, '..', 'page.tsx'), 'utf-8');
const helpersSrc = readFileSync(
  path.join(__dirname, '..', 'page-helpers.ts'),
  'utf-8',
);

describe('veille page smoke (Plan 13-03)', () => {
  it('Test 1 — calls validateRequest() and redirects to /login if no user', () => {
    expect(pageSrc).toMatch(/validateRequest\(\)/);
    expect(pageSrc).toMatch(/redirect\(['"]\/login['"]\)/);
  });

  it('Test 2 — imports and uses shouldShowInbox helper (D-03 LECTEUR strict)', () => {
    expect(pageSrc).toMatch(/shouldShowInbox/);
    expect(pageSrc).toMatch(
      /from\s*['"]\.\/page-helpers['"]/,
    );
  });

  it('Test 3 — defense-in-depth: redirects LECTEUR away from tab=inbox', () => {
    // Au moins 1 redirect vers /app/veille?tab=indic_23 quand !canSeeInbox + tab=inbox
    expect(pageSrc).toMatch(/redirect\(['"]\/app\/veille\?tab=indic_23['"]\)/);
  });

  it('Test 4 — uses dynamic = force-dynamic (admin/manager/lecteur data live)', () => {
    expect(pageSrc).toMatch(
      /export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/,
    );
  });

  it('Test 5 — multi-tenant: ≥ 2 occurrences of tenantId scope in queries', () => {
    const matches = pageSrc.match(/tenantId:\s*user\.tenantId/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('Test 6 — wires VeilleTabsClient + VeilleTable + DaysSinceBadge + ExportPdfButton', () => {
    expect(pageSrc).toMatch(/<VeilleTabsClient/);
    expect(pageSrc).toMatch(/<VeilleTable/);
    expect(pageSrc).toMatch(/<DaysSinceBadge/);
    expect(pageSrc).toMatch(/<ExportPdfButton/);
  });

  it('Test 7 — wires VeilleInbox conditionally + AddVeilleDialog when canEdit', () => {
    expect(pageSrc).toMatch(/<VeilleInbox/);
    expect(pageSrc).toMatch(/<AddVeilleDialog/);
  });

  it('Test 8 — uses daysSince helper from lib/veille (Plan 02)', () => {
    expect(pageSrc).toMatch(/daysSince/);
    expect(pageSrc).toMatch(
      /from\s*['"]@\/lib\/veille\/days-since['"]/,
    );
  });

  it('Test 9 — page-helpers exports parseTab + tabToTheme + shouldShowInbox', () => {
    expect(helpersSrc).toMatch(/export\s+function\s+shouldShowInbox/);
    expect(helpersSrc).toMatch(/export\s+function\s+parseTab/);
    expect(helpersSrc).toMatch(/export\s+function\s+tabToTheme/);
  });

  it('Test 10 — does not use lucide-react JSX symbol that is not imported', () => {
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
      'Newspaper',
      'BookMarked',
      'Telescope',
      'ShieldCheck',
      'Inbox',
      'AlertTriangle',
      'Clock',
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
