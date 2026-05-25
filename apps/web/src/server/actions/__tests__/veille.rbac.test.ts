/**
 * Phase 13 Plan 02 Task 0 (Wave 0) — Tests RBAC strict pour les 6 server actions veille.
 *
 * Contrat (cf. 13-02-PLAN.md must_haves.truths + D-03 CONTEXT) :
 *  - createWatch / updateWatch / updateExploitation / approveWatch / rejectWatch
 *    / archiveWatch : `requireRole(['ADMIN','MANAGER'])` → ForbiddenError pour
 *    tout autre rôle (LECTEUR/COMMERCIAL/COMPTABLE/FORMATEUR).
 *  - Le test capture le retour `{ok:false}` qui suit le `catch (ForbiddenError)`.
 *
 * Mock pattern Phase 9 (leads.test.ts) : on mock `@/lib/auth` AVANT `@/lib/rbac`
 * pour empêcher la cascade vers `cache()` React Server Components.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@qualiof/db', () => ({
  prisma: {
    regulatoryWatch: {
      findFirst: vi.fn(),
      create: vi.fn(),
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

vi.mock('@/lib/regulatoryWatch-audit', () => ({
  logRegulatoryWatchEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { prisma } from '@qualiof/db';
import { requireRole, ForbiddenError } from '@/lib/rbac';
import {
  createWatch,
  updateWatch,
  updateExploitation,
  approveWatch,
  rejectWatch,
  archiveWatch,
} from '../veille';

const requireRoleMock = requireRole as unknown as ReturnType<typeof vi.fn>;
const watchCreate = prisma.regulatoryWatch.create as unknown as ReturnType<typeof vi.fn>;
const watchFindFirst = prisma.regulatoryWatch.findFirst as unknown as ReturnType<typeof vi.fn>;
const watchUpdate = prisma.regulatoryWatch.update as unknown as ReturnType<typeof vi.fn>;

const ADMIN_USER = {
  id: 'user-admin',
  tenantId: 'tenant-1',
  email: 'admin@test.fr',
  role: 'ADMIN',
};

const VALID_UUID = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('veille server actions — RBAC strict (D-03 LECTEUR sans inbox)', () => {
  it('Test 1 — createWatch : LECTEUR rejeté avec ForbiddenError → {ok:false}', async () => {
    requireRoleMock.mockRejectedValueOnce(new ForbiddenError('Rôle LECTEUR non autorisé'));
    const r = await createWatch({ theme: 'INDIC_23', title: 'Source test' });
    expect(r.ok).toBe(false);
    expect(watchCreate).not.toHaveBeenCalled();
  });

  it('Test 2 — updateWatch : LECTEUR rejeté avec ForbiddenError → {ok:false}', async () => {
    requireRoleMock.mockRejectedValueOnce(new ForbiddenError('Rôle LECTEUR non autorisé'));
    const r = await updateWatch({ id: VALID_UUID, title: 'New title' });
    expect(r.ok).toBe(false);
    expect(watchUpdate).not.toHaveBeenCalled();
  });

  it('Test 3 — updateExploitation : COMMERCIAL rejeté avec ForbiddenError → {ok:false}', async () => {
    requireRoleMock.mockRejectedValueOnce(new ForbiddenError('Rôle COMMERCIAL non autorisé'));
    const r = await updateExploitation({ id: VALID_UUID, exploitation: 'maj' });
    expect(r.ok).toBe(false);
    expect(watchUpdate).not.toHaveBeenCalled();
  });

  it('Test 4 — approveWatch : COMPTABLE rejeté avec ForbiddenError → {ok:false}', async () => {
    requireRoleMock.mockRejectedValueOnce(new ForbiddenError('Rôle COMPTABLE non autorisé'));
    const r = await approveWatch(VALID_UUID);
    expect(r.ok).toBe(false);
    expect(watchFindFirst).not.toHaveBeenCalled();
  });

  it('Test 5 — rejectWatch : FORMATEUR rejeté avec ForbiddenError → {ok:false}', async () => {
    requireRoleMock.mockRejectedValueOnce(new ForbiddenError('Rôle FORMATEUR non autorisé'));
    const r = await rejectWatch({ id: VALID_UUID, reason: 'pas pertinent' });
    expect(r.ok).toBe(false);
    expect(watchFindFirst).not.toHaveBeenCalled();
  });

  it('Test 6 — archiveWatch : LECTEUR rejeté avec ForbiddenError → {ok:false}', async () => {
    requireRoleMock.mockRejectedValueOnce(new ForbiddenError('Rôle LECTEUR non autorisé'));
    const r = await archiveWatch(VALID_UUID);
    expect(r.ok).toBe(false);
    expect(watchUpdate).not.toHaveBeenCalled();
  });

  it('Test 7 — createWatch : ADMIN autorisé → path nominal {ok:true, watchId}', async () => {
    requireRoleMock.mockResolvedValueOnce(ADMIN_USER);
    watchCreate.mockResolvedValueOnce({ id: 'new-watch-1' });
    const r = await createWatch({ theme: 'INDIC_23', title: 'Source test ADMIN' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.watchId).toBe('new-watch-1');
    }
    expect(watchCreate).toHaveBeenCalledTimes(1);
    // Le tenantId doit être propagé dans le create (defense-in-depth).
    expect(watchCreate.mock.calls[0]![0].data.tenantId).toBe('tenant-1');
  });

  it('Test 8 — approveWatch : MANAGER autorisé sur draft AUTO → status ACTIVE', async () => {
    const MANAGER_USER = { ...ADMIN_USER, id: 'user-manager', role: 'MANAGER' };
    requireRoleMock.mockResolvedValueOnce(MANAGER_USER);
    watchFindFirst.mockResolvedValueOnce({
      id: VALID_UUID,
      status: 'DRAFT',
      suggestedBy: 'AUTO',
    });
    watchUpdate.mockResolvedValueOnce({});
    const r = await approveWatch(VALID_UUID);
    expect(r.ok).toBe(true);
    expect(watchUpdate).toHaveBeenCalledTimes(1);
    expect(watchUpdate.mock.calls[0]![0].data.status).toBe('ACTIVE');
  });
});
