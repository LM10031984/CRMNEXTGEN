import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@qualiof/db';
import {
  installFarosLibrary,
  FAROS_LIBRARY_REF,
  installFarosComplements,
  FAROS_COMPLEMENTS_REF,
} from '../faros-library';
import { FAROS_WORKSHOPS } from '../../lib/proposition/faros-workshops';

const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  !['localhost', '127.0.0.1'].includes(new URL(url).hostname) ||
  !new URL(url).pathname.endsWith('_test')
) {
  throw new Error('Faros : TEST_DATABASE_URL doit désigner une base locale terminée par _test.');
}
const db = new PrismaClient({ datasources: { db: { url } } });
const tenantId = randomUUID();
const otherId = randomUUID();
beforeAll(async () => {
  await db.tenant.createMany({
    data: [
      { id: tenantId, name: 'TEST-Faros' },
      { id: otherId, name: 'TEST-Autre-organisme' },
    ],
  });
});
afterAll(async () => {
  await db.trainingProduct.deleteMany({ where: { tenantId: { in: [tenantId, otherId] } } });
  await db.auditLog.deleteMany({ where: { tenantId: { in: [tenantId, otherId] } } });
  await db.tenant.deleteMany({ where: { id: { in: [tenantId, otherId] } } });
  await db.$disconnect();
});

describe('installation des ateliers Faros', () => {
  it('importe une seule fois, conserve les exclusions et refuse d’écraser une relecture', async () => {
    expect(await installFarosLibrary(db, tenantId)).toBe('created');
    expect(await installFarosLibrary(db, tenantId)).toBe('unchanged');
    const shelf = await db.trainingProduct.findUniqueOrThrow({
      where: { tenantId_sourceRef: { tenantId, sourceRef: FAROS_LIBRARY_REF } },
      include: { modules: { orderBy: { order: 'asc' } } },
    });
    expect(shelf.isActive).toBe(false);
    expect(shelf.modules).toHaveLength(FAROS_WORKSHOPS.length);
    expect(await db.trainingProduct.count({ where: { tenantId: otherId } })).toBe(0);
    expect(
      await db.auditLog.count({
        where: { tenantId, action: 'catalogue.faros-applique.installed' },
      }),
    ).toBe(1);
    await db.trainingProduct.update({
      where: { id: shelf.id },
      data: { excludedFromClientOutputs: true },
    });
    expect(await installFarosLibrary(db, tenantId)).toBe('unchanged');
    expect(
      (await db.trainingProduct.findUniqueOrThrow({ where: { id: shelf.id } }))
        .excludedFromClientOutputs,
    ).toBe(true);
    await db.trainingModule.update({
      where: { id: shelf.modules[0]!.id },
      data: { contentMd: 'Relecture humaine à conserver' },
    });
    await expect(installFarosLibrary(db, tenantId)).rejects.toThrow('sans écraser');
    expect(
      (await db.trainingModule.findUniqueOrThrow({ where: { id: shelf.modules[0]!.id } }))
        .contentMd,
    ).toBe('Relecture humaine à conserver');
  });
  it('installe les compléments dans une édition distincte sans toucher aux relectures du premier rayon', async () => {
    const before = await db.trainingProduct.findUniqueOrThrow({
      where: { tenantId_sourceRef: { tenantId, sourceRef: FAROS_LIBRARY_REF } },
      include: { modules: { orderBy: { order: 'asc' } } },
    });
    expect(await installFarosComplements(db, tenantId)).toBe('created');
    expect(await installFarosComplements(db, tenantId)).toBe('unchanged');
    const after = await db.trainingProduct.findUniqueOrThrow({
      where: { id: before.id },
      include: { modules: { orderBy: { order: 'asc' } } },
    });
    expect(after).toEqual(before);
    const extension = await db.trainingProduct.findUniqueOrThrow({
      where: { tenantId_sourceRef: { tenantId, sourceRef: FAROS_COMPLEMENTS_REF } },
      include: { modules: { orderBy: { order: 'asc' } } },
    });
    expect(extension.modules).toHaveLength(10);
    expect(extension.isActive).toBe(false);
    expect(await db.trainingProduct.count({ where: { tenantId: otherId } })).toBe(0);
  });
  it('refuse un organisme inexistant sans écrire', async () => {
    await expect(installFarosLibrary(db, randomUUID())).rejects.toThrow('introuvable');
  });
});
