import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  role: vi.fn(),
  participant: vi.fn(),
  submissions: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  drafts: vi.fn(),
  deposit: vi.fn(),
  audit: vi.fn(),
  lock: vi.fn(),
}));
vi.mock('@/lib/rbac', () => ({ requireRole: m.role }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@qualiof/db', () => ({
  Prisma: { TransactionIsolationLevel: { Serializable: 'Serializable' } },
  prisma: {
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        $executeRaw: m.lock,
        sessionParticipant: { findFirst: m.participant, update: m.deposit },
        opcoSubmission: {
          findMany: m.submissions,
          create: m.create,
          update: m.update,
          updateMany: m.drafts,
        },
        auditLog: { create: m.audit },
      }),
  },
}));
import { recordExternalAgeficeDeposit } from '../agefice-external-deposit';
const participantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const input = {
  participantId,
  stage: 'PRISE_EN_CHARGE' as const,
  date: '2026-01-10',
  sender: 'Alice Équipe',
  recipientEmail: '',
  expectedId: null,
  expectedUpdatedAt: null,
};
const existing = () => ({
  id,
  status: 'SENT',
  deliveryMethod: 'EXTERNAL',
  deliveryState: 'READY',
  updatedAt: new Date('2026-01-11T12:00:00Z'),
  sentAt: new Date('2026-01-10T12:00:00Z'),
  externalSender: 'Alice Équipe',
});
beforeEach(() => {
  vi.resetAllMocks();
  m.role.mockResolvedValue({ id: 'actor', tenantId: 'tenant', role: 'ADMIN' });
  m.participant.mockResolvedValue({
    id: participantId,
    sessionId: 'session',
    sponsorOrgId: 'org',
    sponsorOrg: { opcoCode: 'AGEFICE' },
    financingMode: 'OPCO',
  });
  m.submissions.mockResolvedValue([]);
  m.create.mockResolvedValue({ id });
  m.update.mockResolvedValue({ id });
});

describe('déclaration AGEFICE hors QualiOF', () => {
  it('trace le dépôt initial et son auteur sans modifier la date de demande financière', async () => {
    expect(await recordExternalAgeficeDeposit(input)).toEqual({ ok: true });
    expect(m.participant).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          enrollmentStatus: { not: 'CANCELLED' },
          session: { tenantId: 'tenant' },
        }),
      }),
    );
    expect(m.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deliveryMethod: 'EXTERNAL',
          status: 'SENT',
          stage: 'PRISE_EN_CHARGE',
          externalSender: 'Alice Équipe',
          recipientEmail: null,
          attachments: [],
          createdById: 'actor',
        }),
      }),
    );
    expect(m.deposit.mock.calls[0]![0].data).toEqual({
      opcoDepositedAt: new Date('2026-01-10T12:00:00Z'),
      opcoDepositedByEmail: 'Alice Équipe',
    });
    expect(m.audit.mock.calls[0]![0].data.userId).toBe('actor');
    expect(m.lock).toHaveBeenCalledTimes(1);
  });
  it('garde le suivi de fin séparé du dépôt initial', async () => {
    expect((await recordExternalAgeficeDeposit({ ...input, stage: 'FIN_FORMATION' })).ok).toBe(
      true,
    );
    expect(m.deposit).not.toHaveBeenCalled();
    expect(m.create.mock.calls[0]![0].data.stage).toBe('FIN_FORMATION');
  });
  it.each(['2026-02-30', '2999-01-01'])('refuse la date %s sans écriture', async (date) => {
    expect((await recordExternalAgeficeDeposit({ ...input, date })).ok).toBe(false);
    expect(m.create).not.toHaveBeenCalled();
  });
  it('refuse le tenant étranger et le salarié hors AGEFICE', async () => {
    m.participant
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: participantId,
        participantType: 'Salarié',
        sponsorOrgId: 'org',
        sponsorOrg: { opcoCode: 'AGEFICE' },
      });
    expect((await recordExternalAgeficeDeposit(input)).ok).toBe(false);
    expect((await recordExternalAgeficeDeposit(input)).ok).toBe(false);
    expect(m.create).not.toHaveBeenCalled();
  });
  it.each(['SENDING', 'UNCERTAIN'])('ne remplace jamais un envoi %s', async (deliveryState) => {
    m.submissions.mockResolvedValue([{ ...existing(), deliveryState }]);
    expect((await recordExternalAgeficeDeposit(input)).ok).toBe(false);
    expect(m.update).not.toHaveBeenCalled();
  });
  it('refuse les confirmations SMTP, les doubles confirmations et les versions périmées', async () => {
    m.submissions
      .mockResolvedValueOnce([{ ...existing(), deliveryMethod: 'EMAIL' }])
      .mockResolvedValueOnce([existing(), { ...existing(), id: 'duplicate' }])
      .mockResolvedValueOnce([existing()]);
    for (let i = 0; i < 3; i++) expect((await recordExternalAgeficeDeposit(input)).ok).toBe(false);
    expect(m.create).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
  });
  it('corrige la déclaration approuvée en conservant son statut financier', async () => {
    m.submissions.mockResolvedValue([{ ...existing(), status: 'APPROVED' }]);
    expect(
      (
        await recordExternalAgeficeDeposit({
          ...input,
          date: '2026-01-09',
          expectedId: id,
          expectedUpdatedAt: existing().updatedAt.toISOString(),
        })
      ).ok,
    ).toBe(true);
    expect(m.update.mock.calls[0]![0].data.status).toBe('APPROVED');
    expect(m.drafts.mock.calls[0]![0].where).toMatchObject({
      status: 'DRAFT',
      deliveryState: 'READY',
    });
  });
  it('annule uniquement la déclaration et retire sa date de dépôt', async () => {
    m.submissions.mockResolvedValue([existing()]);
    expect(
      (
        await recordExternalAgeficeDeposit({
          ...input,
          clear: true,
          expectedId: id,
          expectedUpdatedAt: existing().updatedAt.toISOString(),
        })
      ).ok,
    ).toBe(true);
    expect(m.update.mock.calls[0]![0].data).toEqual({ status: 'CANCELED' });
    expect(m.deposit.mock.calls[0]![0].data).toEqual({
      opcoDepositedAt: null,
      opcoDepositedByEmail: null,
    });
  });
  it('refuse un rôle non habilité avant toute consultation', async () => {
    m.role.mockRejectedValue(new Error('Accès refusé'));
    expect((await recordExternalAgeficeDeposit(input)).ok).toBe(false);
    expect(m.participant).not.toHaveBeenCalled();
  });
});
