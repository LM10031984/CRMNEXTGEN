import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests Phase 8 Plan 08-02 Task 2 — Server Actions Utilisateurs.
 *
 * Stratégie de mock (cohérente Phase 7 tenant-settings.test.ts) :
 *  - `@qualiof/db`        → prisma mocké (user, userInvitation, auditLog, $transaction)
 *  - `@/lib/auth`         → lucia.invalidateUserSessions mocké
 *  - `@/lib/rbac`         → requireRole mocké (on contrôle qui est admin / null / error)
 *  - `@/lib/mailer`       → sendMail mocké, retourne { ok:true, dryRun:true } par défaut
 *  - `@/lib/of-config`    → loadOfConfig mocké
 *  - `next/cache`         → revalidatePath no-op
 *
 * Coverage (12 tests) :
 *  1.  inviteUser succès → user + invitation + sendMail + auditLog 'users.invite'
 *  2.  inviteUser refus rôle (ForbiddenError) → { ok:false, error }
 *  3.  inviteUser email déjà utilisé → { ok:false, fieldErrors.email }
 *  4.  inviteUser input invalide (email='bad') → { ok:false, fieldErrors }
 *  5.  disableUser succès → update.disabledAt + invalidateUserSessions + auditLog 'users.disable'
 *  6.  disableUser self-disable refusé → { ok:false, error: /votre propre/ }
 *  7.  disableUser déjà désactivé → { ok:false, error: /déjà désactivé/ }
 *  8.  enableUser succès → update disabledAt=null + auditLog 'users.enable'
 *  9.  resetUserPassword succès → invitation + sendMail + auditLog 'users.password.reset_requested'
 *  10. changeUserRole succès → update.role + auditLog 'users.role.change'
 *  11. changeUserRole self-demote refusé → { ok:false, error: /ADMIN vous-même/ }
 *  12. changeUserRole no-op si même rôle → pas de auditLog
 *  13. resendInvitation succès → nouvelle invitation + auditLog 'users.invitation.resend'
 */

// ─── Mocks (AVANT imports du SUT) ────────────────────────────────────────

vi.mock('@qualiof/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    userInvitation: {
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
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

vi.mock('@/lib/auth', () => ({
  lucia: {
    invalidateUserSessions: vi.fn(),
  },
  validateRequest: vi.fn(),
}));

vi.mock('@/lib/rbac', async () => {
  const actual = await vi.importActual<typeof import('@/lib/rbac')>('@/lib/rbac');
  return {
    ...actual,
    requireRole: vi.fn(),
  };
});

vi.mock('@/lib/mailer', () => ({
  sendMail: vi.fn().mockResolvedValue({ ok: true, dryRun: true }),
}));

vi.mock('@/lib/of-config', () => ({
  loadOfConfig: vi.fn().mockResolvedValue({
    name: 'Start Academy',
    siret: '81423718600030',
    rnq: '11000000000',
    addressFull: '12 rue Test, 75001 Paris',
    emailFrom: 'formation@start-academy.fr',
  }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// ─── Imports après mocks ─────────────────────────────────────────────────

import { prisma } from '@qualiof/db';
import { lucia } from '@/lib/auth';
import { requireRole, ForbiddenError } from '@/lib/rbac';
import { sendMail } from '@/lib/mailer';
import {
  inviteUser,
  disableUser,
  enableUser,
  resetUserPassword,
  changeUserRole,
  resendInvitation,
} from '../tenant-users';

// Typed accessors
const userFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const userFindFirst = prisma.user.findFirst as unknown as ReturnType<typeof vi.fn>;
const userUpdate = prisma.user.update as unknown as ReturnType<typeof vi.fn>;
const invitationCreate = prisma.userInvitation.create as unknown as ReturnType<typeof vi.fn>;
const auditLogCreate = prisma.auditLog.create as unknown as ReturnType<typeof vi.fn>;
const transaction = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;
const requireRoleMock = requireRole as unknown as ReturnType<typeof vi.fn>;
const invalidateUserSessionsMock = lucia.invalidateUserSessions as unknown as ReturnType<
  typeof vi.fn
>;
const sendMailMock = sendMail as unknown as ReturnType<typeof vi.fn>;

const FAKE_ADMIN = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  tenantId: 'tenant-1',
  email: 'admin@start-academy.fr',
  firstName: 'Laurent',
  lastName: 'Marx',
  role: 'ADMIN',
  disabledAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default : admin authentifié
  requireRoleMock.mockResolvedValue(FAKE_ADMIN);
  sendMailMock.mockResolvedValue({ ok: true, dryRun: true });
});

// ─── 1. inviteUser ──────────────────────────────────────────────────────

describe('inviteUser', () => {
  it("Test 1 — succès : crée user + invitation + envoie mail + AuditLog 'users.invite'", async () => {
    userFindUnique.mockResolvedValueOnce(null); // email pas déjà pris
    transaction.mockImplementationOnce(async (cb: any) => {
      // Simule l'exécution du callback dans la transaction
      const tx = {
        user: {
          create: vi.fn().mockResolvedValue({ id: 'user-new', email: 'new@x.fr' }),
        },
        userInvitation: {
          create: vi.fn().mockResolvedValue({ id: 'inv-1', token: 'abc' }),
        },
      };
      return cb(tx);
    });

    const result = await inviteUser({
      email: 'new@x.fr',
      firstName: 'Alice',
      lastName: 'Martin',
      role: 'COMMERCIAL',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data?.userId).toBe('user-new');
      expect(result.data?.dryRun).toBe(true);
    }
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const mailCall = sendMailMock.mock.calls[0]![0];
    expect(mailCall.to).toBe('new@x.fr');
    expect(mailCall.subject).toMatch(/Bienvenue/);
    // Phase 22-11 : contexte requis (invitation utilisateur, pas de session).
    expect(mailCall.context).toEqual({
      tenantId: 'tenant-1',
      category: 'user_invitation',
      sessionId: null,
    });
    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    const auditCall = auditLogCreate.mock.calls[0]![0];
    expect(auditCall.data.entity).toBe('User');
    expect(auditCall.data.entityId).toBe('user-new');
    expect(auditCall.data.action).toBe('users.invite');
    expect(auditCall.data.userId).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  });

  it('Test 2 — rôle non autorisé (LECTEUR) → ForbiddenError catchée', async () => {
    requireRoleMock.mockRejectedValueOnce(new ForbiddenError('Rôle LECTEUR non autorisé'));

    const result = await inviteUser({
      email: 'new@x.fr',
      firstName: 'A',
      lastName: 'B',
      role: 'LECTEUR',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/non autorisé/);
    }
    expect(transaction).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it("Test 3 — email déjà utilisé → { ok:false, fieldErrors.email }", async () => {
    userFindUnique.mockResolvedValueOnce({ id: 'existing-user' });

    const result = await inviteUser({
      email: 'already@x.fr',
      firstName: 'A',
      lastName: 'B',
      role: 'COMMERCIAL',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors?.email).toBeDefined();
      expect(result.fieldErrors?.email?.length).toBeGreaterThan(0);
    }
    expect(transaction).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it('Test 4 — input invalide (email malformé) → fieldErrors sans toucher BDD', async () => {
    const result = await inviteUser({
      email: 'not-an-email',
      firstName: 'A',
      lastName: 'B',
      role: 'COMMERCIAL',
    } as never);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors).toBeDefined();
    }
    expect(userFindUnique).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
});

// ─── 2. disableUser ─────────────────────────────────────────────────────

describe('disableUser', () => {
  it("Test 5 — succès : update disabledAt + invalidateUserSessions + AuditLog 'users.disable'", async () => {
    userFindFirst.mockResolvedValueOnce({
      id: 'user-2',
      email: 'b@x.fr',
      disabledAt: null,
    });
    userUpdate.mockResolvedValueOnce({ id: 'user-2', disabledAt: new Date() });

    const result = await disableUser('user-2');

    expect(result.ok).toBe(true);
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-2' },
      data: { disabledAt: expect.any(Date) },
    });
    expect(invalidateUserSessionsMock).toHaveBeenCalledWith('user-2');
    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    const auditCall = auditLogCreate.mock.calls[0]![0];
    expect(auditCall.data.action).toBe('users.disable');
    expect(auditCall.data.entityId).toBe('user-2');
    expect(auditCall.data.diff).toEqual({ email: 'b@x.fr' });
  });

  it('Test 6 — self-disable refusé', async () => {
    const result = await disableUser('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'); // === FAKE_ADMIN.id

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/propre compte/i);
    }
    expect(userUpdate).not.toHaveBeenCalled();
    expect(invalidateUserSessionsMock).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it('Test 7 — déjà désactivé → { ok:false }', async () => {
    userFindFirst.mockResolvedValueOnce({
      id: 'user-3',
      email: 'c@x.fr',
      disabledAt: new Date('2026-01-01'),
    });

    const result = await disableUser('user-3');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/déjà désactivé/i);
    }
    expect(userUpdate).not.toHaveBeenCalled();
    expect(invalidateUserSessionsMock).not.toHaveBeenCalled();
  });
});

// ─── 3. enableUser ──────────────────────────────────────────────────────

describe('enableUser', () => {
  it("Test 8 — succès : update disabledAt=null + AuditLog 'users.enable'", async () => {
    userFindFirst.mockResolvedValueOnce({
      id: 'user-4',
      email: 'd@x.fr',
      disabledAt: new Date('2026-01-01'),
    });
    userUpdate.mockResolvedValueOnce({ id: 'user-4', disabledAt: null });

    const result = await enableUser('user-4');

    expect(result.ok).toBe(true);
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-4' },
      data: { disabledAt: null },
    });
    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    expect(auditLogCreate.mock.calls[0]![0].data.action).toBe('users.enable');
  });

  it('Test 8bis — déjà actif → { ok:false }', async () => {
    userFindFirst.mockResolvedValueOnce({
      id: 'user-5',
      email: 'e@x.fr',
      disabledAt: null,
    });

    const result = await enableUser('user-5');
    expect(result.ok).toBe(false);
    expect(userUpdate).not.toHaveBeenCalled();
  });
});

// ─── 4. resetUserPassword ──────────────────────────────────────────────

describe('resetUserPassword', () => {
  it("Test 9 — succès : crée invitation + sendMail + AuditLog 'users.password.reset_requested'", async () => {
    userFindFirst.mockResolvedValueOnce({
      id: 'user-6',
      email: 'f@x.fr',
      firstName: 'Frank',
      role: 'COMMERCIAL',
    });
    invitationCreate.mockResolvedValueOnce({ id: 'inv-reset-1', token: 'xyz' });

    const result = await resetUserPassword('user-6');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data?.dryRun).toBe(true);
    }
    expect(invitationCreate).toHaveBeenCalledTimes(1);
    const invCall = invitationCreate.mock.calls[0]![0];
    expect(invCall.data.email).toBe('f@x.fr');
    expect(invCall.data.role).toBe('COMMERCIAL');
    expect(invCall.data.userId).toBe('user-6');
    expect(typeof invCall.data.token).toBe('string');
    expect(invCall.data.token.length).toBe(32); // randomUUID().replace(/-/g,'') = 32 hex
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock.mock.calls[0]![0].subject).toMatch(/Réinitialisation/);
    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    const auditCall = auditLogCreate.mock.calls[0]![0];
    expect(auditCall.data.action).toBe('users.password.reset_requested');
    expect(auditCall.data.entityId).toBe('user-6');
  });

  it('Test 9bis — user introuvable → { ok:false }', async () => {
    userFindFirst.mockResolvedValueOnce(null);

    const result = await resetUserPassword('ghost');

    expect(result.ok).toBe(false);
    expect(invitationCreate).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});

// ─── 5. changeUserRole ─────────────────────────────────────────────────

describe('changeUserRole', () => {
  it("Test 10 — succès : update role + AuditLog 'users.role.change' avec diff", async () => {
    userFindFirst.mockResolvedValueOnce({
      id: 'user-7',
      role: 'COMMERCIAL',
      email: 'g@x.fr',
    });
    userUpdate.mockResolvedValueOnce({ id: 'user-7', role: 'MANAGER' });

    const result = await changeUserRole({
      userId: '11111111-1111-1111-1111-111111111111',
      role: 'MANAGER',
    });
    // Note : on passe le userId Zod-valide ; le mock findFirst répond peu importe le where.

    expect(result.ok).toBe(true);
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: '11111111-1111-1111-1111-111111111111' },
      data: { role: 'MANAGER' },
    });
    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    const auditCall = auditLogCreate.mock.calls[0]![0];
    expect(auditCall.data.action).toBe('users.role.change');
    expect(auditCall.data.diff).toEqual({
      role: { before: 'COMMERCIAL', after: 'MANAGER' },
    });
  });

  it('Test 11 — self-demote ADMIN → LECTEUR refusé', async () => {
    const result = await changeUserRole({
      userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', // === FAKE_ADMIN.id
      role: 'LECTEUR',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/ADMIN vous-même/i);
    }
    expect(userFindFirst).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it('Test 12 — no-op si même rôle → pas de AuditLog', async () => {
    userFindFirst.mockResolvedValueOnce({
      id: 'user-8',
      role: 'COMMERCIAL',
      email: 'h@x.fr',
    });

    const result = await changeUserRole({
      userId: '22222222-2222-2222-2222-222222222222',
      role: 'COMMERCIAL',
    });

    expect(result.ok).toBe(true);
    expect(userUpdate).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });
});

// ─── 6. resendInvitation ───────────────────────────────────────────────

describe('resendInvitation', () => {
  it("Test 13 — succès : nouvelle UserInvitation + sendMail + AuditLog 'users.invitation.resend'", async () => {
    userFindFirst.mockResolvedValueOnce({
      id: 'user-9',
      email: 'i@x.fr',
      firstName: 'Inès',
      role: 'COMMERCIAL',
    });
    invitationCreate.mockResolvedValueOnce({ id: 'inv-resend', token: 'def' });

    const result = await resendInvitation('user-9');

    expect(result.ok).toBe(true);
    expect(invitationCreate).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock.mock.calls[0]![0].subject).toMatch(/Bienvenue/);
    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    expect(auditLogCreate.mock.calls[0]![0].data.action).toBe('users.invitation.resend');
    expect(auditLogCreate.mock.calls[0]![0].data.entityId).toBe('user-9');
  });
});
