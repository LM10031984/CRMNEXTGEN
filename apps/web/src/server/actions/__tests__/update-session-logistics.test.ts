import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests comportementaux `updateSessionLogistics` — verrouille la
 * NORMALISATION '' / '   ' / trim sur les 3 champs nullable texte
 * (trainerLodgingPlace, trainerLodgingDates, disabilityAdaptations).
 *
 * Garde-fou Laurent ui-e3 2026-06-08 :
 *   "La propriété 'entonnoir unique' qui rendait sûre la suppression des
 *   gardes wrappers est par-action, elle ne se transmet pas gratuitement.
 *   updateSessionLogistics, setSessionLocation et consorts sont de
 *   nouveaux entonnoirs — chacun doit recâbler normalizeNullableText et
 *   recevoir son propre contre-test à baseline non-nulle. Le piège,
 *   c'est que les nouveaux contre-tests repartent verts-creux si tu
 *   seedes une baseline nulle."
 *
 * Discipline appliquée ici :
 *   - findFirst mocké avec baseline NON-NULLE pour les 3 champs (même si
 *     updateSessionLogistics ne lit pas la valeur existante — c'est la
 *     règle de discipline, on la respecte pour ne pas créer un précédent
 *     "vert creux par habitude").
 *   - Assertions sur le PAYLOAD passé à prisma.trainingSession.update
 *     (pas seulement sur res.ok).
 *
 * Clone-strict du harness `update-session-details.test.ts`.
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
      toString() { return String(this.v); }
      toNumber() { return this.v; }
      valueOf() { return this.v; }
    },
    JsonNull: null,
  },
  SessionStatus: { DRAFT: 'DRAFT', PLANNED: 'PLANNED', OPEN: 'OPEN', VALIDATED: 'VALIDATED', IN_PROGRESS: 'IN_PROGRESS', COMPLETED: 'COMPLETED', CANCELLED: 'CANCELLED' },
  Modality: { PRESENTIEL: 'PRESENTIEL', DISTANCIEL: 'DISTANCIEL', MIXTE: 'MIXTE' },
  EnrollmentStatus: { PRE_ENROLLED: 'PRE_ENROLLED', CONFIRMED: 'CONFIRMED', ATTENDED: 'ATTENDED', NO_SHOW: 'NO_SHOW', CANCELLED: 'CANCELLED' },
  LinkRole: { EI_SELF: 'EI_SELF', AGENT_COMMERCIAL: 'AGENT_COMMERCIAL', SALARIE: 'SALARIE', DIRIGEANT: 'DIRIGEANT', FORMATEUR: 'FORMATEUR' },
  UserRole: { ADMIN: 'ADMIN', MANAGER: 'MANAGER', FORMATEUR: 'FORMATEUR', COMMERCIAL: 'COMMERCIAL', COMPTABLE: 'COMPTABLE', LECTEUR: 'LECTEUR' },
  LegalForm: { SAS: 'SAS', SA: 'SA', SARL: 'SARL', SASU: 'SASU', EURL: 'EURL', EI: 'EI', EIRL: 'EIRL', AUTO_ENTREPRENEUR: 'AUTO_ENTREPRENEUR', AUTRE: 'AUTRE' },
}));

vi.mock('@/lib/auth', () => ({ lucia: {}, validateRequest: vi.fn() }));

vi.mock('@/lib/rbac', async () => {
  const actual = await vi.importActual<typeof import('@/lib/rbac')>('@/lib/rbac');
  return { ...actual, requireRole: vi.fn() };
});

vi.mock('@/server/actions/closure-pack', () => ({ generateClosurePack: vi.fn() }));
vi.mock('@/server/actions/convention-generator', () => ({ generateConventionForParticipant: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { prisma } from '@qualiof/db';
import { requireRole } from '@/lib/rbac';
import { updateSessionLogistics } from '../sessions';

const findFirst = prisma.trainingSession.findFirst as unknown as ReturnType<typeof vi.fn>;
const updateSession = prisma.trainingSession.update as unknown as ReturnType<typeof vi.fn>;
const requireRoleMock = requireRole as unknown as ReturnType<typeof vi.fn>;

const SESSION_ID = '33333333-3333-3333-3333-333333333333';
const FAKE_ADMIN = { id: 'user-1', tenantId: 'tenant-1', email: 'a@b.fr', role: 'ADMIN' };

// Baseline NON-NULLE explicitement — discipline ui-e3.
// updateSessionLogistics ne lit pas ces valeurs aujourd'hui (pas de no-op),
// mais on seede non-null pour ne pas créer un précédent "vert creux" qui
// passerait inaperçu si quelqu'un ajoute un no-op pattern plus tard.
const EXISTING_SESSION = {
  id: SESSION_ID,
  tenantId: 'tenant-1',
  needsTrainerLodging: true,
  trainerLodgingPlace: 'Hôtel Ibis Cagnes-sur-Mer',
  trainerLodgingDates: 'Du 01/06 au 05/06',
  hasDisabledLearner: false,
  disabilityAdaptations: 'Rampe accès + boucle magnétique',
};

beforeEach(() => {
  findFirst.mockReset();
  updateSession.mockReset();
  requireRoleMock.mockReset();

  requireRoleMock.mockResolvedValue(FAKE_ADMIN);
  findFirst.mockResolvedValue(EXISTING_SESSION);
  updateSession.mockResolvedValue({ id: SESSION_ID });
});

describe('updateSessionLogistics — normalisation 3 champs nullable (ui-e3)', () => {
  // ─── trainerLodgingPlace ─────────────────────────────────────────────

  it("trainerLodgingPlace = '   ' (whitespace seul) → DB null", async () => {
    const res = await updateSessionLogistics({
      sessionId: SESSION_ID,
      trainerLodgingPlace: '   ',
    });

    expect(res.ok).toBe(true);
    expect(updateSession).toHaveBeenCalledTimes(1);
    const payload = updateSession.mock.calls[0]![0];
    expect(payload.data.trainerLodgingPlace).toBeNull();
  });

  it("trainerLodgingPlace = '  Hôtel Mercure  ' → DB 'Hôtel Mercure' (trim conservé)", async () => {
    const res = await updateSessionLogistics({
      sessionId: SESSION_ID,
      trainerLodgingPlace: '  Hôtel Mercure  ',
    });

    expect(res.ok).toBe(true);
    const payload = updateSession.mock.calls[0]![0];
    expect(payload.data.trainerLodgingPlace).toBe('Hôtel Mercure');
  });

  it('trainerLodgingPlace = null → DB null', async () => {
    const res = await updateSessionLogistics({
      sessionId: SESSION_ID,
      trainerLodgingPlace: null,
    });

    expect(res.ok).toBe(true);
    const payload = updateSession.mock.calls[0]![0];
    expect(payload.data.trainerLodgingPlace).toBeNull();
  });

  // ─── trainerLodgingDates ─────────────────────────────────────────────

  it("trainerLodgingDates = '\\t\\n  ' → DB null", async () => {
    const res = await updateSessionLogistics({
      sessionId: SESSION_ID,
      trainerLodgingDates: '\t\n  ',
    });

    expect(res.ok).toBe(true);
    const payload = updateSession.mock.calls[0]![0];
    expect(payload.data.trainerLodgingDates).toBeNull();
  });

  it("trainerLodgingDates = '  Du 12 au 14 juin  ' → DB 'Du 12 au 14 juin'", async () => {
    const res = await updateSessionLogistics({
      sessionId: SESSION_ID,
      trainerLodgingDates: '  Du 12 au 14 juin  ',
    });

    expect(res.ok).toBe(true);
    const payload = updateSession.mock.calls[0]![0];
    expect(payload.data.trainerLodgingDates).toBe('Du 12 au 14 juin');
  });

  // ─── disabilityAdaptations ───────────────────────────────────────────

  it("disabilityAdaptations = '' → DB null", async () => {
    const res = await updateSessionLogistics({
      sessionId: SESSION_ID,
      disabilityAdaptations: '',
    });

    expect(res.ok).toBe(true);
    const payload = updateSession.mock.calls[0]![0];
    expect(payload.data.disabilityAdaptations).toBeNull();
  });

  it("disabilityAdaptations = '  Salle PMR  ' → DB 'Salle PMR'", async () => {
    const res = await updateSessionLogistics({
      sessionId: SESSION_ID,
      disabilityAdaptations: '  Salle PMR  ',
    });

    expect(res.ok).toBe(true);
    const payload = updateSession.mock.calls[0]![0];
    expect(payload.data.disabilityAdaptations).toBe('Salle PMR');
  });

  // ─── Mix : whitespace seul sur les 3 champs en un appel ──────────────

  it("3 champs en whitespace simultanés → tous null en DB", async () => {
    const res = await updateSessionLogistics({
      sessionId: SESSION_ID,
      trainerLodgingPlace: '   ',
      trainerLodgingDates: '\n\n',
      disabilityAdaptations: '\t',
    });

    expect(res.ok).toBe(true);
    const payload = updateSession.mock.calls[0]![0];
    expect(payload.data.trainerLodgingPlace).toBeNull();
    expect(payload.data.trainerLodgingDates).toBeNull();
    expect(payload.data.disabilityAdaptations).toBeNull();
  });

  // ─── undefined → skip (pas dans le payload) ──────────────────────────

  it('undefined → champ omis du payload (pattern existant préservé)', async () => {
    const res = await updateSessionLogistics({
      sessionId: SESSION_ID,
      trainerLodgingPlace: 'Hôtel',
      // trainerLodgingDates undefined : doit être ABSENT du payload
    });

    expect(res.ok).toBe(true);
    const payload = updateSession.mock.calls[0]![0];
    expect(payload.data).not.toHaveProperty('trainerLodgingDates');
    expect(payload.data).not.toHaveProperty('disabilityAdaptations');
  });
});
