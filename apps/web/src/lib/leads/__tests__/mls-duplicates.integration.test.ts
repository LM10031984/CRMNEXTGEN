import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
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
import { assertTestDatabaseContent } from '../../../../../../packages/db/scripts/assert-test-target';
import { listMlsDuplicates, mergeMlsDuplicate } from '../mls-duplicates-service';
let actor = { id: '', tenantId: '' };
let keepId = '',
  removeId = '';
beforeEach(async () => {
  await assertTestDatabaseContent(prisma, process.env.TEST_DATABASE_URL);
  const tenant = await prisma.tenant.create({ data: { name: 'TEST-MLS duplicate repair' } });
  actor.tenantId = tenant.id;
  actor.id = (
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `${randomUUID()}@example.invalid`,
        hashedPwd: 'unusable-test',
        firstName: 'Test',
        lastName: 'Admin',
        role: 'ADMIN',
      },
    })
  ).id;
  const base = {
    tenantId: tenant.id,
    source: 'MLS_COTE_D_AZUR',
    firstName: 'Alice',
    lastName: 'Martin',
    city: 'Nice',
    nextAction: 'Planifier un appel',
  };
  const precise = await prisma.organization.create({
    data: { tenantId: tenant.id, legalName: 'Era Agence Azur', legalForm: 'AUTRE' },
  });
  const generic = await prisma.organization.create({
    data: { tenantId: tenant.id, legalName: 'ERA', legalForm: 'AUTRE' },
  });
  keepId = (
    await prisma.lead.create({
      data: {
        ...base,
        organizationId: precise.id,
        phone: '+33612345678',
        email: 'alice@example.invalid',
        importKey: 'keep',
        segments: ['agent'],
        notes: 'Note complète',
        importData: { refs: ['original'] },
      },
    })
  ).id;
  removeId = (
    await prisma.lead.create({
      data: {
        ...base,
        organizationId: generic.id,
        phone: '612345678',
        importKey: 'remove',
        segments: ['collaborateur'],
        notes: 'Note du doublon',
        importData: { refs: ['duplicate'] },
      },
    })
  ).id;
});
afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { tenantId: actor.tenantId } });
  await prisma.lead.deleteMany({ where: { tenantId: actor.tenantId } });
  await prisma.organization.deleteMany({ where: { tenantId: actor.tenantId } });
  await prisma.tenant.delete({ where: { id: actor.tenantId } });
});
afterAll(() => prisma.$disconnect());
it('prévisualise sans écriture, fusionne les informations et conserve un audit complet sans email', async () => {
  const [preview] = await listMlsDuplicates(actor.tenantId);
  expect(preview?.keep.id).toBe(keepId);
  expect(await prisma.lead.count({ where: { tenantId: actor.tenantId } })).toBe(2);
  const input = { actor, keepId, removeId, digest: preview!.digest };
  await mergeMlsDuplicate(input);
  const kept = await prisma.lead.findUniqueOrThrow({ where: { id: keepId } });
  expect(kept).toMatchObject({
    status: 'NEW',
    callCount: 0,
    email: 'alice@example.invalid',
    phone: '+33612345678',
    notes: 'Note complète\n\nNote du doublon',
    segments: ['agent', 'collaborateur'],
    nextActionAt: null,
  });
  expect(kept.importData).toMatchObject({
    original: { refs: ['original'] },
    mergedSources: [{ id: removeId, importKey: 'remove', importData: { refs: ['duplicate'] } }],
  });
  expect(await prisma.lead.findUnique({ where: { id: removeId } })).toBeNull();
  const audit = await prisma.auditLog.findFirstOrThrow({
    where: { tenantId: actor.tenantId, action: 'leads.merge.mls' },
  });
  expect(audit.diff).toMatchObject({
    before: { remove: { id: removeId, phone: '612345678', notes: 'Note du doublon' } },
    removedId: removeId,
  });
  expect(await prisma.emailMessage.count({ where: { tenantId: actor.tenantId } })).toBe(0);
  expect(await listMlsDuplicates(actor.tenantId)).toEqual([]);
  await expect(mergeMlsDuplicate(input)).rejects.toThrow('plus fusionnables');
  expect(
    await prisma.auditLog.count({ where: { tenantId: actor.tenantId, action: 'leads.merge.mls' } }),
  ).toBe(1);
});
it('refuse un aperçu périmé et un autre tenant sans modifier les fiches', async () => {
  const [p] = await listMlsDuplicates(actor.tenantId);
  const input = { actor, keepId, removeId, digest: p!.digest };
  await expect(
    mergeMlsDuplicate({ ...input, actor: { id: actor.id, tenantId: randomUUID() } }),
  ).rejects.toThrow();
  await prisma.lead.update({
    where: { id: removeId },
    data: { notes: 'Note ajoutée après aperçu' },
  });
  await expect(mergeMlsDuplicate(input)).rejects.toThrow();
  expect(await prisma.lead.count({ where: { tenantId: actor.tenantId } })).toBe(2);
});
it('une activité arrivée après aperçu empêche toute suppression en cascade', async () => {
  const [p] = await listMlsDuplicates(actor.tenantId);
  const action = await prisma.leadAction.create({
    data: { leadId: removeId, type: 'note', subject: 'À conserver' },
  });
  await expect(mergeMlsDuplicate({ actor, keepId, removeId, digest: p!.digest })).rejects.toThrow();
  expect(await prisma.leadAction.findUnique({ where: { id: action.id } })).not.toBeNull();
  expect(await prisma.lead.count({ where: { tenantId: actor.tenantId } })).toBe(2);
});
it('annule toute la transaction si l’audit ne peut pas être écrit', async () => {
  const [p] = await listMlsDuplicates(actor.tenantId);
  await expect(
    mergeMlsDuplicate({
      actor: { ...actor, id: randomUUID() },
      keepId,
      removeId,
      digest: p!.digest,
    }),
  ).rejects.toThrow();
  expect(await prisma.lead.count({ where: { tenantId: actor.tenantId } })).toBe(2);
  expect((await prisma.lead.findUniqueOrThrow({ where: { id: keepId } })).notes).toBe(
    'Note complète',
  );
});
