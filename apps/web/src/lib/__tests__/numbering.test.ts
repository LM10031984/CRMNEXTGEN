import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests Phase 7 Plan 07-02 Task 2 — getNextInvoiceNumber (préfixe configurable).
 *
 * Coverage :
 *  - Test 1 : aucune facture existante + prefix = 'FAC' → 'FAC-000001'
 *  - Test 2 : dernière facture 'FAC-000041' → 'FAC-000042'
 *  - Test 3 : prefix custom 'INV' → 'INV-000001'
 *  - Test 4 : Tenant.invoicePrefix = null → fallback 'FAC'
 *  - Test 5 : utilise bien le `tx` fourni (et pas le singleton prisma global)
 *
 * Stratégie de mock : on remplace `@qualiof/db` par un objet exposant un
 * prisma singleton dont les méthodes sont des `vi.fn()`. Pour les cas où on
 * vérifie l'usage du paramètre `tx`, on construit un mockTx local et on
 * s'assure que les vi.fn() du `tx` ont été appelés (pas ceux du singleton).
 */

// Mock du package `@qualiof/db` AVANT l'import du SUT.
// Les vi.fn() sont créés dans une factory pour éviter le hoisting issue.
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
import { getNextInvoiceNumber } from '../numbering';

const tenantFindUnique = prisma.tenant.findUnique as unknown as ReturnType<typeof vi.fn>;
const invoiceFindFirst = prisma.invoice.findFirst as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  tenantFindUnique.mockReset();
  invoiceFindFirst.mockReset();
});

describe('getNextInvoiceNumber', () => {
  it("Test 1 — pas de facture + prefix 'FAC' → FAC-000001", async () => {
    tenantFindUnique.mockResolvedValueOnce({ invoicePrefix: 'FAC' });
    invoiceFindFirst.mockResolvedValueOnce(null);

    const num = await getNextInvoiceNumber('tenant1');

    expect(num).toBe('FAC-000001');
    expect(tenantFindUnique).toHaveBeenCalledWith({
      where: { id: 'tenant1' },
      select: { invoicePrefix: true },
    });
  });

  it("Test 2 — dernière facture FAC-000041 → FAC-000042", async () => {
    tenantFindUnique.mockResolvedValueOnce({ invoicePrefix: 'FAC' });
    invoiceFindFirst.mockResolvedValueOnce({ number: 'FAC-000041' });

    const num = await getNextInvoiceNumber('tenant1');

    expect(num).toBe('FAC-000042');
  });

  it("Test 3 — préfixe custom 'INV' → INV-000001", async () => {
    tenantFindUnique.mockResolvedValueOnce({ invoicePrefix: 'INV' });
    invoiceFindFirst.mockResolvedValueOnce(null);

    const num = await getNextInvoiceNumber('tenant1');

    expect(num).toBe('INV-000001');
    // Vérifie aussi que le filtre `startsWith` utilise bien le préfixe custom
    expect(invoiceFindFirst).toHaveBeenCalledWith({
      where: { tenantId: 'tenant1', number: { startsWith: 'INV-' } },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
  });

  it("Test 4 — Tenant.invoicePrefix = null → fallback 'FAC'", async () => {
    tenantFindUnique.mockResolvedValueOnce({ invoicePrefix: null });
    invoiceFindFirst.mockResolvedValueOnce(null);

    const num = await getNextInvoiceNumber('tenant1');

    expect(num).toBe('FAC-000001');
  });

  it("Test 4bis — Tenant introuvable (findUnique null) → fallback 'FAC'", async () => {
    tenantFindUnique.mockResolvedValueOnce(null);
    invoiceFindFirst.mockResolvedValueOnce(null);

    const num = await getNextInvoiceNumber('ghost-tenant');

    expect(num).toBe('FAC-000001');
  });

  it("Test 5 — utilise le tx fourni au lieu du singleton prisma", async () => {
    const mockTx = {
      tenant: { findUnique: vi.fn().mockResolvedValueOnce({ invoicePrefix: 'FAC' }) },
      invoice: { findFirst: vi.fn().mockResolvedValueOnce({ number: 'FAC-000099' }) },
    };

    const num = await getNextInvoiceNumber(
      'tenant1',
      mockTx as unknown as Parameters<typeof getNextInvoiceNumber>[1],
    );

    expect(num).toBe('FAC-000100');
    expect(mockTx.tenant.findUnique).toHaveBeenCalledTimes(1);
    expect(mockTx.invoice.findFirst).toHaveBeenCalledTimes(1);
    // Singletons NE doivent PAS avoir été touchés
    expect(tenantFindUnique).not.toHaveBeenCalled();
    expect(invoiceFindFirst).not.toHaveBeenCalled();
  });
});
