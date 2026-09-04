/**
 * Contrats partagés de la signature électronique (spec 2026-09-04 §4.2, §5 lot B).
 *
 * Deux contrats vivent ici parce que le serveur ET le client les lisent :
 *  1. `tenantSignatorySchema` (D-1) — le signataire OF configuré une fois dans
 *     Paramètres organisme. Champs vides autorisés : ils font retomber sur le
 *     responsable OF déjà connu (`OF_RESP_*` / of-config), pas de double saisie.
 *  2. `signatureSignersSchema` — le contenu de la colonne Json
 *     `SignatureRequest.signers`. Une colonne Json sans schéma est une dette :
 *     `parseSignatureSigners` est le seul point de lecture autorisé et il ne
 *     fait jamais tomber une page à cause d'une ligne mal formée.
 */

import { z } from 'zod';

/**
 * Ordre de signature (D-3). `AFTER` = l'OF signe après le client, c'est-à-dire
 * après avoir constaté que le client a bien signé — le comportement d'aujourd'hui.
 */
export const SIGNATORY_ORDERS = ['BEFORE', 'AFTER'] as const;
export type SignatoryOrder = (typeof SIGNATORY_ORDERS)[number];

/** D-1 — signataire OF, édité dans Paramètres organisme. */
export const tenantSignatorySchema = z.object({
  signatoryName: z
    .string()
    .max(120, 'Maximum 120 caractères')
    .nullable()
    .optional()
    .transform((s) => s ?? ''),
  signatoryEmail: z
    .string()
    .nullable()
    .optional()
    .transform((s) => (s ?? '').trim())
    // Vide volontaire = fallback ENV `OF_RESP_EMAIL` / `OF_EMAIL`.
    .pipe(z.string().email('Email invalide').or(z.literal(''))),
  signatoryTitle: z
    .string()
    .max(120, 'Maximum 120 caractères')
    .nullable()
    .optional()
    .transform((s) => s ?? ''),
  signatoryOrder: z.enum(SIGNATORY_ORDERS).default('AFTER'),
});

export type TenantSignatoryInput = z.infer<typeof tenantSignatorySchema>;

/**
 * Un signataire tel que mémorisé dans `SignatureRequest.signers`.
 *
 * `signedAt` est une chaîne ISO (et non un `Date`) : c'est du Json en base,
 * il traverse la frontière serveur → client sans sérialisation maison.
 */
export const signatureSignerSchema = z.object({
  role: z.string().min(1),
  name: z.string().min(1),
  email: z.string().min(1),
  providerSignerId: z.string().min(1),
  status: z.string().min(1),
  signedAt: z.string().nullable(),
  signUrl: z.string().nullable(),
});

export const signatureSignersSchema = z.array(signatureSignerSchema);

export type SignatureSigner = z.infer<typeof signatureSignerSchema>;

/**
 * Relit la colonne Json en écartant — sans bruit — ce qui ne respecte pas le
 * contrat. Une fiche session ne doit jamais tomber en erreur parce qu'un
 * webhook a écrit une ligne inattendue.
 */
export function parseSignatureSigners(raw: unknown): SignatureSigner[] {
  if (!Array.isArray(raw)) return [];
  const out: SignatureSigner[] = [];
  for (const item of raw) {
    const parsed = signatureSignerSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}
