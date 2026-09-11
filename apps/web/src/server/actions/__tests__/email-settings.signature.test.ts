import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Le CÂBLAGE de la catégorie « signature » jusqu'à la BASE — T1.4.
 *
 * CE QUE CE FICHIER EMPÊCHE. Le classique de l'upsert : le champ est écrit dans
 * le `create` et oublié dans l'`update`. La case se coche à l'écran, le toast
 * dit « enregistré », et elle est revenue à `false` au rechargement — sans une
 * seule erreur. Un test qui ne regarde que `create` reste vert : on regarde LES
 * DEUX.
 *
 * Et le `select` avec : c'est lui qui alimente le diff de l'AuditLog. Un champ
 * absent du select est un champ dont personne ne saura jamais qu'il a changé.
 */

const { upsert, findUnique, requireRole, logTenantSettingsChange } = vi.hoisted(() => ({
  upsert: vi.fn(),
  findUnique: vi.fn(),
  requireRole: vi.fn(),
  logTenantSettingsChange: vi.fn(),
}));

vi.mock('@qualiof/db', () => ({
  prisma: { tenantEmailSettings: { upsert, findUnique } },
}));
vi.mock('@/lib/rbac', () => ({
  requireRole,
  UnauthorizedError: class UnauthorizedError extends Error {},
  ForbiddenError: class ForbiddenError extends Error {},
}));
vi.mock('@/lib/audit-log', () => ({
  logTenantSettingsChange,
  computeDiff: vi.fn(() => ({})),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { updateEmailSettings } from '../email-settings';
import { EmailSettingsSchema } from '@qualiof/shared';

const TENANT = 'tenant-start-academy';

beforeEach(() => {
  vi.clearAllMocks();
  requireRole.mockResolvedValue({ id: 'user-1', tenantId: TENANT, role: 'ADMIN' });
  findUnique.mockResolvedValue(null);
  upsert.mockResolvedValue({});
});

describe('updateEmailSettings — la case « signature » survit au rechargement', () => {
  it('T1.4 — le champ descend dans `create` ET dans `update`', async () => {
    const r = await updateEmailSettings(
      EmailSettingsSchema.parse({ signatureEmailsEnabled: true }),
    );
    expect(r).toEqual({ ok: true });

    expect(upsert).toHaveBeenCalledTimes(1);
    const arg = upsert.mock.calls[0]![0] as {
      create: Record<string, unknown>;
      update: Record<string, unknown>;
      select: Record<string, unknown>;
      where: Record<string, unknown>;
    };
    expect(arg.create.signatureEmailsEnabled).toBe(true);
    expect(arg.update.signatureEmailsEnabled).toBe(true);
  });

  it('le `select` de la lecture ET celui de l’écriture portent le champ (sinon l’audit ne le voit pas)', async () => {
    await updateEmailSettings(EmailSettingsSchema.parse({ signatureEmailsEnabled: true }));

    const avant = findUnique.mock.calls[0]![0] as { select: Record<string, unknown> };
    const apres = upsert.mock.calls[0]![0] as { select: Record<string, unknown> };
    expect(avant.select.signatureEmailsEnabled).toBe(true);
    expect(apres.select.signatureEmailsEnabled).toBe(true);
  });

  it('PUISSANCE — l’upsert reste scopé au tenant de l’utilisateur, jamais à un id reçu', async () => {
    await updateEmailSettings(EmailSettingsSchema.parse({ signatureEmailsEnabled: true }));
    const arg = upsert.mock.calls[0]![0] as { where: { tenantId: string } };
    expect(arg.where).toEqual({ tenantId: TENANT });
  });

  it('non coché ⇒ `false` écrit explicitement, jamais `undefined` (fail-closed)', async () => {
    await updateEmailSettings(EmailSettingsSchema.parse({}));
    const arg = upsert.mock.calls[0]![0] as {
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    expect(arg.create.signatureEmailsEnabled).toBe(false);
    expect(arg.update.signatureEmailsEnabled).toBe(false);
  });
});
