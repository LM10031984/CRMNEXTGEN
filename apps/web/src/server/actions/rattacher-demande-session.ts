'use server';

/**
 * Rattacher une demande d'inscription à une session — le chaînon manquant.
 *
 * `PreEnrollment.intendedSessionId` existe depuis toujours et porte une
 * conséquence lourde : sans lui, `enrollFromRequest` refuse net (« Cette
 * demande n'est rattachée à aucune session ») et le dossier ne peut JAMAIS
 * être inscrit en un clic. Or aucun écran ne l'écrivait hors du formulaire
 * public par session. Relevé sur la base de production le 15/09/2026 :
 * 11 dossiers sur 14 sans session — ceux nés d'un lien « Nouveau formulaire »
 * ou d'une campagne RDV, qui n'en posent jamais — et aucun moyen de corriger
 * un dossier déposé sur le lien de la mauvaise session.
 *
 * CE QUE CETTE ACTION NE FAIT PAS : déplacer l'inscription. Le
 * `SessionParticipant` déjà créé reste où il est ; seul le dossier bouge. On
 * le DIT plutôt que de le deviner à la place de l'admin — supprimer une
 * inscription sous-entendrait de savoir quoi faire de sa convention et de sa
 * facture, ce qui n'est pas une décision à prendre dans une liste déroulante.
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';

export async function rattacherDemandeASession(input: {
  preEnrollmentId: string;
  /** `null` = détacher la demande de toute session. */
  sessionId: string | null;
}): Promise<
  { ok: true; sessionCode: string | null; avertissement?: string } | { ok: false; error: string }
> {
  // Déplacer un dossier change qui sera facturé pour cette formation : même
  // niveau d'exigence que l'édition des champs structurants d'une session.
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const pe = await prisma.preEnrollment.findFirst({
    where: { id: input.preEnrollmentId, tenantId: user.tenantId },
    select: {
      id: true,
      status: true,
      firstName: true,
      lastName: true,
      intendedSessionId: true,
      convertedToPersonId: true,
    },
  });
  if (!pe) return { ok: false, error: 'Demande introuvable.' };

  // Rattachement inchangé : ni écriture ni ligne d'audit. Un journal qui
  // consigne des non-événements devient un journal qu'on ne lit plus.
  if (pe.intendedSessionId === input.sessionId) {
    return { ok: true, sessionCode: null };
  }

  let cible: { id: string; code: string } | null = null;
  if (input.sessionId) {
    cible = await prisma.trainingSession.findFirst({
      where: { id: input.sessionId, tenantId: user.tenantId },
      select: { id: true, code: true },
    });
    if (!cible) return { ok: false, error: 'Session introuvable.' };
  }

  // L'inscription reste dans la session quittée : on ne la déplace pas, mais
  // on ne laisse pas l'admin le découvrir tout seul.
  let avertissement: string | undefined;
  if (pe.convertedToPersonId && pe.intendedSessionId) {
    const participantRestant = await prisma.sessionParticipant.findUnique({
      where: {
        sessionId_personId: {
          sessionId: pe.intendedSessionId,
          personId: pe.convertedToPersonId,
        },
      },
      select: { id: true },
    });
    if (participantRestant) {
      const nom = [pe.firstName, pe.lastName].filter(Boolean).join(' ') || 'Cette personne';
      avertissement =
        `${nom} reste inscrit(e) à la session précédente : le dossier a été déplacé, ` +
        `pas l'inscription. Retire-la à la main si elle n'a plus lieu d'être.`;
    }
  }

  await prisma.preEnrollment.update({
    where: { id: pe.id },
    data: { intendedSessionId: cible?.id ?? null },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: user.tenantId,
      userId: user.id,
      entity: 'PreEnrollment',
      entityId: pe.id,
      action: 'preinscriptions.rattacher',
      diff: {
        before: { intendedSessionId: pe.intendedSessionId },
        after: { intendedSessionId: cible?.id ?? null, sessionCode: cible?.code ?? null },
      },
    },
  });

  revalidatePath('/app/inscriptions');
  revalidatePath(`/app/inscriptions/${pe.id}`);
  if (cible) revalidatePath(`/app/sessions/${cible.id}`);
  if (pe.intendedSessionId) revalidatePath(`/app/sessions/${pe.intendedSessionId}`);

  return { ok: true, sessionCode: cible?.code ?? null, avertissement };
}
