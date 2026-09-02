'use server';

/**
 * Pilotage du lien public d'inscription depuis la fiche session.
 * Actions AUTHENTIFIÉES, scopées par tenant (CLAUDE.md).
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { generatePublicToken, buildPublicEnrollmentUrl } from '@/lib/enrollment/public-link';

type Echec = { ok: false; error: string };

async function chargerSession(
  sessionId: string,
): Promise<Echec | { ok: true; session: { id: string; publicToken: string | null } }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };
  const session = await prisma.trainingSession.findFirst({
    where: { id: sessionId, tenantId: user.tenantId },
    select: { id: true, publicToken: true },
  });
  if (!session) return { ok: false, error: 'Session introuvable' };
  return { ok: true, session };
}

export async function openSessionEnrollments(
  sessionId: string,
): Promise<{ ok: true; url: string } | Echec> {
  const r = await chargerSession(sessionId);
  if (!r.ok) return r;

  // Réouvrir NE change PAS le jeton : les liens déjà diffusés restent valides.
  const token = r.session.publicToken ?? generatePublicToken();
  await prisma.trainingSession.update({
    where: { id: sessionId },
    data: {
      ...(r.session.publicToken ? {} : { publicToken: token }),
      publicFormOpenedAt: new Date(),
      publicFormClosedAt: null,
    },
  });

  revalidatePath(`/app/sessions/${sessionId}`);
  return { ok: true, url: buildPublicEnrollmentUrl(token) };
}

export async function closeSessionEnrollments(sessionId: string): Promise<{ ok: true } | Echec> {
  const r = await chargerSession(sessionId);
  if (!r.ok) return r;

  // Le jeton est conservé : rouvrir plus tard ne demandera pas de rediffuser
  // un nouveau lien.
  await prisma.trainingSession.update({
    where: { id: sessionId },
    data: { publicFormClosedAt: new Date() },
  });

  revalidatePath(`/app/sessions/${sessionId}`);
  return { ok: true };
}

export async function revokeSessionEnrollmentLink(
  sessionId: string,
): Promise<{ ok: true; url: string } | Echec> {
  const r = await chargerSession(sessionId);
  if (!r.ok) return r;

  // Nouveau jeton = l'ancien lien meurt immédiatement (404).
  const token = generatePublicToken();
  await prisma.trainingSession.update({
    where: { id: sessionId },
    data: { publicToken: token, publicFormOpenedAt: new Date(), publicFormClosedAt: null },
  });

  revalidatePath(`/app/sessions/${sessionId}`);
  return { ok: true, url: buildPublicEnrollmentUrl(token) };
}
