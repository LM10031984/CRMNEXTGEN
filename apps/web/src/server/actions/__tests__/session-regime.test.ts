import { beforeEach, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({
  tx: {
    trainingSession: { findFirst: vi.fn(), update: vi.fn() },
    sessionParticipant: { updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  guard: vi.fn(),
  sync: vi.fn(),
  role: vi.fn(),
}));
vi.mock('@qualiof/db', async (original) => ({
  ...(await original<any>()),
  prisma: { $transaction: async (fn: any) => fn(f.tx) },
}));
vi.mock('@/lib/rbac', () => ({ requireRole: f.role }));
vi.mock('@/lib/pricing/company-session-price', () => ({
  assertCompanyPriceEditable: f.guard,
  synchronizeCompanyPriceTx: f.sync,
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { setSessionRegime } from '../session-regime';
const session = {
  id: 's',
  tenantId: 't',
  regime: null,
  priceTotalHT: null,
  pricePerLearner: 120,
  startDate: new Date('2026-11-20'),
  endDate: new Date('2026-11-20'),
  participants: [
    {
      id: 'p',
      sponsorOrgId: 'org',
      sponsorOrg: { legalForm: 'SAS' },
      person: {
        firstName: 'Conseiller',
        lastName: 'Test',
        legalLinks: [{ organizationId: 'org', role: 'AGENT_COMMERCIAL' }],
      },
      priceHT: 120,
      amountCollected: 0,
    },
  ],
};
const input = { sessionId: 's', regime: 'ENTREPRISE' as const, priceHT: 240 };
beforeEach(() => {
  vi.clearAllMocks();
  f.role.mockResolvedValue({ id: 'u', tenantId: 't' });
  f.tx.trainingSession.findFirst.mockResolvedValue(structuredClone(session));
  f.tx.trainingSession.update.mockImplementation(async ({ data }) => ({ ...session, ...data }));
  f.sync.mockResolvedValue(1);
  f.guard.mockResolvedValue(undefined);
});
it('prévisualise sans écrire et exige la clé de cette session avant apply', async () => {
  const preview = await setSessionRegime(input);
  expect(preview).toMatchObject({
    ok: true,
    changed: false,
    preview: { regime: 'ENTREPRISE', priceHT: 240, participants: 1 },
  });
  expect(f.tx.trainingSession.update).not.toHaveBeenCalled();
  expect(await setSessionRegime({ ...input, apply: true })).toMatchObject({
    ok: false,
    error: expect.stringContaining('prévisualisation'),
  });
  if (!preview.ok) throw new Error(preview.error);
  expect(
    await setSessionRegime({ ...input, apply: true, confirmationKey: preview.confirmationKey }),
  ).toMatchObject({ ok: true, changed: true });
  expect(f.tx.auditLog.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        tenantId: 't',
        diff: expect.objectContaining({ participantsUpdated: 1 }),
      }),
    }),
  );
});
it('refuse une prévisualisation périmée si le payeur change sans changer les IDs', async () => {
  const preview = await setSessionRegime(input);
  if (!preview.ok) throw new Error(preview.error);
  f.tx.trainingSession.findFirst.mockResolvedValue({
    ...session,
    participants: [{ ...session.participants[0], sponsorOrg: { legalForm: 'SARL' } }],
  });
  expect(
    await setSessionRegime({ ...input, apply: true, confirmationKey: preview.confirmationKey }),
  ).toMatchObject({ ok: false });
  expect(f.tx.trainingSession.update).not.toHaveBeenCalled();
});
it('scope tenant et refus des pièces engagées', async () => {
  f.guard.mockRejectedValueOnce(new Error('Facture FAC-TEST engagée'));
  expect(await setSessionRegime(input)).toMatchObject({
    ok: false,
    error: expect.stringContaining('FAC-TEST'),
  });
  expect(f.tx.trainingSession.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({ where: { id: 's', tenantId: 't' } }),
  );
  expect(f.tx.trainingSession.update).not.toHaveBeenCalled();
});
it('rejeu idempotent sans écriture ni second journal', async () => {
  f.tx.trainingSession.findFirst.mockResolvedValue({
    ...session,
    regime: 'ENTREPRISE',
    priceTotalHT: 240,
  });
  expect(await setSessionRegime({ ...input, apply: true })).toEqual({ ok: true, changed: false });
  expect(f.tx.auditLog.create).not.toHaveBeenCalled();
});

it('déclare le régime entreprise historique sans réécrire les prix déjà signés', async () => {
  const employee = {
    ...session.participants[0],
    person: {
      ...session.participants[0]!.person,
      legalLinks: [{ organizationId: 'org', role: 'SALARIE' }],
    },
  };
  f.tx.trainingSession.findFirst.mockResolvedValue({
    ...session,
    participants: [
      { ...employee, id: 'p1' },
      { ...employee, id: 'p2' },
    ],
  });
  f.guard.mockRejectedValue(new Error('Convention signée'));
  const preview = await setSessionRegime(input);
  expect(preview.ok).toBe(true);
  if (!preview.ok) throw new Error(preview.error);
  expect(
    await setSessionRegime({ ...input, apply: true, confirmationKey: preview.confirmationKey }),
  ).toMatchObject({ ok: true, changed: true });
  expect(f.guard).not.toHaveBeenCalled();
  expect(f.sync).not.toHaveBeenCalled();
  expect(f.tx.sessionParticipant.updateMany).not.toHaveBeenCalled();
  expect(f.tx.auditLog.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        diff: expect.objectContaining({ metadataOnly: true, participantsUpdated: 0 }),
      }),
    }),
  );
});

it('garde le verrou si le forfait ou la ventilation change malgré un même total', async () => {
  const employee = {
    ...session.participants[0],
    person: {
      ...session.participants[0]!.person,
      legalLinks: [{ organizationId: 'org', role: 'SALARIE' }],
    },
  };
  f.tx.trainingSession.findFirst.mockResolvedValue({
    ...session,
    participants: [
      { ...employee, id: 'p1', priceHT: 100 },
      { ...employee, id: 'p2', priceHT: 140 },
    ],
  });
  f.guard.mockRejectedValue(new Error('Convention signée'));
  expect(await setSessionRegime(input)).toMatchObject({ ok: false, error: 'Convention signée' });
  expect(f.tx.trainingSession.update).not.toHaveBeenCalled();
});

it.each([
  ['total modifié', 300, 'SALARIE'],
  ['activité indépendante', 240, 'AGENT_COMMERCIAL'],
])('ne contourne pas une pièce signée : %s', async (_, priceHT, role) => {
  const employee = {
    ...session.participants[0],
    person: { ...session.participants[0]!.person, legalLinks: [{ organizationId: 'org', role }] },
  };
  f.tx.trainingSession.findFirst.mockResolvedValue({
    ...session,
    participants: [
      { ...employee, id: 'p1' },
      { ...employee, id: 'p2' },
    ],
  });
  f.guard.mockRejectedValue(new Error('Convention signée'));
  expect(await setSessionRegime({ ...input, priceHT })).toMatchObject({
    ok: false,
    error: 'Convention signée',
  });
  expect(f.tx.trainingSession.update).not.toHaveBeenCalled();
});

it('rejette une déclaration historique dont les inscriptions changent entre revue et confirmation', async () => {
  const employee = {
    ...session.participants[0],
    person: {
      ...session.participants[0]!.person,
      legalLinks: [{ organizationId: 'org', role: 'SALARIE' }],
    },
  };
  const current = {
    ...session,
    participants: [
      { ...employee, id: 'p1' },
      { ...employee, id: 'p2' },
    ],
  };
  f.tx.trainingSession.findFirst.mockResolvedValue(current);
  const preview = await setSessionRegime(input);
  if (!preview.ok) throw new Error(preview.error);
  f.tx.trainingSession.findFirst.mockResolvedValue({
    ...current,
    participants: [
      { ...employee, id: 'p1' },
      { ...employee, id: 'p3' },
    ],
  });
  expect(
    await setSessionRegime({ ...input, apply: true, confirmationKey: preview.confirmationKey }),
  ).toMatchObject({ ok: false, error: expect.stringContaining('changé') });
  expect(f.tx.trainingSession.update).not.toHaveBeenCalled();
  expect(f.tx.sessionParticipant.updateMany).not.toHaveBeenCalled();
});
