/**
 * Zod schemas centralisés Factures (Phase 11 Plan 11-04).
 *
 * 3 schémas indépendants partagés Plans 11-05 (créer avoir), 11-06 (worker
 * relances), 11-07 (export comptable) :
 *
 *  - `CreateCreditNoteSchema` (D-03/D-04 CONTEXT.md) : input pour
 *    `createCreditNote(originalInvoiceId, amountHtToCredit, motif)`.
 *    Vérifie : uuid + montant strictement positif + motif ≥3 chars.
 *
 *  - `InvoiceReminderSettingsSchema` (D-10/D-02 CONTEXT.md) : input pour
 *    `updateInvoiceReminderSettings({ invoiceReminderDays, creditNotePrefix? })`.
 *    `invoiceReminderDays` : array 1-3 entiers strictement croissants
 *    (ex. [30, 45] ou [30, 45, 60]) — Laurent peut éditer depuis Paramètres.
 *    `creditNotePrefix` : optional, 1-8 chars majuscules+chiffres uniquement
 *    (ex. "AVO", "NC", "AV2026") — séquence dédiée CGI art. 289.
 *
 *  - `ExportInvoicesQuerySchema` (D-15 CONTEXT.md) : input pour export xlsx.
 *    `from`/`to` z.coerce.date pour accepter strings ISO depuis URL query.
 *
 * Pourquoi centraliser ici plutôt que dans `apps/web` :
 *  - Réutilisés côté server (server actions) ET côté client (RHF + zodResolver).
 *  - Plan 11-05 et 11-06 (Wave 2) importent `CreateCreditNoteSchema` /
 *    `InvoiceReminderSettingsSchema` depuis `@qualiof/shared`.
 *  - Plan 11-07 importe `ExportInvoicesQuerySchema` pour valider la query
 *    string sur la route `/api/factures/export`.
 *
 * Pattern clone-strict `tenant.ts` (Phase 7-02).
 */

import { z } from 'zod';

// ─── D-03/D-04 — Création d'avoir (avoir partiel OU total) ───────────────

export const CreateCreditNoteSchema = z.object({
  originalInvoiceId: z.string().uuid(),
  amountHtToCredit: z.number().positive().finite(),
  motif: z
    .string()
    .trim()
    .min(3, 'Motif obligatoire (3 caractères minimum)')
    .max(500, 'Motif trop long (500 caractères maximum)'),
});
export type CreateCreditNoteInput = z.infer<typeof CreateCreditNoteSchema>;

// ─── D-10/D-02 — Paramètres relances + préfixe avoirs ────────────────────

export const InvoiceReminderSettingsSchema = z.object({
  /**
   * Délais de relance en jours après échéance (J+N).
   * - 1 à 3 valeurs (D-12 = 2 niveaux par défaut, marge pour J+60 ajouté ad-hoc)
   * - Strictement croissants (J+45 doit venir APRÈS J+30, pas avant)
   * - Entiers positifs (pas de fraction de jour, pas de valeurs négatives)
   *
   * Défaut BDD (migration Plan 11-00) : [30, 45].
   */
  invoiceReminderDays: z
    .array(z.number().int().positive())
    .min(1, 'Au moins 1 délai requis')
    .max(3, 'Maximum 3 délais')
    .refine(
      (arr) => arr.every((v, i) => i === 0 || v > arr[i - 1]!),
      'Les délais doivent être strictement croissants',
    ),
  /**
   * Préfixe séquence avoirs (NCN). Optional pour permettre de mettre à jour
   * uniquement les délais sans toucher au préfixe.
   * - 1 à 8 chars majuscules + chiffres uniquement (ex. "AVO", "NC", "AV2026")
   * - Convention CGI art. 289 : séquence DÉDIÉE distincte de FAC-
   *
   * Défaut BDD (migration Plan 11-00) : "AVO".
   */
  creditNotePrefix: z
    .string()
    .trim()
    .min(1)
    .max(8)
    .regex(/^[A-Z0-9]+$/, 'Préfixe : majuscules + chiffres uniquement')
    .optional(),
});
export type InvoiceReminderSettingsInput = z.infer<typeof InvoiceReminderSettingsSchema>;

// ─── D-15 — Export comptable xlsx (route /api/factures/export) ───────────

export const ExportInvoicesQuerySchema = z.object({
  /** Date début (incluse). Accepte string ISO ou Date — coerce automatique. */
  from: z.coerce.date(),
  /** Date fin (incluse). */
  to: z.coerce.date(),
  /**
   * Filtre statuts optional. Si omis, l'export inclut tous statuts (DRAFT
   * compris — l'expert-comptable choisit en aval).
   */
  statuses: z.array(z.string()).optional(),
});
export type ExportInvoicesQueryInput = z.infer<typeof ExportInvoicesQuerySchema>;
