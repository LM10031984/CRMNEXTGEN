import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests comportementaux `updateSessionDetails` — verrouille la
 * NORMALISATION '' / '   ' / trim côté action (commit ui-e2).
 *
 * Garde-fou Laurent ui-e2 #1 2026-06-08 :
 *   "Tout le fix vit dans l'action. Il n'est verrouillé que par un grep
 *   de chaîne, qui prouve que l'import existe, pas que name ET
 *   internalNotes passent tous les deux par le helper et écrivent null.
 *   Si quelqu'un refactore name pour court-circuiter le helper, ton
 *   smoke reste vert."
 *
 * Ce test vérifie le payload EFFECTIVEMENT envoyé à
 * `prisma.trainingSession.update` — la seule couche qui peut prouver
 * que la normalisation est appliquée.
 *
 * Stratégie de mock : clone-strict du harness `sessions-unenroll.test.ts`.
 */

vi.mock('@qualiof/db', () => ({
  prisma: {
    sessionParticipant: { findUnique: vi.fn(), delete: vi.fn() },
    auditLog: { create: vi.fn() },
    trainingSession: { findFirst: vi.fn(), update: vi.fn() },
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
      toString() {
        return String(this.v);
      }
      toNumber() {
        return this.v;
      }
      valueOf() {
        return this.v;
      }
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
import { requireRole } from '@/lib/rbac';
import { updateSessionDetails } from '../sessions';

const findFirst = prisma.trainingSession.findFirst as unknown as ReturnType<typeof vi.fn>;
const updateSession = prisma.trainingSession.update as unknown as ReturnType<typeof vi.fn>;
const auditLogCreate = prisma.auditLog.create as unknown as ReturnType<typeof vi.fn>;
const $transaction = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;
const requireRoleMock = requireRole as unknown as ReturnType<typeof vi.fn>;

const SESSION_ID = '22222222-2222-2222-2222-222222222222';
const FAKE_ADMIN = {
  id: 'user-1',
  tenantId: 'tenant-1',
  email: 'admin@test.fr',
  role: 'ADMIN',
};

// Session existante "riche" pour permettre les diff/no-op tests sur
// CHAQUE champ que l'action manipule individuellement.
const EXISTING_SESSION = {
  id: SESSION_ID,
  tenantId: 'tenant-1',
  name: 'Old name',
  startDate: new Date('2026-06-01T09:30:00Z'),
  endDate: new Date('2026-06-05T17:00:00Z'),
  capacityMin: 4,
  capacityMax: 12,
  modality: 'PRESENTIEL',
  pricePerLearner: 1500,
  language: 'fr',
  internalNotes: 'Old notes',
};

function setupTxPassthrough() {
  $transaction.mockImplementation(async (operations: any) => {
    if (Array.isArray(operations)) return Promise.all(operations);
    return operations({
      trainingSession: { update: updateSession },
      auditLog: { create: auditLogCreate },
    });
  });
}

beforeEach(() => {
  findFirst.mockReset();
  updateSession.mockReset();
  auditLogCreate.mockReset();
  $transaction.mockReset();
  requireRoleMock.mockReset();

  requireRoleMock.mockResolvedValue(FAKE_ADMIN);
  findFirst.mockResolvedValue(EXISTING_SESSION);
  updateSession.mockResolvedValue({ id: SESSION_ID });
  auditLogCreate.mockResolvedValue({ id: 'audit-1' });
  setupTxPassthrough();
});

describe('updateSessionDetails — normalisation "champ vidé" (ui-e2)', () => {
  // ─── name (nullable, trimmed côté schema mais re-normalisé action) ─────

  it('name = "" → DB stocke null', async () => {
    const res = await updateSessionDetails({
      sessionId: SESSION_ID,
      name: '',
    });

    expect(res.ok).toBe(true);
    expect(updateSession).toHaveBeenCalledTimes(1);
    const payload = updateSession.mock.calls[0]![0];
    expect(payload.where).toEqual({ id: SESSION_ID });
    expect(payload.data.name).toBeNull();
  });

  it('name = "  Foo  " → DB stocke "Foo" (trim conservé)', async () => {
    const res = await updateSessionDetails({
      sessionId: SESSION_ID,
      name: '  Foo  ',
    });

    expect(res.ok).toBe(true);
    const payload = updateSession.mock.calls[0]![0];
    expect(payload.data.name).toBe('Foo');
  });

  it('name = null → DB stocke null', async () => {
    const res = await updateSessionDetails({
      sessionId: SESSION_ID,
      name: null,
    });

    expect(res.ok).toBe(true);
    const payload = updateSession.mock.calls[0]![0];
    expect(payload.data.name).toBeNull();
  });

  it('name === session.name → no-op (pas d\'update, pas d\'AuditLog)', async () => {
    const res = await updateSessionDetails({
      sessionId: SESSION_ID,
      name: 'Old name',
    });

    expect(res.ok).toBe(true);
    expect(updateSession).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  // ─── internalNotes (le cas qui manquait — whitespace seul) ─────────────

  it('internalNotes = "   " (whitespace seul) → DB stocke null', async () => {
    // C'est LE bug : avant ui-e2, '   ' restait stocké brut en DB.
    // L'action ne le trimait pas, et aucun wrapper ne le normalisait.
    const res = await updateSessionDetails({
      sessionId: SESSION_ID,
      internalNotes: '   ',
    });

    expect(res.ok).toBe(true);
    expect(updateSession).toHaveBeenCalledTimes(1);
    const payload = updateSession.mock.calls[0]![0];
    expect(payload.data.internalNotes).toBeNull();
  });

  it('internalNotes = "" → DB stocke null', async () => {
    const res = await updateSessionDetails({
      sessionId: SESSION_ID,
      internalNotes: '',
    });

    expect(res.ok).toBe(true);
    const payload = updateSession.mock.calls[0]![0];
    expect(payload.data.internalNotes).toBeNull();
  });

  it('internalNotes = "  Note libre  " → DB stocke "Note libre"', async () => {
    const res = await updateSessionDetails({
      sessionId: SESSION_ID,
      internalNotes: '  Note libre  ',
    });

    expect(res.ok).toBe(true);
    const payload = updateSession.mock.calls[0]![0];
    expect(payload.data.internalNotes).toBe('Note libre');
  });

  it('internalNotes = null → DB stocke null', async () => {
    const res = await updateSessionDetails({
      sessionId: SESSION_ID,
      internalNotes: null,
    });

    expect(res.ok).toBe(true);
    const payload = updateSession.mock.calls[0]![0];
    expect(payload.data.internalNotes).toBeNull();
  });

  it('internalNotes === session.internalNotes → no-op', async () => {
    const res = await updateSessionDetails({
      sessionId: SESSION_ID,
      internalNotes: 'Old notes',
    });

    expect(res.ok).toBe(true);
    expect(updateSession).not.toHaveBeenCalled();
  });

  // ─── AuditLog diff cohérent avec la valeur normalisée ──────────────────

  it('AuditLog diff capture la valeur NORMALISÉE (null, pas la raw)', async () => {
    await updateSessionDetails({
      sessionId: SESSION_ID,
      internalNotes: '   ',
    });

    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    const audit = auditLogCreate.mock.calls[0]![0];
    expect(audit.data.diff.before.internalNotes).toBe('Old notes');
    expect(audit.data.diff.after.internalNotes).toBeNull();
  });
});
