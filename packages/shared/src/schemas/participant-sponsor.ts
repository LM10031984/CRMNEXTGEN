/**
 * Zod — « Financeur de l'inscription » (décision Laurent 11/09/2026).
 *
 * Le commanditaire d'une inscription (`SessionParticipant.sponsorOrgId`) n'était
 * posé qu'à la création. Une inscription rattachée à la mauvaise organisation
 * n'était corrigible qu'en la supprimant puis en la recréant — donc en perdant
 * sa ligne et son historique. Ces schémas valident l'input de l'action dédiée
 * `changerFinanceurInscription`.
 *
 * ⚠ NE PAS CONFONDRE avec `financingMode` (`UpdateParticipant`) : le MODE dit
 * COMMENT c'est financé (OPCO / CPF / entreprise / autofinancement), le
 * FINANCEUR dit PAR QUI l'inscription est portée. Deux champs, deux natures :
 * c'est `sponsorOrg.opcoCode` — donc ce schéma — que le régime de signature lit.
 *
 * Pas d'import depuis `@qualiof/db` : `packages/shared` ne doit pas dépendre du
 * client Prisma (cycle de deps).
 */
import { z } from 'zod';

export const ChangerFinanceurInscriptionInputSchema = z.object({
  participantId: z.string().uuid('participantId doit être un UUID valide'),
  sponsorOrgId: z.string().uuid('sponsorOrgId doit être un UUID valide'),
});

export type ChangerFinanceurInscriptionInput = z.infer<
  typeof ChangerFinanceurInscriptionInputSchema
>;

/**
 * Plafond de la liste proposée dans le sélecteur. Volontairement bas : le champ
 * est une recherche, pas un annuaire déroulant. Au-delà, l'admin tape.
 */
export const LIMITE_FINANCEURS_PROPOSES = 50;

export const ListerFinanceursInputSchema = z.object({
  /** Recherche libre sur la raison sociale, l'enseigne ou le SIRET. */
  q: z.string().trim().max(120, 'Recherche trop longue (120 caractères max)').optional(),
  /**
   * L'inscription dont on édite le financeur. Fourni, il fait remonter le
   * financeur ACTUEL avec la liste — même s'il sort du plafond ou de la
   * recherche. Sans lui, le sélecteur s'ouvrirait sur « aucun choix » alors que
   * l'inscription en a un : l'écran mentirait sur l'état de la donnée.
   */
  participantId: z.string().uuid('participantId doit être un UUID valide').optional(),
});

export type ListerFinanceursInput = z.infer<typeof ListerFinanceursInputSchema>;
