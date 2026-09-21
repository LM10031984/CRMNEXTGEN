import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  sessionFindFirst: vi.fn(),
  documentFindMany: vi.fn(),
  invoiceFindMany: vi.fn(),
  messageFindMany: vi.fn(),
  messageFindFirst: vi.fn(),
  messageCreate: vi.fn(),
  messageUpdate: vi.fn(),
  messageUpdateMany: vi.fn(),
  participantUpdateMany: vi.fn(),
  auditCreate: vi.fn(),
  auditFindMany: vi.fn(),
  executeRaw: vi.fn(),
  transaction: vi.fn(),
  downloadFile: vi.fn(),
  sendMail: vi.fn(),
  loadOfConfig: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@qualiof/db', () => ({
  prisma: {
    trainingSession: { findFirst: mocks.sessionFindFirst },
    document: { findMany: mocks.documentFindMany },
    invoice: { findMany: mocks.invoiceFindMany },
    emailMessage: {
      findMany: mocks.messageFindMany,
      findFirst: mocks.messageFindFirst,
      update: mocks.messageUpdate,
    },
    auditLog: { findMany: mocks.auditFindMany },
    $transaction: mocks.transaction,
  },
}));
vi.mock('@/lib/rbac', () => ({
  requireRole: mocks.requireRole,
  UnauthorizedError: class UnauthorizedError extends Error {},
  ForbiddenError: class ForbiddenError extends Error {},
}));
vi.mock('@/lib/storage', () => ({ DOCS_BUCKET: 'docs', downloadFile: mocks.downloadFile }));
vi.mock('@/lib/mailer', () => ({ sendMail: mocks.sendMail }));
vi.mock('@/lib/of-config', () => ({ loadOfConfig: mocks.loadOfConfig }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import {
  getAfterTrainingPreview,
  recoverUncertainAfterTrainingDelivery,
  sendAfterTrainingDelivery,
} from '../after-training-delivery';

const tenantId = 'tenant-1';
const sessionId = 'session-1';
const participantId = 'participant-1';

function individualSession() {
  return {
    id: sessionId,
    code: 'SES-0109',
    startDate: new Date('2026-09-01T00:00:00Z'),
    endDate: new Date('2026-09-02T00:00:00Z'),
    regime: 'INDIVIDUEL',
    product: { title: 'Formation test' },
    participants: [
      {
        id: participantId,
        sponsorOrgId: 'org-1',
        person: {
          firstName: 'Alice',
          lastName: 'Martin',
          email: 'alice@example.test',
          legalLinks: [
            { organizationId: 'org-1', role: 'EI_SELF', startDate: null, endDate: null },
          ],
        },
        sponsorOrg: {
          id: 'org-1',
          legalName: 'Alice EI',
          brandName: null,
          legalForm: 'EI',
          representative: 'Alice MARTIN',
          contacts: [],
        },
      },
    ],
  };
}

function companySession(): any {
  const session: any = individualSession();
  session.regime = 'ENTREPRISE';
  const org = session.participants[0]!.sponsorOrg;
  org.representative = 'Claire Responsable';
  org.contacts = [
    { firstName: 'Claire', lastName: 'Responsable', email: 'claire@example.test', isPrimary: true },
  ];
  session.participants[0]!.person.legalLinks[0]!.role = 'SALARIE';
  session.participants.push({
    ...session.participants[0]!,
    id: 'participant-2',
    person: {
      firstName: 'Bob',
      lastName: 'Durand',
      email: 'bob@example.test',
      legalLinks: [{ organizationId: 'org-1', role: 'SALARIE', startDate: null, endDate: null }],
    },
    sponsorOrg: org,
  });
  return session;
}

function companyDocuments() {
  return [
    {
      id: 'att-1',
      participantId,
      type: 'ATTESTATION_FIN',
      pdfUrl: 'att-1.pdf',
      signedPdfUrl: null,
      hashSha256: 'h1',
    },
    {
      id: 'att-2',
      participantId: 'participant-2',
      type: 'ATTESTATION_FIN',
      pdfUrl: 'att-2.pdf',
      signedPdfUrl: null,
      hashSha256: 'h2',
    },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireRole.mockResolvedValue({ id: 'admin-1', tenantId, role: 'ADMIN' });
  mocks.sessionFindFirst.mockResolvedValue(individualSession());
  mocks.documentFindMany.mockResolvedValue([
    {
      id: 'certificate-1',
      participantId,
      type: 'CERTIFICAT_REALISATION',
      pdfUrl: 'private/certificate.pdf',
      signedPdfUrl: null,
      hashSha256: 'cert-hash',
    },
    {
      id: 'attestation-1',
      participantId,
      type: 'ATTESTATION_FIN',
      pdfUrl: 'private/attestation.pdf',
      signedPdfUrl: null,
      hashSha256: 'attestation-hash',
    },
  ]);
  mocks.invoiceFindMany.mockResolvedValue([
    {
      id: 'invoice-1',
      number: 'FAC-0001',
      status: 'PAID',
      paidAt: new Date('2026-09-03'),
      amountPaid: 800,
      amountTTC: 800,
      payments: [{ source: 'MANUAL' }],
      creditNotes: [],
      participantId,
      participantIds: null,
      sessionId: null,
      payerOrgId: 'org-1',
      pdfUrl: 'private/FAC-0001.pdf',
      hashSha256: 'invoice-hash',
      createdAt: new Date(),
      payerOrg: { legalName: 'Alice EI', brandName: null },
      participant: { person: { firstName: 'Alice', lastName: 'Martin' } },
    },
  ]);
  mocks.messageFindMany.mockResolvedValue([]);
  mocks.downloadFile.mockImplementation(async (_bucket: string, key: string) => Buffer.from(key));
  mocks.loadOfConfig.mockResolvedValue({
    name: 'Start Academy',
    emailFrom: 'formation@example.test',
  });
  mocks.sendMail.mockResolvedValue({ ok: true, messageId: 'smtp-1' });
  mocks.messageFindFirst.mockResolvedValue(null);
  mocks.auditFindMany.mockResolvedValue([]);
  mocks.messageCreate.mockResolvedValue({ id: 'message-1' });
  const tx = {
    $executeRaw: mocks.executeRaw,
    emailMessage: {
      findFirst: mocks.messageFindFirst,
      create: mocks.messageCreate,
      update: mocks.messageUpdate,
      updateMany: mocks.messageUpdateMany,
    },
    sessionParticipant: { updateMany: mocks.participantUpdateMany },
    auditLog: { create: mocks.auditCreate },
  };
  mocks.transaction.mockImplementation(async (callback: (arg: typeof tx) => unknown) =>
    callback(tx),
  );
});

describe('after-training delivery', () => {
  it.each(['ISSUED', 'PARTIAL', 'OVERDUE', 'PAID'])(
    'envoie la facture ordinaire et le certificat sans condition de paiement (%s)',
    async (status) => {
      const invoices = await mocks.invoiceFindMany();
      mocks.invoiceFindMany.mockResolvedValue([
        { ...invoices[0], status, paidAt: null, amountPaid: 0 },
      ]);
      const delivery = (await getAfterTrainingPreview(sessionId)).deliveries![0]!;
      expect(delivery.blockers).toEqual([]);
      expect(delivery.attachments.find((a) => a.kind === 'invoice')?.label).toBe(
        'Facture FAC-0001',
      );
      expect(delivery.text).toContain('votre facture');
      expect(delivery.text).toContain('votre certificat de réalisation');
      expect(delivery.text).toContain('votre attestation de fin de formation');
      expect(delivery.text).not.toContain('acquittée');
      expect(
        (
          await sendAfterTrainingDelivery({
            sessionId,
            deliveryKey: delivery.key,
            fingerprint: delivery.fingerprint,
          })
        ).ok,
      ).toBe(true);
      expect(mocks.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: expect.arrayContaining([
            expect.objectContaining({
              filename: 'Facture-FAC-0001-Alice-EI.pdf',
              content: Buffer.from('private/FAC-0001.pdf'),
            }),
          ]),
        }),
      );
      expect(
        mocks.downloadFile.mock.calls.some((call) => String(call[1]).includes('acquittee')),
      ).toBe(false);
    },
  );

  it('bloque un PDF ordinaire illisible sans proposer de préparer une acquittée', async () => {
    mocks.downloadFile.mockRejectedValue(new Error('Not found'));
    const delivery = (await getAfterTrainingPreview(sessionId)).deliveries![0]!;
    expect(delivery).not.toHaveProperty('prepareInvoiceId');
    expect(delivery.blockers.join(' ')).toContain('facture ordinaire émise est illisible');
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it('sends the reviewed message as escaped HTML with the learner category and OF sender', async () => {
    const delivery = (await getAfterTrainingPreview(sessionId)).deliveries![0]!;
    expect(
      (
        await sendAfterTrainingDelivery({
          sessionId,
          deliveryKey: delivery.key,
          fingerprint: delivery.fingerprint,
          messageText: 'Bonjour <Alice>,\n\nVotre document.\nClaire',
        })
      ).ok,
    ).toBe(true);
    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Start Academy <formation@example.test>',
        text: 'Bonjour <Alice>,\n\nVotre document.\nClaire',
        html: '<p>Bonjour &lt;Alice&gt;,</p><p>Votre document.<br>Claire</p>',
        context: expect.objectContaining({ category: 'learner_documents' }),
      }),
    );
  });

  it('blocks when the ordinary invoice bytes change between preview and attachment download', async () => {
    const delivery = (await getAfterTrainingPreview(sessionId)).deliveries![0]!;
    mocks.downloadFile
      .mockResolvedValueOnce(Buffer.from('private/FAC-0001.pdf'))
      .mockResolvedValueOnce(Buffer.from('modified invoice'));
    expect(
      (
        await sendAfterTrainingDelivery({
          sessionId,
          deliveryKey: delivery.key,
          fingerprint: delivery.fingerprint,
        })
      ).ok,
    ).toBe(false);
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it('previews the ordinary invoice, certificate and end-of-training attestation to person.email', async () => {
    const result = await getAfterTrainingPreview(sessionId);
    expect(result.ok).toBe(true);
    const delivery = result.deliveries?.[0];
    expect(delivery?.recipientEmail).toBe('alice@example.test');
    expect(delivery?.attachments.map((item) => item.label)).toEqual([
      'Facture FAC-0001',
      'Certificat de réalisation — Alice Martin',
      'Attestation de fin de formation — Alice Martin',
    ]);
    expect(JSON.stringify(delivery)).not.toContain('private/FAC-0001.pdf');
    expect(delivery?.from).toContain('formation@example.test');
  });

  it('bloque l’envoi si l’attestation de fin de formation manque', async () => {
    const documents = await mocks.documentFindMany();
    mocks.documentFindMany.mockResolvedValue(
      documents.filter((doc: { type: string }) => doc.type !== 'ATTESTATION_FIN'),
    );
    const delivery = (await getAfterTrainingPreview(sessionId)).deliveries![0]!;
    expect(delivery.blockers).toContain(
      'Attestation de fin de formation de Alice Martin manquant.',
    );
    expect(
      (
        await sendAfterTrainingDelivery({
          sessionId,
          deliveryKey: delivery.key,
          fingerprint: delivery.fingerprint,
        })
      ).ok,
    ).toBe(false);
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it('joint uniquement la dernière attestation de cet apprenant, signée si disponible', async () => {
    const documents = await mocks.documentFindMany();
    const newest = {
      id: 'attestation-new',
      participantId,
      type: 'ATTESTATION_FIN',
      pdfUrl: 'private/attestation-new.pdf',
      signedPdfUrl: 'private/attestation-signed.pdf',
      hashSha256: 'attestation-new-hash',
    };
    mocks.documentFindMany.mockResolvedValue([
      { ...newest, id: 'attestation-other', participantId: 'another-participant' },
      newest,
      ...documents,
    ]);
    const delivery = (await getAfterTrainingPreview(sessionId)).deliveries![0]!;
    expect(delivery.attachments.map((item) => item.id)).toEqual([
      'invoice-1',
      'certificate-1',
      'attestation-new',
    ]);
    expect(
      (
        await sendAfterTrainingDelivery({
          sessionId,
          deliveryKey: delivery.key,
          fingerprint: delivery.fingerprint,
        })
      ).ok,
    ).toBe(true);
    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: expect.arrayContaining([
          expect.objectContaining({ content: Buffer.from('private/attestation-signed.pdf') }),
        ]),
      }),
    );
  });

  it('blocks a multi-learner group invoice from an individual email', async () => {
    mocks.invoiceFindMany.mockResolvedValue([
      {
        id: 'invoice-group',
        number: 'FAC-GROUPE',
        status: 'ISSUED',
        participantId: null,
        participantIds: [participantId, 'another-participant'],
        sessionId,
        payerOrgId: 'org-1',
        pdfUrl: 'private/group.pdf',
        hashSha256: 'group-hash',
        createdAt: new Date(),
        payerOrg: { legalName: 'Alice EI', brandName: null },
        participant: null,
      },
    ]);
    const delivery = (await getAfterTrainingPreview(sessionId)).deliveries![0]!;
    expect(delivery.blockers.join(' ')).toContain('plusieurs apprenants');
    expect(delivery.attachments.some((attachment) => attachment.kind === 'invoice')).toBe(false);
  });

  it('blocks a single grouped invoice tied to the wrong payer', async () => {
    mocks.invoiceFindMany.mockResolvedValue([
      {
        id: 'invoice-wrong-payer',
        number: 'FAC-WRONG',
        status: 'ISSUED',
        participantId: null,
        participantIds: [participantId],
        sessionId,
        payerOrgId: 'unrelated-org',
        pdfUrl: 'private/wrong.pdf',
        hashSha256: 'wrong-hash',
        createdAt: new Date(),
        payerOrg: { legalName: 'Autre société', brandName: null },
        participant: null,
      },
    ]);
    const delivery = (await getAfterTrainingPreview(sessionId)).deliveries![0]!;
    expect(delivery.blockers.join(' ')).toContain('ne correspond pas au payeur ou à la session');
    expect(delivery.attachments.some((attachment) => attachment.kind === 'invoice')).toBe(false);
  });

  it('blocks a nominal single-participant invoice tied to the old payer', async () => {
    mocks.invoiceFindMany.mockResolvedValue([
      {
        id: 'invoice-old-payer',
        number: 'FAC-OLD',
        status: 'ISSUED',
        participantId,
        participantIds: [participantId],
        sessionId,
        payerOrgId: 'old-sponsor',
        pdfUrl: 'private/old.pdf',
        hashSha256: 'old-hash',
        createdAt: new Date(),
        payerOrg: { legalName: 'Ancien payeur', brandName: null },
        participant: { person: { firstName: 'Alice', lastName: 'Martin' } },
      },
    ]);
    const delivery = (await getAfterTrainingPreview(sessionId)).deliveries![0]!;
    expect(delivery.blockers.join(' ')).toContain('ne correspond pas au payeur ou à la session');
    expect(delivery.attachments.some((attachment) => attachment.kind === 'invoice')).toBe(false);
  });

  it('blocks a nominal invoice explicitly tied to another session', async () => {
    mocks.invoiceFindMany.mockResolvedValue([
      {
        id: 'invoice-other-session',
        number: 'FAC-OTHER',
        status: 'ISSUED',
        participantId,
        participantIds: [participantId],
        sessionId: 'other-session',
        payerOrgId: 'org-1',
        pdfUrl: 'private/other.pdf',
        hashSha256: 'other-hash',
        createdAt: new Date(),
        payerOrg: { legalName: 'Alice EI', brandName: null },
        participant: { person: { firstName: 'Alice', lastName: 'Martin' } },
      },
    ]);
    const delivery = (await getAfterTrainingPreview(sessionId)).deliveries![0]!;
    expect(delivery.blockers.join(' ')).toContain('ne correspond pas au payeur ou à la session');
    expect(delivery.attachments.some((attachment) => attachment.kind === 'invoice')).toBe(false);
  });

  it('blocks a multi-person participantIds array even when participantId is nominal', async () => {
    mocks.invoiceFindMany.mockResolvedValue([
      {
        id: 'invoice-direct-multi',
        number: 'FAC-MULTI',
        status: 'ISSUED',
        participantId,
        participantIds: [participantId, 'another-participant'],
        sessionId,
        payerOrgId: 'org-1',
        pdfUrl: 'private/multi.pdf',
        hashSha256: 'multi-hash',
        createdAt: new Date(),
        payerOrg: { legalName: 'Alice EI', brandName: null },
        participant: { person: { firstName: 'Alice', lastName: 'Martin' } },
      },
    ]);
    const delivery = (await getAfterTrainingPreview(sessionId)).deliveries![0]!;
    expect(delivery.blockers.join(' ')).toContain('plusieurs apprenants');
    expect(delivery.attachments.some((attachment) => attachment.kind === 'invoice')).toBe(false);
  });

  it('re-resolves exact sources, sends once, then tracks sent only after SMTP success', async () => {
    const preview = await getAfterTrainingPreview(sessionId);
    const delivery = preview.deliveries![0]!;
    const result = await sendAfterTrainingDelivery({
      sessionId,
      deliveryKey: delivery.key,
      fingerprint: delivery.fingerprint,
    });
    expect(result).toEqual({ ok: true });
    expect(new Set(mocks.downloadFile.mock.calls.map((call) => call[1]))).toEqual(
      new Set(['private/FAC-0001.pdf', 'private/certificate.pdf', 'private/attestation.pdf']),
    );
    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Start Academy <formation@example.test>',
        to: 'alice@example.test',
        attachments: expect.arrayContaining([
          expect.objectContaining({
            filename: expect.stringContaining('Facture-FAC-0001'),
          }),
          expect.objectContaining({
            filename: expect.stringContaining('Certificat-de-realisation'),
          }),
          expect.objectContaining({ content: Buffer.from('private/attestation.pdf') }),
        ]),
      }),
    );
    expect(mocks.messageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'sent',
          documentIds: ['certificate-1', 'attestation-1'],
        }),
      }),
    );
  });

  it('blocks send when the destination changed after preview', async () => {
    const preview = await getAfterTrainingPreview(sessionId);
    const delivery = preview.deliveries![0]!;
    const changed = individualSession();
    changed.participants[0]!.person.email = 'new-address@example.test';
    mocks.sessionFindFirst.mockResolvedValue(changed);
    const result = await sendAfterTrainingDelivery({
      sessionId,
      deliveryKey: delivery.key,
      fingerprint: delivery.fingerprint,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('changé depuis l’aperçu');
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it('cancels the claim when membership/destination changes after the lock', async () => {
    const preview = await getAfterTrainingPreview(sessionId);
    const delivery = preview.deliveries![0]!;
    const changed = individualSession();
    changed.participants[0]!.person.email = 'changed-after-claim@example.test';
    mocks.sessionFindFirst
      .mockResolvedValueOnce(individualSession())
      .mockResolvedValueOnce(changed);
    const result = await sendAfterTrainingDelivery({
      sessionId,
      deliveryKey: delivery.key,
      fingerprint: delivery.fingerprint,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('changé pendant la préparation');
    expect(mocks.messageUpdate).toHaveBeenCalledWith({
      where: { id: 'message-1' },
      data: { status: 'bounced' },
    });
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it('groups employees to the named representative with one attestation each and no certificate', async () => {
    mocks.sessionFindFirst.mockResolvedValue(companySession());
    mocks.documentFindMany.mockResolvedValue([
      ...companyDocuments(),
      {
        id: 'cert-ignored',
        participantId,
        type: 'CERTIFICAT_REALISATION',
        pdfUrl: 'cert.pdf',
        signedPdfUrl: null,
        hashSha256: 'hc',
      },
    ]);
    mocks.invoiceFindMany.mockResolvedValue([]);
    const result = await getAfterTrainingPreview(sessionId);
    const delivery = result.deliveries?.[0];
    expect(delivery?.recipientEmail).toBe('claire@example.test');
    expect(delivery?.attachments.map((item) => item.id)).toEqual(['att-1', 'att-2']);
  });

  it('keeps the send locked after an employee is added to an already sent group', async () => {
    mocks.sessionFindFirst.mockResolvedValue(companySession());
    mocks.documentFindMany.mockResolvedValue(companyDocuments());
    mocks.invoiceFindMany.mockResolvedValue([]);
    const first = (await getAfterTrainingPreview(sessionId)).deliveries![0]!;
    mocks.messageFindMany.mockResolvedValue([
      {
        relatedEntity: `after-training:${sessionId}:${first.key}:snapshot:${first.fingerprint}`,
        status: 'sent',
        sentAt: new Date('2026-09-10T10:00:00Z'),
        createdAt: new Date('2026-09-10T10:00:00Z'),
      },
    ]);
    const changed = companySession();
    changed.participants.push({
      ...changed.participants[0],
      id: 'participant-3',
      person: {
        firstName: 'Chloé',
        lastName: 'Petit',
        email: 'chloe@example.test',
        legalLinks: [{ organizationId: 'org-1', role: 'SALARIE', startDate: null, endDate: null }],
      },
    });
    mocks.sessionFindFirst.mockResolvedValue(changed);
    mocks.documentFindMany.mockResolvedValue([
      ...companyDocuments(),
      {
        id: 'att-3',
        participantId: 'participant-3',
        type: 'ATTESTATION_FIN',
        pdfUrl: 'att-3.pdf',
        signedPdfUrl: null,
        hashSha256: 'h3',
      },
    ]);
    const next = (await getAfterTrainingPreview(sessionId)).deliveries![0]!;
    expect(next.state).toBe('sent');
    expect(
      (
        await sendAfterTrainingDelivery({
          sessionId,
          deliveryKey: next.key,
          fingerprint: next.fingerprint,
        })
      ).ok,
    ).toBe(false);
    expect(mocks.sendMail).not.toHaveBeenCalled();
    expect(next.changedSinceLastSend).toBe(true);
    expect(next.attachments.map((item) => item.id)).toEqual(['att-1', 'att-2', 'att-3']);
    expect(next.fingerprint).not.toBe(first.fingerprint);
  });

  it('keeps the send locked when the current document changes after success', async () => {
    const first = (await getAfterTrainingPreview(sessionId)).deliveries![0]!;
    mocks.messageFindMany.mockResolvedValue([
      {
        relatedEntity: `after-training:${sessionId}:${first.key}:snapshot:${first.fingerprint}`,
        status: 'sent',
        sentAt: new Date(),
        createdAt: new Date(),
      },
    ]);
    mocks.documentFindMany.mockResolvedValue([
      {
        id: 'certificate-2',
        participantId,
        type: 'CERTIFICAT_REALISATION',
        pdfUrl: 'private/certificate-v2.pdf',
        signedPdfUrl: null,
        hashSha256: 'cert-hash-v2',
      },
    ]);
    const next = (await getAfterTrainingPreview(sessionId)).deliveries![0]!;
    expect(next.state).toBe('sent');
    expect(
      (
        await sendAfterTrainingDelivery({
          sessionId,
          deliveryKey: next.key,
          fingerprint: next.fingerprint,
        })
      ).ok,
    ).toBe(false);
    expect(mocks.sendMail).not.toHaveBeenCalled();
    expect(next.changedSinceLastSend).toBe(true);
    expect(next.attachments.map((item) => item.id)).toContain('certificate-2');
  });

  it('keeps the whole logical group blocked when an old snapshot is uncertain', async () => {
    mocks.sessionFindFirst.mockResolvedValue(companySession());
    mocks.documentFindMany.mockResolvedValue(companyDocuments());
    mocks.invoiceFindMany.mockResolvedValue([]);
    const first = (await getAfterTrainingPreview(sessionId)).deliveries![0]!;
    mocks.messageFindMany.mockResolvedValue([
      {
        relatedEntity: `after-training:${sessionId}:${first.key}:snapshot:${first.fingerprint}`,
        status: 'queued',
        sentAt: null,
        createdAt: new Date(Date.now() - 20 * 60 * 1000),
      },
    ]);
    mocks.documentFindMany.mockResolvedValue([
      {
        id: 'att-new',
        participantId,
        type: 'ATTESTATION_FIN',
        pdfUrl: 'new.pdf',
        signedPdfUrl: null,
        hashSha256: 'new',
      },
      ...companyDocuments(),
    ]);
    const changed = (await getAfterTrainingPreview(sessionId)).deliveries![0]!;
    expect(changed.fingerprint).not.toBe(first.fingerprint);
    expect(changed.state).toBe('uncertain');
  });

  it('does not mark a dry-run as sent and permits a later explicit attempt', async () => {
    const preview = (await getAfterTrainingPreview(sessionId)).deliveries![0]!;
    mocks.sendMail.mockResolvedValueOnce({ ok: true, dryRun: true });
    const result = await sendAfterTrainingDelivery({
      sessionId,
      deliveryKey: preview.key,
      fingerprint: preview.fingerprint,
    });
    expect(result.ok).toBe(false);
    expect(mocks.messageUpdate).toHaveBeenCalledWith({
      where: { id: 'message-1' },
      data: { status: 'bounced' },
    });
    mocks.messageFindMany.mockResolvedValue([
      {
        relatedEntity: `after-training:${sessionId}:${preview.key}:snapshot:${preview.fingerprint}`,
        status: 'bounced',
        sentAt: null,
        createdAt: new Date(),
      },
    ]);
    expect((await getAfterTrainingPreview(sessionId)).deliveries![0]!.state).toBe('ready');
  });

  it('refuses cancelled sessions even when their dates are in the past', async () => {
    mocks.sessionFindFirst.mockResolvedValue({ ...individualSession(), status: 'CANCELLED' });
    const result = await getAfterTrainingPreview(sessionId);
    expect(result).toEqual(
      expect.objectContaining({ ok: false, error: expect.stringContaining('annulée') }),
    );
    expect(mocks.documentFindMany).not.toHaveBeenCalled();
  });

  it('lets an admin release an uncertain claim only after the mailbox-check delay', async () => {
    mocks.messageFindFirst.mockResolvedValue({
      id: 'message-old',
      relatedEntity: `after-training:${sessionId}:individual:${participantId}:snapshot:old-fingerprint`,
      createdAt: new Date(Date.now() - 11 * 60 * 1000),
    });
    mocks.messageUpdateMany.mockResolvedValue({ count: 1 });
    const result = await recoverUncertainAfterTrainingDelivery({
      sessionId,
      deliveryKey: `individual:${participantId}`,
      resolution: 'retry',
    });
    expect(result).toEqual({ ok: true });
    expect(mocks.messageUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'bounced' } }),
    );
    expect(mocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'after_training.uncertain_released' }),
      }),
    );
  });

  it('can confirm a real send found in the mailbox without sending again', async () => {
    mocks.messageFindFirst.mockResolvedValue({
      id: 'message-old',
      relatedEntity: `after-training:${sessionId}:individual:${participantId}:snapshot:fp-1`,
      createdAt: new Date(Date.now() - 11 * 60 * 1000),
    });
    mocks.auditFindMany.mockResolvedValue([
      {
        diff: {
          deliveryKey: `individual:${participantId}`,
          fingerprint: 'fp-1',
          participantIds: [participantId],
          documentIds: ['certificate-1'],
        },
      },
    ]);
    mocks.messageUpdateMany.mockResolvedValue({ count: 1 });
    const result = await recoverUncertainAfterTrainingDelivery({
      sessionId,
      deliveryKey: `individual:${participantId}`,
      resolution: 'sent',
    });
    expect(result).toEqual({ ok: true });
    expect(mocks.messageUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'sent',
          documentIds: ['certificate-1'],
          sentAt: expect.any(Date),
        }),
      }),
    );
    expect(mocks.participantUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: [participantId] } }),
        data: { closingDocsSent: true },
      }),
    );
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });
});
