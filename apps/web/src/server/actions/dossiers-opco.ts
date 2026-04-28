'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';

type ToggleField = 'invoiceSent' | 'opcoApproved' | 'opcoReimbursed' | 'paymentReceived';

export async function toggleDossierBoolean(
  participantId: string,
  field: ToggleField,
  next: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const participant = await prisma.sessionParticipant.findFirst({
    where: { id: participantId, session: { tenantId: user.tenantId } },
    select: { id: true, sessionId: true },
  });
  if (!participant) return { ok: false, error: 'Inscription introuvable' };

  await prisma.sessionParticipant.update({
    where: { id: participantId },
    data: { [field]: next },
  });

  revalidatePath('/app/dossiers-opco');
  revalidatePath(`/app/sessions/${participant.sessionId}`);
  return { ok: true };
}
