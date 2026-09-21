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
import * as XLSX from 'xlsx';
import { enrichMls } from '../mls-enrichment-service';
let actor = { id: '', tenantId: '' };
let leadId = '';
let otherTenant = '';
beforeAll(async () => {
  await assertTestDatabaseContent(prisma, process.env.TEST_DATABASE_URL);
  const tenant = await prisma.tenant.create({ data: { name: 'TEST-MLS enrichment' } });
  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: `${randomUUID()}@example.invalid`,
      hashedPwd: 'unusable-test',
      firstName: 'Test',
      lastName: 'Admin',
      role: 'ADMIN',
    },
  });
  actor = { id: user.id, tenantId: tenant.id };
  const org = await prisma.organization.create({
    data: {
      tenantId: tenant.id,
      legalName: 'SAS AZUR CONSEIL',
      brandName: 'Century 21 Immo d’Azur',
      legalForm: 'SAS',
      address: { street: '1 rue A', city: 'Nice' },
    },
  });
  const lead = await prisma.lead.create({
    data: {
      tenantId: tenant.id,
      firstName: 'Alice',
      lastName: 'Martin',
      phone: '06 01 02 03 04',
      email: 'alice@example.invalid',
      status: 'QUALIFIED',
      notes: 'Note à conserver',
      callCount: 3,
      ownerUserId: user.id,
      nextAction: 'Rappeler',
      nextActionAt: new Date('2026-10-10'),
    },
  });
  leadId = lead.id;
  otherTenant = (await prisma.tenant.create({ data: { name: 'TEST-MLS foreign' } })).id;
  await prisma.lead.create({
    data: {
      tenantId: otherTenant,
      firstName: 'Alice',
      lastName: 'Martin',
      phone: lead.phone,
      email: lead.email,
    },
  });
  expect(org.crmManagers).toEqual([]);
});
afterAll(async () => {
  for (const tenantId of [actor.tenantId, otherTenant]) {
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.lead.deleteMany({ where: { tenantId } });
    await prisma.organization.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
  }
  await prisma.$disconnect();
});
it('prévisualise puis enrichit sans créer de contact ni écraser le suivi, et reste idempotent', async () => {
  const book = XLSX.utils.book_new();
  const header = ["Nom de l'agence", 'Prénom', 'Nom', 'email', 'mobile', 'Ville', 'Titre'];
  const row = [
    'C21 Immo d’Azur',
    'Alice',
    'Martin',
    'alice@example.invalid',
    '+33601020304',
    'Nice',
    'Directrice',
  ];
  for (const name of ['Users MLS Côte dAzur', 'Dirigeant', 'Collaborateurs'])
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([header, ...(name === 'Collaborateurs' ? [] : [row])]),
      name,
    );
  const args = {
    buffer: XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer,
    fileName: 'fictif.xlsx',
    actor,
  };
  const preview = await enrichMls(args);
  expect(preview.leadsToUpdate).toBe(1);
  expect(preview.agenciesToUpdate).toBe(1);
  expect(preview.agenciesToCreate).toBe(0);
  expect(
    (await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).organizationId,
  ).toBeNull();
  expect((await enrichMls({ ...args, expectedDigest: preview.digest })).updated).toBe(1);
  const after = await prisma.lead.findUniqueOrThrow({
    where: { id: leadId },
    include: { organization: true },
  });
  expect(after).toMatchObject({
    status: 'QUALIFIED',
    notes: 'Note à conserver',
    callCount: 3,
    ownerUserId: actor.id,
    nextAction: 'Rappeler',
    phone: '06 01 02 03 04',
    jobTitle: 'Directrice',
    city: 'Nice',
  });
  expect(after.organization?.crmManagers).toEqual(['Alice Martin']);
  expect(after.organization?.address).toEqual({ street: '1 rue A', city: 'Nice' });
  const second = await enrichMls(args);
  expect(second.leadsToUpdate).toBe(0);
  expect(second.agenciesToUpdate).toBe(0);
  await expect(enrichMls({ ...args, expectedDigest: preview.digest })).rejects.toThrow('changé');
  expect(await prisma.lead.count({ where: { tenantId: actor.tenantId } })).toBe(1);
  expect(
    (await prisma.lead.findFirstOrThrow({ where: { tenantId: otherTenant } })).organizationId,
  ).toBeNull();
  expect(await prisma.person.count({ where: { tenantId: actor.tenantId } })).toBe(0);
  expect(await prisma.user.count({ where: { tenantId: actor.tenantId } })).toBe(1);
  expect(await prisma.emailMessage.count({ where: { tenantId: actor.tenantId } })).toBe(0);
  expect(
    await prisma.auditLog.count({
      where: { tenantId: actor.tenantId, action: 'leads.enrich.mls' },
    }),
  ).toBe(1);
});
