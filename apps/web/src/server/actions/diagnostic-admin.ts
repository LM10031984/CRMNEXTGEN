'use server';

/**
 * Rattrapage manuel des programmes du diagnostic, depuis le CRM.
 *
 * Le mécanisme normal, c'est le navigateur du prospect (il déclenche son propre
 * email depuis l'écran de remerciement). Ce bouton existe pour le cas où Laurent
 * voit, le lendemain matin, des soumissions encore en attente : téléphone passé
 * en mode avion en sortant de la soirée, onglet fermé dans la seconde, 4G
 * coupée. Il fait exactement le même travail que le cron, à la demande.
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import { processDiagnosticSends } from '@/lib/diagnostic/worker';

export type RattrapageResult =
  | { ok: true; examinees: number; envoyees: number; suppressed: number; echouees: number }
  | { ok: false; error: string };

/**
 * Traite le lot en attente (20 max par appel, comme le cron).
 *
 * Un lot complet peut dépasser la durée de la fonction si chaque génération
 * prend ~30 s : ce n'est PAS un problème. Chaque soumission est validée
 * indépendamment en base — une interruption laisse simplement le reste en
 * `PENDING`, et un second clic reprend là où ça s'est arrêté.
 */
export async function envoyerProgrammesEnAttente(): Promise<RattrapageResult> {
  try {
    await requireRole(['ADMIN', 'MANAGER']);
    // Le worker n'est pas scopé par tenant (c'est un traitement de fond global,
    // comme le cron). Start Academy est mono-tenant : le lot traité est le sien.
    const r = await processDiagnosticSends({ triggered_by: 'crm-manuel' });
    revalidatePath('/app/leads');
    return { ok: true, ...r };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }
}

/**
 * Remet une soumission abandonnée (`FAILED`) en file.
 *
 * Le compteur de tentatives repart à zéro, sinon le worker la re-jetterait
 * immédiatement (plafond atteint). Réservé aux échecs : on ne « renvoie » pas
 * un programme déjà parti — le prospect le recevrait deux fois.
 */
export async function relancerSoumissionDiagnostic(
  submissionId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireRole(['ADMIN', 'MANAGER']);
    const remise = await prisma.diagnosticSubmission.updateMany({
      where: { id: submissionId, tenantId: user.tenantId, programmeStatus: 'FAILED' },
      data: { programmeStatus: 'PENDING', attempts: 0, lastError: null },
    });
    if (remise.count !== 1) {
      return { ok: false, error: 'Soumission introuvable ou déjà envoyée' };
    }
    revalidatePath('/app/leads');
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }
}
