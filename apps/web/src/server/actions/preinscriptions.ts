'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';

const DEFAULT_VALIDITY_DAYS = 30;

export async function createPreEnrollmentLink(input: {
  email?: string;
  firstName?: string;
  lastName?: string;
  intendedSessionId?: string;
  validityDays?: number;
}): Promise<{ ok: boolean; url?: string; token?: string; preEnrollmentId?: string; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const token = randomUUID().replace(/-/g, '');
  const validity = input.validityDays ?? DEFAULT_VALIDITY_DAYS;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + validity);

  const created = await prisma.preEnrollment.create({
    data: {
      tenantId: user.tenantId,
      token,
      expiresAt,
      sentByUserId: user.id,
      sentTo: input.email?.trim() || null,
      sentAt: input.email?.trim() ? new Date() : null,
      firstName: input.firstName?.trim() || null,
      lastName: input.lastName?.trim() || null,
      email: input.email?.trim() || null,
      intendedSessionId: input.intendedSessionId || null,
      status: 'PENDING_FORM',
    },
  });

  // URL absolue calculée côté serveur (en prod : APP_URL env)
  const baseUrl = process.env.APP_URL ?? 'http://localhost:3000';
  const url = `${baseUrl}/preinscription/${token}`;

  revalidatePath('/app/preinscriptions');
  return { ok: true, url, token, preEnrollmentId: created.id };
}

export async function deletePreEnrollment(id: string): Promise<{ ok: boolean; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };
  const pe = await prisma.preEnrollment.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!pe) return { ok: false, error: 'Pré-inscription introuvable' };
  // On ne peut pas supprimer si déjà convertie en apprenant
  if (pe.status === 'CONVERTED') {
    return { ok: false, error: 'Pré-inscription déjà convertie en apprenant — impossible à supprimer' };
  }
  await prisma.preEnrollment.delete({ where: { id } });
  revalidatePath('/app/preinscriptions');
  return { ok: true };
}
