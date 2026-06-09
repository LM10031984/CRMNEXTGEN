import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests comportementaux P1.2 — `updateSessionDetails`.
 *
 * Cible : la convergence `'' / '   ' → null` via le helper centralisé
 * `normalizeNullableText`, et le no-op qui n'écrit PAS d'AuditLog.
 *
 * Stratégie de mock (pattern Phase 11) :
 *  - `@qualiof/db`   → prisma mocké (trainingSession.findFirst/update + auditLog.create + $transaction)
 *  - `@/lib/rbac`    → requireRole mocké
 *  - `next/cache`    → revalidatePath no-op
 */

vi.mock('@qualiof/db', () => ({
  prisma: {
    trainingSession: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  Prisma: {
    Decimal: class {
      private v: number;
      constructor(v: number | string) {
        this.v = typeof v === 'string' ? parseFloat(v) : v;
      }
      toString() { return String(this.v); }
      toNumber() { return this.v; }
      valueOf() { return this.v; }
    },
  },
  Modality: { PRESENTIEL: 'PRESENTIEL', DISTANCIEL: 'DISTANCIEL', MIXTE: 'MIXTE' },
  UserRole: {
    ADMIN: 'ADMIN', MANAGER: 'MANAGER', FORMATEUR: 'FORMATEUR',
    COMMERCIAL: 'COMMERCIAL', COMPTABLE: 'COMPTABLE', LECTEUR: 'LECTEUR',
  },
  LegalForm: {
    SAS: 'SAS', SA: 'SA', SARL: 'SARL', SASU: 'SASU', EURL: 'EURL',
    EI: 'EI', EIRL: 'EIRL', AUTO_ENTREPRENEUR: 'AUTO_ENTREPRENEUR',
    PARTICULIER: 'PARTICULIER', ASSOCIATION: 'ASSOCIATION', AUTRE: 'AUTRE',
  },
  SessionStatus: {
    DRAFT: 'DRAFT', PLANNED: 'PLANNED', OPEN: 'OPEN',
    VALIDATED: 'VALIDATED', IN_PROGRESS: 'IN_PROGRESS',
    COMPLETED: 'COMPLETED', CANCELLED: 'CANCELLED',
  },
  EnrollmentStatus: {
    PRE_ENROLLED: 'PRE_ENROLLED', CONFIRMED: 'CONFIRMED',
    ATTENDED: 'ATTENDED', NO_SHOW: 'NO_SHOW', CANCELLED: 'CANCELLED',
  },
  LinkRole: {
    EI_SELF: 'EI_SELF', AGENT_COMMERCIAL: 'AGENT_COMMERCIAL',
    SALARIE: 'SALARIE', DIRIGEANT: 'DIRIGEANT', FORMATEUR: 'FORMATEUR',
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

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { prisma } from '@qualiof/db';
import { requireRole } from '@/lib/rbac';
import { updateSessionDetails } from '../sessions';

const sessionFindFirst = prisma.trainingSession.findFirst as unknown as ReturnType<typeof vi.fn>;
const sessionUpdate = prisma.trainingSession.update as unknown as ReturnType<typeof vi.fn>;
const auditLogCreate = prisma.auditLog.create as unknown as ReturnType<typeof vi.fn>;
const $transaction = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;
const requireRoleMock = requireRole as unknown as ReturnType<typeof vi.fn>;

const SESSION_ID = '11111111-1111-1111-1111-111111111111';
const FAKE_ADMIN = {
  id: 'user-1',
  tenantId: 'tenant-1',
  email: 'admin@test.fr',
  role: 'ADMIN',
};

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    tenantId: 'tenant-1',
    name: 'Existing name',
    startDate: new Date('2026-09-01T09:00:00Z'),
    endDate: new Date('2026-09-03T17:00:00Z'),
    capacityMin: 4,
    capacityMax: 12,
    modality: 'PRESENTIEL',
    pricePerLearner: null,
    language: 'fr',
    internalNotes: 'Existing notes',
    ...overrides,
  };
}

beforeEach(() => {
  sessionFindFirst.mockReset();
  sessionUpdate.mockReset();
  auditLogCreate.mockReset();
  $transaction.mockReset();
  requireRoleMock.mockReset();

  requireRoleMock.mockResolvedValue(FAKE_ADMIN);
  sessionUpdate.mockResolvedValue({ id: SESSION_ID });
  auditLogCreate.mockResolvedValue({ id: 'audit-1' });
  // $transaction([promise1, promise2]) → exécute les promesses, capture les deux ops.
  $transaction.mockImplementation(async (ops: unknown) => {
    if (Array.isArray(ops)) return Promise.all(ops);
    return [];
  });
});

describe('updateSessionDetails — convergence nullable (P1.2)', () => {
  it("Test 1 — name: '' converge vers null en BDD + AuditLog écrit", async () => {
    sessionFindFirst.mockResolvedValueOnce(makeSession({ name: 'Existing' }));

    const res = await updateSessionDetails({ sessionId: SESSION_ID, name: '' });

    expect(res.ok).toBe(true);
    expect(sessionUpdate).toHaveBeenCalledTimes(1);
    const updateArgs = sessionUpdate.mock.calls[0]![0];
    expect(updateArgs.data.name).toBeNull();

    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    const auditDiff = auditLogCreate.mock.calls[0]![0].data.diff;
    expect(auditDiff.before.name).toBe('Existing');
    expect(auditDiff.after.name).toBeNull();
  });

  it("Test 2 — name: '   ' (whitespace-only) converge vers null en BDD", async () => {
    sessionFindFirst.mockResolvedValueOnce(makeSession({ name: 'Existing' }));

    const res = await updateSessionDetails({ sessionId: SESSION_ID, name: '   ' });

    expect(res.ok).toBe(true);
    expect(sessionUpdate).toHaveBeenCalledTimes(1);
    expect(sessionUpdate.mock.calls[0]![0].data.name).toBeNull();
  });

  it('Test 3 — name texte non-vide est trimé + préservé', async () => {
    sessionFindFirst.mockResolvedValueOnce(makeSession({ name: 'Old' }));

    const res = await updateSessionDetails({
      sessionId: SESSION_ID,
      name: '  Nouveau nom  ',
    });

    expect(res.ok).toBe(true);
    expect(sessionUpdate.mock.calls[0]![0].data.name).toBe('Nouveau nom');
  });

  it("Test 4 — internalNotes: '   ' converge vers null en BDD", async () => {
    sessionFindFirst.mockResolvedValueOnce(
      makeSession({ internalNotes: 'Notes en cours' }),
    );

    const res = await updateSessionDetails({
      sessionId: SESSION_ID,
      internalNotes: '   ',
    });

    expect(res.ok).toBe(true);
    expect(sessionUpdate).toHaveBeenCalledTimes(1);
    expect(sessionUpdate.mock.calls[0]![0].data.internalNotes).toBeNull();
  });

  it('Test 5 — internalNotes texte non-vide préservé (trim externe)', async () => {
    sessionFindFirst.mockResolvedValueOnce(makeSession({ internalNotes: null }));

    const res = await updateSessionDetails({
      sessionId: SESSION_ID,
      internalNotes: '  À rappeler le client  ',
    });

    expect(res.ok).toBe(true);
    expect(sessionUpdate.mock.calls[0]![0].data.internalNotes).toBe(
      'À rappeler le client',
    );
  });
});

describe('updateSessionDetails — no-op (P1.2 acceptance gate)', () => {
  it("Test 6 — name identique à l'existant : ni update ni AuditLog écrit", async () => {
    sessionFindFirst.mockResolvedValueOnce(makeSession({ name: 'Same name' }));

    const res = await updateSessionDetails({
      sessionId: SESSION_ID,
      name: 'Same name',
    });

    expect(res.ok).toBe(true);
    expect(sessionUpdate).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
    expect($transaction).not.toHaveBeenCalled();
  });

  it("Test 7 — name: '   ' alors que session.name est déjà null : pas d'AuditLog (faux changement)", async () => {
    sessionFindFirst.mockResolvedValueOnce(makeSession({ name: null }));

    const res = await updateSessionDetails({ sessionId: SESSION_ID, name: '   ' });

    expect(res.ok).toBe(true);
    expect(sessionUpdate).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it("Test 8 — internalNotes: '' alors que session.internalNotes est déjà null : pas d'AuditLog", async () => {
    sessionFindFirst.mockResolvedValueOnce(makeSession({ internalNotes: null }));

    const res = await updateSessionDetails({
      sessionId: SESSION_ID,
      internalNotes: '',
    });

    expect(res.ok).toBe(true);
    expect(sessionUpdate).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });
});
