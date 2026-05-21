import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Phase 11 Plan 11-09 Task 1 — `LearnerInvoicesBlock` (Server Component).
 *
 * Approche source-regex (pattern Phase 9 smoke tests + Plan 11-08).
 *
 * On évite React Testing Library car le composant utilise `prisma` côté
 * server (RSC async) — pas montable dans un env node sans mock complexe.
 * Le rendu visuel est validé manuellement (cf 11-VALIDATION.md).
 *
 * Couverture (6+ grep tests) :
 *   1. PAS de directive 'use client' (Server Component)
 *   2. importe prisma depuis @qualiof/db
 *   3. where clause Prisma : `participant: { personId }` (filtre apprenant)
 *   4. where clause Prisma : `tenantId` (defense-in-depth multi-tenant)
 *   5. Empty state verbatim "Aucune facture liée à cet apprenant"
 *   6. Cross-nav Link /app/factures/${inv.id}
 *   7. Badge "AVO" conditional sur status CREDIT_NOTE (D-07)
 */

const SOURCE = readFileSync(
  path.join(__dirname, '..', 'learner-invoices-block.tsx'),
  'utf-8',
);

describe('LearnerInvoicesBlock — source regex (Phase 11 Plan 11-09)', () => {
  it("Test 1 — PAS de directive 'use client' (Server Component async)", () => {
    expect(SOURCE).not.toMatch(/^'use client'/);
    expect(SOURCE).not.toMatch(/^"use client"/);
  });

  it('Test 2 — importe prisma depuis @qualiof/db', () => {
    expect(SOURCE).toMatch(/from\s+['"]@qualiof\/db['"]/);
    expect(SOURCE).toContain('prisma');
  });

  it('Test 3 — where Prisma scope participant.personId (filtre apprenant)', () => {
    expect(SOURCE).toMatch(/participant:\s*\{\s*personId/);
  });

  it('Test 4 — where Prisma scope tenantId (defense-in-depth)', () => {
    expect(SOURCE).toMatch(/tenantId/);
    // Vérifie qu'on l'utilise bien dans le where, pas juste en interface
    expect(SOURCE).toMatch(/where:\s*\{[\s\S]*?tenantId/);
  });

  it('Test 5 — empty state verbatim "Aucune facture liée à cet apprenant"', () => {
    expect(SOURCE).toContain('Aucune facture liée à cet apprenant');
  });

  it('Test 6 — cross-nav Link `/app/factures/${inv.id}` (D-07)', () => {
    expect(SOURCE).toMatch(/\/app\/factures\/\$\{[a-zA-Z_]+\.id\}/);
  });

  it("Test 7 — badge 'AVO' conditional sur status CREDIT_NOTE (D-07)", () => {
    expect(SOURCE).toMatch(/CREDIT_NOTE/);
    expect(SOURCE).toMatch(/AVO/);
  });

  it('Test 8 — exporte LearnerInvoicesBlock async function', () => {
    expect(SOURCE).toMatch(/export\s+async\s+function\s+LearnerInvoicesBlock/);
  });
});
