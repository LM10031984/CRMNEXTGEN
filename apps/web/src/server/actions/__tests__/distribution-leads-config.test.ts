import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 9 Plan 09-02 Task 3 — Tests `updateLeadDistributionConfig`.
 *
 * Coverage (5 cas) :
 *  1. non-admin (MANAGER) → ForbiddenError → { ok: false, error }
 *  2. input invalide (boolean manquant) → { ok: false, fieldErrors }
 *  3. tenant inexistant → { ok: false, error: 'Tenant introuvable' }
 *  4. diff non-vide → update tenant + AuditLog row écrit avec action='leads.distribution_config'
 *  5. diff vide (toggles identiques) → AuditLog quand même écrit (pas no-op explicite)
 *
 * Mocks : @qualiof/db (tenant.findUnique/update, auditLog.create),
 *         @/lib/rbac (requireRole), next/cache (revalidatePath).
 */

vi.mock('@qualiof/db', () => ({
  prisma: {
    tenant: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
  UserRole: {
    ADMIN: 'ADMIN',
    MANAGER: 'MANAGER',
    FORMATEUR: 'FORMATEUR',
    COMMERCIAL: 'COMMERCIAL',
    COMPTABLE: 'COMPTABLE',
    LECTEUR: 'LECTEUR',
  },
  LegalForm: {
    SAS: 'SAS',
    SARL: 'SARL',
    SASU: 'SASU',
    EURL: 'EURL',
    SA: 'SA',
    EI: 'EI',
    EIRL: 'EIRL',
    AUTO_ENTREPRENEUR: 'AUTO_ENTREPRENEUR',
    AUTRE: 'AUTRE',
  },
}));

vi.mock('@/lib/auth', () => ({
  lucia: {},
  validateRequest: vi.fn(),
}));

vi.mock('@/lib/rbac', async () => {
  const actual = await vi.importActual<typeof import('@/lib/rbac')>('@/lib/rbac');
  return {
    ...actual,
    requireRole: vi.fn(),
  };
});

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { prisma } from '@qualiof/db';
import { requireRole, ForbiddenError } from '@/lib/rbac';
import { updateLeadDistributionConfig } from '../distribution-leads-config';

const tenantFindUnique = prisma.tenant.findUnique as unknown as ReturnType<typeof vi.fn>;
const tenantUpdate = prisma.tenant.update as unknown as ReturnType<typeof vi.fn>;
const auditLogCreate = prisma.auditLog.create as unknown as ReturnType<typeof vi.fn>;
const requireRoleMock = requireRole as unknown as ReturnType<typeof vi.fn>;

const ADMIN_USER = {
  id: 'admin-1',
  tenantId: 'tenant-1',
  email: 'admin@test.fr',
  role: 'ADMIN',
  firstName: 'Admin',
  lastName: 'Test',
};

beforeEach(() => {
  tenantFindUnique.mockReset();
  tenantUpdate.mockReset();
  auditLogCreate.mockReset();
  auditLogCreate.mockResolvedValue({});
  tenantUpdate.mockResolvedValue({});
  requireRoleMock.mockReset();
});

describe('updateLeadDistributionConfig', () => {
  it('Test 1 — non-admin (MANAGER) → ForbiddenError → ok:false', async () => {
    requireRoleMock.mockRejectedValueOnce(new ForbiddenError('Rôle MANAGER non autorisé'));

    const result = await updateLeadDistributionConfig({
      autoAssignLeads: true,
      notifyOnLeadAssignEmail: true,
      notifyOnLeadAssignBell: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('MANAGER');
    }
    expect(tenantUpdate).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it('Test 2 — input invalide (champ manquant) → fieldErrors', async () => {
    requireRoleMock.mockResolvedValueOnce(ADMIN_USER);

    // notifyOnLeadAssignBell manquant
    const result = await updateLeadDistributionConfig({
      autoAssignLeads: true,
      notifyOnLeadAssignEmail: false,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Validation');
      expect(result.fieldErrors).toBeDefined();
    }
    expect(tenantUpdate).not.toHaveBeenCalled();
  });

  it('Test 3 — tenant inexistant → ok:false', async () => {
    requireRoleMock.mockResolvedValueOnce(ADMIN_USER);
    tenantFindUnique.mockResolvedValueOnce(null);

    const result = await updateLeadDistributionConfig({
      autoAssignLeads: false,
      notifyOnLeadAssignEmail: false,
      notifyOnLeadAssignBell: false,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Tenant introuvable');
    }
    expect(tenantUpdate).not.toHaveBeenCalled();
  });

  it('Test 4 — diff non vide → update + AuditLog action="leads.distribution_config"', async () => {
    requireRoleMock.mockResolvedValueOnce(ADMIN_USER);
    tenantFindUnique.mockResolvedValueOnce({
      autoAssignLeads: true,
      notifyOnLeadAssignEmail: true,
      notifyOnLeadAssignBell: true,
    });

    const result = await updateLeadDistributionConfig({
      autoAssignLeads: false, // diff !
      notifyOnLeadAssignEmail: true,
      notifyOnLeadAssignBell: false, // diff !
    });

    expect(result.ok).toBe(true);
    expect(tenantUpdate).toHaveBeenCalledTimes(1);
    const updateArg = tenantUpdate.mock.calls[0]![0];
    expect(updateArg.where.id).toBe('tenant-1');
    expect(updateArg.data.autoAssignLeads).toBe(false);
    expect(updateArg.data.notifyOnLeadAssignBell).toBe(false);

    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    const auditArg = auditLogCreate.mock.calls[0]![0];
    expect(auditArg.data.entity).toBe('Tenant');
    expect(auditArg.data.entityId).toBe('tenant-1');
    expect(auditArg.data.userId).toBe('admin-1');
    expect(auditArg.data.action).toBe('leads.distribution_config');
    // Diff doit contenir les 2 champs modifies
    expect(auditArg.data.diff).toHaveProperty('autoAssignLeads');
    expect(auditArg.data.diff).toHaveProperty('notifyOnLeadAssignBell');
    expect(auditArg.data.diff).not.toHaveProperty('notifyOnLeadAssignEmail');
  });

  it('Test 5 — diff vide (toggles identiques) → AuditLog quand même écrit (pas no-op)', async () => {
    requireRoleMock.mockResolvedValueOnce(ADMIN_USER);
    tenantFindUnique.mockResolvedValueOnce({
      autoAssignLeads: true,
      notifyOnLeadAssignEmail: true,
      notifyOnLeadAssignBell: true,
    });

    const result = await updateLeadDistributionConfig({
      autoAssignLeads: true,
      notifyOnLeadAssignEmail: true,
      notifyOnLeadAssignBell: true,
    });

    expect(result.ok).toBe(true);
    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    const auditArg = auditLogCreate.mock.calls[0]![0];
    expect(auditArg.data.action).toBe('leads.distribution_config');
    expect(auditArg.data.diff).toEqual({});
  });
});
