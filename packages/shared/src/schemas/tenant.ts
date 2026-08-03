/**
 * Zod schemas Paramètres OF (Phase 7 Plan 07-02).
 *
 * 4 schémas indépendants, alignés sur les sections UI de `/app/parametres` :
 *  - `tenantIdentitySchema` (SET-01) : name, siret, numDA, rcs, legalForm
 *  - `tenantAddressSchema`  (SET-02) : address Json, legalMentions (max 2000)
 *  - `tenantBillingSchema`  (SET-03) : invoicePrefix, iban, bic
 *  - `tenantEmailSchema`    (SET-03) : emailFrom
 *
 * Réutilisés côté client (react-hook-form + zodResolver) ET côté server
 * (server actions de tenant-settings.ts).
 *
 * Décisions clés :
 *  - SIRET validé via `isValidSiret` (Luhn + cas La Poste — cf. helpers/siret.ts)
 *  - IBAN normalisé (espaces retirés, MAJ) avant validation regex FR
 *  - BIC normalisé (MAJ, espaces retirés) avant validation 8 ou 11 chars
 *  - invoicePrefix : 2-5 lettres MAJUSCULES (FAC, INV, …) avec default 'FAC'
 *  - emailFrom : email valide OU chaîne vide (admin peut "vider" le champ)
 *  - legalForm : string libre (per CONTEXT.md D-02 — pas encore l'enum LegalForm)
 */

import { z } from 'zod';
import { addressSchema } from './address';
import { isValidSiret } from '../helpers/siret';

const IBAN_FR_REGEX = /^FR\d{2}[A-Z0-9]{23}$/;
const BIC_REGEX = /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/;

function normalizeIban(s: string): string {
  return s.replace(/\s/g, '').toUpperCase();
}

function normalizeBic(s: string): string {
  return s.replace(/\s/g, '').toUpperCase();
}

/** SET-01 — Identité OF (raison sociale, SIRET, numDA, RCS, forme juridique). */
export const tenantIdentitySchema = z.object({
  name: z.string().min(1, 'Nom requis'),
  siret: z
    .string()
    .nullable()
    .optional()
    .refine((s) => !s || isValidSiret(s), {
      message: 'SIRET invalide (14 chiffres + clé Luhn)',
    }),
  numDA: z.string().nullable().optional(),
  rcs: z.string().nullable().optional(),
  // String libre per CONTEXT.md D-02 ("SAS", "EURL", "SARL", …).
  // Peut migrer vers `z.nativeEnum(LegalForm)` lors d'une phase ultérieure.
  legalForm: z.string().nullable().optional(),
});

/** SET-02 — Adresse + mentions légales (logo & signatures = Plan 07-03). */
export const tenantAddressSchema = z.object({
  address: addressSchema.nullable().optional(),
  legalMentions: z
    .string()
    .max(2000, 'Maximum 2000 caractères')
    .nullable()
    .optional(),
});

/**
 * SET-03 — Préférences facturation (préfixe numéro + RIB).
 *
 * `iban` et `bic` acceptent :
 *  - `null` → champ vidé (pas de RIB renseigné)
 *  - une chaîne avec/sans espaces → normalisée puis validée par regex FR
 */
export const tenantBillingSchema = z.object({
  invoicePrefix: z
    .string()
    .regex(/^[A-Z]{2,5}$/, '2 à 5 lettres majuscules (ex: FAC)')
    .default('FAC'),
  iban: z.preprocess(
    (s) => (typeof s === 'string' && s.trim().length > 0 ? normalizeIban(s) : null),
    z
      .string()
      .nullable()
      .refine((s) => s === null || IBAN_FR_REGEX.test(s), {
        message: 'IBAN FR invalide (FR + 2 chiffres + 23 caractères)',
      }),
  ),
  bic: z.preprocess(
    (s) => (typeof s === 'string' && s.trim().length > 0 ? normalizeBic(s) : null),
    z
      .string()
      .nullable()
      .refine((s) => s === null || BIC_REGEX.test(s), {
        message: 'BIC invalide (8 ou 11 caractères)',
      }),
  ),
});

/**
 * SET-03 — Email expéditeur SMTP (D-08).
 *
 * Accepte une chaîne vide (admin peut volontairement vider le champ pour
 * revenir au fallback ENV `OF_EMAIL`).
 */
export const tenantEmailSchema = z.object({
  emailFrom: z
    .string()
    .nullable()
    .optional()
    .transform((s) => s ?? '')
    .pipe(z.string().email('Email invalide').or(z.literal(''))),
});

/**
 * BUG-15 — documents légaux statiques tenant (CGV + règlement intérieur).
 * Stockés en markdown éditable côté Paramètres, rendus en PDF via marked.
 * Limites larges (50 000 chars) car ces docs peuvent être longs.
 */
export const tenantLegalDocsSchema = z.object({
  cgvMarkdown: z
    .string()
    .max(50000, 'Maximum 50000 caractères')
    .nullable()
    .optional(),
  reglementInterieurMarkdown: z
    .string()
    .max(50000, 'Maximum 50000 caractères')
    .nullable()
    .optional(),
});

/**
 * Phase 22 Plan 22-11 (D-06) — Réglages d'envoi d'emails par tenant.
 *
 * 7 booleans (interrupteur général + 6 catégories, tous default false =
 * fail-closed) + sessions autorisées en mode test (UUIDs, cap 20).
 * Consommé par `updateEmailSettings` (server action) et le formulaire
 * Paramètres organisme « Envois d'emails ».
 */
export const EmailSettingsSchema = z.object({
  emailsEnabled: z.boolean().default(false),
  invoiceRemindersEnabled: z.boolean().default(false),
  preinscriptionRemindersEnabled: z.boolean().default(false),
  opcoRemindersEnabled: z.boolean().default(false),
  opcoSubmissionsEnabled: z.boolean().default(false),
  internalNotificationsEnabled: z.boolean().default(false),
  userInvitationsEnabled: z.boolean().default(false),
  testSessionIds: z
    .array(z.string().uuid('Identifiant de session invalide'))
    .max(20, 'Maximum 20 sessions de test')
    .default([]),
});

// Types inférés — consommés par tenant-settings.ts (signatures Server Actions)
export type TenantIdentityInput = z.infer<typeof tenantIdentitySchema>;
export type TenantAddressInput = z.infer<typeof tenantAddressSchema>;
export type TenantBillingInput = z.infer<typeof tenantBillingSchema>;
export type TenantEmailInput = z.infer<typeof tenantEmailSchema>;
export type TenantLegalDocsInput = z.infer<typeof tenantLegalDocsSchema>;
export type EmailSettingsInput = z.infer<typeof EmailSettingsSchema>;
