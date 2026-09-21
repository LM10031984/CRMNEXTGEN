import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertTestDatabaseContent } from '../../../../../../packages/db/scripts/assert-test-target';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  sendMail: vi.fn(),
  createSignature: vi.fn(),
}));
vi.mock('@/lib/rbac', () => ({
  requireRole: mocks.requireRole,
  UnauthorizedError: class UnauthorizedError extends Error {},
  ForbiddenError: class ForbiddenError extends Error {},
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/mailer', () => ({ sendMail: mocks.sendMail }));
vi.mock('@/lib/storage', () => ({
  DOCS_BUCKET: 'test-only',
  downloadFile: vi.fn(async (_bucket: string, key: string) => Buffer.from(key)),
}));
vi.mock('@/lib/of-config', () => ({
  loadOfConfig: vi.fn(async () => ({ name: 'TEST-OF', emailFrom: 'of@example.invalid' })),
}));
vi.mock('@/lib/signature/provider', () => ({
  getSignatureProvider: () => ({
    name: 'test-only',
    createRequest: mocks.createSignature,
    cancel: vi.fn(),
  }),
  SignatureNotConfiguredError: class SignatureNotConfiguredError extends Error {},
}));
vi.mock('@/lib/closure/convention-core', () => ({
  generateConventionCore: vi.fn(),
  generateConventionEntrepriseCore: vi.fn(),
}));
vi.mock('../agefice-generator', () => ({ generateAgeficeForParticipant: vi.fn() }));
vi.mock('../agefice-attendance-generator', () => ({
  generateAgeficeAttendanceForParticipant: vi.fn(),
}));
vi.mock('@qualiof/db', async (original) => {
  const { assertTestTarget } =
    await import('../../../../../../packages/db/scripts/assert-test-target');
  assertTestTarget({ databaseUrl: process.env.TEST_DATABASE_URL });
  const actual = await original<typeof import('@qualiof/db')>();
  return { ...actual, prisma: actual.createPrismaClientForUrl(process.env.TEST_DATABASE_URL!) };
});

import { prisma as db } from '@qualiof/db';
import { getAfterTrainingPreview, sendAfterTrainingDelivery } from '../after-training-delivery';
import { sendForSignature } from '../signature-envoi';
import type { SignatureSignerInput } from '@/lib/signature/port';

let tenantId: string | undefined;
let sessionId: string;
let participantId: string;
let certificateId: string;
let attestationId: string;
let invoiceId: string;

beforeEach(async () => {
  vi.clearAllMocks();
  await assertTestDatabaseContent(db, process.env.TEST_DATABASE_URL);
  const tenant = await db.tenant.create({
    data: {
      name: 'TEST-AFTER-TRAINING',
      signatoryName: 'Test Responsable',
      signatoryEmail: 'of@example.invalid',
      signatoryTitle: 'Responsable',
    },
  });
  tenantId = tenant.id;
  const user = await db.user.create({
    data: {
      tenantId,
      email: `${randomUUID()}@example.invalid`,
      hashedPwd: 'test-only-unusable',
      firstName: 'Test',
      lastName: 'Delivery',
      role: 'ADMIN',
    },
  });
  mocks.requireRole.mockResolvedValue(user);
  const sponsor = await db.organization.create({
    data: { tenantId, legalName: 'TEST-EI', legalForm: 'EI', opcoCode: 'AGEFICE' },
  });
  const person = await db.person.create({
    data: {
      tenantId,
      firstName: 'Alice',
      lastName: 'Test',
      email: 'alice@example.invalid',
      phone: '+33600000001',
      legalLinks: { create: { organizationId: sponsor.id, role: 'EI_SELF' } },
    },
  });
  const product = await db.trainingProduct.create({
    data: {
      tenantId,
      code: `TEST-${randomUUID()}`,
      title: 'Formation fictive',
      durationHours: 7,
      modality: 'PRESENTIEL',
      objectives: [],
      programMd: 'Test',
    },
  });
  const session = await db.trainingSession.create({
    data: {
      tenantId,
      productId: product.id,
      code: `TEST-${randomUUID()}`,
      regime: 'INDIVIDUEL',
      startDate: new Date('2020-01-20'),
      endDate: new Date('2020-01-21'),
      modality: 'PRESENTIEL',
    },
  });
  sessionId = session.id;
  const participant = await db.sessionParticipant.create({
    data: { sessionId, personId: person.id, sponsorOrgId: sponsor.id },
  });
  participantId = participant.id;
  const certificate = await db.document.create({
    data: {
      tenantId,
      sessionId,
      participantId,
      type: 'CERTIFICAT_REALISATION',
      entityType: 'participant',
      entityId: participantId,
      pdfUrl: 'test/certificate.pdf',
      hashSha256: 'test-certificate-hash',
    },
  });
  certificateId = certificate.id;
  const attestation = await db.document.create({
    data: {
      tenantId,
      sessionId,
      participantId,
      type: 'ATTESTATION_FIN',
      entityType: 'participant',
      entityId: participantId,
      pdfUrl: 'test/attestation.pdf',
      hashSha256: 'test-attestation-hash',
    },
  });
  attestationId = attestation.id;
  const invoice = await db.invoice.create({
    data: {
      tenantId,
      participantId,
      sessionId,
      payerOrgId: sponsor.id,
      number: `FAC-TEST-${randomUUID()}`,
      status: 'ISSUED',
      amountHT: 800,
      amountTTC: 800,
      pdfUrl: 'test/ordinary-invoice.pdf',
    },
  });
  invoiceId = invoice.id;
  mocks.sendMail.mockResolvedValue({ ok: true, messageId: 'test-smtp-id' });
});

afterEach(async () => {
  if (!tenantId) return;
  const id = tenantId;
  await db.$transaction(async (tx) => {
    await tx.emailMessage.deleteMany({ where: { tenantId: id } });
    await tx.auditLog.deleteMany({ where: { tenantId: id } });
    await tx.document.deleteMany({ where: { tenantId: id } });
    await tx.signatureRequest.deleteMany({ where: { tenantId: id } });
    await tx.invoice.deleteMany({ where: { tenantId: id } });
    await tx.trainingSession.deleteMany({ where: { tenantId: id } });
    await tx.trainingProduct.deleteMany({ where: { tenantId: id } });
    await tx.person.deleteMany({ where: { tenantId: id } });
    await tx.organization.deleteMany({ where: { tenantId: id } });
    await tx.user.deleteMany({ where: { tenantId: id } });
    await tx.tenant.delete({ where: { id } });
  });
  tenantId = undefined;
});

describe('signature avant/après formation — persistance PostgreSQL et notification', () => {
  it.each([
    ['BEFORE', 'AGEFICE'],
    ['AFTER', 'ASSIDUITE'],
  ] as const)(
    'enregistre la demande %s et transmet le lien %s à l’apprenant',
    async (scope, type) => {
      await db.opcoCatalog.upsert({
        where: { code: 'AGEFICE' },
        update: {},
        create: {
          code: 'AGEFICE',
          name: 'AGEFICE',
          type: 'FAF',
          conventionSigner: 'DIRIGEANT',
          ageficeSigner: 'STAGIAIRE',
          assiduiteSigner: 'STAGIAIRE',
        },
      });
      const document = await db.document.create({
        data: {
          tenantId: tenantId!,
          sessionId,
          participantId,
          type,
          entityType: 'participant',
          entityId: participantId,
          pdfUrl: `test/${type}.pdf`,
          hashSha256: `test-${type}`,
        },
      });
      mocks.createSignature.mockImplementation(
        async ({ signers }: { signers: SignatureSignerInput[] }) => ({
          providerId: `test-${randomUUID()}`,
          status: 'SENT',
          signatureFieldCount: 2,
          expiresAt: null,
          signers: signers.map((signer, i) => ({
            ...signer,
            providerSignerId: `test-signer-${i}`,
            status: 'sent',
            signedAt: null,
            signUrl: `https://signature.example.invalid/s/test-${i}`,
          })),
        }),
      );
      const input = {
        sessionId,
        scope,
        cibles: [{ cle: `${type}:${participantId}`, hashConfirme: `test-${type}` }],
      };
      const result = await sendForSignature(input);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.refus).toEqual([]);
      expect(result.envoyes).toHaveLength(1);
      expect(result.envoyes[0]!.notification).toMatchObject({
        envoye: true,
        destinataire: 'alice@example.invalid',
      });
      const saved = await db.document.findUniqueOrThrow({ where: { id: document.id } });
      expect(saved.status).toBe('sent_for_signature');
      expect(saved.signatureRequestId).toBeTruthy();
      expect(await db.signatureRequest.count({ where: { tenantId, status: 'SENT' } })).toBe(1);
      expect(await db.auditLog.count({ where: { tenantId, action: 'signature.notified' } })).toBe(
        1,
      );
      expect(mocks.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'alice@example.invalid',
          html: expect.stringContaining('https://signature.example.invalid/s/test-0'),
          context: expect.objectContaining({ category: 'signature' }),
        }),
      );
      await sendForSignature(input);
      expect(mocks.createSignature).toHaveBeenCalledTimes(1);
      expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    },
  );
});
afterAll(async () => {
  await db.$disconnect();
});

async function confirmedInput() {
  const preview = await getAfterTrainingPreview(sessionId);
  expect(preview.ok).toBe(true);
  const delivery = preview.deliveries![0]!;
  expect(delivery.blockers).toEqual([]);
  return { sessionId, deliveryKey: delivery.key, fingerprint: delivery.fingerprint };
}

describe('after-training delivery — real PostgreSQL claim and confirmation', () => {
  it('envoie les trois pièces de fin de formation puis confirme le suivi sans erreur Prisma void', async () => {
    expect(await sendAfterTrainingDelivery(await confirmedInput())).toEqual({ ok: true });
    const messages = await db.emailMessage.findMany({ where: { tenantId } });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      status: 'sent',
      documentIds: [certificateId, attestationId],
    });
    expect(messages[0]!.sentAt).toBeInstanceOf(Date);
    expect(
      (await db.sessionParticipant.findUniqueOrThrow({ where: { id: participantId } }))
        .closingDocsSent,
    ).toBe(true);
    expect((await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).status).toBe(
      'ISSUED',
    );
    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'alice@example.invalid',
        attachments: expect.arrayContaining([
          expect.objectContaining({ content: Buffer.from('test/ordinary-invoice.pdf') }),
          expect.objectContaining({ content: Buffer.from('test/certificate.pdf') }),
          expect.objectContaining({ content: Buffer.from('test/attestation.pdf') }),
        ]),
      }),
    );
    expect(
      await db.auditLog.count({ where: { tenantId, action: 'after_training.delivery_sent' } }),
    ).toBe(1);
  });

  it('deux confirmations simultanées ne déclenchent qu’un seul envoi', async () => {
    const input = await confirmedInput();
    const results = await Promise.all([
      sendAfterTrainingDelivery(input),
      sendAfterTrainingDelivery(input),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    expect(await db.emailMessage.count({ where: { tenantId, status: 'sent' } })).toBe(1);
    expect(
      await db.auditLog.count({ where: { tenantId, action: 'after_training.delivery_claimed' } }),
    ).toBe(1);
    expect((await sendAfterTrainingDelivery(input)).ok).toBe(false);
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
  });

  it('un résultat SMTP incertain garde le verrou et ne confirme pas les documents', async () => {
    mocks.sendMail.mockResolvedValue({ ok: false });
    const input = await confirmedInput();
    expect((await sendAfterTrainingDelivery(input)).ok).toBe(false);
    expect((await sendAfterTrainingDelivery(input)).ok).toBe(false);
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    const message = await db.emailMessage.findFirstOrThrow({ where: { tenantId } });
    expect(message).toMatchObject({ status: 'queued', sentAt: null, documentIds: null });
    expect(
      (await db.sessionParticipant.findUniqueOrThrow({ where: { id: participantId } }))
        .closingDocsSent,
    ).toBe(false);
    expect(
      await db.auditLog.count({ where: { tenantId, action: 'after_training.delivery_sent' } }),
    ).toBe(0);
  });
});
