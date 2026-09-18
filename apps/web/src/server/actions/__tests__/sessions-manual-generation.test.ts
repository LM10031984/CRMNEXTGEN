import { beforeEach, describe, expect, it, vi } from 'vitest';

// Les frontières coûteuses sont espionnées : les actions d'inscription et de
// statut doivent enregistrer les données sans démarrer de génération.
const m = vi.hoisted(() => ({
  sessionFind: vi.fn(), sessionCreate: vi.fn(), sessionUpdate: vi.fn(),
  participantCreate: vi.fn(), participantUpsert: vi.fn(),
  declaredParticipant: vi.fn(), prepare: vi.fn(), closure: vi.fn(),
  conventions: vi.fn(), convocation: vi.fn(), agefice: vi.fn(),
}));
vi.mock('@qualiof/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@qualiof/db')>();
  const db = {
    trainingSession: { findFirst: m.sessionFind, create: m.sessionCreate, update: m.sessionUpdate },
    trainingProduct: { findFirst: vi.fn().mockResolvedValue({ id: 'prod', title: 'Formation', priceHT: 100, groupFlatPrice: null, capacityMax: 12 }) },
    person: { findFirst: vi.fn().mockResolvedValue({ id: 'per', firstName: 'Marie', lastName: 'Test' }) },
    organization: {
      findFirst: vi.fn().mockResolvedValue({ id: 'org', legalName: 'Test EI', legalForm: 'EI', opcoCode: 'AGEFICE' }),
      findMany: vi.fn().mockResolvedValue([{ id: 'org', legalForm: 'EI' }]),
    },
    legalLink: { findFirst: vi.fn().mockResolvedValue({ role: 'EI_SELF' }) },
    sessionParticipant: { create: m.participantCreate, upsert: m.participantUpsert, findFirst: vi.fn().mockResolvedValue(null) },
    sessionTrainer: { create: vi.fn().mockResolvedValue({}) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    document: { findFirst: vi.fn().mockResolvedValue(null) },
    closureBatch: { count: vi.fn().mockResolvedValue(0) },
  };
  return { ...actual, prisma: { ...db, $transaction: vi.fn(async (fn) => fn(db)) } };
});
vi.mock('@/lib/auth', () => ({ validateRequest: vi.fn() }));
vi.mock('@/lib/rbac', () => ({
  requireRole: vi.fn().mockResolvedValue({ id: 'user', tenantId: 'tenant', role: 'ADMIN' }),
  UnauthorizedError: class extends Error {}, ForbiddenError: class extends Error {},
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/sessions/enrollment-regime-guard', () => ({ assertSessionPayersTx: vi.fn() }));
vi.mock('@/lib/pricing/company-session-price', () => ({ synchronizeCompanyPriceTx: vi.fn(), assertCompanyPriceEditable: vi.fn() }));
vi.mock('@/lib/pricing/declared-session-enrollment', () => ({ createDeclaredParticipant: m.declaredParticipant }));
vi.mock('../prepare-training', () => ({ prepareSession: m.prepare }));
vi.mock('../closure-pack', () => ({ generateClosurePack: m.closure }));
vi.mock('@/lib/closure/route-conventions', () => ({ routeConventionsByPayerRule: m.conventions }));
vi.mock('../convocation-generator', () => ({ generateConvocationForParticipant: m.convocation }));
vi.mock('../agefice-generator', () => ({ generateAgeficeForParticipant: m.agefice }));

import { createSessionFull } from '../sessions-create';
import { addParticipant, updateSessionStatus } from '../sessions';

beforeEach(() => {
  vi.clearAllMocks();
  m.sessionCreate.mockResolvedValue({ id: 'ses', regime: 'INDIVIDUEL' });
  m.sessionUpdate.mockResolvedValue({ id: 'ses' });
  m.participantCreate.mockResolvedValue({ id: 'part' });
  m.participantUpsert.mockResolvedValue({ id: 'part' });
  m.declaredParticipant.mockResolvedValue({ id: 'part' });
  for (const fn of [m.prepare, m.closure, m.conventions, m.convocation, m.agefice]) fn.mockResolvedValue({ ok: true });
});

async function expectNoGeneration() {
  // Termine aussi les éventuels imports dynamiques / fire-and-forget.
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (const fn of [m.prepare, m.closure, m.conventions, m.convocation, m.agefice]) expect(fn).not.toHaveBeenCalled();
}

describe('génération exclusivement à la demande', () => {
  it('crée une session et son inscription sans lancer la préparation', async () => {
    m.sessionFind.mockResolvedValue(null);
    const result = await createSessionFull({
      productId: 'prod', startDate: '2026-11-23', endDate: '2026-12-03',
      modality: 'PRESENTIEL', trainerPersonIds: ['trainer'],
      regime: 'INDIVIDUEL', pricePerLearner: 100,
      participants: [{ personId: 'per', sponsorOrgId: 'org' }],
    });
    expect(result).toEqual({ ok: true, sessionId: 'ses' });
    expect(m.participantCreate).toHaveBeenCalledTimes(1);
    await expectNoGeneration();
  });

  it.each([null, 'INDIVIDUEL', 'ENTREPRISE'])('ajoute un inscrit (%s) sans générer ni régénérer les documents', async (regime) => {
    m.sessionFind.mockResolvedValue({ id: 'ses', regime, pricePerLearner: 100, product: { priceHT: 100 } });
    const result = await addParticipant({ sessionId: 'ses', personId: 'per', sponsorOrgId: 'org' });
    expect(result).toEqual({ ok: true, id: 'part' });
    expect(regime ? m.declaredParticipant : m.participantUpsert).toHaveBeenCalledTimes(1);
    await expectNoGeneration();
  });

  it('marque une session terminée sans démarrer le pack ni ses conventions', async () => {
    m.sessionFind.mockResolvedValue({ id: 'ses', status: 'IN_PROGRESS' });
    const result = await updateSessionStatus({ sessionId: 'ses', newStatus: 'COMPLETED' });
    expect(result.ok).toBe(true);
    expect(m.sessionUpdate).toHaveBeenCalledWith({ where: { id: 'ses' }, data: { status: 'COMPLETED' } });
    await expectNoGeneration();
  });
});
