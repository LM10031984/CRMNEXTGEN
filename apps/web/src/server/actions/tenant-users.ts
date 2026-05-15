'use server';

/**
 * Server actions Utilisateurs (Phase 8 D-04 → D-06 + D-10 audit convention).
 *
 * 6 actions ADMIN-only via `requireRole(['ADMIN'])` :
 *   1. inviteUser         — crée un User (placeholder hashedPwd='') + UserInvitation + envoie email
 *   2. disableUser        — soft-delete via disabledAt + invalide les sessions Lucia
 *   3. enableUser         — annule la désactivation
 *   4. resetUserPassword  — nouvelle UserInvitation + email "réinitialisation"
 *   5. changeUserRole     — change User.role
 *   6. resendInvitation   — régénère un token + renvoie l'email d'invitation
 *
 * Conventions communes (cohérentes Phase 7 `tenant-settings.ts`) :
 *  - Retour discriminé `{ ok: true, data?: T } | { ok: false, error, fieldErrors? }`.
 *  - Toutes les queries Prisma scopées par `admin.tenantId` (multi-tenant safety).
 *  - Toutes les mutations écrivent dans AuditLog via `logUserAction` (D-10 convention).
 *  - `revalidatePath('/app/parametres/utilisateurs')` après chaque mutation.
 *  - Erreurs `UnauthorizedError` / `ForbiddenError` capturées → `{ ok: false, error }`.
 *
 * Protections métier :
 *  - disableUser refuse de désactiver soi-même (admin ne peut pas se lock-out).
 *  - changeUserRole refuse de retirer le rôle ADMIN à soi-même.
 *
 * Cf. RESEARCH.md Findings #4 (token cleartext), #5 (Lucia invalidateUserSessions),
 * et CONTEXT.md D-04 D-05 D-06 D-10.
 */

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import type { UserRole } from '@qualiof/db';
import { lucia } from '@/lib/auth';
import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import {
  inviteUserSchema,
  changeUserRoleSchema,
  type InviteUserInput,
  type ChangeUserRoleInput,
} from '@qualiof/shared';
import { sendMail } from '@/lib/mailer';
import { renderInvitationEmail } from '@/lib/mailer-templates/user-invitation';
import { renderPasswordResetEmail } from '@/lib/mailer-templates/user-password-reset';
import { loadOfConfig } from '@/lib/of-config';
import { logUserAction } from '@/lib/audit-log';

const INVITATION_VALIDITY_DAYS = 7;
const REVAL_PATH = '/app/parametres/utilisateurs';

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

/**
 * Token clair 32 hex (128 bits entropie via OS RNG).
 *
 * Pattern identique à `preinscriptions.ts:20` — cohérence projet.
 * Pas de hash Argon2 en BDD (RESEARCH Finding #4) : single-use + expiration 7j
 * + 128 bits suffisent + permet `where: { token }` direct.
 */
function generateToken(): string {
  return randomUUID().replace(/-/g, '');
}

function invitationExpiry(): Date {
  return new Date(Date.now() + INVITATION_VALIDITY_DAYS * 86400 * 1000);
}

/**
 * Construit l'URL publique absolue. Pattern repris de `preinscriptions.ts`
 * (NEXT_PUBLIC_APP_URL > APP_URL > fallback localhost:3002 — port dev QualiOF).
 */
function publicInvitationUrl(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    process.env.NEXTAUTH_URL ??
    'http://localhost:3002';
  return `${base.replace(/\/$/, '')}/invitation/${token}`;
}

// ─── 1. inviteUser ──────────────────────────────────────────────────────
/**
 * Invite un nouvel utilisateur (D-04). ADMIN only.
 *  - Crée le User avec `hashedPwd=''` (ne peut pas se connecter avant set-password).
 *  - Crée la UserInvitation (token 32 hex, expiration 7j).
 *  - Envoie l'email d'invitation (dry-run silencieux si SMTP non configuré).
 *  - Loggue `users.invite` dans AuditLog.
 *
 * Retourne `{ ok: true, data: { userId, dryRun? } }`. `dryRun=true` permet à
 * l'UI d'afficher un toast "mail simulé (SMTP non configuré)".
 */
export async function inviteUser(
  input: InviteUserInput,
): Promise<ActionResult<{ userId: string; dryRun?: boolean }>> {
  try {
    const admin = await requireRole(['ADMIN']);

    const parsed = inviteUserSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Validation échouée',
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }
    const { email, firstName, lastName, role } = parsed.data;

    // Email unique global (cohérent `prisma.user.email @unique`).
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return {
        ok: false,
        error: 'Email déjà utilisé',
        fieldErrors: { email: ['Email déjà utilisé'] },
      };
    }

    const token = generateToken();
    const expiresAt = invitationExpiry();

    // Transaction atomique : si l'un échoue, on annule l'autre.
    const { newUser, invitation } = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          tenantId: admin.tenantId,
          email,
          hashedPwd: '', // placeholder — sera défini via /invitation/[token]
          firstName,
          lastName,
          role: role as UserRole,
          invitedAt: new Date(),
          invitedBy: admin.id,
        },
      });
      const invitation = await tx.userInvitation.create({
        data: {
          tenantId: admin.tenantId,
          email,
          token,
          role: role as UserRole,
          expiresAt,
          userId: newUser.id,
          invitedBy: admin.id,
        },
      });
      return { newUser, invitation };
    });

    // Email (hors transaction — un échec SMTP ne doit pas rollback la création).
    const of = await loadOfConfig(admin.tenantId);
    const { subject, html, text } = renderInvitationEmail(
      {
        firstName,
        publicUrl: publicInvitationUrl(token),
        expiresAt,
        invitedByName: `${admin.firstName} ${admin.lastName}`,
      },
      of,
    );
    const mailResult = await sendMail({ to: email, subject, html, text });

    await logUserAction({
      tenantId: admin.tenantId,
      actorUserId: admin.id,
      targetUserId: newUser.id,
      action: 'users.invite',
      diff: { email, role, invitationId: invitation.id },
    });

    revalidatePath(REVAL_PATH);
    return { ok: true, data: { userId: newUser.id, dryRun: mailResult.dryRun } };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }
}

// ─── 2. disableUser ─────────────────────────────────────────────────────
/**
 * Désactive un utilisateur (D-05 soft-delete). ADMIN only.
 *  - Set `User.disabledAt = now()` (le user ne pourra plus se connecter, cf
 *    `validateRequest()` qui rejette si `disabledAt != null`).
 *  - Invalide TOUTES les sessions Lucia existantes du user (logout immédiat).
 *  - Loggue `users.disable`.
 *
 * Protections :
 *  - L'admin ne peut pas se désactiver lui-même (anti lock-out).
 *  - Idempotent : `{ ok: false }` si user déjà désactivé.
 *  - Scope tenantId obligatoire (un admin ne peut désactiver qu'un user de son tenant).
 */
export async function disableUser(userId: string): Promise<ActionResult> {
  try {
    const admin = await requireRole(['ADMIN']);

    if (userId === admin.id) {
      return { ok: false, error: 'Vous ne pouvez pas désactiver votre propre compte' };
    }

    const before = await prisma.user.findFirst({
      where: { id: userId, tenantId: admin.tenantId },
      select: { id: true, email: true, disabledAt: true },
    });
    if (!before) return { ok: false, error: 'Utilisateur introuvable' };
    if (before.disabledAt) return { ok: false, error: 'Utilisateur déjà désactivé' };

    await prisma.user.update({
      where: { id: userId },
      data: { disabledAt: new Date() },
    });

    // Invalidation Lucia — vérifié dans core.d.ts:41 (RESEARCH Standard Stack).
    // Force la déconnexion immédiate du user désactivé sur tous ses devices.
    await lucia.invalidateUserSessions(userId);

    await logUserAction({
      tenantId: admin.tenantId,
      actorUserId: admin.id,
      targetUserId: userId,
      action: 'users.disable',
      diff: { email: before.email },
    });

    revalidatePath(REVAL_PATH);
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }
}

// ─── 3. enableUser ──────────────────────────────────────────────────────
/**
 * Réactive un utilisateur précédemment désactivé. ADMIN only.
 * Pas de regen de sessions — l'user devra se reconnecter manuellement.
 */
export async function enableUser(userId: string): Promise<ActionResult> {
  try {
    const admin = await requireRole(['ADMIN']);

    const before = await prisma.user.findFirst({
      where: { id: userId, tenantId: admin.tenantId },
      select: { id: true, email: true, disabledAt: true },
    });
    if (!before) return { ok: false, error: 'Utilisateur introuvable' };
    if (!before.disabledAt) return { ok: false, error: 'Utilisateur déjà actif' };

    await prisma.user.update({
      where: { id: userId },
      data: { disabledAt: null },
    });

    await logUserAction({
      tenantId: admin.tenantId,
      actorUserId: admin.id,
      targetUserId: userId,
      action: 'users.enable',
      diff: { email: before.email },
    });

    revalidatePath(REVAL_PATH);
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }
}

// ─── 4. resetUserPassword ──────────────────────────────────────────────
/**
 * Déclenche un reset de mot de passe (D-06). ADMIN only.
 *  - Crée une nouvelle `UserInvitation` (token 32 hex, expiration 7j) liée
 *    à l'user existant — role = role actuel de l'user (pas de changement).
 *  - Envoie l'email de réinitialisation.
 *  - Loggue `users.password.reset_requested`.
 *
 * L'user clique le lien → même flow que l'invitation initiale (server action
 * `acceptInvitation` qui sera implémentée en Plan 08-03).
 */
export async function resetUserPassword(
  userId: string,
): Promise<ActionResult<{ dryRun?: boolean }>> {
  try {
    const admin = await requireRole(['ADMIN']);

    const target = await prisma.user.findFirst({
      where: { id: userId, tenantId: admin.tenantId },
      select: { id: true, email: true, firstName: true, role: true },
    });
    if (!target) return { ok: false, error: 'Utilisateur introuvable' };

    const token = generateToken();
    const expiresAt = invitationExpiry();
    const invitation = await prisma.userInvitation.create({
      data: {
        tenantId: admin.tenantId,
        email: target.email,
        token,
        role: target.role,
        expiresAt,
        userId: target.id,
        invitedBy: admin.id,
      },
    });

    const of = await loadOfConfig(admin.tenantId);
    const { subject, html, text } = renderPasswordResetEmail(
      {
        firstName: target.firstName,
        publicUrl: publicInvitationUrl(token),
        expiresAt,
      },
      of,
    );
    const mailResult = await sendMail({ to: target.email, subject, html, text });

    await logUserAction({
      tenantId: admin.tenantId,
      actorUserId: admin.id,
      targetUserId: userId,
      action: 'users.password.reset_requested',
      diff: { invitationId: invitation.id },
    });

    revalidatePath(REVAL_PATH);
    return { ok: true, data: { dryRun: mailResult.dryRun } };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }
}

// ─── 5. changeUserRole ─────────────────────────────────────────────────
/**
 * Change le rôle d'un utilisateur. ADMIN only.
 *  - Protection lock-out : l'admin ne peut pas se retirer le rôle ADMIN.
 *  - No-op (sans AuditLog) si le nouveau rôle == rôle actuel.
 *  - Loggue `users.role.change` avec diff `{ role: { before, after } }`.
 */
export async function changeUserRole(input: ChangeUserRoleInput): Promise<ActionResult> {
  try {
    const admin = await requireRole(['ADMIN']);

    const parsed = changeUserRoleSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Validation échouée',
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }
    const { userId, role } = parsed.data;

    if (userId === admin.id && role !== 'ADMIN') {
      return {
        ok: false,
        error: 'Vous ne pouvez pas vous retirer le rôle ADMIN vous-même',
      };
    }

    const before = await prisma.user.findFirst({
      where: { id: userId, tenantId: admin.tenantId },
      select: { id: true, role: true, email: true },
    });
    if (!before) return { ok: false, error: 'Utilisateur introuvable' };
    if (before.role === role) return { ok: true }; // no-op silencieux

    await prisma.user.update({
      where: { id: userId },
      data: { role: role as UserRole },
    });

    await logUserAction({
      tenantId: admin.tenantId,
      actorUserId: admin.id,
      targetUserId: userId,
      action: 'users.role.change',
      diff: { role: { before: before.role, after: role } },
    });

    revalidatePath(REVAL_PATH);
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }
}

// ─── 6. resendInvitation ───────────────────────────────────────────────
/**
 * Renvoie une invitation à un user existant (typiquement après expiration du
 * token précédent ou si l'user n'a jamais reçu/cliqué le premier mail).
 *
 * Génère une NOUVELLE `UserInvitation` (token + 7j) — les anciennes invitations
 * restent en BDD avec `usedAt=null` mais expirées (`expiresAt < now()`). Pas de
 * cleanup automatique pour Phase 8 (Plan 08-03 fera le check `expiresAt > now()`
 * côté accept).
 */
export async function resendInvitation(
  userId: string,
): Promise<ActionResult<{ dryRun?: boolean }>> {
  try {
    const admin = await requireRole(['ADMIN']);

    const target = await prisma.user.findFirst({
      where: { id: userId, tenantId: admin.tenantId },
      select: { id: true, email: true, firstName: true, role: true },
    });
    if (!target) return { ok: false, error: 'Utilisateur introuvable' };

    const token = generateToken();
    const expiresAt = invitationExpiry();
    await prisma.userInvitation.create({
      data: {
        tenantId: admin.tenantId,
        email: target.email,
        token,
        role: target.role,
        expiresAt,
        userId: target.id,
        invitedBy: admin.id,
      },
    });

    const of = await loadOfConfig(admin.tenantId);
    const { subject, html, text } = renderInvitationEmail(
      {
        firstName: target.firstName,
        publicUrl: publicInvitationUrl(token),
        expiresAt,
        invitedByName: `${admin.firstName} ${admin.lastName}`,
      },
      of,
    );
    const mailResult = await sendMail({ to: target.email, subject, html, text });

    await logUserAction({
      tenantId: admin.tenantId,
      actorUserId: admin.id,
      targetUserId: userId,
      action: 'users.invitation.resend',
    });

    revalidatePath(REVAL_PATH);
    return { ok: true, data: { dryRun: mailResult.dryRun } };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }
}
