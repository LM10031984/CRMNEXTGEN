import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Sprint 4 — Tests du Prisma tenant-validator.
 *
 * On teste les fonctions internes du module via require dynamique pour
 * pouvoir manipuler `process.env.TENANT_VALIDATOR_MODE` entre les tests.
 *
 * Note : on ne teste pas l'extension `$extends` Prisma elle-même (ça
 * nécessiterait une vraie connexion BDD). On vérifie la logique de routing
 * mode + l'export des modèles.
 */

describe('tenant-validator', () => {
  const originalEnv = process.env.TENANT_VALIDATOR_MODE;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env.TENANT_VALIDATOR_MODE = originalEnv;
  });

  it('exporte la liste des modèles multi-tenant principaux', async () => {
    const mod = await import('@qualiof/db');
    expect(mod.MULTI_TENANT_MODELS.has('Person')).toBe(true);
    expect(mod.MULTI_TENANT_MODELS.has('Organization')).toBe(true);
    expect(mod.MULTI_TENANT_MODELS.has('TrainingSession')).toBe(true);
    expect(mod.MULTI_TENANT_MODELS.has('Invoice')).toBe(true);
    expect(mod.MULTI_TENANT_MODELS.has('Lead')).toBe(true);
    expect(mod.MULTI_TENANT_MODELS.has('AuditLog')).toBe(true);
  });

  it('exempte User (auth par email global)', async () => {
    const mod = await import('@qualiof/db');
    expect(mod.TENANT_VALIDATOR_EXEMPT.has('User')).toBe(true);
  });

  it('mode=off : passe le client tel quel sans wrapper', async () => {
    process.env.TENANT_VALIDATOR_MODE = 'off';
    const { withTenantValidator } = await import('@qualiof/db');
    const fakeClient = { $extends: vi.fn() } as unknown as Parameters<typeof withTenantValidator>[0];
    const result = withTenantValidator(fakeClient);
    expect(result).toBe(fakeClient);
    expect(fakeClient.$extends).not.toHaveBeenCalled();
  });

  it('mode=warn (default) : applique le wrapper $extends', async () => {
    process.env.TENANT_VALIDATOR_MODE = 'warn';
    const { withTenantValidator } = await import('@qualiof/db');
    const extended = { _isExtended: true };
    const fakeClient = {
      $extends: vi.fn().mockReturnValue(extended),
    } as unknown as Parameters<typeof withTenantValidator>[0];
    const result = withTenantValidator(fakeClient);
    expect(fakeClient.$extends).toHaveBeenCalledOnce();
    expect(result).toBe(extended);
  });

  it('mode=strict : applique aussi le wrapper $extends', async () => {
    process.env.TENANT_VALIDATOR_MODE = 'strict';
    const { withTenantValidator } = await import('@qualiof/db');
    const fakeClient = {
      $extends: vi.fn().mockReturnValue({}),
    } as unknown as Parameters<typeof withTenantValidator>[0];
    withTenantValidator(fakeClient);
    expect(fakeClient.$extends).toHaveBeenCalledOnce();
  });
});
