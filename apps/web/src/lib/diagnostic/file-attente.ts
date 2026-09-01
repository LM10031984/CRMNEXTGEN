/**
 * L'état de la file d'envoi du diagnostic — module LÉGER (prisma seul).
 *
 * Il existe pour une raison précise : la liste des leads a besoin de savoir
 * combien de programmes attendent, mais elle n'a aucune raison de charger le
 * worker complet (nodemailer, client LLM, templates). Ce compteur-là est un
 * simple `count`.
 */

import { prisma } from '@qualiof/db';

/** Au-delà, le worker arrête d'insister : la soumission passe en `FAILED`. */
export const MAX_TENTATIVES = 3;

/** Ce qui attend encore — alimente le bouton de rattrapage du CRM. */
export async function compterDiagnosticsEnAttente(tenantId: string): Promise<number> {
  return prisma.diagnosticSubmission.count({
    where: { tenantId, programmeStatus: 'PENDING', attempts: { lt: MAX_TENTATIVES } },
  });
}
