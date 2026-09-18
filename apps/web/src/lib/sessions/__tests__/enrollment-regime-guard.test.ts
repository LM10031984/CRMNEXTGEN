import { beforeEach, expect, it, vi } from 'vitest';
import { assertSessionPayersTx } from '../enrollment-regime-guard';
import type { Prisma } from '@qualiof/db';
const tx = {
  person: { findMany: vi.fn() },
  organization: { findMany: vi.fn() },
  sessionParticipant: { findMany: vi.fn() },
};
const session = {
  id: 'session',
  tenantId: 'tenant',
  regime: 'ENTREPRISE' as const,
  startDate: new Date('2026-11-20'),
  endDate: new Date('2026-11-20'),
};
const people = [{ personId: 'person', sponsorOrgId: 'sas' }];
const run = (s: any = session, p = people) =>
  assertSessionPayersTx(tx as unknown as Prisma.TransactionClient, s, p);
beforeEach(() => {
  vi.clearAllMocks();
  tx.person.findMany.mockResolvedValue([
    {
      id: 'person',
      firstName: 'Conseiller',
      lastName: 'Test',
      legalLinks: [{ organizationId: 'sas', role: 'AGENT_COMMERCIAL' }],
    },
  ]);
  tx.organization.findMany.mockResolvedValue([
    { id: 'sas', legalForm: 'SAS', legalName: 'Agence Test' },
  ]);
  tx.sessionParticipant.findMany.mockResolvedValue([]);
});
it('accepte agent commercial payé par SAS, pas un test SALARIE', async () => {
  await expect(run()).resolves.toBeUndefined();
});
it('refuse le payeur EI en entreprise en nommant la personne et la fiche à corriger', async () => {
  tx.organization.findMany.mockResolvedValue([
    { id: 'sas', legalForm: 'EI', legalName: 'EI Test' },
  ]);
  await expect(run()).rejects.toThrow(/Conseiller Test.*fiche/);
});
it('ne consulte ni ne refuse une session historique NULL', async () => {
  await run({ ...session, regime: null });
  expect(tx.person.findMany).not.toHaveBeenCalled();
});
it('ne mélange pas deux sociétés dans le même forfait', async () => {
  tx.sessionParticipant.findMany.mockResolvedValue([{ sponsorOrgId: 'autre-sas' }]);
  await expect(run()).rejects.toThrow(/commanditaire/);
});
it('le rôle de salarié dans une EI est lu aux dates de la session', async () => {
  tx.organization.findMany.mockResolvedValue([
    { id: 'sas', legalForm: 'EI', legalName: 'EI Test' },
  ]);
  tx.person.findMany.mockResolvedValue([
    {
      id: 'person',
      firstName: 'Conseiller',
      lastName: 'Test',
      legalLinks: [
        { organizationId: 'sas', role: 'EI_SELF', endDate: new Date('2026-01-31') },
        { organizationId: 'sas', role: 'SALARIE', startDate: new Date('2026-02-01') },
      ],
    },
  ]);
  await expect(run()).resolves.toBeUndefined();
  await expect(
    run({ ...session, startDate: new Date('2026-01-20'), endDate: new Date('2026-01-20') }),
  ).rejects.toThrow(/INDIVIDUEL/);
});
it('refuse un identifiant absent du tenant avant écriture', async () => {
  tx.person.findMany.mockResolvedValue([]);
  await expect(run()).rejects.toThrow(/introuvable/);
  expect(tx.organization.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant' }) }),
  );
});
