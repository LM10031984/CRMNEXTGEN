import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ role: vi.fn(), build: vi.fn(), update: vi.fn(), audit: vi.fn() }));
vi.mock('@/lib/rbac', () => ({ requireRole: m.role }));
vi.mock('@/lib/opco/build-submission', () => ({ buildOpcoSubmission: m.build }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@qualiof/db', () => {
  const tx = { sessionParticipant: { updateMany: m.update }, auditLog: { create: m.audit } };
  return { prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn(tx) } };
});
import { recordOpcoDeposit } from '../opco-deposit';
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
  participant: { sessionId: 's', opcoDepositedAt: null, opcoDepositedByEmail: null },
  attachments: [
    { kind: 'CONVENTION', key: 'signed', included: true, signe: true },
    { kind: 'PROGRAMME', key: 'programme', included: true },
  ],
});
beforeEach(() => {
  vi.resetAllMocks();
  m.role.mockResolvedValue({ id: 'actual-user', tenantId: 'tenant' });
  m.build.mockResolvedValue(built());
  m.update.mockResolvedValue({ count: 1 });
});
describe('déclaration externe OPCO', () => {
  it('enregistre la personne déclarée tout en auditant le vrai auteur sans modifier le financement', async () => {
    expect(await recordOpcoDeposit(input)).toEqual({ ok: true });
    expect(m.update.mock.calls[0]![0]).toEqual({
      where: {
        id: 'p',
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
