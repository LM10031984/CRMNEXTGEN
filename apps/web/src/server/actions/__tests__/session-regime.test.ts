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
