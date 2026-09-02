'use server';

/**
 * Génération à la demande de l'analyse des besoins d'ENTREPRISE.
 *
 * Wrapper server action du cœur `@/lib/closure/analyse-besoin-entreprise-core`
 * (RBAC + revalidatePath). Le cœur reste sans auth pour rester appelable depuis
 * un script tsx ou le worker.
 */

import { revalidatePath } from 'next/cache';
import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import { generateAnalyseBesoinEntrepriseCore } from '@/lib/closure/analyse-besoin-entreprise-core';

export async function generateAnalyseBesoinEntreprise(input: {
  sessionId: string;
  sponsorOrgId: string;
}): Promise<{ ok: boolean; assetId?: string; count?: number; error?: string }> {
  // Même trio que `canWrite` : l'action REMPLACE l'analyse existante et
  // supprime les analyses nominatives des salariés couverts — un rôle lecteur
  // ne doit pas pouvoir la déclencher (revue Codex PR #13 sur la convention).
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER', 'COMMERCIAL']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const r = await generateAnalyseBesoinEntrepriseCore(
    user.tenantId,
    input.sessionId,
    input.sponsorOrgId,
  );
  if (r.sessionId) revalidatePath(`/app/sessions/${r.sessionId}`);
  return { ok: r.ok, assetId: r.assetId, count: r.count, error: r.error };
}
