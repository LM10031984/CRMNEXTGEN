import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertTestDatabaseContent } from '../../../../../../packages/db/scripts/assert-test-target';
const auth = vi.hoisted(() => ({ validateRequest: vi.fn() }));
vi.mock('@/lib/auth', () => ({ validateRequest: auth.validateRequest }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@qualiof/db', async (original) => {
  const { assertTestTarget } =
    await import('../../../../../../packages/db/scripts/assert-test-target');
  assertTestTarget({ databaseUrl: process.env.TEST_DATABASE_URL });
  const actual = await original<typeof import('@qualiof/db')>();
  return { ...actual, prisma: actual.createPrismaClientForUrl(process.env.TEST_DATABASE_URL!) };
});
import { prisma as db, type User } from '@qualiof/db';
import { revalidatePath } from 'next/cache';
import {
  createTrainerAvailability,
  updateTrainerAvailability,
  deleteTrainerAvailability,
} from '../trainer-availability';
import { listTrainers } from '@/lib/planning/list-trainers';
import { availabilityAccess } from '@/lib/planning/availability-access';
import { checkTrainerAvailability } from '@/lib/schedule/trainer-availability';

let tenantId: string;
let otherTenantId: string;
let trainerId: string;
let otherTrainerId: string;
let user: User;
const dates = {
  startsAt: '2026-11-20T08:00:00.000Z',
  endsAt: '2026-11-20T17:00:00.000Z',
  status: 'busy' as const,
  note: 'Indisponible',
};
function signIn(actor: User | null) {
  auth.validateRequest.mockResolvedValue({
    user: actor,
    session: actor ? { id: 'fixture' } : null,
  });
}
async function availability() {
  return db.trainerAvailability.create({
    data: {
      tenantId,
      trainerId,
      ...dates,
      startsAt: new Date(dates.startsAt),
      endsAt: new Date(dates.endsAt),
    },
  });
}
beforeEach(async () => {
  vi.clearAllMocks();
  await assertTestDatabaseContent(db, process.env.TEST_DATABASE_URL);
  tenantId = (await db.tenant.create({ data: { name: 'TEST-PLANNING-ACTIONS' } })).id;
  otherTenantId = (await db.tenant.create({ data: { name: 'TEST-PLANNING-OTHER' } })).id;
  user = await db.user.create({
    data: {
      tenantId,
      email: `${randomUUID()}@planning.invalid`,
      firstName: 'Test',
      lastName: 'Admin',
      hashedPwd: 'unusable-test',
      role: 'ADMIN',
    },
  });
  trainerId = (
    await db.person.create({
      data: { tenantId, firstName: 'Alice', lastName: 'Test', email: user.email },
    })
  ).id;
  otherTrainerId = (
    await db.person.create({
      data: { tenantId: otherTenantId, firstName: 'Autre', lastName: 'Tenant' },
    })
  ).id;
  for (const [tid, pid] of [
    [tenantId, trainerId],
    [otherTenantId, otherTrainerId],
  ])
    await db.externalIdentity.create({
      data: {
        tenantId: tid!,
        entityType: 'Person.Trainer',
        entityId: pid!,
        source: 'test-planning',
        externalId: randomUUID(),
      },
    });
  signIn(user);
});
afterEach(async () => {
  for (const id of [tenantId, otherTenantId].filter(Boolean)) {
    await db.trainerAvailability.deleteMany({ where: { tenantId: id } });
    await db.externalIdentity.deleteMany({ where: { tenantId: id } });
    await db.trainingSession.deleteMany({ where: { tenantId: id } });
    await db.trainingProduct.deleteMany({ where: { tenantId: id } });
    await db.person.deleteMany({ where: { tenantId: id } });
    await db.auditLog.deleteMany({ where: { tenantId: id } });
    await db.tenant.delete({ where: { id } });
  }
});
afterAll(async () => {
  await db.$disconnect();
});

describe('indisponibilités — PostgreSQL réel', () => {
  it('reconnaît les formateurs de sessions sans marquage import ni lien organisation, même hors période', async () => {
    await db.externalIdentity.deleteMany({ where: { tenantId, entityId: trainerId } });
    const product = await db.trainingProduct.create({
      data: { tenantId, code: 'TEST-HISTORY', title: 'Historique', durationHours: 7,
        modality: 'PRESENTIEL', objectives: [], programMd: 'Test' },
    });
    const archived = await db.person.create({
      data: { tenantId, firstName: 'Archive', lastName: 'Test', archived: true },
    });
    await db.person.create({ data: { tenantId, firstName: 'Non formateur', lastName: 'Test' } });
    await db.trainingSession.create({
      data: { tenantId, productId: product.id, code: 'TEST-HISTORY', status: 'COMPLETED',
        startDate: new Date('2020-01-01'), endDate: new Date('2020-01-02'), modality: 'PRESENTIEL',
        trainers: { create: [trainerId, archived.id].map(personId => ({ personId, role: 'FORMATEUR' })) } },
    });
    expect((await listTrainers(tenantId)).map(t => t.id)).toEqual([trainerId]);
    expect((await availabilityAccess({ ...user, role: 'FORMATEUR' })).trainerIds).toEqual([trainerId]);
    expect(await createTrainerAvailability({ trainerId, ...dates })).toMatchObject({ ok: true });
  });

  it('crée, modifie puis supprime avec audit before/after et revalidation', async () => {
    const result = await createTrainerAvailability({ trainerId, ...dates });
    expect(result).toMatchObject({ ok: true, changed: true });
    if (!result.ok) throw new Error(result.error);
    const id = result.id;
    expect(await db.auditLog.findFirst({ where: { tenantId, entityId: id } })).toMatchObject({
      diff: { before: null, after: { trainerId, status: 'busy' } },
    });
    expect(
      await updateTrainerAvailability({ id, ...dates, status: 'tentative', note: 'À confirmer' }),
    ).toMatchObject({ ok: true, changed: true });
    expect(await db.trainerAvailability.findFirst({ where: { id, tenantId } })).toMatchObject({
      status: 'tentative',
      note: 'À confirmer',
    });
    expect(await deleteTrainerAvailability({ id })).toMatchObject({ ok: true, changed: true });
    expect(await db.trainerAvailability.count({ where: { id, tenantId } })).toBe(0);
    expect(await db.auditLog.count({ where: { tenantId, entityId: id } })).toBe(3);
    expect(revalidatePath).toHaveBeenCalledWith('/app/planning');
    expect(revalidatePath).toHaveBeenCalledWith(`/app/formateurs/${trainerId}`);
    expect(revalidatePath).toHaveBeenCalledWith('/app/sessions', 'layout');
  });
  it('refuse startsAt >= endsAt et les statuts hors busy/tentative sans écriture', async () => {
    for (const input of [
      { ...dates, endsAt: dates.startsAt },
      { ...dates, startsAt: dates.endsAt, endsAt: dates.startsAt },
      { ...dates, startsAt: 'invalide' },
      { ...dates, status: 'available' },
    ])
      expect(await createTrainerAvailability({ trainerId, ...input })).toMatchObject({ ok: false });
    expect(await db.trainerAvailability.count({ where: { tenantId } })).toBe(0);
    expect(await db.auditLog.count({ where: { tenantId } })).toBe(0);
  });
  it('ne journalise pas une modification sans changement', async () => {
    const a = await availability();
    expect(await updateTrainerAvailability({ id: a.id, ...dates })).toMatchObject({
      ok: true,
      changed: false,
    });
    expect(await db.auditLog.count({ where: { tenantId } })).toBe(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it('refuse création, édition et suppression hors tenant même avec ADMIN', async () => {
    const a = await db.trainerAvailability.create({
      data: {
        tenantId: otherTenantId,
        trainerId: otherTrainerId,
        startsAt: new Date(dates.startsAt),
        endsAt: new Date(dates.endsAt),
        status: 'busy',
      },
    });
    expect(await createTrainerAvailability({ trainerId: otherTrainerId, ...dates })).toMatchObject({
      ok: false,
    });
    expect(await updateTrainerAvailability({ id: a.id, ...dates })).toMatchObject({ ok: false });
    expect(await deleteTrainerAvailability({ id: a.id })).toMatchObject({ ok: false });
    expect(await db.trainerAvailability.count({ where: { id: a.id } })).toBe(1);
    expect(await db.auditLog.count({ where: { tenantId } })).toBe(0);
  });
  it('refuse LECTEUR, COMMERCIAL, COMPTABLE et anonyme, y compris pour un ID connu', async () => {
    const a = await availability();
    for (const role of ['LECTEUR', 'COMMERCIAL', 'COMPTABLE'] as const) {
      signIn({ ...user, role });
      expect(await createTrainerAvailability({ trainerId, ...dates })).toMatchObject({ ok: false });
      expect(
        await updateTrainerAvailability({ id: a.id, ...dates, note: 'interdit' }),
      ).toMatchObject({ ok: false });
      expect(await deleteTrainerAvailability({ id: a.id })).toMatchObject({ ok: false });
    }
    signIn(null);
    expect(await deleteTrainerAvailability({ id: a.id })).toMatchObject({ ok: false });
    expect(await db.trainerAvailability.count({ where: { tenantId } })).toBe(1);
  });
  it('rend busy visible au moteur existant du wizard, tentative ne bloque pas, suppression libère', async () => {
    const result = await createTrainerAvailability({ trainerId, ...dates });
    if (!result.ok) throw new Error(result.error);
    expect(
      await checkTrainerAvailability(trainerId, [new Date('2026-11-20')], tenantId),
    ).toMatchObject({ hasConflict: true, conflicts: [{ reason: 'unavailable' }] });
    await updateTrainerAvailability({ id: result.id, ...dates, status: 'tentative' });
    expect(
      await checkTrainerAvailability(trainerId, [new Date('2026-11-20')], tenantId),
    ).toMatchObject({ hasConflict: false });
    await deleteTrainerAvailability({ id: result.id });
    expect(
      await checkTrainerAvailability(trainerId, [new Date('2026-11-20')], tenantId),
    ).toMatchObject({ hasConflict: false });
  });
  it('FORMATEUR écrit seulement sur sa fiche email unique, sans pouvoir réaffecter une plage', async () => {
    signIn({ ...user, role: 'FORMATEUR', email: user.email.toUpperCase() });
    const sameTenantOther = await db.person.create({
      data: { tenantId, firstName: 'Bob', lastName: 'Test' },
    });
    await db.externalIdentity.create({
      data: {
        tenantId,
        entityType: 'Person.Trainer',
        entityId: sameTenantOther.id,
        source: 'test-planning',
        externalId: randomUUID(),
      },
    });
    const others = await db.trainerAvailability.create({
      data: {
        tenantId,
        trainerId: sameTenantOther.id,
        startsAt: new Date(dates.startsAt),
        endsAt: new Date(dates.endsAt),
        status: 'busy',
      },
    });
    const own = await createTrainerAvailability({ trainerId, ...dates });
    expect(own).toMatchObject({ ok: true });
    if (!own.ok) throw new Error(own.error);
    expect(await updateTrainerAvailability({ id: own.id, ...dates, note: 'Moi' })).toMatchObject({
      ok: true,
    });
    expect(
      await createTrainerAvailability({ trainerId: sameTenantOther.id, ...dates }),
    ).toMatchObject({ ok: false });
    expect(
      await updateTrainerAvailability({ id: others.id, ...dates, note: 'Autre' }),
    ).toMatchObject({ ok: false });
    expect(await deleteTrainerAvailability({ id: others.id })).toMatchObject({ ok: false });
    expect(
      await updateTrainerAvailability({ id: own.id, ...dates, trainerId: sameTenantOther.id }),
    ).toMatchObject({ ok: false });
    expect(await deleteTrainerAvailability({ id: own.id })).toMatchObject({ ok: true });
  });
  it('FORMATEUR reste en lecture si email absent, ambigu, fiche archivée ou non formateur', async () => {
    signIn({ ...user, role: 'FORMATEUR', email: 'inconnu@planning.invalid' });
    expect(await createTrainerAvailability({ trainerId, ...dates })).toMatchObject({ ok: false });
    signIn({ ...user, role: 'FORMATEUR' });
    const duplicate = await db.person.create({
      data: { tenantId, firstName: 'Double', lastName: 'Test', email: user.email },
    });
    expect(await createTrainerAvailability({ trainerId, ...dates })).toMatchObject({ ok: false });
    await db.person.delete({ where: { id: duplicate.id } });
    await db.person.update({ where: { id: trainerId }, data: { archived: true } });
    expect(await createTrainerAvailability({ trainerId, ...dates })).toMatchObject({ ok: false });
    await db.person.update({ where: { id: trainerId }, data: { archived: false } });
    await db.externalIdentity.deleteMany({ where: { tenantId, entityId: trainerId } });
    expect(await createTrainerAvailability({ trainerId, ...dates })).toMatchObject({ ok: false });
  });
  it('MANAGER peut déclarer pour tous les formateurs actifs du tenant', async () => {
    signIn({ ...user, role: 'MANAGER' });
    expect(await createTrainerAvailability({ trainerId, ...dates })).toMatchObject({ ok: true });
  });
  it('annule la création si la FK du journal échoue', async () => {
    signIn({ ...user, id: randomUUID() });
    expect(await createTrainerAvailability({ trainerId, ...dates })).toMatchObject({ ok: false });
    expect(await db.trainerAvailability.count({ where: { tenantId } })).toBe(0);
  });
});
