import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests Phase 8 Plan 08-01 Task 3 — helpers RBAC.
 *
 * Stratégie de mock : on remplace `../auth` par un module exposant un
 * `validateRequest` `vi.fn()`. Pour chaque test, on contrôle ce que ce mock
 * retourne (user actif / user null / etc.) puis on vérifie que `requireRole`
 * et `hasRole` se comportent comme attendu.
 *
 * Coverage :
 *  - requireRole : throws UnauthorizedError quand user null
 *  - requireRole : throws ForbiddenError quand role non autorisé
 *  - requireRole : retourne user quand role autorisé
 *  - hasRole : true/false selon role
 *  - error.name correctement assigné (utile pour discrimination côté caller)
 */

// Mock du module auth.ts AVANT l'import du SUT.
vi.mock('../auth', () => ({
  validateRequest: vi.fn(),
}));

import { validateRequest } from '../auth';
import {
  requireRole,
  hasRole,
  UnauthorizedError,
  ForbiddenError,
} from '../rbac';

describe('requireRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Test 1 — throw UnauthorizedError quand user est null', async () => {
    vi.mocked(validateRequest).mockResolvedValue({ user: null, session: null });
    await expect(requireRole(['ADMIN'])).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('Test 2 — throw ForbiddenError quand role non autorisé', async () => {
    vi.mocked(validateRequest).mockResolvedValue({
      user: {
        id: 'u1',
        role: 'LECTEUR',
        tenantId: 't1',
        email: 'a@b.fr',
        firstName: 'A',
        lastName: 'B',
        disabledAt: null,
      } as never,
      session: { id: 's1' } as never,
    });
    await expect(requireRole(['ADMIN'])).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('Test 3 — retourne user quand role autorisé', async () => {
    const fakeUser = {
      id: 'u1',
      role: 'ADMIN',
      tenantId: 't1',
      email: 'admin@start-academy.fr',
      firstName: 'Laurent',
      lastName: 'Marx',
      disabledAt: null,
    };
    vi.mocked(validateRequest).mockResolvedValue({
      user: fakeUser as never,
      session: { id: 's1' } as never,
    });
    const got = await requireRole(['ADMIN']);
    expect(got.id).toBe('u1');
    expect(got.role).toBe('ADMIN');
  });

  it('Test 4 — accepte plusieurs rôles dans `allowed`', async () => {
    vi.mocked(validateRequest).mockResolvedValue({
      user: {
        id: 'u2',
        role: 'MANAGER',
        tenantId: 't1',
        email: 'm@b.fr',
        firstName: 'M',
        lastName: 'A',
        disabledAt: null,
      } as never,
      session: { id: 's1' } as never,
    });
    const got = await requireRole(['ADMIN', 'MANAGER']);
    expect(got.role).toBe('MANAGER');
  });

  it('Test 5 — message ForbiddenError contient le rôle réel', async () => {
    vi.mocked(validateRequest).mockResolvedValue({
      user: {
        id: 'u3',
        role: 'FORMATEUR',
        tenantId: 't1',
        email: 'f@b.fr',
        firstName: 'F',
        lastName: 'B',
        disabledAt: null,
      } as never,
      session: { id: 's1' } as never,
    });
    await expect(requireRole(['ADMIN'])).rejects.toThrow(/FORMATEUR/);
  });
});

describe('hasRole', () => {
  it('Test 6 — retourne true quand role dans allowed', () => {
    expect(
      hasRole({ role: 'ADMIN' } as never, ['ADMIN', 'MANAGER']),
    ).toBe(true);
  });

  it('Test 7 — retourne false quand role hors allowed', () => {
    expect(hasRole({ role: 'LECTEUR' } as never, ['ADMIN'])).toBe(false);
  });
});

describe('Error classes', () => {
  it('Test 8 — UnauthorizedError a `.name === "UnauthorizedError"`', () => {
    const err = new UnauthorizedError();
    expect(err.name).toBe('UnauthorizedError');
    expect(err).toBeInstanceOf(Error);
  });

  it('Test 9 — ForbiddenError a `.name === "ForbiddenError"`', () => {
    const err = new ForbiddenError('test msg');
    expect(err.name).toBe('ForbiddenError');
    expect(err.message).toBe('test msg');
    expect(err).toBeInstanceOf(Error);
  });
});
