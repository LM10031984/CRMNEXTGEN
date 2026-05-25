'use server';

/**
 * Gestion du formateur principal d'une session — c'est lui qui signe
 * tous les docs Qualiopi (convention, grille, satisfaction…).
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';

/**
 * Définit le formateur principal d'une session. Désactive le précédent
 * primary et active le nouveau dans la même transaction.
 */
export async function setPrimaryTrainer(
  sessionId: string,
  personId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  // Vérifie que la session existe dans le tenant + le formateur y est rattaché
  const trainer = await prisma.sessionTrainer.findFirst({
    where: {
      sessionId,
      personId,
      session: { tenantId: user.tenantId },
    },
  });
  if (!trainer) return { ok: false, error: 'Formateur non rattaché à cette session' };

  await prisma.$transaction([
    prisma.sessionTrainer.updateMany({
      where: { sessionId, NOT: { personId } },
      data: { isPrimary: false },
    }),
    prisma.sessionTrainer.update({
      where: { id: trainer.id },
      data: { isPrimary: true },
    }),
  ]);

  revalidatePath(`/app/sessions/${sessionId}`);
  return { ok: true };
}
