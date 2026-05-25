'use server';

/**
 * Wrapper server action de la génération satisfaction session (i30).
 * Délègue le travail à `generateSatisfactionSessionCore` réutilisable
 * depuis le worker BullMQ.
 */

import { revalidatePath } from 'next/cache';
import { validateRequest } from '@/lib/auth';
import {
  generateSatisfactionSessionCore,
  type SatisfactionSessionResult,
} from '@/lib/closure/satisfaction-session-generator';

export async function generateSatisfactionSessionForSession(
  sessionId: string,
): Promise<SatisfactionSessionResult> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const result = await generateSatisfactionSessionCore(sessionId, user.tenantId);
  if (result.ok) revalidatePath(`/app/sessions/${sessionId}`);
  return result;
}
