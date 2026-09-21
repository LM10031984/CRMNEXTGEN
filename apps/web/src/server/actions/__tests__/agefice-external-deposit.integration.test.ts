import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { assertTestDatabaseContent } from '../../../../../../packages/db/scripts/assert-test-target';
// Seul le choix du client est substitué : requêtes, contraintes et transactions
// utilisent réellement PostgreSQL, via une URL de test explicitement vérifiée.
// Sans ce bloc, `prisma` suit DATABASE_URL — l'URL MÉTIER, qui sur un poste de
// développement désigne la production (audit du 21/09). Le remplacement vaut
// aussi pour le CODE TESTÉ, qui importe le même `prisma`.
vi.mock('@qualiof/db', async (original) => {
  const { assertTestTarget } =
    await import('../../../../../../packages/db/scripts/assert-test-target');
  assertTestTarget({ databaseUrl: process.env.TEST_DATABASE_URL });
  const actual = await original<typeof import('@qualiof/db')>();
  return { ...actual, prisma: actual.createPrismaClientForUrl(process.env.TEST_DATABASE_URL!) };
});
import { prisma } from '@qualiof/db';
const state = vi.hoisted(() => ({ actor: { id: '', tenantId: '', role: 'ADMIN' } }));
vi.mock('@/lib/rbac', () => ({ requireRole: vi.fn(async () => state.actor) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { recordExternalAgeficeDeposit } from '../agefice-external-deposit';
let sessionId = '';
let participantId = '';
let sponsorOrgId = '';
beforeAll(async () => {
  await assertTestDatabaseContent(prisma, process.env.TEST_DATABASE_URL);
  const tenant = await prisma.tenant.create({ data: { name: 'TEST-External deposits' } });
  state.actor.tenantId = tenant.id;
  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: `${randomUUID()}@example.invalid`,
      hashedPwd: 'unusable-test',
      firstName: 'Alice',
      lastName: 'Test',
      role: 'ADMIN',
    },
  });
  state.actor.id = user.id;
  const product = await prisma.trainingProduct.create({
    data: {
      tenantId: tenant.id,
      code: 'TEST-DEPOT',
      title: 'Formation fictive',
      durationHours: 7,
      modality: 'PRESENTIEL',
      objectives: [],
      programMd: 'Test',
    },
  });
  const org = await prisma.organization.create({
    data: { tenantId: tenant.id, legalName: 'EI fictive', legalForm: 'EI', opcoCode: 'AGEFICE' },
  });
  const person = await prisma.person.create({
    data: { tenantId: tenant.id, firstName: 'Alice', lastName: 'Test' },
  });
  sponsorOrgId = org.id;
  const session = await prisma.trainingSession.create({
    data: {
      tenantId: tenant.id,
      productId: product.id,
      code: `TEST-${randomUUID()}`,
      startDate: new Date('2026-01-20'),
      endDate: new Date('2026-01-21'),
      modality: 'PRESENTIEL',
    },
  });
  sessionId = session.id;
  const participant = await prisma.sessionParticipant.create({
    data: {
      sessionId,
      personId: person.id,
      sponsorOrgId: org.id,
      financingMode: 'OPCO',
      financingRequestDate: new Date('2025-12-15'),
      opcoApproved: true,
    },
  });
  participantId = participant.id;
});
afterAll(async () => {
  const tenantId = state.actor.tenantId;
  await prisma.auditLog.deleteMany({ where: { tenantId } });
  await prisma.opcoSubmission.deleteMany({ where: { tenantId } });
  await prisma.trainingSession.deleteMany({ where: { tenantId } });
  await prisma.trainingProduct.deleteMany({ where: { tenantId } });
  await prisma.person.deleteMany({ where: { tenantId } });
  await prisma.organization.deleteMany({ where: { tenantId } });
  await prisma.tenant.delete({ where: { id: tenantId } });
  await prisma.$disconnect();
});
it('conserve les deux étapes, annule le brouillon et protège les données financières', async () => {
  const draft = await prisma.opcoSubmission.create({
    data: {
      tenantId: state.actor.tenantId,
      participantId,
      sponsorOrgId,
      stage: 'PRISE_EN_CHARGE',
      attachments: [],
    },
  });
  const input = {
    participantId,
    stage: 'PRISE_EN_CHARGE' as const,
    date: '2026-01-10',
    sender: 'Alice Test',
    expectedId: null,
    expectedUpdatedAt: null,
  };
  expect(await recordExternalAgeficeDeposit(input)).toEqual({ ok: true });
  expect(
    await recordExternalAgeficeDeposit({ ...input, stage: 'FIN_FORMATION', date: '2026-01-22' }),
  ).toEqual({ ok: true });
  expect((await prisma.opcoSubmission.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe(
    'CANCELED',
  );
  const participant = await prisma.sessionParticipant.findUniqueOrThrow({
    where: { id: participantId },
  });
  expect(participant.financingRequestDate?.toISOString().slice(0, 10)).toBe('2025-12-15');
  expect(participant.opcoApproved).toBe(true);
  expect(participant.opcoDepositedAt?.toISOString().slice(0, 10)).toBe('2026-01-10');
  expect(
    await prisma.opcoSubmission.count({
      where: { tenantId: state.actor.tenantId, status: 'SENT', deliveryMethod: 'EXTERNAL' },
    }),
  ).toBe(2);
  expect(await prisma.emailMessage.count({ where: { tenantId: state.actor.tenantId } })).toBe(0);
  expect((await recordExternalAgeficeDeposit(input)).ok).toBe(false);
  const initial = await prisma.opcoSubmission.findFirstOrThrow({
    where: { participantId, status: 'SENT', stage: 'PRISE_EN_CHARGE' },
  });
  expect(
    await recordExternalAgeficeDeposit({
      ...input,
      date: '2026-01-09',
      expectedId: initial.id,
      expectedUpdatedAt: initial.updatedAt.toISOString(),
    }),
  ).toEqual({ ok: true });
  const updated = await prisma.opcoSubmission.findUniqueOrThrow({ where: { id: initial.id } });
  expect(
    await recordExternalAgeficeDeposit({
      ...input,
      clear: true,
      expectedId: updated.id,
      expectedUpdatedAt: updated.updatedAt.toISOString(),
    }),
  ).toEqual({ ok: true });
  expect(
    (await prisma.sessionParticipant.findUniqueOrThrow({ where: { id: participantId } }))
      .opcoDepositedAt,
  ).toBeNull();
  expect(
    await prisma.opcoSubmission.count({
      where: { tenantId: state.actor.tenantId, status: 'SENT', stage: 'FIN_FORMATION' },
    }),
  ).toBe(1);
});
