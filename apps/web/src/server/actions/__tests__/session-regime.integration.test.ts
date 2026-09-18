import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertTestDatabaseContent } from '../../../../../../packages/db/scripts/assert-test-target';

const auth = vi.hoisted(() => ({ requireRole: vi.fn() }));
vi.mock('@/lib/rbac', () => ({ requireRole: auth.requireRole }));
vi.mock('@/lib/auth', () => ({ validateRequest: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
// Seul le choix du client est substitué : requêtes, contraintes et transactions
// utilisent réellement PostgreSQL, via une URL de test explicitement vérifiée.
vi.mock('@qualiof/db', async (original) => {
  const { assertTestTarget } =
    await import('../../../../../../packages/db/scripts/assert-test-target');
  assertTestTarget({ databaseUrl: process.env.TEST_DATABASE_URL });
  const actual = await original<typeof import('@qualiof/db')>();
  return { ...actual, prisma: actual.createPrismaClientForUrl(process.env.TEST_DATABASE_URL!) };
});

import { prisma as db } from '@qualiof/db';
import { createDeclaredParticipant } from '@/lib/pricing/declared-session-enrollment';
import { legalLinkAtSession } from '@/lib/persons/legal-link-period';
import { setSessionRegime } from '../session-regime';
import { updateLegalLink } from '../legal-links';

let tenantId: string | undefined;
let user: { id: string; tenantId: string };
let sessionId: string;
let sponsorOrgId: string;
let personIds: string[];

beforeEach(async () => {
  await assertTestDatabaseContent(db, process.env.TEST_DATABASE_URL);
  const tenant = await db.tenant.create({ data: { name: 'TEST-TENANT-REGIME' } });
  tenantId = tenant.id;
  user = await db.user.create({
    data: {
      tenantId,
      email: `${randomUUID()}@regime.invalid`,
      hashedPwd: 'test-only-unusable',
      firstName: 'Test',
      lastName: 'Regime',
      role: 'ADMIN',
    },
  });
  auth.requireRole.mockResolvedValue(user);
  const sponsor = await db.organization.create({
    data: { tenantId, legalName: 'TEST-ENTREPRISE-REGIME', legalForm: 'SAS' },
  });
  sponsorOrgId = sponsor.id;
  const product = await db.trainingProduct.create({
    data: {
      tenantId,
      code: `TEST-${randomUUID()}`,
      title: 'TEST-PRODUIT-REGIME',
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
      regime: 'ENTREPRISE',
      priceTotalHT: 240,
    },
  });
  sessionId = session.id;
  personIds = [];
  for (let i = 0; i < 3; i++) {
    const person = await db.person.create({
      data: {
        tenantId,
        firstName: `Agent${i}`,
        lastName: 'TEST-REGIME',
        legalLinks: { create: { organizationId: sponsorOrgId, role: 'AGENT_COMMERCIAL' } },
      },
    });
    personIds.push(person.id);
  }
});

afterEach(async () => {
  if (!tenantId) return;
  const id = tenantId;
  // Nettoyage exclusivement des fixtures créées par ce test, dans l'ordre FK.
  await db.$transaction(async (tx) => {
    await tx.trainingSession.deleteMany({ where: { tenantId: id } });
    await tx.trainingProduct.deleteMany({ where: { tenantId: id } });
    await tx.person.deleteMany({ where: { tenantId: id } });
    await tx.organization.deleteMany({ where: { tenantId: id } });
    await tx.auditLog.deleteMany({ where: { tenantId: id } });
    await tx.tenant.delete({ where: { id } });
  });
  tenantId = undefined;
});
afterAll(async () => {
  await db.$disconnect();
});

function enroll(index: number, actor = user) {
  return createDeclaredParticipant(actor, { sessionId, sponsorOrgId, personId: personIds[index]! });
}
async function prices() {
  const participants = await db.sessionParticipant.findMany({
    where: { sessionId },
    orderBy: { id: 'asc' },
  });
  return participants.map((p) => ({
    price: Number(p.priceHT),
    remaining: Number(p.amountRemaining),
  }));
}
async function auditCount() {
  return db.auditLog.count({ where: { tenantId } });
}

describe('régime et rattachements — transactions PostgreSQL réelles', () => {
  it('conserve 240 € avec un troisième agent payé par la SAS, puis rejoue sans écriture', async () => {
    await enroll(0);
    await enroll(1);
    expect(await prices()).toEqual([
      { price: 120, remaining: 120 },
      { price: 120, remaining: 120 },
    ]);
    await enroll(2);
    expect(await prices()).toEqual(Array(3).fill({ price: 80, remaining: 80 }));
    const session = await db.trainingSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(Number(session.priceTotalHT)).toBe(240);
    const before = await auditCount();
    await enroll(2);
    expect(await auditCount()).toBe(before);
    expect(await db.sessionParticipant.count({ where: { sessionId } })).toBe(3);
  });

  it('prévisualise sans écriture puis répartit les centimes et journalise une seule application', async () => {
    for (let i = 0; i < 3; i++) await enroll(i);
    await db.trainingSession.update({
      where: { id: sessionId },
      data: { regime: null, priceTotalHT: null, pricePerLearner: 80 },
    });
    const before = await auditCount();
    const input = { sessionId, regime: 'ENTREPRISE' as const, priceHT: 100 };
    const preview = await setSessionRegime(input);
    expect(preview).toMatchObject({ ok: true, changed: false, preview: { participants: 3 } });
    if (!preview.ok) throw new Error(preview.error);
    expect(await auditCount()).toBe(before);
    expect(
      (await db.trainingSession.findUniqueOrThrow({ where: { id: sessionId } })).regime,
    ).toBeNull();
    expect(
      await setSessionRegime({ ...input, apply: true, confirmationKey: preview.confirmationKey }),
    ).toEqual({ ok: true, changed: true });
    expect(await prices()).toEqual([
      { price: 33.34, remaining: 33.34 },
      { price: 33.33, remaining: 33.33 },
      { price: 33.33, remaining: 33.33 },
    ]);
    expect(await auditCount()).toBe(before + 2);
    const audit = await db.auditLog.findFirstOrThrow({
      where: { tenantId, action: 'sessions.setRegime' },
    });
    expect(audit.diff).toMatchObject({ participantsUpdated: 3 });
    expect(
      await setSessionRegime({ ...input, apply: true, confirmationKey: preview.confirmationKey }),
    ).toEqual({ ok: true, changed: false });
    expect(await auditCount()).toBe(before + 2);
  });

  it('refuse une prévisualisation périmée après une nouvelle inscription', async () => {
    await enroll(0);
    const input = { sessionId, regime: 'ENTREPRISE' as const, priceHT: 100 };
    const preview = await setSessionRegime(input);
    if (!preview.ok) throw new Error(preview.error);
    await enroll(1);
    const before = await auditCount();
    expect(
      await setSessionRegime({ ...input, apply: true, confirmationKey: preview.confirmationKey }),
    ).toMatchObject({ ok: false, error: expect.stringContaining('prévisualisation') });
    expect(await prices()).toEqual(Array(2).fill({ price: 120, remaining: 120 }));
    expect(await auditCount()).toBe(before);
  });

  it('annule inscription et redistribution si le journal échoue sur une vraie contrainte FK', async () => {
    await enroll(0);
    const before = await auditCount();
    await expect(enroll(1, { ...user, id: randomUUID() })).rejects.toMatchObject({ code: 'P2003' });
    expect(await prices()).toEqual([{ price: 240, remaining: 240 }]);
    expect(await auditCount()).toBe(before);
  });

  it('refuse un payeur individuel et un forfait déjà engagé sans changement de prix', async () => {
    const individual = await db.organization.create({
      data: { tenantId: user.tenantId, legalName: 'TEST-EI-REGIME', legalForm: 'EI' },
    });
    await db.legalLink.create({
      data: { personId: personIds[0]!, organizationId: individual.id, role: 'EI_SELF' },
    });
    await expect(
      createDeclaredParticipant(user, {
        sessionId,
        sponsorOrgId: individual.id,
        personId: personIds[0]!,
      }),
    ).rejects.toThrow(/Agent0 TEST-REGIME.*ENTREPRISE/);
    expect(await prices()).toEqual([]);
    expect(await auditCount()).toBe(0);
    const participant = await enroll(0);
    await db.sessionParticipant.update({
      where: { id: participant.id },
      data: { conventionSigned: true },
    });
    const before = await auditCount();
    await expect(enroll(1)).rejects.toThrow(/engagé/);
    expect(await prices()).toEqual([{ price: 240, remaining: 240 }]);
    expect(await auditCount()).toBe(before);
  });

  it('garde le total en cas d’inscriptions concurrentes et permet de rejouer un conflit sérialisable', async () => {
    const results = await Promise.allSettled([enroll(0), enroll(1)]);
    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      if (result.status === 'rejected') {
        expect(result.reason).toMatchObject({ code: 'P2034' });
        await enroll(i);
      }
    }
    expect(await prices()).toEqual(Array(2).fill({ price: 120, remaining: 120 }));
    expect(
      await db.auditLog.count({ where: { tenantId, action: 'sessionParticipants.create' } }),
    ).toBe(2);
  });

  it('ferme le rôle précédent, crée la période salariée et rejoue sans dupliquer les liens', async () => {
    const link = await db.legalLink.findFirstOrThrow({
      where: { personId: personIds[0], organizationId: sponsorOrgId },
    });
    const input = {
      linkId: link.id,
      changeRole: { role: 'SALARIE' as const, effectiveDate: '2026-11-10' },
    };
    const preview = await updateLegalLink(input);
    if (!preview.ok) throw new Error(preview.error);
    expect(await auditCount()).toBe(0);
    expect(
      await updateLegalLink({ ...input, apply: true, confirmationKey: preview.confirmationKey }),
    ).toEqual({ ok: true, changed: true });
    const links = await db.legalLink.findMany({
      where: { personId: personIds[0], organizationId: sponsorOrgId },
    });
    expect(links).toHaveLength(2);
    expect(links.find((l) => l.id === link.id)).toMatchObject({
      role: 'AGENT_COMMERCIAL',
      endDate: new Date('2026-11-09'),
    });
    expect(
      legalLinkAtSession(links, sponsorOrgId, { startDate: '2026-11-20', endDate: '2026-11-20' })
        ?.role,
    ).toBe('SALARIE');
    expect(
      await updateLegalLink({ ...input, apply: true, confirmationKey: preview.confirmationKey }),
    ).toEqual({ ok: true, changed: false });
    expect(await auditCount()).toBe(1);
  });
});
