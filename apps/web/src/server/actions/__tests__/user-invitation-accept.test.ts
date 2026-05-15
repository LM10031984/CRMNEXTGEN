import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests Phase 8 Plan 08-03 Task 1 — Server action `acceptInvitation`.
 *
 * Stratégie de mocks (cohérente Phase 7 tenant-settings.test.ts + Phase 8 tenant-users.test.ts) :
 *  - `@qualiof/db`        → prisma mocké (userInvitation, user, auditLog)
 *  - `@/lib/auth`         → lucia.createSession / createSessionCookie mockés
 *  - `argon2`             → hash mocké
 *  - `next/headers`       → cookies() mocké
 *  - `next/navigation`    → redirect mocké (throw NEXT_REDIRECT)
 *  - `@/lib/audit-log`    → logUserAction mocké
 *
 * Coverage (6 tests) :
 *  1. password trop court → fieldErrors.password
 *  2. confirm ne matche pas → fieldErrors.confirm
 *  3. token already used / expired (count=0) → { ok:false, error: /expiré|utilisé/i }
 *  4. invitation sans userId → { ok:false, error: /introuvable/i }
 *  5. succès → hash + update user + audit + redirect /app
 *  6. double-submit race : 2e call sur même token retourne erreur (single-use)
 */

// ─── Mocks (AVANT imports du SUT) ────────────────────────────────────────

vi.mock('@qualiof/db', () => ({
  prisma: {
    userInvitation: {
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },
    user: {
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
  UserRole: {
    ADMIN: 'ADMIN', MANAGER: 'MANAGER', FORMATEUR: 'FORMATEUR',
    COMMERCIAL: 'COMMERCIAL', COMPTABLE: 'COMPTABLE', LECTEUR: 'LECTEUR',
  },
  LegalForm: {
    SAS: 'SAS', SARL: 'SARL', SASU: 'SASU', EURL: 'EURL',
    SA: 'SA', EI: 'EI', EIRL: 'EIRL',
    AUTO_ENTREPRENEUR: 'AUTO_ENTREPRENEUR', AUTRE: 'AUTRE',
  },
}));

vi.mock('@/lib/auth', () => ({
  lucia: {
    createSession: vi.fn().mockResolvedValue({ id: 'sess1' }),
    createSessionCookie: vi.fn().mockReturnValue({
      name: 'auth_session',
      value: 'cookie-value',
      attributes: {},
    }),
  },
}));

vi.mock('argon2', () => ({
  default: { hash: vi.fn().mockResolvedValue('hashed-pwd-stub') },
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ set: vi.fn() }),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn().mockImplementation((url: string) => {
    const err = new Error('NEXT_REDIRECT');
    (err as Error & { digest?: string }).digest = `NEXT_REDIRECT;replace;${url};307`;
    throw err;
  }),
}));

vi.mock('@/lib/audit-log', () => ({
  logUserAction: vi.fn().mockResolvedValue(undefined),
}));

// ─── Imports SUT (après les mocks) ───────────────────────────────────────

import { acceptInvitation } from '../user-invitation-accept';
import { prisma } from '@qualiof/db';
import { lucia } from '@/lib/auth';
import { logUserAction } from '@/lib/audit-log';
import argon2 from 'argon2';

describe('acceptInvitation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-établir les valeurs par défaut des mocks (clearAllMocks reset les retours).
    vi.mocked(lucia.createSession).mockResolvedValue({ id: 'sess1' } as never);
    vi.mocked(lucia.createSessionCookie).mockReturnValue({
      name: 'auth_session',
      value: 'cookie-value',
      attributes: {},
    } as never);
    vi.mocked(argon2.hash).mockResolvedValue('hashed-pwd-stub' as never);
  });

  it('rejects password shorter than 8 characters with fieldErrors', async () => {
    const result = await acceptInvitation({
      token: 'tok-1',
      password: 'short',
      confirm: 'short',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors).toBeDefined();
      expect(result.fieldErrors?.password?.[0]).toMatch(/8 caractères/i);
    }
    // No DB write should have occurred.
    expect(prisma.userInvitation.updateMany).not.toHaveBeenCalled();
  });

  it('rejects mismatched confirm field with fieldErrors.confirm', async () => {
    const result = await acceptInvitation({
      token: 'tok-1',
      password: 'longenough1',
      confirm: 'longenough2',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors).toBeDefined();
      expect(result.fieldErrors?.confirm?.[0]).toMatch(/correspondent/i);
    }
    expect(prisma.userInvitation.updateMany).not.toHaveBeenCalled();
  });

  it('returns error when token already used or expired (updateMany count=0)', async () => {
    vi.mocked(prisma.userInvitation.updateMany).mockResolvedValue({ count: 0 } as never);

    const result = await acceptInvitation({
      token: 'expired-token',
      password: 'longenough',
      confirm: 'longenough',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/expiré|utilisé/i);
    }
    // Verify the atomic single-use query was issued.
    expect(prisma.userInvitation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          token: 'expired-token',
          usedAt: null,
          expiresAt: expect.objectContaining({ gt: expect.any(Date) }),
        }),
        data: expect.objectContaining({ usedAt: expect.any(Date) }),
      }),
    );
    // No further work after count=0.
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(lucia.createSession).not.toHaveBeenCalled();
  });

  it('returns error when invitation has no userId linked', async () => {
    vi.mocked(prisma.userInvitation.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.userInvitation.findUnique).mockResolvedValue({
      userId: null,
      tenantId: 'tenant-1',
      email: 'orphan@example.fr',
    } as never);

    const result = await acceptInvitation({
      token: 'orphan-token',
      password: 'longenough',
      confirm: 'longenough',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/introuvable/i);
    }
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('hashes password, updates user, logs audit, creates Lucia session and redirects /app on success', async () => {
    vi.mocked(prisma.userInvitation.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.userInvitation.findUnique).mockResolvedValue({
      userId: 'user-1',
      tenantId: 'tenant-1',
      email: 'newuser@example.fr',
    } as never);
    vi.mocked(prisma.user.update).mockResolvedValue({ id: 'user-1' } as never);

    let thrown: Error | null = null;
    try {
      await acceptInvitation({
        token: 'fresh-token',
        password: 'longenough',
        confirm: 'longenough',
      });
    } catch (e) {
      thrown = e as Error;
    }

    // redirect() throws NEXT_REDIRECT — that's the success signal.
    expect(thrown).not.toBeNull();
    expect(thrown?.message).toBe('NEXT_REDIRECT');

    expect(argon2.hash).toHaveBeenCalledWith('longenough');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          hashedPwd: 'hashed-pwd-stub',
          lastLoginAt: expect.any(Date),
        }),
      }),
    );
    expect(logUserAction).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        actorUserId: 'user-1',
        targetUserId: 'user-1',
        action: 'users.password.set',
      }),
    );
    expect(lucia.createSession).toHaveBeenCalledWith('user-1', {});
    expect(lucia.createSessionCookie).toHaveBeenCalledWith('sess1');
  });

  it('enforces single-use atomically: second call on same token returns error (count=0)', async () => {
    // First call : succès (count=1)
    vi.mocked(prisma.userInvitation.updateMany).mockResolvedValueOnce({ count: 1 } as never);
    vi.mocked(prisma.userInvitation.findUnique).mockResolvedValueOnce({
      userId: 'user-1',
      tenantId: 'tenant-1',
      email: 'a@b.fr',
    } as never);
    vi.mocked(prisma.user.update).mockResolvedValueOnce({ id: 'user-1' } as never);

    try {
      await acceptInvitation({
        token: 'same-token',
        password: 'longenough',
        confirm: 'longenough',
      });
    } catch {
      // redirect throws — c'est le signal de succès.
    }

    // Second call : updateMany retourne 0 (déjà claim par le 1er appel)
    vi.mocked(prisma.userInvitation.updateMany).mockResolvedValueOnce({ count: 0 } as never);

    const second = await acceptInvitation({
      token: 'same-token',
      password: 'longenough',
      confirm: 'longenough',
    });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error).toMatch(/expiré|utilisé/i);
    }
  });
});
