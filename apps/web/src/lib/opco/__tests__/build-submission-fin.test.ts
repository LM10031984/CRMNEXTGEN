import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'lucia';

const m = vi.hoisted(() => ({
  participant: vi.fn(),
  participants: vi.fn(),
  documents: vi.fn(),
  invoices: vi.fn(),
  submission: vi.fn(),
  updateMany: vi.fn(),
  mail: vi.fn(),
  download: vi.fn(),
  audit: vi.fn(),
  auth: vi.fn(),
}));
vi.mock('@qualiof/db', () => {
  const db = {
    $executeRaw: vi.fn(),
    sessionParticipant: { findFirst: m.participant, findMany: m.participants },
    document: { findMany: m.documents },
    invoice: { findMany: m.invoices },
    opcoSubmission: {
      findFirst: (a: any) => (a.where?.id?.not ? null : m.submission(a)),
      updateMany: m.updateMany,
    },
    auditLog: { create: m.audit },
  };
  return {
    Prisma: {},
    prisma: { ...db, $transaction: async (fn: (tx: typeof db) => unknown) => fn(db) },
  };
});
vi.mock('@/lib/auth', () => ({ validateRequest: m.auth }));
vi.mock('@/lib/mailer', () => ({ sendMail: m.mail }));
vi.mock('@/lib/storage', () => ({ DOCS_BUCKET: 'documents', downloadFile: m.download }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { buildOpcoSubmission } from '../build-submission';
import { sendOpcoSubmission } from '@/server/actions/opco-submission';

const user = {
  id: 'admin',
  tenantId: 'tenant',
  role: 'ADMIN',
  firstName: 'Béatrice',
  lastName: 'Blanc',
  email: 'formation@start-academy.fr',
} as User;
function participant() {
  return {
    id: 'participant',
    sessionId: 'session',
    sponsorOrgId: 'sponsor',
    priceHT: 100,
    person: {
      firstName: 'Jean',
      lastName: 'Martin',
      legalLinks: [],
      ribKey: 'rib.pdf',
      sensitiveData: null,
    },
    sponsorOrg: {
      opcoCode: 'AGEFICE',
      ageficeProfile: { pointAccueil: { name: 'CCI', email: 'cci@example.test' } },
    },
    session: {
      id: 'session',
      code: 'SES-1',
      startDate: new Date('2020-01-01'),
      endDate: new Date('2020-01-02'),
      product: { title: 'Formation', durationHours: 7 },
    },
  };
}
function documents() {
  return ['EMARGEMENT', 'ASSIDUITE'].map((type) => ({
    id: type,
    type,
    participantId: 'participant',
    entityType: 'participant',
    entityId: 'participant',
    pdfUrl: `${type}.pdf`,
    signedPdfUrl: `signed/${type}.pdf`,
    signatureRequest: null,
  }));
}
function invoice(over: Record<string, unknown> = {}) {
  return {
    id: 'invoice',
    number: 'FAC-2020-001',
    status: 'PAID',
    paidAt: new Date('2020-01-03'),
    amountPaid: 120,
    amountTTC: 120,
    payments: [{ source: 'MANUAL' }],
    creditNotes: [],
    ...over,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  m.participant.mockResolvedValue(participant());
  m.participants.mockResolvedValue([]);
  m.documents.mockResolvedValue(documents());
  m.invoices.mockResolvedValue([invoice()]);
  m.auth.mockResolvedValue({ user });
  m.updateMany.mockResolvedValue({ count: 1 });
  m.mail.mockResolvedValue({ ok: true, messageId: 'smtp-id' });
  m.download.mockResolvedValue(Buffer.from('%PDF-1.7'));
});

async function prepare() {
  const built = await buildOpcoSubmission('participant', user, 'FIN_FORMATION');
  if (!built.ok) throw new Error(built.error);
  m.submission.mockResolvedValue({
    id: 'submission',
    participantId: 'participant',
    stage: 'FIN_FORMATION',
    status: 'DRAFT',
    deliveryState: 'READY',
    recipientEmail: built.recipientEmail,
    subject: built.subject,
    bodyHtml: built.bodyHtml,
    attachments: built.attachments,
  });
  return built;
}

describe('dossier de fin de formation — sources réelles', () => {
  it('joint seulement RIB, émargement signé, assiduité signée et facture acquittée', async () => {
    const built = await prepare();
    expect(built.attachments.map((p) => p.kind)).toEqual([
      'RIB',
      'EMARGEMENT',
      'ASSIDUITE',
      'FACTURE_ACQUITTEE',
    ]);
    expect(
      built.attachments
        .filter((p) => ['EMARGEMENT', 'ASSIDUITE'].includes(p.kind))
        .every((p) => p.signe && p.key.startsWith('signed/')),
    ).toBe(true);
    expect(built.missing).toEqual([]);
    expect(built.bodyHtml).not.toContain('sécurité sociale');
    expect(built.subject).toBe('FIN DE FORMATION pour Jean MARTIN');
    expect((await sendOpcoSubmission('submission')).ok).toBe(true);
    expect(m.mail.mock.calls[0]![0].attachments).toHaveLength(4);
  });

  it('refuse une session dont la fin est encore future', async () => {
    const p = participant();
    p.session.endDate = new Date('2999-01-01');
    m.participant.mockResolvedValue(p);
    const result = await buildOpcoSubmission('participant', user, 'FIN_FORMATION');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('terminée');
    expect(m.invoices).not.toHaveBeenCalled();
  });

  it.each(['EMARGEMENT', 'ASSIDUITE'])(
    'refuse côté serveur une signature absente sur %s',
    async (type) => {
      m.documents.mockResolvedValue(
        documents().map((d) => (d.type === type ? { ...d, signedPdfUrl: null } : d)),
      );
      await prepare();
      const result = await sendOpcoSubmission('submission', { force: true });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Signature manquante');
      expect(m.mail).not.toHaveBeenCalled();
    },
  );

  it('ne récupère pas les pièces signées d’un autre participant', async () => {
    m.documents.mockResolvedValue(
      documents().map((d) => ({ ...d, participantId: 'other-participant' })),
    );
    const built = await prepare();
    expect(built.missing).toEqual(['EMARGEMENT', 'ASSIDUITE']);
    expect((await sendOpcoSubmission('submission')).ok).toBe(false);
    expect(m.mail).not.toHaveBeenCalled();
  });

  it('scope la recherche facture au tenant et à cet apprenant, y compris facture groupe', async () => {
    await prepare();
    expect(m.invoices).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant',
          OR: [
            { participantId: 'participant' },
            {
              sessionId: 'session',
              payerOrgId: 'sponsor',
              participantIds: { array_contains: ['participant'] },
            },
          ],
        }),
      }),
    );
  });

  it.each([
    ['non payée', { status: 'SENT' }],
    ['date de paiement absente', { paidAt: null }],
    ['paiement partiel', { amountPaid: 119 }],
    ['paiement synthétique OPCO', { payments: [{ source: 'OPCO_SYNC' }] }],
    ['avoir', { creditNotes: [{ id: 'credit' }] }],
  ])('ne transmet pas de facture acquittée si %s', async (_name, over) => {
    m.invoices.mockResolvedValue([invoice(over)]);
    const built = await prepare();
    expect(built.missing).toContain('FACTURE_ACQUITTEE');
    expect(built.invoiceId).toBeNull();
    expect((await sendOpcoSubmission('submission')).ok).toBe(false);
    expect(m.mail).not.toHaveBeenCalled();
  });

  it.each([{ invoices: [] }, { invoices: [invoice(), invoice({ id: 'second' })] }])(
    'bloque une facture absente ou ambiguë',
    async ({ invoices }) => {
      m.invoices.mockResolvedValue(invoices);
      const built = await prepare();
      expect(built.missing).toContain('FACTURE_ACQUITTEE');
      expect((await sendOpcoSubmission('submission')).ok).toBe(false);
      expect(m.mail).not.toHaveBeenCalled();
    },
  );

  it('bloque si le PDF acquitté n’est pas encore disponible au stockage', async () => {
    await prepare();
    m.download.mockRejectedValue(new Error('not found'));
    expect((await sendOpcoSubmission('submission')).ok).toBe(false);
    expect(m.mail).not.toHaveBeenCalled();
    expect(m.updateMany.mock.calls.at(-1)![0].data.deliveryState).toBe('READY');
  });
});
