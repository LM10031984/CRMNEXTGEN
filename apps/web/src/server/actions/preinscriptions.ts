'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { enqueueMail } from '@/lib/mailer-queue/enqueue';
import { loadOfConfig } from '@/lib/of-config';
import { renderPreinscriptionLinkEmail } from '@/lib/mailer-templates/preinscription-link';

const DEFAULT_VALIDITY_DAYS = 30;

export async function createPreEnrollmentLink(input: {
  email?: string;
  firstName?: string;
  lastName?: string;
  intendedSessionId?: string;
  validityDays?: number;
}): Promise<{ ok: boolean; url?: string; token?: string; preEnrollmentId?: string; emailSent?: boolean; emailDryRun?: boolean; error?: string }> {
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

  // URL absolue calculée côté serveur. Préfère NEXT_PUBLIC_APP_URL (déjà
  // dans .env.example) puis APP_URL en fallback. Le port doit correspondre
  // à celui où tourne réellement Next (3000-3003 selon disponibilité) —
  // pour le dev local, on essaie de détecter le port via Host header
  // côté server action n'est pas possible, donc l'utilisateur DOIT
  // synchroniser NEXT_PUBLIC_APP_URL avec le port effectif.
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? 'http://localhost:3000';
  const url = `${baseUrl}/preinscription/${token}`;

  // Envoi email auto si un email a été fourni. Best-effort : si SMTP échoue,
  // on retourne quand même ok:true avec emailSent:false pour que Laurent
  // copie/colle le lien manuellement en fallback.
  let emailSent = false;
  let emailDryRun = false;
  if (input.email?.trim()) {
    try {
      const of = await loadOfConfig(user.tenantId);
      const { subject, html, text } = renderPreinscriptionLinkEmail(
        {
          firstName: input.firstName?.trim() ?? null,
          lastName: input.lastName?.trim() ?? null,
          formUrl: url,
          expiresAt,
        },
        of,
      );
      // Sprint 3 — Queue mailer pour ne pas bloquer l'action sur l'envoi SMTP.
      // Idempotency key par token : empêche un double-clic de générer 2 mails.
      const r = await enqueueMail({
        to: input.email.trim(),
        subject,
        html,
        text,
        idempotencyKey: `preinscription-link:${token}`,
      });
      emailSent = r.ok && r.mode !== 'dry-run';
      emailDryRun = r.mode === 'dry-run';
    } catch (e) {
      console.error('[createPreEnrollmentLink] enqueueMail failed (non-blocking)', e);
    }
  }

  revalidatePath('/app/preinscriptions');
  return { ok: true, url, token, preEnrollmentId: created.id, emailSent, emailDryRun };
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
