import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Smoke test `/invitation/[token]/page.tsx` (Phase 8 Plan 08-03 Task 2).
 *
 * Pattern anti-régression BUG-01 (audit 2026-05-12 — "FileText is not defined"
 * sur une page lucide-react). Vérifie statiquement que :
 *   1. La page exporte bien un Server Component default async.
 *   2. `dynamic = 'force-dynamic'` est en place (lecture token fraîche, jamais cache).
 *   3. La page consomme prisma.userInvitation.findUnique pour résoudre le token.
 *   4. Les 3 états du flow sont rendus (ExpiredState / AlreadyUsedState / SetPasswordForm).
 *   5. Tous les symboles lucide-react utilisés en JSX sont déclarés dans l'import.
 *
 * Pas d'exec runtime ici (Server Component RSC = pas trivial à tester unitairement).
 * Pattern emprunté à `apps/web/src/app/app/parametres/__tests__/page.smoke.test.ts`.
 */

const pageSrc = readFileSync(path.join(__dirname, '..', 'page.tsx'), 'utf8');

describe('/invitation/[token]/page smoke (Plan 08-03)', () => {
  it('exports a default async Server Component named InvitationPage', () => {
    expect(pageSrc).toMatch(/export\s+default\s+async\s+function\s+InvitationPage/);
  });

  it("uses `dynamic = 'force-dynamic'` for fresh token reads", () => {
    expect(pageSrc).toMatch(/export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/);
  });

  it('queries prisma.userInvitation.findUnique by token', () => {
    expect(pageSrc).toContain('prisma.userInvitation.findUnique');
    expect(pageSrc).toMatch(/where:\s*\{\s*token\s*\}/);
  });

  it('renders the 3 branches: ExpiredState / AlreadyUsedState / SetPasswordForm', () => {
    expect(pageSrc).toMatch(/<ExpiredState\b/);
    expect(pageSrc).toMatch(/<AlreadyUsedState\b/);
    expect(pageSrc).toMatch(/<SetPasswordForm\b/);
  });

  it('handles the not-found case via notFound() from next/navigation', () => {
    expect(pageSrc).toMatch(/import\s*\{[^}]*\bnotFound\b[^}]*\}\s*from\s*['"]next\/navigation['"]/);
    expect(pageSrc).toMatch(/if\s*\(\s*!invitation\s*\)\s*notFound\s*\(\s*\)/);
  });

  it('imports all lucide-react JSX symbols actually used (anti-BUG-01)', () => {
    const importMatch = pageSrc.match(
      /import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/,
    );
    expect(importMatch, 'page.tsx must import from lucide-react').toBeTruthy();

    const imported = new Set(
      (importMatch?.[1] ?? '')
        .split(',')
        .map((s) => s.trim())
        .map((s) => (s.includes(' as ') ? s.split(' as ')[1]!.trim() : s)),
    );

    // Liste figée des icônes lucide-react référencées en JSX sur cette page.
    const lucideCandidates = new Set([
      'ShieldCheck',
      'Clock',
      'CheckCircle2',
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

  it('imports SetPasswordForm from the kebab-case components path', () => {
    expect(pageSrc).toMatch(
      /import\s*\{\s*SetPasswordForm\s*\}\s*from\s*['"]@\/components\/users\/set-password-form['"]/,
    );
  });
});
