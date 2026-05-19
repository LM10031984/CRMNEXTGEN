import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests Phase 11 Plan 11-01 — getNextCreditNoteNumber (séquence AVO-NNNNNN).
 *
 * Clone-strict du pattern Phase 7 (numbering.test.ts) pour `getNextInvoiceNumber`.
 *
 * Coverage :
 *  - Test 1 : aucun avoir + prefix='AVO' → 'AVO-000001'
 *  - Test 2 : dernier avoir 'AVO-000041' → 'AVO-000042'
 *  - Test 3 : prefix custom 'NC' → 'NC-000001'
 *  - Test 4 : Tenant.creditNotePrefix null → fallback 'AVO'
 *  - Test 5 : utilise bien le `tx` fourni (atomicité transactional)
 *  - Test 6 : filtre `startsWith: 'AVO-'` n'inclut pas les factures 'FAC-'
 *
 * Stratégie de mock identique à numbering.test.ts : on remplace `@qualiof/db`
 * par un objet exposant un prisma singleton dont les méthodes sont des `vi.fn()`.
 */

// Mock du package `@qualiof/db` AVANT l'import du SUT.
vi.mock('@qualiof/db', () => {
  return {
    prisma: {
      tenant: { findUnique: vi.fn() },
      invoice: { findFirst: vi.fn() },
    },
  };
});

// Import après le mock pour que le SUT capture les références mockées.
import { prisma } from '@qualiof/db';
import { getNextCreditNoteNumber } from '../numbering';

const tenantFindUnique = prisma.tenant.findUnique as unknown as ReturnType<typeof vi.fn>;
const invoiceFindFirst = prisma.invoice.findFirst as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  tenantFindUnique.mockReset();
  invoiceFindFirst.mockReset();
});

describe('getNextCreditNoteNumber', () => {
  it("Test 1 — pas d'avoir + prefix 'AVO' → AVO-000001", async () => {
    tenantFindUnique.mockResolvedValueOnce({ creditNotePrefix: 'AVO' });
    invoiceFindFirst.mockResolvedValueOnce(null);

    const num = await getNextCreditNoteNumber('tenant1');

    expect(num).toBe('AVO-000001');
    expect(tenantFindUnique).toHaveBeenCalledWith({
      where: { id: 'tenant1' },
      select: { creditNotePrefix: true },
    });
  });

  it('Test 2 — dernier avoir AVO-000041 → AVO-000042', async () => {
    tenantFindUnique.mockResolvedValueOnce({ creditNotePrefix: 'AVO' });
    invoiceFindFirst.mockResolvedValueOnce({ number: 'AVO-000041' });

    const num = await getNextCreditNoteNumber('tenant1');

    expect(num).toBe('AVO-000042');
  });

  it("Test 3 — préfixe custom 'NC' → NC-000001", async () => {
    tenantFindUnique.mockResolvedValueOnce({ creditNotePrefix: 'NC' });
    invoiceFindFirst.mockResolvedValueOnce(null);

    const num = await getNextCreditNoteNumber('tenant1');

    expect(num).toBe('NC-000001');
    // Vérifie aussi que le filtre `startsWith` utilise bien le préfixe custom
    expect(invoiceFindFirst).toHaveBeenCalledWith({
      where: { tenantId: 'tenant1', number: { startsWith: 'NC-' } },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
  });

  it("Test 4 — Tenant.creditNotePrefix = null → fallback 'AVO'", async () => {
    tenantFindUnique.mockResolvedValueOnce({ creditNotePrefix: null });
    invoiceFindFirst.mockResolvedValueOnce(null);

    const num = await getNextCreditNoteNumber('tenant1');

    expect(num).toBe('AVO-000001');
  });

  it("Test 4bis — Tenant introuvable (findUnique null) → fallback 'AVO'", async () => {
    tenantFindUnique.mockResolvedValueOnce(null);
    invoiceFindFirst.mockResolvedValueOnce(null);

    const num = await getNextCreditNoteNumber('ghost-tenant');

    expect(num).toBe('AVO-000001');
  });

  it('Test 5 — utilise le tx fourni au lieu du singleton prisma (atomicité)', async () => {
    const mockTx = {
      tenant: { findUnique: vi.fn().mockResolvedValueOnce({ creditNotePrefix: 'AVO' }) },
      invoice: { findFirst: vi.fn().mockResolvedValueOnce({ number: 'AVO-000099' }) },
    };

    const num = await getNextCreditNoteNumber(
      'tenant1',
      mockTx as unknown as Parameters<typeof getNextCreditNoteNumber>[1],
    );

    expect(num).toBe('AVO-000100');
    expect(mockTx.tenant.findUnique).toHaveBeenCalledTimes(1);
    expect(mockTx.invoice.findFirst).toHaveBeenCalledTimes(1);
    // Singletons NE doivent PAS avoir été touchés
    expect(tenantFindUnique).not.toHaveBeenCalled();
    expect(invoiceFindFirst).not.toHaveBeenCalled();
  });

  it("Test 6 — filtre startsWith 'AVO-' n'inclut pas les factures 'FAC-' (isolation)", async () => {
    tenantFindUnique.mockResolvedValueOnce({ creditNotePrefix: 'AVO' });
    invoiceFindFirst.mockResolvedValueOnce({ number: 'AVO-000005' });

    await getNextCreditNoteNumber('tenant1');

    expect(invoiceFindFirst).toHaveBeenCalledWith({
      where: { tenantId: 'tenant1', number: { startsWith: 'AVO-' } },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
  });
});
