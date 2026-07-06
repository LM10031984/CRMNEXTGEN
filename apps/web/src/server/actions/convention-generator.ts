'use server';

/**
 * Génère une convention de formation professionnelle pour une inscription.
 *
 * Logique métier :
 * - Si le sponsorOrg de l'inscription est l'auto-entreprise de l'apprenant
 *   (LegalLink role EI_SELF), le bénéficiaire = AE, représentant = apprenant
 * - Sinon (sponsor = structure employeur, apprenant salarié), bénéficiaire =
 *   structure, représentant = champ Organization.representative
 *
 * NB : pour grouper plusieurs salariés de la même structure sur une seule
 * convention, on utilisera plus tard generateConventionForSession(sessionId,
 * sponsorOrgId) qui agrège.
 */

import { revalidatePath } from 'next/cache';
import { validateRequest } from '@/lib/auth';
import { generateConventionCore } from '@/lib/closure/convention-core';

// Le cœur SANS auth `generateConventionCore` vit désormais dans
// `@/lib/closure/convention-core` (quick 260618-gux) : ce fichier reste un
// wrapper server action (validateRequest → core → revalidatePath). Le cœur
// N'IMPORTE PAS `@/lib/auth`, ce qui permet aux scripts tsx pipeline de
// l'importer sans tirer `validateRequest` → `react cache`.

export async function generateConventionForParticipant(
  participantId: string,
  options?: { force?: boolean },
): Promise<{ ok: boolean; documentId?: string; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const r = await generateConventionCore(user.tenantId, participantId, options);
  if (r.sessionId) revalidatePath(`/app/sessions/${r.sessionId}`);
  if (r.personId) revalidatePath(`/app/apprenants/${r.personId}`);
  return { ok: r.ok, documentId: r.documentId, error: r.error };
}
