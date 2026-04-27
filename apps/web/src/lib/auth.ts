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
    },
  },
  getUserAttributes: (data) => ({
    email: data.email,
    firstName: data.firstName,
    lastName: data.lastName,
    role: data.role,
    tenantId: data.tenantId,
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
    };
  }
}

export const validateRequest = cache(
  async (): Promise<{ user: User; session: Session } | { user: null; session: null }> => {
    const sessionId = (await cookies()).get(lucia.sessionCookieName)?.value ?? null;
    if (!sessionId) return { user: null, session: null };

    const result = await lucia.validateSession(sessionId);
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
