/**
 * Schémas Zod Phase 9.1 — Centralisation Qualiopi 360°.
 *
 * Stocke les **statuts manuels par-participant** de la matrice docs × stagiaires
 * (fiche session). Cf. RESEARCH.md §"Decision A — Data Model JSON Shape"
 * + CONTEXT.md D-03 (grain 3 états) + D-07 (Json sur SessionParticipant).
 *
 * Persistence : `SessionParticipant.docStatus Json?` — clé = DocType string,
 * valeur = `DocStatusEntry`. Source unique de vérité des statuts manuels.
 * Les PDF physiques restent sur `Document` (entityType participant|session|product).
 */

import { z } from 'zod';

/** 3 états figés par D-03 CONTEXT.md. */
export const DocStatusState = z.enum(['GENERATED', 'MANUAL_OK', 'MISSING']);
export type DocStatusState = z.infer<typeof DocStatusState>;

/**
 * Entrée pour un DocType donné dans `SessionParticipant.docStatus`.
 *
 * - `uploadedSignedPdfKey` : clé MinIO (pas FK Document, cohérent ribKey).
 * - `markedOkWithoutUpload` : cas dérogatoire D-01 (pastille orange ⚠).
 * - `note` : justification libre admin (raison dérogation, ≤ 500 chars).
 */
export const DocStatusEntrySchema = z.object({
  state: DocStatusState,
  uploadedSignedPdfKey: z.string().optional(),
  uploadedSignedAt: z.string().datetime().optional(),
  uploadedByUserId: z.string().uuid().optional(),
  markedOkWithoutUpload: z.boolean().optional(),
  note: z.string().max(500).optional(),
  updatedAt: z.string().datetime(),
});
export type DocStatusEntry = z.infer<typeof DocStatusEntrySchema>;

/**
 * Map clé=DocType (string), valeur=entry. Stockée dans `SessionParticipant.docStatus`.
 * Prisma `Json?` = null|undefined si aucun statut manuel n'a jamais été posé.
 */
export const DocStatusMapSchema = z.record(z.string(), DocStatusEntrySchema);
export type DocStatusMap = z.infer<typeof DocStatusMapSchema>;
