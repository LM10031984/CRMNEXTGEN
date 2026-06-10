import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests Phase 8 Plan 08-05 Task 1 — loginAction hooks AuditLog + lastLoginAt.
 *
 * Stratégie de mock (cohérente avec tenant-users.test.ts) :
 *  - `@qualiof/db`     → prisma mocké (user.findUnique, user.update, auditLog.create)
 *                        + UserRole + LegalForm enums (rappel CLAUDE.md test mock pattern)
 *  - `argon2`          → verify() mocké
 *  - `@/lib/auth`      → lucia.createSession/createSessionCookie mockés
 *  - `next/headers`    → cookies().set() mocké
 *  - `next/navigation` → redirect() throw 'REDIRECT' pour pouvoir le tester
 *  - `@qualiof/shared` → loginSchema déjà OK, on l'utilise tel quel
 *
 * Coverage (5 tests) :
 *  1. Email inconnu → ok=false + AUCUN AuditLog (pas de tenantId résoluble)
 *  2. User désactivé → ok=false + AuditLog auth.login.failed reason='disabled'
 *  3. Bad password → ok=false + AuditLog auth.login.failed reason='bad_password'
 *  4. Succès → AuditLog auth.login.success + user.update lastLoginAt
 *  5. Audit fails silently (best-effort) — login continue même si auditLog.create throw
 */

// ─── Mocks (AVANT imports du SUT) ────────────────────────────────────────

vi.mock('@qualiof/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
  UserRole: {
    ADMIN: 'ADMIN',
    MANAGER: 'MANAGER',
    FORMATEUR: 'FORMATEUR',
    COMMERCIAL: 'COMMERCIAL',
    COMPTABLE: 'COMPTABLE',
    LECTEUR: 'LECTEUR',
  },
  LegalForm: {
    SAS: 'SAS',
    SARL: 'SARL',
    SASU: 'SASU',
    EURL: 'EURL',
    SA: 'SA',
    EI: 'EI',
    EIRL: 'EIRL',
    AUTO_ENTREPRENEUR: 'AUTO_ENTREPRENEUR',
    AUTRE: 'AUTRE',
  },
}));

vi.mock('argon2', () => ({
  default: { verify: vi.fn() },
}));

vi.mock('@/lib/auth', () => ({
  lucia: {
    createSession: vi.fn().mockResolvedValue({ id: 's1' }),
    createSessionCookie: vi.fn().mockReturnValue({
      name: 'auth_session',
      value: 'v',
      attributes: {},
    }),
    sessionCookieName: 'auth_session',
    invalidateSession: vi.fn(),
    createBlankSessionCookie: vi
      .fn()
      .mockReturnValue({ name: 'auth_session', value: '', attributes: {} }),
  },
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    set: vi.fn(),
    get: vi.fn().mockReturnValue(undefined),
  }),
  headers: vi.fn().mockResolvedValue({
    get: vi.fn().mockReturnValue(null),
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn().mockImplementation((url: string) => {
    const err = new Error(`NEXT_REDIRECT:${url}`);
    err.name = 'NEXT_REDIRECT';
    throw err;
  }),
}));

// Rate-limit fail-open (Redis non disponible en test).
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ ok: true, remaining: 99, resetIn: 0 }),
  RateLimitProfile: {
    LOGIN: { limit: 5, windowSec: 900 },
  },
}));

// ─── Imports du SUT ──────────────────────────────────────────────────────

import { loginAction } from '../actions';
import { prisma } from '@qualiof/db';
import argon2 from 'argon2';

const VALID_PASSWORD = 'longenough123';

const baseUser = {
  id: 'u1',
  tenantId: 't1',
  email: 'a@b.fr',
  hashedPwd: 'hash-xxx',
  firstName: 'A',
  lastName: 'B',
  role: 'ADMIN' as const,
  disabledAt: null,
  lastLoginAt: null,
  invitedAt: null,
  invitedBy: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('loginAction (Plan 08-05 hooks AuditLog)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Test 1 — email inconnu : ok=false + AUCUN AuditLog (pas de tenantId)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    const r = await loginAction({
      email: 'unknown@x.fr',
      password: VALID_PASSWORD,
    });
    expect(r).toEqual({ ok: false, error: 'Identifiants invalides.' });
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('Test 2 — user désactivé : ok=false + AuditLog auth.login.failed reason=disabled', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...baseUser,
      disabledAt: new Date('2026-04-01'),
    } as never);
    const r = await loginAction({ email: 'a@b.fr', password: VALID_PASSWORD });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/désactivé/i);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'auth.login.failed',
          entity: 'User',
          entityId: 'u1',
          tenantId: 't1',
          diff: expect.objectContaining({ reason: 'disabled' }),
        }),
      }),
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('Test 3 — bad password : ok=false + AuditLog auth.login.failed reason=bad_password', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(baseUser as never);
    vi.mocked(argon2.verify).mockResolvedValue(false);
    const r = await loginAction({ email: 'a@b.fr', password: VALID_PASSWORD });
    expect(r).toEqual({ ok: false, error: 'Identifiants invalides.' });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'auth.login.failed',
          tenantId: 't1',
          diff: expect.objectContaining({ reason: 'bad_password' }),
        }),
      }),
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('Test 4 — succès : AuditLog auth.login.success + user.update lastLoginAt + redirect', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(baseUser as never);
    vi.mocked(argon2.verify).mockResolvedValue(true);
    vi.mocked(prisma.user.update).mockResolvedValue(baseUser as never);

    let redirectCaught = false;
    try {
      await loginAction({ email: 'a@b.fr', password: VALID_PASSWORD });
    } catch (e) {
      // redirect() de next/navigation throw → c'est le path "succès"
      if ((e as Error).name === 'NEXT_REDIRECT') redirectCaught = true;
      else throw e;
    }
    expect(redirectCaught).toBe(true);

    // lastLoginAt mis à jour
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1' },
        data: expect.objectContaining({ lastLoginAt: expect.any(Date) }),
      }),
    );
    // AuditLog success écrit
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'auth.login.success',
          entity: 'User',
          entityId: 'u1',
          tenantId: 't1',
        }),
      }),
    );
  });

  it('Test 5 — best-effort : si auditLog.create throw, le login NE doit PAS échouer', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(baseUser as never);
    vi.mocked(argon2.verify).mockResolvedValue(true);
    vi.mocked(prisma.user.update).mockResolvedValue(baseUser as never);
    vi.mocked(prisma.auditLog.create).mockRejectedValue(
      new Error('Prisma timeout'),
    );

    let redirectCaught = false;
    try {
      await loginAction({ email: 'a@b.fr', password: VALID_PASSWORD });
    } catch (e) {
      if ((e as Error).name === 'NEXT_REDIRECT') redirectCaught = true;
      else throw e;
    }
    // Même si l'audit a planté, la session est créée et redirect a été appelé.
    expect(redirectCaught).toBe(true);
  });

  it('Test 6 — input invalide (email format) : ok=false + AUCUN AuditLog + AUCUN findUnique', async () => {
    const r = await loginAction({
      email: 'pas-un-email',
      password: VALID_PASSWORD,
    });
    expect(r).toEqual({ ok: false, error: 'Données invalides.' });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
