'use server';

/**
 * Phase 8 RBAC-02 — acceptation invitation utilisateur (server action publique).
 *
 * Flow (D-04 + Example 3 RESEARCH) :
 *   user clique le lien email → page `/invitation/[token]` →
 *   formulaire 2 champs (password + confirm) → cette action :
 *     1. Valide via `setPasswordSchema` (8 chars min + match confirm)
 *     2. Claim atomique via `updateMany` (Pitfall #3 single-use) :
 *        on update `usedAt` SEULEMENT si `usedAt == null AND expiresAt > now`.
 *        Si count == 0 → token déjà consommé OU expiré → erreur générique.
 *     3. Hash password (Argon2, même pattern que login/actions.ts)
 *     4. Update user.hashedPwd + user.lastLoginAt
 *     5. AuditLog `users.password.set` (D-10 convention)
 *     6. Lucia createSession + setSessionCookie (login auto)
 *     7. redirect('/app') — la fonction ne revient JAMAIS sur succès.
 *
 * Pourquoi `updateMany` plutôt que `findUnique → if ok update` ?
 * → Race-condition : si l'user double-clique vite, deux requêtes parallèles
 *   verraient toutes les deux `usedAt = null` au findUnique et créeraient
 *   deux sessions / écraseraient le hashedPwd. `updateMany` est atomique côté
 *   Postgres : un seul gagne le claim, l'autre retourne count=0.
 *
 * Return shape : discriminated union
 *   - `{ ok: false, error, fieldErrors? }` (Zod ou erreur métier)
 *   - jamais `{ ok: true, ... }` car `redirect()` throw avant.
 *
 * Cohérence pattern Phase 7 / Plan 08-02.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import argon2 from 'argon2';
import { prisma } from '@qualiof/db';
import { lucia } from '@/lib/auth';
import { setPasswordSchema } from '@qualiof/shared';
import { logUserAction } from '@/lib/audit-log';

export type AcceptInvitationResult = {
  ok: false;
  error: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export async function acceptInvitation(input: {
  token: string;
  password: string;
  confirm: string;
}): Promise<AcceptInvitationResult> {
  // 1. Validation Zod (8 chars min + match confirm)
  const parsed = setPasswordSchema.safeParse({
    password: input.password,
    confirm: input.confirm,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Mot de passe invalide',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  // 2. Claim atomique single-use (Pitfall #3 RESEARCH).
  //    Si l'invitation est déjà utilisée OU expirée, count=0 et on bail out.
  const claim = await prisma.userInvitation.updateMany({
    where: {
      token: input.token,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { usedAt: new Date() },
  });
  if (claim.count === 0) {
    return { ok: false, error: 'Lien expiré ou déjà utilisé' };
  }

  // 3. Récupère l'invitation pour lire userId + tenantId.
  const invitation = await prisma.userInvitation.findUnique({
    where: { token: input.token },
    select: { userId: true, tenantId: true, email: true },
  });
  if (!invitation || !invitation.userId) {
    return { ok: false, error: 'Invitation introuvable' };
  }

  // 4. Hash password (même pattern que login/actions.ts) + update user.
  const hashedPwd = await argon2.hash(parsed.data.password);
  await prisma.user.update({
    where: { id: invitation.userId },
    data: {
      hashedPwd,
      lastLoginAt: new Date(),
    },
  });

  // 5. AuditLog (D-10 convention). L'actor == target car c'est l'user lui-même
  //    qui définit son mot de passe via le lien (pas un admin).
  await logUserAction({
    tenantId: invitation.tenantId,
    actorUserId: invitation.userId,
    targetUserId: invitation.userId,
    action: 'users.password.set',
  });

  // 6. Login auto Lucia : session + cookie.
  const session = await lucia.createSession(invitation.userId, {});
  const sessionCookie = lucia.createSessionCookie(session.id);
  (await cookies()).set(
    sessionCookie.name,
    sessionCookie.value,
    sessionCookie.attributes,
  );

  // 7. Redirect — throws NEXT_REDIRECT, ne revient jamais.
  redirect('/app');
}
