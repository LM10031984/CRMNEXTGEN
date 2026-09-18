import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertTestDatabaseContent } from '../../../../../../packages/db/scripts/assert-test-target';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  build: vi.fn(),
  sendMail: vi.fn(),
  download: vi.fn(),
}));
vi.mock('@/lib/rbac', () => ({ requireRole: mocks.requireRole }));
vi.mock('@/lib/auth', () => ({ validateRequest: vi.fn() }));
vi.mock('@/lib/opco/build-submission', () => ({ buildOpcoSubmission: mocks.build }));
vi.mock('@/lib/mailer', () => ({ sendMail: mocks.sendMail }));
vi.mock('@/lib/storage', () => ({
  DOCS_BUCKET: 'test-only',
  downloadFile: mocks.download,
  objectExists: vi.fn().mockResolvedValue(true),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@qualiof/db', async (original) => {
  const { assertTestTarget } =
    await import('../../../../../../packages/db/scripts/assert-test-target');
  assertTestTarget({ databaseUrl: process.env.TEST_DATABASE_URL });
  const actual = await original<typeof import('@qualiof/db')>();
  return { ...actual, prisma: actual.createPrismaClientForUrl(process.env.TEST_DATABASE_URL!) };
});

import { prisma as db } from '@qualiof/db';
import { composeOpcoSubmission, sendOpcoSubmission } from '../opco-submission';

let tenantId: string | undefined;
let participantId: string;
let sponsorOrgId: string;
let userId: string;
const attachments = [
  'CNI',
  'CFP_ATTESTATION',
  'RIB',
  'CONVENTION',
  'AGEFICE_PA_FORM',
  'PROGRAMME',
].map((kind) => ({
  kind,
  key: `test/${kind}.pdf`,
  filename: `${kind}.pdf`,
  included: true,
  signe: ['CONVENTION', 'AGEFICE_PA_FORM'].includes(kind),
}));

beforeEach(async () => {
  vi.clearAllMocks();
  await assertTestDatabaseContent(db, process.env.TEST_DATABASE_URL);
  const tenant = await db.tenant.create({ data: { name: 'TEST-OPCO-DELIVERY' } });
  tenantId = tenant.id;
  const user = await db.user.create({
    data: {
      tenantId,
      email: `${randomUUID()}@delivery.invalid`,
      hashedPwd: 'test-only-unusable',
      firstName: 'Test',
      lastName: 'Delivery',
      role: 'ADMIN',
    },
  });
  userId = user.id;
  mocks.requireRole.mockResolvedValue(user);
  const sponsor = await db.organization.create({
    data: { tenantId, legalName: 'TEST-SPONSOR-DELIVERY', legalForm: 'EI' },
  });
  sponsorOrgId = sponsor.id;
  const product = await db.trainingProduct.create({
    data: {
      tenantId,
      code: `TEST-${randomUUID()}`,
      title: 'TEST-PRODUCT-DELIVERY',
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
      startDate: new Date('2026-11-20'),
      endDate: new Date('2026-11-20'),
      modality: 'PRESENTIEL',
    },
  });
  const person = await db.person.create({
    data: { tenantId, firstName: 'Test', lastName: 'TEST-DELIVERY' },
  });
  const participant = await db.sessionParticipant.create({
    data: { sessionId: session.id, personId: person.id, sponsorOrgId },
  });
  participantId = participant.id;
  mocks.build.mockResolvedValue({
    ok: true,
    participant: { ...participant, sessionId: session.id },
    agefice: true,
    invoiceId: null,
    nir: '1850578006084',
    stage: 'PRISE_EN_CHARGE',
    recipientEmail: 'test@example.invalid',
    subject: 'TEST dossier',
    bodyHtml: '<p>1850578006084</p>',
    attachments,
    missing: [],
    avertissementDestinataire: null,
  });
  mocks.download.mockResolvedValue(Buffer.from('%PDF-test-only'));
  mocks.sendMail.mockResolvedValue({ ok: true, messageId: 'test-smtp-id' });
});

afterEach(async () => {
  if (!tenantId) return;
  const id = tenantId;
  // Only this test's TEST-* tenant; never delete by an unscoped condition.
  await db.$transaction(async (tx) => {
    await tx.opcoSubmission.deleteMany({ where: { tenantId: id } });
    await tx.auditLog.deleteMany({ where: { tenantId: id } });
    await tx.trainingSession.deleteMany({ where: { tenantId: id } });
    await tx.trainingProduct.deleteMany({ where: { tenantId: id } });
    await tx.person.deleteMany({ where: { tenantId: id } });
    await tx.organization.deleteMany({ where: { tenantId: id } });
    await tx.user.deleteMany({ where: { tenantId: id } });
    await tx.tenant.delete({ where: { id } });
  });
  tenantId = undefined;
});
afterAll(async () => {
  await db.$disconnect();
});

function legacyDraft() {
  return db.opcoSubmission.create({
    data: {
      tenantId: tenantId!,
      participantId,
      sponsorOrgId,
      stage: 'PRISE_EN_CHARGE',
      recipientEmail: 'test@example.invalid',
      subject: 'TEST dossier',
      bodyHtml: '<p>1850578006084</p>',
      attachments,
      createdById: userId,
    },
  });
}

describe('OPCO delivery — real PostgreSQL advisory locks and state transitions', () => {
  it('concurrent compose calls create one draft and one audit event', async () => {
    const results = await Promise.all([
      composeOpcoSubmission(participantId),
      composeOpcoSubmission(participantId),
    ]);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(results[0]!.submissionId).toBe(results[1]!.submissionId);
    expect(
      await db.opcoSubmission.count({
        where: { tenantId, participantId, stage: 'PRISE_EN_CHARGE' },
      }),
    ).toBe(1);
    expect(await db.auditLog.count({ where: { tenantId, action: 'opco.composed' } })).toBe(1);
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it('two legacy draft IDs for one participant/stage cannot both reach SMTP', async () => {
    const [first, second] = await Promise.all([legacyDraft(), legacyDraft()]);
    const results = await Promise.all([
      sendOpcoSubmission(first.id),
      sendOpcoSubmission(second.id),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    expect(await db.opcoSubmission.count({ where: { tenantId, status: 'SENT' } })).toBe(1);
    expect(
      await db.opcoSubmission.count({
        where: { tenantId, status: 'DRAFT', deliveryState: 'READY' },
      }),
    ).toBe(1);
    expect(await db.auditLog.count({ where: { tenantId, action: 'opco.sent' } })).toBe(1);
  });

  it('dry-run leaves a DRAFT READY with no sent timestamp or sent audit', async () => {
    const draft = await legacyDraft();
    mocks.sendMail.mockResolvedValue({ ok: true, dryRun: true });
    expect(await sendOpcoSubmission(draft.id)).toEqual({ ok: true, dryRun: true });
    expect(await db.opcoSubmission.findUniqueOrThrow({ where: { id: draft.id } })).toMatchObject({
      status: 'DRAFT',
      deliveryState: 'READY',
      sentAt: null,
      sendingStartedAt: null,
    });
    expect(await db.auditLog.count({ where: { tenantId, action: 'opco.sent' } })).toBe(0);
  });
});
