'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import argon2 from 'argon2';
import { prisma } from '@qualiof/db';
import { loginSchema, type LoginInput } from '@qualiof/shared';
import { lucia } from '@/lib/auth';
import { checkRateLimit, RateLimitProfile } from '@/lib/rate-limit';

/**
 * Login server action — Phase 8 Plan 08-05 (RBAC-05 + D-10 CONTEXT.md).
 *
 * Extensions vs. Phase 1 :
 *  - `auth.login.failed` AuditLog row sur user désactivé / mot de passe incorrect
 *    (diff.reason = 'disabled' | 'bad_password')
 *  - `auth.login.success` AuditLog row + `User.lastLoginAt = now()` à chaque
 *    connexion réussie (sert l'UI "Dernière connexion" de Plan 08-04 +
 *    permet la détection brute-force dans la page Historique).
 *  - User désactivé : retourne `'Compte désactivé.'` au lieu du message
 *    générique pour distinguer (info utile pour l'utilisateur final).
 *  - Email inconnu : PAS de AuditLog (pas de tenantId résoluble — la contrainte
 *    FK `AuditLog.tenantId → Tenant.id` empêche un log "orphelin"). Conséquence
 *    acceptée : on perd la trace des tentatives sur des emails inexistants
 *    (RESEARCH Finding #5 — détection brute-force se fait sur les `bad_password`).
 *
 * Toutes les écritures AuditLog sont best-effort : encapsulées dans `safeAudit`
 * (try/catch silencieux) pour qu'une erreur d'audit ne bloque JAMAIS le flow
 * de login (sécurité > observabilité dans ce cas précis).
 */

/**
 * Best-effort AuditLog write — ne propage AUCUNE erreur.
 *
 * Utilise `prisma.auditLog.create` directement (et non `logUserAction` du helper)
 * pour pouvoir wrapper dans try/catch ici sans polluer le helper générique.
 */
async function safeAudit(data: {
  tenantId: string;
  userId: string | null;
  targetUserId: string;
  action: string;
  diff?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: data.tenantId,
        userId: data.userId,
        entity: 'User',
        entityId: data.targetUserId,
        action: data.action,
        diff: (data.diff ?? {}) as never,
      },
    });
  } catch {
    // Best-effort : un échec d'audit ne doit pas bloquer le login.
    // (e.g. Prisma timeout, FK contrainte, etc.)
  }
}

export async function loginAction(
  input: LoginInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides.' };
  }
  const { email, password } = parsed.data;
  const lcEmail = email.toLowerCase();

  // Sprint 1 — Rate-limit anti-brute force : 5 tentatives par fenêtre de 15 min
  // sur la combinaison (IP, email). Combine les deux pour limiter à la fois :
  //   - un attaquant qui essaye plein de mots de passe sur un compte (key = email)
  //   - un attaquant distribué qui essaye un mot de passe sur plein de comptes
  //     depuis la même IP (key = IP)
  // En fail-open : si Redis tombe, on autorise (logué côté rate-limit).
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? 'unknown';
  const rl = await checkRateLimit({
    key: `login:${ip}:${lcEmail}`,
    ...RateLimitProfile.LOGIN,
  });
  if (!rl.ok) {
    const mins = Math.ceil(rl.resetIn / 60);
    return {
      ok: false,
      error: `Trop de tentatives. Réessayez dans ${mins} min.`,
    };
  }

  const user = await prisma.user.findUnique({ where: { email: lcEmail } });
  if (!user) {
    // Pas de tenantId résoluble → pas d'AuditLog persistable (FK requise).
    // Réponse identique à "mauvais mdp" pour ne pas leaker l'existence d'un email.
    return { ok: false, error: 'Identifiants invalides.' };
  }

  // Garde "compte désactivé" — message distinct (UX) + audit failed (sécurité).
  if (user.disabledAt) {
    await safeAudit({
      tenantId: user.tenantId,
      userId: user.id,
      targetUserId: user.id,
      action: 'auth.login.failed',
      diff: { email: lcEmail, reason: 'disabled' },
    });
    return {
      ok: false,
      error: 'Compte désactivé. Contactez votre administrateur.',
    };
  }

  const ok = await argon2.verify(user.hashedPwd, password);
  if (!ok) {
    await safeAudit({
      tenantId: user.tenantId,
      userId: user.id,
      targetUserId: user.id,
      action: 'auth.login.failed',
      diff: { email: lcEmail, reason: 'bad_password' },
    });
    return { ok: false, error: 'Identifiants invalides.' };
  }

  // Succès — on met à jour lastLoginAt (best-effort aussi : un échec d'update
  // ne doit pas empêcher la création de session) + on logge auth.login.success.
  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
  } catch {
    // Best-effort : pas critique pour la session
  }
  await safeAudit({
    tenantId: user.tenantId,
    userId: user.id,
    targetUserId: user.id,
    action: 'auth.login.success',
  });

  const session = await lucia.createSession(user.id, {});
  const sessionCookie = lucia.createSessionCookie(session.id);
  (await cookies()).set(
    sessionCookie.name,
    sessionCookie.value,
    sessionCookie.attributes,
  );
  redirect('/app');
}

export async function logoutAction(): Promise<void> {
  const sessionId = (await cookies()).get(lucia.sessionCookieName)?.value;
  if (sessionId) {
    await lucia.invalidateSession(sessionId);
  }
  const blank = lucia.createBlankSessionCookie();
  (await cookies()).set(blank.name, blank.value, blank.attributes);
  redirect('/login');
}
