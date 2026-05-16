/**
 * Zod schemas Lead (Phase 9 Plan 09-01 Task 2).
 *
 * 3 schémas, source unique pour :
 *  - `CreateLeadSchema` : input `createLead` server action (Plan 09-02)
 *      + refine personId OU firstName+lastName requis (cf. RESEARCH.md Pattern Zod)
 *  - `DistributionConfigSchema` : input `updateDistributionConfig` (Plan 09-04)
 *      + 3 booleans stricts, pas de coercion (admin doit envoyer des booleans)
 *  - `LeadAssignedPayloadSchema` : typage runtime de `Notification.payload`
 *      pour le type 'lead.assigned' (Pitfall 6 RESEARCH.md — éviter le drift
 *      writer/reader sur le champ Json schema-less).
 *
 * Pas de typing import depuis `@qualiof/db` (LeadStatus/LeadPriority dupliqués
 * comme tuple `as const`) pour garder le package shared 100% indépendant de
 * la couche Prisma — convention Phase 7/8.
 */

import { z } from 'zod';

const LEAD_STATUS = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'PROPOSAL_SENT',
  'NEGOTIATION',
  'WON',
  'LOST',
  'ON_HOLD',
  'TO_FOLLOWUP',
] as const;
const LEAD_PRIORITY = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

/** LEAD-01 — Input création Lead (createLead server action Plan 09-02). */
export const CreateLeadSchema = z
  .object({
    source: z.string().trim().max(80).optional().nullable(),
    status: z.enum(LEAD_STATUS).default('NEW'),
    priority: z.enum(LEAD_PRIORITY).default('MEDIUM'),
    personId: z.string().uuid().optional().nullable(),
    firstName: z.string().trim().max(80).optional().nullable(),
    lastName: z.string().trim().max(80).optional().nullable(),
    // email : email valide OU chaîne vide (transformée en null pour la BDD).
    // `or(z.literal('').transform(...))` couvre le cas "champ optionnel vidé"
    // côté UI sans forcer l'utilisateur à mettre `null` explicitement.
    email: z
      .string()
      .email()
      .optional()
      .nullable()
      .or(z.literal('').transform(() => null)),
    phone: z.string().trim().max(40).optional().nullable(),
    interestedProductId: z.string().uuid().optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
  })
  .refine(
    (d) => Boolean(d.personId) || Boolean(d.firstName && d.lastName),
    { message: 'Personne existante OU nom+prénom requis', path: ['lastName'] },
  );

export type CreateLeadInput = z.infer<typeof CreateLeadSchema>;

/** LEAD-01 D-06 — Config distribution (3 toggles tenant, Plan 09-04). */
export const DistributionConfigSchema = z.object({
  autoAssignLeads: z.boolean(),
  notifyOnLeadAssignEmail: z.boolean(),
  notifyOnLeadAssignBell: z.boolean(),
});
export type DistributionConfigInput = z.infer<typeof DistributionConfigSchema>;

/**
 * LEAD-01 D-03 — Payload typé de `Notification.payload` pour type='lead.assigned'.
 *
 * Utilisé côté writer (`notifyLeadAssigned` Plan 09-02) ET côté reader
 * (`getNotifications` extension Plan 09-04) → source unique de vérité,
 * évite le drift décrit Pitfall 6 RESEARCH.md.
 */
export const LeadAssignedPayloadSchema = z.object({
  leadId: z.string().uuid(),
  prospectName: z.string().min(1),
  source: z.string().nullable().optional(),
});
export type LeadAssignedPayload = z.infer<typeof LeadAssignedPayloadSchema>;
