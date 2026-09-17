import { beforeEach, describe, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => {
  const tx = {
    legalLink: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      updateMany: vi.fn(),
    },
    sessionParticipant: { findMany: vi.fn() },
    auditLog: { create: vi.fn() },
    invoice: { findMany: vi.fn() },
  };
  return {
    tx,
    transaction: vi.fn(async (fn) => fn(tx)),
    user: { id: 'user', tenantId: 'tenant', role: 'ADMIN' },
  };
});
vi.mock('@qualiof/db', async (original) => ({
  ...(await original<typeof import('@qualiof/db')>()),
  prisma: { $transaction: f.transaction },
}));
vi.mock('@/lib/auth', () => ({ validateRequest: vi.fn(async () => ({ user: f.user })) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { updateLegalLink, deleteLegalLink } from '../legal-links';
const old = {
  id: 'link',
  personId: 'person',
  organizationId: 'org',
  role: 'AGENT_COMMERCIAL',
  startDate: null,
  endDate: null,
  function: null,
  isPrimary: true,
  person: { firstName: 'Test', lastName: 'Person' },
  organization: { ageficeProfile: null },
};
beforeEach(() => {
  vi.clearAllMocks();
  f.tx.legalLink.findFirst.mockResolvedValue({ ...old });
  f.tx.legalLink.findMany.mockResolvedValue([{ ...old }]);
  f.tx.legalLink.create.mockImplementation(async ({ data }) => ({ id: 'new', ...data }));
  f.tx.legalLink.update.mockImplementation(async ({ data }) => ({ ...old, ...data }));
  f.tx.sessionParticipant.findMany.mockResolvedValue([]);
  f.tx.invoice.findMany.mockResolvedValue([]);
});
describe('édition des périodes — prévisualisation puis transaction auditée', () => {
  it('prévisualise un changement de rôle sans écrire', async () => {
    const result = await updateLegalLink({
      linkId: 'link',
      changeRole: { role: 'SALARIE', effectiveDate: '2026-02-01' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview?.next?.role).toBe('SALARIE');
    expect(result.preview?.after.endDate).toBe('2026-01-31');
    expect(f.tx.legalLink.update).not.toHaveBeenCalled();
    expect(f.tx.auditLog.create).not.toHaveBeenCalled();
  });
  it('termine et crée dans la même transaction, avec le journal', async () => {
    const input = {
      linkId: 'link',
      changeRole: { role: 'SALARIE' as const, effectiveDate: '2026-02-01' },
    };
    const preview = await updateLegalLink(input);
    if (!preview.ok) throw new Error(preview.error);
    const result = await updateLegalLink({
      ...input,
      apply: true,
      confirmationKey: preview.confirmationKey,
    });
    expect(result.ok).toBe(true);
    expect(f.tx.legalLink.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ endDate: new Date('2026-01-31'), isPrimary: false }),
      }),
    );
    expect(f.tx.legalLink.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: 'SALARIE',
          startDate: new Date('2026-02-01'),
          isPrimary: true,
        }),
      }),
    );
    expect(f.tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(f.tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: 'tenant', userId: 'user', entityId: 'link' }),
      }),
    );
  });
  it('refuse apply sans revue et une prévisualisation devenue périmée', async () => {
    const result = await updateLegalLink({
      linkId: 'link',
      function: 'Conseiller',
      apply: true,
      confirmationKey: 'obsolete',
    });
    expect(result.ok).toBe(false);
    expect(f.tx.legalLink.update).not.toHaveBeenCalled();
  });
  it('ne journalise pas un rejeu sans changement', async () => {
    const result = await updateLegalLink({ linkId: 'link', function: null, apply: true });
    expect(result).toMatchObject({ ok: true, changed: false });
    expect(f.tx.auditLog.create).not.toHaveBeenCalled();
  });
  it('refuse de modifier une période qui porte une pièce engagée', async () => {
    f.tx.sessionParticipant.findMany.mockResolvedValue([
      {
        id: 'p',
        sponsorOrgId: 'org',
        conventionSigned: true,
        financingMode: null,
        session: {
          id: 's',
          code: 'SES-TEST',
          startDate: new Date('2026-11-20'),
          endDate: new Date('2026-11-20'),
          documents: [],
        },
        agreementDocs: [],
        opcoSubmissions: [],
        invoices: [],
      },
    ]);
    const result = await updateLegalLink({ linkId: 'link', endDate: '2026-02-01' });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('SES-TEST') });
    expect(f.tx.legalLink.update).not.toHaveBeenCalled();
  });
  it('conserve la période de janvier lorsque seule celle de février change', async () => {
    f.tx.sessionParticipant.findMany.mockResolvedValue([
      {
        id: 'p',
        sponsorOrgId: 'org',
        conventionSigned: true,
        financingMode: null,
        session: {
          id: 's',
          code: 'SES-JAN',
          startDate: new Date('2026-01-20'),
          endDate: new Date('2026-01-20'),
          documents: [],
        },
        agreementDocs: [],
        opcoSubmissions: [],
        invoices: [],
      },
    ]);
    const result = await updateLegalLink({
      linkId: 'link',
      changeRole: { role: 'SALARIE', effectiveDate: '2026-02-01' },
    });
    expect(result.ok).toBe(true);
  });
  it('refuse de supprimer un lien ayant porté une inscription et propose de le terminer', async () => {
    f.tx.sessionParticipant.findMany.mockResolvedValue([{ sponsorOrgId: 'org' }]);
    const result = await deleteLegalLink('link');
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('Terminez') });
    expect(f.tx.legalLink.delete).not.toHaveBeenCalled();
  });
});

it('une facture groupée protège la période même sans Invoice.participantId', async () => {
  f.tx.sessionParticipant.findMany.mockResolvedValue([
    {
      id: 'p',
      sponsorOrgId: 'org',
      conventionSigned: false,
      session: {
        id: 's',
        code: 'SES-GROUP',
        startDate: new Date('2026-11-20'),
        endDate: new Date('2026-11-20'),
        documents: [],
      },
      agreementDocs: [],
      opcoSubmissions: [],
      invoices: [],
    },
  ]);
  f.tx.invoice.findMany.mockResolvedValue([
    { id: 'invoice', number: 'FAC-GROUP', sessionId: 's', participantIds: ['p'], status: 'ISSUED' },
  ]);
  const result = await updateLegalLink({ linkId: 'link', endDate: '2026-02-01' });
  expect(result).toMatchObject({ ok: false, error: expect.stringContaining('FAC-GROUP') });
});
