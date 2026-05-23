import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests Quick task 260523-eyi — Server Action `unenrollParticipant`.
 *
 * Stratégie de mock (clone-strict pattern Phase 11 `credit-note.test.ts`) :
 *  - `@qualiof/db`               → prisma mocké (sessionParticipant.findUnique/delete + auditLog.create + $transaction)
 *  - `@/lib/auth`                → validateRequest stub (évite cascade RSC)
 *  - `@/lib/rbac`                → requireRole mocké (classes UnauthorizedError/ForbiddenError préservées)
 *  - `next/cache`                → revalidatePath no-op
 *
 * Coverage (6 cas — cf <behavior> plan 260523-eyi-01) :
 *  1. Appel sans session valide → { ok: false, error: 'Non authentifié' }
 *  2. Appel COMMERCIAL → { ok: false, error: 'Rôle COMMERCIAL non autorisé' } (RBAC durci)
 *  3. Appel ADMIN sur participantId d'un autre tenant → { ok: false, error: 'Inscription introuvable.' }
 *  4. Appel MANAGER sur participantId valide → { ok: true } + delete + auditLog
 *  5. Input invalide (string non-UUID) → { ok: false, error: <message Zod> }
 *  6. revalidatePath appelé sur /app/sessions/{sessionId} après succès
 */

vi.mock('@qualiof/db', () => ({
  prisma: {
    sessionParticipant: {
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    trainingSession: { findFirst: vi.fn() },
    person: { findFirst: vi.fn() },
    organization: { findFirst: vi.fn() },
    legalLink: { findFirst: vi.fn(), create: vi.fn() },
    document: { findFirst: vi.fn() },
    trainingProduct: { findMany: vi.fn(), findFirst: vi.fn() },
    sessionTrainer: { upsert: vi.fn(), delete: vi.fn(), updateMany: vi.fn() },
    location: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    closureBatch: { count: vi.fn() },
    invoice: { count: vi.fn() },
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
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
    JsonNull: null,
  },
  SessionStatus: {
    DRAFT: 'DRAFT', PLANNED: 'PLANNED', OPEN: 'OPEN',
    VALIDATED: 'VALIDATED', IN_PROGRESS: 'IN_PROGRESS',
    COMPLETED: 'COMPLETED', CANCELLED: 'CANCELLED',
  },
  Modality: { PRESENTIEL: 'PRESENTIEL', DISTANCIEL: 'DISTANCIEL', MIXTE: 'MIXTE' },
  EnrollmentStatus: {
    PRE_ENROLLED: 'PRE_ENROLLED', CONFIRMED: 'CONFIRMED',
    ATTENDED: 'ATTENDED', NO_SHOW: 'NO_SHOW', CANCELLED: 'CANCELLED',
  },
  LinkRole: {
    EI_SELF: 'EI_SELF', AGENT_COMMERCIAL: 'AGENT_COMMERCIAL',
    SALARIE: 'SALARIE', DIRIGEANT: 'DIRIGEANT', FORMATEUR: 'FORMATEUR',
  },
  UserRole: {
    ADMIN: 'ADMIN', MANAGER: 'MANAGER', FORMATEUR: 'FORMATEUR',
    COMMERCIAL: 'COMMERCIAL', COMPTABLE: 'COMPTABLE', LECTEUR: 'LECTEUR',
  },
  LegalForm: {
    SAS: 'SAS', SA: 'SA', SARL: 'SARL', SASU: 'SASU', EURL: 'EURL',
    EI: 'EI', EIRL: 'EIRL', AUTO_ENTREPRENEUR: 'AUTO_ENTREPRENEUR', AUTRE: 'AUTRE',
  },
}));

// Mock @/lib/auth AVANT @/lib/rbac pour empêcher la cascade vers `cache()` RSC.
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

// Mock fire-and-forget pour éviter des cascades
vi.mock('@/server/actions/closure-pack', () => ({
  generateClosurePack: vi.fn(),
}));
vi.mock('@/server/actions/convention-generator', () => ({
  generateConventionForParticipant: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

import { prisma } from '@qualiof/db';
import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import { revalidatePath } from 'next/cache';
import { unenrollParticipant } from '../sessions';

const findUnique = prisma.sessionParticipant.findUnique as unknown as ReturnType<typeof vi.fn>;
const deleteParticipant = prisma.sessionParticipant.delete as unknown as ReturnType<typeof vi.fn>;
const auditLogCreate = prisma.auditLog.create as unknown as ReturnType<typeof vi.fn>;
const $transaction = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;
const requireRoleMock = requireRole as unknown as ReturnType<typeof vi.fn>;
const revalidatePathMock = revalidatePath as unknown as ReturnType<typeof vi.fn>;

const VALID_PARTICIPANT_ID = '11111111-1111-1111-1111-111111111111';
const SESSION_ID = '22222222-2222-2222-2222-222222222222';

const FAKE_ADMIN = {
  id: 'user-1',
  tenantId: 'tenant-1',
  email: 'admin@test.fr',
  role: 'ADMIN',
};

const FAKE_MANAGER = { ...FAKE_ADMIN, role: 'MANAGER', id: 'user-mgr' };

const PARTICIPANT_BASE = {
  id: VALID_PARTICIPANT_ID,
  sessionId: SESSION_ID,
  personId: 'person-1',
  sponsorOrgId: 'org-1',
  priceHT: 1500,
  enrollmentStatus: 'CONFIRMED',
  session: { id: SESSION_ID, tenantId: 'tenant-1' },
  person: { firstName: 'Jean', lastName: 'Dupont' },
};

function setupTxPassthrough() {
  // $transaction([promise1, promise2]) → exécute les promesses
  $transaction.mockImplementation(async (operations: any) => {
    if (Array.isArray(operations)) {
      return Promise.all(operations);
    }
    // fallback callback form
    return operations({
      sessionParticipant: { delete: deleteParticipant },
      auditLog: { create: auditLogCreate },
    });
  });
}

beforeEach(() => {
  findUnique.mockReset();
  deleteParticipant.mockReset();
  auditLogCreate.mockReset();
  $transaction.mockReset();
  requireRoleMock.mockReset();
  revalidatePathMock.mockReset();

  requireRoleMock.mockResolvedValue(FAKE_ADMIN);
  deleteParticipant.mockResolvedValue({ id: VALID_PARTICIPANT_ID });
  auditLogCreate.mockResolvedValue({ id: 'audit-1' });
  setupTxPassthrough();
});

describe('unenrollParticipant', () => {
  it("Test 1 — appel sans session valide → { ok:false, error:'Non authentifié' }", async () => {
    requireRoleMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await unenrollParticipant(VALID_PARTICIPANT_ID);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/authentifi/i);
    expect(deleteParticipant).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it("Test 2 — appel COMMERCIAL → ForbiddenError (RBAC durci ADMIN+MANAGER only)", async () => {
    requireRoleMock.mockRejectedValueOnce(new ForbiddenError('Rôle COMMERCIAL non autorisé'));

    const res = await unenrollParticipant(VALID_PARTICIPANT_ID);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/COMMERCIAL|non autorisé/i);
    expect(deleteParticipant).not.toHaveBeenCalled();
    // Verify ADMIN+MANAGER only (pas COMMERCIAL)
    const allowed = requireRoleMock.mock.calls[0]![0];
    expect(allowed).toEqual(expect.arrayContaining(['ADMIN', 'MANAGER']));
    expect(allowed).not.toContain('COMMERCIAL');
  });

  it("Test 3 — ADMIN sur participantId d'un autre tenant → 'Inscription introuvable.'", async () => {
    findUnique.mockResolvedValueOnce({
      ...PARTICIPANT_BASE,
      session: { id: SESSION_ID, tenantId: 'tenant-OTHER' },
    });

    const res = await unenrollParticipant(VALID_PARTICIPANT_ID);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/introuvable/i);
    expect(deleteParticipant).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it("Test 4 — MANAGER sur participantId valide → { ok:true } + delete + auditLog", async () => {
    requireRoleMock.mockReset();
    requireRoleMock.mockResolvedValueOnce(FAKE_MANAGER);
    findUnique.mockResolvedValueOnce(PARTICIPANT_BASE);

    const res = await unenrollParticipant(VALID_PARTICIPANT_ID);

    expect(res.ok).toBe(true);
    expect(deleteParticipant).toHaveBeenCalledWith({ where: { id: VALID_PARTICIPANT_ID } });
    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    const auditCall = auditLogCreate.mock.calls[0]![0];
    expect(auditCall.data.tenantId).toBe('tenant-1');
    expect(auditCall.data.userId).toBe('user-mgr');
    expect(auditCall.data.entity).toBe('SessionParticipant');
    expect(auditCall.data.entityId).toBe(VALID_PARTICIPANT_ID);
    expect(auditCall.data.action).toBe('sessionParticipants.delete');
    expect(auditCall.data.diff).toMatchObject({
      sessionId: SESSION_ID,
      personId: 'person-1',
      sponsorOrgId: 'org-1',
      enrollmentStatus: 'CONFIRMED',
    });
    expect(auditCall.data.diff.personName).toMatch(/Jean.*Dupont/);
    expect(Number(auditCall.data.diff.priceHT)).toBe(1500);
  });

  it("Test 5 — input invalide (non-UUID) → { ok:false, error:<message Zod> }", async () => {
    const res = await unenrollParticipant('not-a-uuid');

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/UUID|invalide|valide/i);
    expect(findUnique).not.toHaveBeenCalled();
    expect(deleteParticipant).not.toHaveBeenCalled();
  });

  it("Test 6 — revalidatePath appelé sur /app/sessions/{sessionId} après succès", async () => {
    findUnique.mockResolvedValueOnce(PARTICIPANT_BASE);

    const res = await unenrollParticipant(VALID_PARTICIPANT_ID);

    expect(res.ok).toBe(true);
    const calls = revalidatePathMock.mock.calls.map((c) => c[0]);
    expect(calls).toContain(`/app/sessions/${SESSION_ID}`);
  });

  it("Test 7 — participant inexistant → 'Inscription introuvable.'", async () => {
    findUnique.mockResolvedValueOnce(null);

    const res = await unenrollParticipant(VALID_PARTICIPANT_ID);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/introuvable/i);
    expect(deleteParticipant).not.toHaveBeenCalled();
  });
});
