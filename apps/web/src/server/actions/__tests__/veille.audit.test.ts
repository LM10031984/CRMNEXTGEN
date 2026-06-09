/**
 * Phase 13 Plan 02 Task 0 (Wave 0) — Tests AuditLog instanciation via
 * `logRegulatoryWatchEvent` sur les 5 mutations veille (VEILLE-02 D-Phase 13).
 *
 * Contrat (cf. 13-CONTEXT.md §AuditLog convention + 13-01-SUMMARY.md helper) :
 *  - updateExploitation → action='regulatoryWatch.exploitation_updated' + diff before/after
 *  - approveWatch       → action='regulatoryWatch.approved'             + diff status
 *  - rejectWatch        → action='regulatoryWatch.rejected'             + diff status+reason
 *  - archiveWatch       → action='regulatoryWatch.archived'             + diff status
 *  - createWatch        → action='regulatoryWatch.created'              + diff theme+title
 *
 * Stratégie : on mock `logRegulatoryWatchEvent` (helper Plan 01) et on vérifie
 * que l'action attendue + le diff attendu sont passés.
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

vi.mock('@/lib/regulatoryWatch-audit', () => ({
  logRegulatoryWatchEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { prisma } from '@qualiof/db';
import { requireRole } from '@/lib/rbac';
import { logRegulatoryWatchEvent } from '@/lib/regulatoryWatch-audit';
import {
  createWatch,
  updateExploitation,
  approveWatch,
  rejectWatch,
  archiveWatch,
} from '../veille';

const requireRoleMock = requireRole as unknown as ReturnType<typeof vi.fn>;
const watchFindFirst = prisma.regulatoryWatch.findFirst as unknown as ReturnType<typeof vi.fn>;
const watchCreate = prisma.regulatoryWatch.create as unknown as ReturnType<typeof vi.fn>;
const watchUpdate = prisma.regulatoryWatch.update as unknown as ReturnType<typeof vi.fn>;
const logEventMock = logRegulatoryWatchEvent as unknown as ReturnType<typeof vi.fn>;

const ADMIN_USER = {
  id: 'user-admin',
  tenantId: 'tenant-1',
  email: 'admin@test.fr',
  role: 'ADMIN',
};

const VALID_UUID = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue(ADMIN_USER);
  logEventMock.mockResolvedValue(undefined);
});

describe('veille AuditLog instanciation', () => {
  it("Test 1 — updateExploitation appelle logRegulatoryWatchEvent action='regulatoryWatch.exploitation_updated'", async () => {
    watchFindFirst.mockResolvedValueOnce({
      id: VALID_UUID,
      exploitation: 'ancien',
    });
    watchUpdate.mockResolvedValueOnce({});

    await updateExploitation({
      id: VALID_UUID,
      exploitation: 'nouveau',
    });

    expect(logEventMock).toHaveBeenCalledTimes(1);
    const arg = logEventMock.mock.calls[0]![0];
    expect(arg.action).toBe('regulatoryWatch.exploitation_updated');
    expect(arg.tenantId).toBe('tenant-1');
    expect(arg.actorUserId).toBe('user-admin');
    expect(arg.targetWatchId).toBe(VALID_UUID);
  });

  it('Test 2 — updateExploitation diff inclut before/after de exploitation', async () => {
    watchFindFirst.mockResolvedValueOnce({
      id: VALID_UUID,
      exploitation: 'ancien texte exploitation',
    });
    watchUpdate.mockResolvedValueOnce({});

    await updateExploitation({
      id: VALID_UUID,
      exploitation: 'nouveau texte exploitation',
    });

    const arg = logEventMock.mock.calls[0]![0];
    expect(arg.diff).toBeDefined();
    expect(arg.diff.exploitation).toEqual({
      before: 'ancien texte exploitation',
      after: 'nouveau texte exploitation',
    });
  });

  it("Test 3 — approveWatch → action='regulatoryWatch.approved' + diff status DRAFT→ACTIVE", async () => {
    watchFindFirst.mockResolvedValueOnce({
      id: VALID_UUID,
      status: 'DRAFT',
      suggestedBy: 'AUTO',
    });
    watchUpdate.mockResolvedValueOnce({});

    await approveWatch(VALID_UUID);

    expect(logEventMock).toHaveBeenCalledTimes(1);
    const arg = logEventMock.mock.calls[0]![0];
    expect(arg.action).toBe('regulatoryWatch.approved');
    expect(arg.diff.status).toEqual({ before: 'DRAFT', after: 'ACTIVE' });
  });

  it("Test 4 — rejectWatch → action='regulatoryWatch.rejected' avec reason dans diff", async () => {
    watchFindFirst.mockResolvedValueOnce({
      id: VALID_UUID,
      status: 'DRAFT',
      suggestedBy: 'AUTO',
    });
    watchUpdate.mockResolvedValueOnce({});

    await rejectWatch({ id: VALID_UUID, reason: 'Source non pertinente pour notre OF' });

    expect(logEventMock).toHaveBeenCalledTimes(1);
    const arg = logEventMock.mock.calls[0]![0];
    expect(arg.action).toBe('regulatoryWatch.rejected');
    expect(arg.diff.rejectionReason).toBe('Source non pertinente pour notre OF');
    expect(arg.diff.status).toEqual({ before: 'DRAFT', after: 'ARCHIVED' });
  });

  it("Test 5 — archiveWatch → action='regulatoryWatch.archived' + diff status", async () => {
    watchFindFirst.mockResolvedValueOnce({
      id: VALID_UUID,
      status: 'ACTIVE',
    });
    watchUpdate.mockResolvedValueOnce({});

    await archiveWatch(VALID_UUID);

    expect(logEventMock).toHaveBeenCalledTimes(1);
    const arg = logEventMock.mock.calls[0]![0];
    expect(arg.action).toBe('regulatoryWatch.archived');
    expect(arg.diff.status).toEqual({ before: 'ACTIVE', after: 'ARCHIVED' });
  });

  it("Test 6 — createWatch → action='regulatoryWatch.created' + diff theme+title", async () => {
    watchCreate.mockResolvedValueOnce({ id: 'new-watch-1' });

    await createWatch({
      theme: 'INDIC_24',
      title: 'Nouvelle source secteur immo',
    });

    expect(logEventMock).toHaveBeenCalledTimes(1);
    const arg = logEventMock.mock.calls[0]![0];
    expect(arg.action).toBe('regulatoryWatch.created');
    expect(arg.targetWatchId).toBe('new-watch-1');
    expect(arg.diff.theme).toBe('INDIC_24');
    expect(arg.diff.title).toBe('Nouvelle source secteur immo');
  });
});
