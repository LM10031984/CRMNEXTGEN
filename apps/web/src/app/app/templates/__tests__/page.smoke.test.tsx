import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Smoke test page /app/templates — Phase 12 Plan 02 (D-06 + D-09 + D-10).
 *
 * Le stub Placeholder doit avoir disparu, la page doit importer le catalogue
 * centralisé et appliquer le RBAC ADMIN+MANAGER+LECTEUR.
 */
describe('/app/templates page — Phase 12 D-06+D-09', () => {
  const pagePath = path.resolve(__dirname, '../page.tsx');
  const src = readFileSync(pagePath, 'utf-8');

  it('ne contient plus de Placeholder (stub remplacé)', () => {
    expect(src).not.toMatch(/<Placeholder\b/);
  });

  it('importe TEMPLATES_CATALOG (D-10 source unique)', () => {
    expect(src).toMatch(/TEMPLATES_CATALOG/);
  });

  it('applique requireRole ADMIN+MANAGER+LECTEUR (D-09 RBAC)', () => {
    expect(src).toMatch(
      /requireRole\(\s*\[\s*'ADMIN'\s*,\s*'MANAGER'\s*,\s*'LECTEUR'\s*\]\s*\)/,
    );
  });

  it('export default async function (Server Component)', () => {
    expect(src).toMatch(/export\s+default\s+async\s+function/);
  });
});
