import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  role: vi.fn(),
  build: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  audit: vi.fn(),
}));
vi.mock('@/lib/rbac', () => ({ requireRole: m.role }));
vi.mock('@/lib/opco/build-submission', () => ({ buildOpcoSubmission: m.build }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@qualiof/db', () => {
  const tx = {
    sessionParticipant: { findMany: m.findMany, updateMany: m.update },
    auditLog: { create: m.audit },
  };
  return { prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn(tx) } };
});
import { recordCompanyOpcoDeposit, recordOpcoDeposit } from '../opco-deposit';
const input = {
  participantId: 'p',
  email: 'formation@start-academy.fr',
  date: '2026-01-10',
  expectedAt: null,
  expectedBy: null,
};
const built = () => ({
  ok: true,
  company: true,
  participant: {
    sessionId: 's',
    sponsorOrgId: 'org',
    opcoDepositedAt: null,
    opcoDepositedByEmail: null,
  },
  attachments: [
    { kind: 'CONVENTION', key: 'signed', included: true, signe: true },
    { kind: 'PROGRAMME', key: 'programme', included: true },
  ],
});
beforeEach(() => {
  vi.resetAllMocks();
  m.role.mockResolvedValue({ id: 'actual-user', tenantId: 'tenant' });
  m.build.mockResolvedValue(built());
  m.findMany.mockResolvedValue([
    { id: 'p', participantType: 'salarie', opcoDepositedAt: null, opcoDepositedByEmail: null },
    { id: 'p2', participantType: 'salarie', opcoDepositedAt: null, opcoDepositedByEmail: null },
    {
      id: 'independent',
      participantType: 'dirigeant',
      opcoDepositedAt: null,
      opcoDepositedByEmail: null,
    },
  ]);
  m.update.mockResolvedValue({ count: 1 });
});

describe('déclaration OPCO groupée par entreprise', () => {
  const groupInput = {
    sessionId: 's',
    sponsorOrgId: 'org',
    email: 'formation@start-academy.fr',
    date: '2026-01-10',
    expectedMembers: [
      { id: 'p', depositedAt: null, depositedBy: null },
      { id: 'p2', depositedAt: null, depositedBy: null },
    ],
  };

  it('déclare en une fois tous les salariés actifs et garde une seule trace groupe', async () => {
    expect(await recordCompanyOpcoDeposit(groupInput)).toEqual({ ok: true });
    expect(m.update).toHaveBeenCalledTimes(2);
    expect(m.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entity: 'Organization',
          entityId: 'org',
          action: 'opco.company_deposit_recorded',
          diff: expect.objectContaining({ participantIds: ['p', 'p2'] }),
        }),
      }),
    );
  });

  it('refuse si un salarié a été ajouté depuis l’affichage', async () => {
    m.findMany.mockResolvedValue([
      { id: 'p', participantType: 'salarie', opcoDepositedAt: null, opcoDepositedByEmail: null },
      { id: 'p2', participantType: 'salarie', opcoDepositedAt: null, opcoDepositedByEmail: null },
      { id: 'p3', participantType: 'salarie', opcoDepositedAt: null, opcoDepositedByEmail: null },
    ]);
    const result = await recordCompanyOpcoDeposit(groupInput);
    expect(result).toEqual({ ok: false, error: expect.stringContaining('groupe a changé') });
    expect(m.update).not.toHaveBeenCalled();
  });

  it('refuse une modification concurrente d’un membre', async () => {
    m.findMany.mockResolvedValue([
      {
        id: 'p',
        participantType: 'salarie',
        opcoDepositedAt: new Date('2026-01-09T12:00:00Z'),
        opcoDepositedByEmail: 'laurent@start-academy.fr',
      },
      { id: 'p2', participantType: 'salarie', opcoDepositedAt: null, opcoDepositedByEmail: null },
    ]);
    expect((await recordCompanyOpcoDeposit(groupInput)).ok).toBe(false);
    expect(m.update).not.toHaveBeenCalled();
  });

  it('annule le groupe si un membre est réaffecté pendant les écritures', async () => {
    m.update.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const result = await recordCompanyOpcoDeposit(groupInput);
    expect(result).toEqual({ ok: false, error: expect.stringContaining('groupe a changé') });
    expect(m.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'p',
          sessionId: 's',
          sponsorOrgId: 'org',
          enrollmentStatus: { not: 'CANCELLED' },
          session: { tenantId: 'tenant' },
        }),
      }),
    );
    expect(m.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'p2',
          sessionId: 's',
          sponsorOrgId: 'org',
          enrollmentStatus: { not: 'CANCELLED' },
          session: { tenantId: 'tenant' },
        }),
      }),
    );
    expect(m.audit).not.toHaveBeenCalled();
  });

  it('exige convention signée et programme avant une déclaration', async () => {
    m.build.mockResolvedValue({ ...built(), attachments: [] });
    expect((await recordCompanyOpcoDeposit(groupInput)).ok).toBe(false);
    expect(m.findMany).not.toHaveBeenCalled();
  });

  it('refuse si le premier salarié est complet mais le second ne l’est pas', async () => {
    m.build.mockResolvedValueOnce(built()).mockResolvedValueOnce({ ...built(), attachments: [] });
    expect((await recordCompanyOpcoDeposit(groupInput)).ok).toBe(false);
    expect(m.build).toHaveBeenCalledTimes(2);
    expect(m.findMany).not.toHaveBeenCalled();
  });

  it('refuse un instantané contenant deux fois la même inscription', async () => {
    const duplicate = {
      ...groupInput,
      expectedMembers: [groupInput.expectedMembers[0]!, groupInput.expectedMembers[0]!],
    };
    expect((await recordCompanyOpcoDeposit(duplicate)).ok).toBe(false);
    expect(m.build).not.toHaveBeenCalled();
  });
});
describe('déclaration externe OPCO', () => {
  it('enregistre la personne déclarée tout en auditant le vrai auteur sans modifier le financement', async () => {
    expect(await recordOpcoDeposit(input)).toEqual({ ok: true });
    expect(m.update.mock.calls[0]![0]).toEqual({
      where: {
        id: 'p',
        sessionId: 's',
        sponsorOrgId: 'org',
        enrollmentStatus: { not: 'CANCELLED' },
        session: { tenantId: 'tenant' },
        opcoDepositedAt: null,
        opcoDepositedByEmail: null,
      },
      data: {
        opcoDepositedAt: new Date('2026-01-10T12:00:00Z'),
        opcoDepositedByEmail: 'formation@start-academy.fr',
      },
    });
    expect(m.audit.mock.calls[0]![0].data.userId).toBe('actual-user');
  });
  it('refuse un auteur inconnu, une date future et un dossier incomplet', async () => {
    expect((await recordOpcoDeposit({ ...input, email: 'unknown@example.com' })).ok).toBe(false);
    expect((await recordOpcoDeposit({ ...input, date: '2999-01-01' })).ok).toBe(false);
    m.build.mockResolvedValue({ ...built(), attachments: [] });
    expect((await recordOpcoDeposit(input)).ok).toBe(false);
    expect(m.update).not.toHaveBeenCalled();
  });
  it('refuse un dossier hors tenant ou AGEFICE', async () => {
    m.build
      .mockResolvedValueOnce({ ok: false, error: 'Inscription introuvable' })
      .mockResolvedValueOnce({ ...built(), company: false });
    expect((await recordOpcoDeposit(input)).ok).toBe(false);
    expect((await recordOpcoDeposit(input)).ok).toBe(false);
    expect(m.update).not.toHaveBeenCalled();
  });
  it('une modification concurrente ne remplace pas le suivi', async () => {
    m.update.mockResolvedValue({ count: 0 });
    expect((await recordOpcoDeposit(input)).ok).toBe(false);
    expect(m.audit).not.toHaveBeenCalled();
  });
  it('permet de corriger une déclaration erronée même si des pièces ont disparu', async () => {
    m.build.mockResolvedValue({ ...built(), attachments: [] });
    expect((await recordOpcoDeposit({ ...input, email: null, date: null })).ok).toBe(true);
    expect(m.update.mock.calls[0]![0].data).toEqual({
      opcoDepositedAt: null,
      opcoDepositedByEmail: null,
    });
  });
});
