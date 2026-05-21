import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Phase 11 Plan 11-09 Task 2 — `SessionInvoicesBlock` (Server Component).
 *
 * Approche source-regex (pattern Plan 11-09 Task 1 + Phase 9.1 smoke tests).
 *
 * Couverture (6+ grep tests) :
 *   1. PAS de directive 'use client' (Server Component async)
 *   2. importe prisma depuis @qualiof/db
 *   3. where Prisma OR: [{ sessionId }, { participant: { sessionId } }] (D-07)
 *   4. where Prisma scope tenantId (defense-in-depth multi-tenant)
 *   5. Empty state verbatim "Aucune facture liée à cette session"
 *   6. Cross-nav Link `/app/factures/${inv.id}`
 *   7. Badge "AVO" conditional sur status CREDIT_NOTE + lien vers facture originale
 *   8. exporte SessionInvoicesBlock async
 */

const SOURCE = readFileSync(
  path.join(__dirname, '..', 'session-invoices-block.tsx'),
  'utf-8',
);

describe('SessionInvoicesBlock — source regex (Phase 11 Plan 11-09)', () => {
  it("Test 1 — PAS de directive 'use client' (Server Component async)", () => {
    expect(SOURCE).not.toMatch(/^'use client'/);
    expect(SOURCE).not.toMatch(/^"use client"/);
  });

  it('Test 2 — importe prisma depuis @qualiof/db', () => {
    expect(SOURCE).toMatch(/from\s+['"]@qualiof\/db['"]/);
    expect(SOURCE).toContain('prisma');
  });

  it('Test 3 — where Prisma OR [sessionId, participant.sessionId] (D-07)', () => {
    expect(SOURCE).toMatch(/OR:\s*\[/);
    // soit `{ sessionId }` direct, soit via la relation `participant: { sessionId }`
    expect(SOURCE).toMatch(/sessionId/);
    expect(SOURCE).toMatch(/participant:\s*\{\s*sessionId/);
  });

  it('Test 4 — where Prisma scope tenantId (defense-in-depth)', () => {
    expect(SOURCE).toMatch(/where:\s*\{[\s\S]*?tenantId/);
  });

  it('Test 5 — empty state verbatim "Aucune facture liée à cette session"', () => {
    expect(SOURCE).toContain('Aucune facture liée à cette session');
  });

  it('Test 6 — cross-nav Link `/app/factures/${inv.id}` (D-07)', () => {
    expect(SOURCE).toMatch(/\/app\/factures\/\$\{[a-zA-Z_]+\.id\}/);
  });

  it("Test 7 — badge 'AVO' conditional sur status CREDIT_NOTE + lien facture origine", () => {
    expect(SOURCE).toMatch(/CREDIT_NOTE/);
    expect(SOURCE).toMatch(/AVO/);
    expect(SOURCE).toMatch(/originalInvoice/);
  });

  it('Test 8 — exporte SessionInvoicesBlock async function', () => {
    expect(SOURCE).toMatch(/export\s+async\s+function\s+SessionInvoicesBlock/);
  });
});
