import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `updateParticipant` N'ÉCRIT PLUS le financeur — lot C.2b-5, garde-fou Rule 2.
 *
 * CE QUE CE FICHIER EMPÊCHE DE REVENIR. En posant les deux refus du changement
 * de financeur (dossier déjà parti, pièce signée) dans `changerFinanceurInscription`,
 * on n'a rien protégé tant qu'une SECONDE porte reste ouverte sur le même champ.
 * Or `updateParticipant` en avait une : sa signature acceptait `sponsorOrgId` et
 * l'écrivait, sans aucun de ces refus, avec un RBAC plus large
 * (`ADMIN | MANAGER | COMMERCIAL`). Personne ne l'appelait ainsi — c'était du
 * code mort — mais un code mort qui contourne un garde-fou n'attend qu'un
 * appelant. La branche est retirée ; ce test garde la porte fermée.
 *
 * ⚠ LE TEST DE PUISSANCE : on passe DÉLIBÉRÉMENT `sponsorOrgId` (via un cast,
 * puisque la signature ne l'accepte plus) et on vérifie que RIEN ne descend en
 * base. Un test qui se contenterait de ne pas le passer resterait vert même si
 * la branche revenait.
 */

vi.mock('@qualiof/db', () => ({
  prisma: {
    sessionParticipant: { findUnique: vi.fn(), delete: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
    trainingSession: { findFirst: vi.fn(), update: vi.fn() },
    organization: { findFirst: vi.fn(), findMany: vi.fn() },
    person: { findFirst: vi.fn() },
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
      toNumber() {
        return this.v;
      }
      valueOf() {
        return this.v;
      }
    },
    JsonNull: null,
  },
  SessionStatus: { DRAFT: 'DRAFT', PLANNED: 'PLANNED', OPEN: 'OPEN', VALIDATED: 'VALIDATED', IN_PROGRESS: 'IN_PROGRESS', COMPLETED: 'COMPLETED', CANCELLED: 'CANCELLED' },
  Modality: { PRESENTIEL: 'PRESENTIEL', DISTANCIEL: 'DISTANCIEL', MIXTE: 'MIXTE' },
  EnrollmentStatus: { PRE_ENROLLED: 'PRE_ENROLLED', VALIDATED: 'VALIDATED', IN_PROGRESS: 'IN_PROGRESS', COMPLETED: 'COMPLETED', CANCELLED: 'CANCELLED' },
  FinancingMode: { OPCO: 'OPCO', CPF: 'CPF', ENTREPRISE: 'ENTREPRISE', AUTOFINANCEMENT: 'AUTOFINANCEMENT', POLE_EMPLOI: 'POLE_EMPLOI', AUTRE: 'AUTRE' },
  LinkRole: { EI_SELF: 'EI_SELF', SALARIE: 'SALARIE', DIRIGEANT: 'DIRIGEANT' },
  UserRole: { ADMIN: 'ADMIN', MANAGER: 'MANAGER', COMMERCIAL: 'COMMERCIAL' },
  LegalForm: { EI: 'EI', SAS: 'SAS' },
}));

vi.mock('@/lib/auth', () => ({ lucia: {}, validateRequest: vi.fn() }));
vi.mock('@/lib/rbac', async () => {
  const actual = await vi.importActual<typeof import('@/lib/rbac')>('@/lib/rbac');
  return { ...actual, requireRole: vi.fn() };
});
vi.mock('@/server/actions/closure-pack', () => ({ generateClosurePack: vi.fn() }));
vi.mock('@/server/actions/convention-generator', () => ({
  generateConventionForParticipant: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { prisma } from '@qualiof/db';
import { requireRole } from '@/lib/rbac';
import { updateParticipant } from '../sessions';

const participantFindUnique = prisma.sessionParticipant.findUnique as unknown as ReturnType<typeof vi.fn>;
const participantUpdate = prisma.sessionParticipant.update as unknown as ReturnType<typeof vi.fn>;
const auditCreate = prisma.auditLog.create as unknown as ReturnType<typeof vi.fn>;
const orgFindFirst = prisma.organization.findFirst as unknown as ReturnType<typeof vi.fn>;
const $transaction = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;
const requireRoleMock = requireRole as unknown as ReturnType<typeof vi.fn>;

const PARTICIPANT_ID = '11111111-1111-1111-1111-111111111111';
const ANCIEN_ORG_ID = '33333333-3333-3333-3333-333333333333';
const AUTRE_ORG_ID = '44444444-4444-4444-4444-444444444444';

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue({
    id: 'user-1',
    tenantId: 'tenant-1',
    email: 'laurent@start-academy.fr',
    role: 'ADMIN',
  });
  participantFindUnique.mockResolvedValue({
    id: PARTICIPANT_ID,
    priceHT: 2000,
    enrollmentStatus: 'VALIDATED',
    sponsorOrgId: ANCIEN_ORG_ID,
    financingRequestDate: null,
    financingMode: 'OPCO',
    session: { id: 'ses-1', tenantId: 'tenant-1' },
  });
  orgFindFirst.mockResolvedValue({ id: AUTRE_ORG_ID, tenantId: 'tenant-1' });
  participantUpdate.mockResolvedValue({ id: PARTICIPANT_ID });
  auditCreate.mockResolvedValue({ id: 'audit-1' });
  $transaction.mockImplementation(async (ops: unknown) =>
    Array.isArray(ops) ? Promise.all(ops) : (ops as (tx: unknown) => Promise<unknown>)({}),
  );
});

describe('updateParticipant — la seconde porte sur le financeur est condamnée', () => {
  it('PUISSANCE — `sponsorOrgId` passé de force n’atteint JAMAIS la base', async () => {
    const r = await updateParticipant({
      participantId: PARTICIPANT_ID,
      priceHT: 1800,
      sponsorOrgId: AUTRE_ORG_ID,
    } as Parameters<typeof updateParticipant>[0]);

    expect(r.ok).toBe(true);
    expect(participantUpdate).toHaveBeenCalledTimes(1);

    const data = participantUpdate.mock.calls[0]![0].data;
    expect(data.sponsorOrg).toBeUndefined();
    expect(data.sponsorOrgId).toBeUndefined();
    // Le prix, lui, passe toujours : la porte est condamnée, pas l'action.
    expect(Number(data.priceHT)).toBe(1800);
  });

  it('aucune organisation n’est même cherchée : plus de branche financeur du tout', async () => {
    await updateParticipant({
      participantId: PARTICIPANT_ID,
      priceHT: 1800,
      sponsorOrgId: AUTRE_ORG_ID,
    } as Parameters<typeof updateParticipant>[0]);

    expect(orgFindFirst).not.toHaveBeenCalled();
  });

  it('l’AuditLog de cette action ne raconte rien sur le financeur', async () => {
    await updateParticipant({
      participantId: PARTICIPANT_ID,
      priceHT: 1800,
      sponsorOrgId: AUTRE_ORG_ID,
    } as Parameters<typeof updateParticipant>[0]);

    expect(auditCreate).toHaveBeenCalledTimes(1);
    const diff = JSON.stringify(auditCreate.mock.calls[0]![0].data.diff);
    expect(diff).not.toContain('sponsorOrgId');
    expect(diff).not.toContain(AUTRE_ORG_ID);
  });

  it('un changement de financeur SEUL est un no-op : rien à écrire, aucun AuditLog', async () => {
    const r = await updateParticipant({
      participantId: PARTICIPANT_ID,
      sponsorOrgId: AUTRE_ORG_ID,
    } as Parameters<typeof updateParticipant>[0]);

    expect(r.ok).toBe(true);
    expect(participantUpdate).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });
});
