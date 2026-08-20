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
 * Le groupage de plusieurs salariés d'une même structure sur une SEULE
 * convention est livré par `generateConventionEntreprise` ci-dessous
 * (quick 260817-mm0).
 */

import { revalidatePath } from 'next/cache';
import { validateRequest } from '@/lib/auth';
import {
  generateConventionCore,
  generateConventionEntrepriseCore,
} from '@/lib/closure/convention-core';

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

/**
 * Génère LA convention unique au nom d'une entreprise commanditaire, couvrant
 * tous ses salariés inscrits à la session (quick 260817-mm0).
 *
 * Règle métier figée le 12/08 : payeur personne morale ⇒ 1 convention signée
 * par le chef d'entreprise pour tout le groupe, jamais une par stagiaire.
 * L'appel supprime donc les conventions individuelles des participants
 * couverts (cf. `generateConventionEntrepriseCore`).
 */
export async function generateConventionEntreprise(input: {
  sessionId: string;
  sponsorOrgId: string;
}): Promise<{ ok: boolean; documentId?: string; count?: number; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const r = await generateConventionEntrepriseCore(
    user.tenantId,
    input.sessionId,
    input.sponsorOrgId,
  );
  if (r.sessionId) revalidatePath(`/app/sessions/${r.sessionId}`);
  return { ok: r.ok, documentId: r.documentId, count: r.count, error: r.error };
}
