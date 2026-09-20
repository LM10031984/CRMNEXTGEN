import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { prisma } from '@qualiof/db';
const state = vi.hoisted(() => ({
  actor: { id: '', tenantId: '', firstName: 'Alice', lastName: 'Admin', role: 'ADMIN' },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/rbac', () => ({
  requireRole: vi.fn(async () => state.actor),
  UnauthorizedError: class extends Error {},
  ForbiddenError: class extends Error {},
}));
import { importMls } from '../mls-service';
import { addLeadActivity, editLead } from '@/server/actions/lead-fiche';
let leadId = '';
let otherTenant = '';
const makeFile = () => {
  const b = XLSX.utils.book_new();
  const h = ["Nom de l'agence", 'Prénom', 'Nom', 'email', 'mobile', 'Ville', 'Titre'];
  const r = [
    'Agence test MLS',
    'Alice',
    'Martin',
    'alice@example.invalid',
    '0612345678',
    'Nice',
    'Dirigeant',
  ];
  for (const name of ['Users MLS Côte dAzur', 'Dirigeant', 'Collaborateurs'])
    XLSX.utils.book_append_sheet(
      b,
      XLSX.utils.aoa_to_sheet([h, ...(name === 'Collaborateurs' ? [] : [r])]),
      name,
    );
  return XLSX.write(b, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
};
beforeAll(async () => {
  const t = await prisma.tenant.create({ data: { name: 'Test import MLS' } });
  state.actor.tenantId = t.id;
  const u = await prisma.user.create({
    data: {
      tenantId: t.id,
      email: `${randomUUID()}@example.invalid`,
      hashedPwd: 'unusable-test-only',
      firstName: 'Alice',
      lastName: 'Admin',
      role: 'ADMIN',
    },
  });
  state.actor.id = u.id;
  otherTenant = (await prisma.tenant.create({ data: { name: 'Autre tenant test' } })).id;
});
afterAll(async () => {
  for (const tenantId of [state.actor.tenantId, otherTenant]) {
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.lead.deleteMany({ where: { tenantId } });
    await prisma.organization.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
  }
  await prisma.$disconnect();
});
describe('import et suivi en PostgreSQL', () => {
  it('prévisualise sans écriture puis importe une seule fiche et une agence, sans compte ni apprenant', async () => {
    const args = { buffer: makeFile(), fileName: 'fictif.xlsx', actor: state.actor };
    const preview = await importMls(args);
    expect(preview.leadsToCreate).toBe(1);
    expect(await prisma.lead.count({ where: { tenantId: state.actor.tenantId } })).toBe(0);
    const report = await importMls({ ...args, expectedDigest: preview.digest });
    expect(report.created).toBe(1);
    const lead = await prisma.lead.findFirstOrThrow({
      where: { tenantId: state.actor.tenantId },
      include: { organization: true },
    });
    leadId = lead.id;
    expect(lead.organization).toMatchObject({
      crmManagers: ['Alice Martin'],
      representative: null,
      address: { city: 'Nice' },
    });
    expect(lead.segments).toEqual(['agent', 'dirigeant']);
    expect(await prisma.user.count({ where: { tenantId: state.actor.tenantId } })).toBe(1);
    expect(await prisma.person.count({ where: { tenantId: state.actor.tenantId } })).toBe(0);
    expect((await importMls(args)).leadsToCreate).toBe(0);
    await expect(importMls({ ...args, expectedDigest: preview.digest })).rejects.toThrow('changé');
    expect(await prisma.lead.count({ where: { tenantId: state.actor.tenantId } })).toBe(1);
  });
  it('enregistre auteur, résultat, commentaire et relance une seule fois', async () => {
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    const input = {
      requestId: randomUUID(),
      updatedAt: lead.updatedAt.toISOString(),
      type: 'call',
      occurredAt: new Date(Date.now() - 60000).toISOString(),
      outcome: 'NO_ANSWER',
      durationSeconds: 20,
      body: 'Compte rendu fictif',
      status: 'NEW',
      nextAction: 'Rappeler',
      nextActionAt: new Date(Date.now() + 86400000).toISOString(),
      lossReason: '',
    };
    expect(await addLeadActivity(leadId, input)).toEqual({ ok: true });
    expect(await addLeadActivity(leadId, input)).toEqual({ ok: true });
    const after = await prisma.lead.findUniqueOrThrow({
      where: { id: leadId },
      include: { actions: true },
    });
    expect(after.callCount).toBe(1);
    expect(after.status).toBe('CONTACTED');
    expect(after.actions).toHaveLength(1);
    expect(after.actions[0]).toMatchObject({
      authorUserId: state.actor.id,
      authorName: 'Alice Admin',
      outcome: 'NO_ANSWER',
      body: 'Compte rendu fictif',
      durationSeconds: 20,
    });
    expect((await addLeadActivity(leadId, { ...input, requestId: randomUUID() })).ok).toBe(false);
    expect(await prisma.leadAction.count({ where: { leadId } })).toBe(1);
  });
  it('refuse un lead d’un autre tenant et conserve le suivi à la modification', async () => {
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    const form = {
      updatedAt: lead.updatedAt.toISOString(),
      firstName: 'Alice',
      lastName: 'Martin',
      email: 'alice@example.invalid',
      phone: '+33612345678',
      jobTitle: 'Directrice',
      city: 'Nice',
      organizationId: lead.organizationId!,
      ownerUserId: state.actor.id,
      priority: 'HIGH',
      notes: 'Note générale fictive',
      status: 'QUALIFIED',
      nextAction: 'Préparer une proposition',
      nextActionAt: new Date(Date.now() + 86400000).toISOString(),
      lossReason: '',
    };
    const foreignOrg = await prisma.organization.create({
      data: { tenantId: otherTenant, legalName: 'Invisible', legalForm: 'AUTRE' },
    });
    expect((await editLead(leadId, { ...form, organizationId: foreignOrg.id })).ok).toBe(false);
    expect(await editLead(leadId, form)).toEqual({ ok: true });
    const after = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(after.callCount).toBe(1);
    expect(after.importKey).toBe(lead.importKey);
    expect(after.notes).toBe('Note générale fictive');
    const tenantId = state.actor.tenantId;
    state.actor.tenantId = otherTenant;
    expect((await editLead(leadId, form)).ok).toBe(false);
    state.actor.tenantId = tenantId;
  });
});
