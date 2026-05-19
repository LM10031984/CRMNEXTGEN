import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests Phase 11 Plan 11-04 Task 2 — Server Action `updateInvoiceReminderSettings`.
 *
 * Stratégie de mock (pattern Phase 7 tenant-settings.test.ts) :
 *  - `@qualiof/db` → prisma mocké (tenant.findUnique/update + auditLog.create)
 *  - `@/lib/rbac` → requireRole mocké (default = ADMIN authentifié)
 *  - `next/cache` → revalidatePath no-op
 *
 * Coverage (6 tests acceptance + extras défensifs) :
 *  1. Input valide ADMIN → { ok: true } + tenant.update + auditLog.create
 *  2. RBAC MANAGER → { ok: false, error: 'Forbidden...' } (ForbiddenError)
 *  3. RBAC unauthenticated → { ok: false, error: 'Non authentifié' }
 *  4. Zod invalide (array non croissant) → { ok: false, fieldErrors }
 *  5. revalidatePath('/app/parametres') appelé sur succès
 *  6. computeDiff before/after passé à logTenantSettingsChange
 *
 * Plus 2 tests bonus :
 *  - creditNotePrefix optional omis → update SANS prefix
 *  - no-op : aucun changement → pas d'AuditLog
 */

vi.mock('@qualiof/db', () => ({
  prisma: {
    tenant: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock('@/lib/rbac', () => {
  class UnauthorizedError extends Error {
    constructor(msg = 'Non authentifié') {
      super(msg);
      this.name = 'UnauthorizedError';
    }
  }
  class ForbiddenError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'ForbiddenError';
    }
  }
  return {
    requireRole: vi.fn(),
    hasRole: vi.fn(),
    UnauthorizedError,
    ForbiddenError,
  };
});

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { prisma } from '@qualiof/db';
import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import { revalidatePath } from 'next/cache';
import { updateInvoiceReminderSettings } from '../invoice-settings';

const tenantFindUnique = prisma.tenant.findUnique as unknown as ReturnType<typeof vi.fn>;
const tenantUpdate = prisma.tenant.update as unknown as ReturnType<typeof vi.fn>;
const auditLogCreate = prisma.auditLog.create as unknown as ReturnType<typeof vi.fn>;
const requireRoleMock = requireRole as unknown as ReturnType<typeof vi.fn>;
const revalidatePathMock = revalidatePath as unknown as ReturnType<typeof vi.fn>;

const FAKE_ADMIN = { id: 'user-1', tenantId: 'tenant-1', role: 'ADMIN' };

beforeEach(() => {
  tenantFindUnique.mockReset();
  tenantUpdate.mockReset();
  auditLogCreate.mockReset();
  requireRoleMock.mockReset();
  revalidatePathMock.mockReset();
  requireRoleMock.mockResolvedValue(FAKE_ADMIN);
});

describe('updateInvoiceReminderSettings', () => {
  it("Test 1 — input valide ADMIN → { ok: true } + tenant.update + AuditLog 'parameters.update'", async () => {
    tenantFindUnique.mockResolvedValueOnce({
      invoiceReminderDays: [30, 45],
      creditNotePrefix: 'AVO',
    });
    tenantUpdate.mockResolvedValueOnce({
      invoiceReminderDays: [30, 45, 60],
      creditNotePrefix: 'AVO',
    });

    const result = await updateInvoiceReminderSettings({
      invoiceReminderDays: [30, 45, 60],
      creditNotePrefix: 'AVO',
    });

    expect(result).toEqual({ ok: true });
    expect(tenantUpdate).toHaveBeenCalledWith({
      where: { id: 'tenant-1' },
      data: expect.objectContaining({
        invoiceReminderDays: [30, 45, 60],
        creditNotePrefix: 'AVO',
      }),
      select: { invoiceReminderDays: true, creditNotePrefix: true },
    });
    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    const call = auditLogCreate.mock.calls[0]![0];
    expect(call.data.entity).toBe('Tenant');
    expect(call.data.entityId).toBe('tenant-1');
    expect(call.data.action).toBe('parameters.update');
    expect(call.data.userId).toBe('user-1');
  });

  it("Test 2 — RBAC MANAGER → ForbiddenError → { ok: false, error: ... }", async () => {
    requireRoleMock.mockRejectedValueOnce(new ForbiddenError('Rôle MANAGER non autorisé'));

    const result = await updateInvoiceReminderSettings({
      invoiceReminderDays: [30, 45],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/MANAGER|non autorisé/i);
    }
    expect(tenantUpdate).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it("Test 3 — RBAC unauthenticated → UnauthorizedError → { ok: false, error: 'Non authentifié' }", async () => {
    requireRoleMock.mockRejectedValueOnce(new UnauthorizedError());

    const result = await updateInvoiceReminderSettings({
      invoiceReminderDays: [30, 45],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/authentifi/i);
    }
    expect(tenantUpdate).not.toHaveBeenCalled();
  });

  it('Test 4 — Zod invalide (array non croissant [45, 30]) → { ok: false } sans toucher BDD', async () => {
    const result = await updateInvoiceReminderSettings({
      invoiceReminderDays: [45, 30],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Validation|croissants/i);
    }
    expect(tenantFindUnique).not.toHaveBeenCalled();
    expect(tenantUpdate).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it("Test 5 — revalidatePath('/app/parametres') appelé sur succès", async () => {
    tenantFindUnique.mockResolvedValueOnce({
      invoiceReminderDays: [30, 45],
      creditNotePrefix: 'AVO',
    });
    tenantUpdate.mockResolvedValueOnce({
      invoiceReminderDays: [30, 60],
      creditNotePrefix: 'AVO',
    });

    await updateInvoiceReminderSettings({
      invoiceReminderDays: [30, 60],
    });

    expect(revalidatePathMock).toHaveBeenCalledWith('/app/parametres');
  });

  it('Test 6 — computeDiff before/after passé à logTenantSettingsChange', async () => {
    tenantFindUnique.mockResolvedValueOnce({
      invoiceReminderDays: [30, 45],
      creditNotePrefix: 'AVO',
    });
    tenantUpdate.mockResolvedValueOnce({
      invoiceReminderDays: [30, 45, 60],
      creditNotePrefix: 'NC',
    });

    await updateInvoiceReminderSettings({
      invoiceReminderDays: [30, 45, 60],
      creditNotePrefix: 'NC',
    });

    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    const call = auditLogCreate.mock.calls[0]![0];
    // diff contient les 2 changements
    expect(call.data.diff.creditNotePrefix).toEqual({ before: 'AVO', after: 'NC' });
    // invoiceReminderDays comparé via JSON.stringify (helper Phase 7 computeDiff)
    expect(call.data.diff.invoiceReminderDays).toBeDefined();
  });

  it('Test 7 — creditNotePrefix omis → tenant.update sans la clé creditNotePrefix', async () => {
    tenantFindUnique.mockResolvedValueOnce({
      invoiceReminderDays: [30, 45],
      creditNotePrefix: 'AVO',
    });
    tenantUpdate.mockResolvedValueOnce({
      invoiceReminderDays: [30, 60],
      creditNotePrefix: 'AVO',
    });

    await updateInvoiceReminderSettings({
      invoiceReminderDays: [30, 60],
    });

    const updateCall = tenantUpdate.mock.calls[0]![0];
    expect(updateCall.data.invoiceReminderDays).toEqual([30, 60]);
    // Le champ creditNotePrefix ne doit PAS être inclus si omis (préservé en BDD)
    expect('creditNotePrefix' in updateCall.data).toBe(false);
  });

  it("Test 8 — no-op (aucun changement) → PAS d'AuditLog créé", async () => {
    tenantFindUnique.mockResolvedValueOnce({
      invoiceReminderDays: [30, 45],
      creditNotePrefix: 'AVO',
    });
    tenantUpdate.mockResolvedValueOnce({
      invoiceReminderDays: [30, 45],
      creditNotePrefix: 'AVO',
    });

    const result = await updateInvoiceReminderSettings({
      invoiceReminderDays: [30, 45],
      creditNotePrefix: 'AVO',
    });

    // Phase 7 helper logTenantSettingsChange : no-op si diff vide
    expect(result.ok).toBe(true);
    expect(auditLogCreate).not.toHaveBeenCalled();
  });
});
