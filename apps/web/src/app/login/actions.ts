'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import argon2 from 'argon2';
import { prisma } from '@qualiof/db';
import { loginSchema, type LoginInput } from '@qualiof/shared';
import { lucia } from '@/lib/auth';

export async function loginAction(input: LoginInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides.' };
  }
  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) return { ok: false, error: 'Identifiants invalides.' };

  const ok = await argon2.verify(user.hashedPwd, password);
  if (!ok) return { ok: false, error: 'Identifiants invalides.' };

  const session = await lucia.createSession(user.id, {});
  const sessionCookie = lucia.createSessionCookie(session.id);
  (await cookies()).set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
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
