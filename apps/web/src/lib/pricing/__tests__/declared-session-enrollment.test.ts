import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ tx: { trainingSession: { findFirst: vi.fn() }, sessionParticipant: { findUnique: vi.fn(), create: vi.fn() }, auditLog: { create: vi.fn() } }, editable: vi.fn(), sync: vi.fn() }));
vi.mock('@qualiof/db', async (original) => ({ ...await original<any>(), prisma: { $transaction: async (fn: any) => fn(mocks.tx) } }));
vi.mock('../company-session-price', () => ({ assertCompanyPriceEditable: mocks.editable, synchronizeCompanyPriceTx: mocks.sync }));
import { createDeclaredParticipant } from '../declared-session-enrollment';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.tx.trainingSession.findFirst.mockResolvedValue({ id: 's', tenantId: 't', regime: 'ENTREPRISE', priceTotalHT: 240 });
  mocks.tx.sessionParticipant.findUnique.mockResolvedValue(null);
  mocks.tx.sessionParticipant.create.mockResolvedValue({ id: 'p' });
});
const input = { sessionId: 's', personId: 'person', sponsorOrgId: 'org' };
it('ajoute et répartit dans la même transaction sans accepter un tarif individuel', async () => {
  await createDeclaredParticipant({ tenantId: 't', id: 'u' }, input);
  expect(mocks.editable).toHaveBeenCalledWith(mocks.tx, expect.objectContaining({ priceTotalHT: 240 }));
  expect(mocks.tx.sessionParticipant.create).toHaveBeenCalledWith({ data: expect.objectContaining({ priceHT: expect.anything(), sessionId: 's' }) });
  expect(mocks.sync).toHaveBeenCalledWith(mocks.tx, expect.objectContaining({ id: 's' }), 'u');
  expect(mocks.tx.auditLog.create).toHaveBeenCalled();
});
it('le rejeu ne réinscrit ni ne change silencieusement le commanditaire', async () => {
  mocks.tx.sessionParticipant.findUnique.mockResolvedValue({ id: 'p', sponsorOrgId: 'org' });
  expect(await createDeclaredParticipant({ tenantId: 't', id: 'u' }, input)).toEqual({ id: 'p', sponsorOrgId: 'org' });
  expect(mocks.tx.sessionParticipant.create).not.toHaveBeenCalled();
  await expect(createDeclaredParticipant({ tenantId: 't', id: 'u' }, { ...input, sponsorOrgId: 'autre' })).rejects.toThrow(/commanditaire/i);
});
it('ne crée rien si le forfait est déjà engagé', async () => {
  mocks.editable.mockRejectedValueOnce(new Error('Facture engagée'));
  await expect(createDeclaredParticipant({ tenantId: 't', id: 'u' }, input)).rejects.toThrow(/engagée/);
  expect(mocks.tx.sessionParticipant.create).not.toHaveBeenCalled();
});
