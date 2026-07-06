/**
 * Lucia v3 auth — pattern recommandé : adapter Prisma + Argon2 pour les mots de passe.
 *
 * Usage côté Server Components :
 *   const { user, session } = await validateRequest();
 *   if (!user) redirect('/login');
 */

import { Lucia } from 'lucia';
import { PrismaAdapter } from '@lucia-auth/adapter-prisma';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { prisma } from '@qualiof/db';
import type { Session, User } from 'lucia';

const adapter = new PrismaAdapter(prisma.authSession, prisma.user);

export const lucia = new Lucia(adapter, {
  sessionCookie: {
    expires: false,
    attributes: {
      secure: process.env.NODE_ENV === 'production',
      // Phase 21 APP-02 : lax explicite (défaut Lucia rendu grep-vérifiable).
      // Vercel force NODE_ENV=production → secure activé automatiquement.
      sameSite: 'lax',
    },
  },
  getUserAttributes: (data) => ({
    email: data.email,
    firstName: data.firstName,
    lastName: data.lastName,
    role: data.role,
    tenantId: data.tenantId,
    // Phase 8 — soft-delete : exposé pour permettre à validateRequest() ci-dessous
    // d'invalider la session des users désactivés sans 2e query (cf RESEARCH Pitfall #1).
    disabledAt: data.disabledAt,
  }),
});

declare module 'lucia' {
  interface Register {
    Lucia: typeof lucia;
    DatabaseUserAttributes: {
      email: string;
      firstName: string;
      lastName: string;
      role: string;
      tenantId: string;
      // Phase 8 — soft-delete marker (null = actif). Lucia adapter Prisma sait le lire
      // automatiquement depuis le model `User`.
      disabledAt: Date | null;
    };
  }
}

export const validateRequest = cache(
  async (): Promise<{ user: User; session: Session } | { user: null; session: null }> => {
    const sessionId = (await cookies()).get(lucia.sessionCookieName)?.value ?? null;
    if (!sessionId) return { user: null, session: null };

    const result = await lucia.validateSession(sessionId);

    // Phase 8 — Rejet user désactivé (D-05 + RESEARCH Pitfall #1).
    // ORDRE STRICT : validateSession → check disabledAt → cookie maintenance.
    // Si on inversait, on aurait un bug (pas d'user à lire pour check).
    if (result.user && result.session && result.user.disabledAt) {
      await lucia.invalidateSession(result.session.id);
      try {
        const blank = lucia.createBlankSessionCookie();
        (await cookies()).set(blank.name, blank.value, blank.attributes);
      } catch {
        // cookies() throws hors Route Handler/Action — ignoré (idem fallthrough cookie ci-dessous).
      }
      return { user: null, session: null };
    }

    try {
      if (result.session && result.session.fresh) {
        const sessionCookie = lucia.createSessionCookie(result.session.id);
        (await cookies()).set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
      }
      if (!result.session) {
        const sessionCookie = lucia.createBlankSessionCookie();
        (await cookies()).set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
      }
    } catch {
      // cookies() throws when called from a Server Component during SSR — c'est OK,
      // on ne peut pas modifier le cookie hors d'une Route Handler / Action.
    }
    return result;
  },
);
