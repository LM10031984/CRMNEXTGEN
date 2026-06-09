/**
 * Zod schemas Veille Qualiopi (Phase 13 Plan 13-02 — VEILLE-02).
 *
 * 4 schemas indépendants, réutilisables :
 *  - `createWatchSchema`           — formulaire "Ajouter une source" UI Plan 03
 *  - `updateWatchSchema`           — édition champs hors exploitation (kebab menu UI)
 *  - `updateExploitationSchema`    — inline edit du champ exploitation (déclenche dateLastReviewed=now)
 *  - `rejectWatchSchema`           — rejet d'une suggestion inbox (avec raison obligatoire)
 *
 * Décisions clés (cf. 13-CONTEXT.md) :
 *  - D-09 : `frequency`, `modeSuivi`, `typeSource` en string libre (pas d'enum prématurée)
 *  - D-10 : `responsable` en string libre (pas FK User — xlsx contient « Direction », etc.)
 *  - D-07 : `exploitation` = textarea simple (pas de rich-text V1)
 *
 * Limites volontairement larges (max 300 title, max 5000 exploitation) — l'audit
 * Qualiopi peut nécessiter du texte verbeux.
 */

import { z } from 'zod';

/** 4 indicateurs Qualiopi du critère 6 (cf. RegulatoryWatchTheme Prisma enum). */
export const VeilleThemeEnum = z.enum(['INDIC_23', 'INDIC_24', 'INDIC_25', 'INDIC_26']);

/**
 * Création manuelle d'une entrée veille (UI "+ Ajouter une source" Plan 03).
 *
 * `url` accepte null (certaines sources sont des salons, des newsletters sans page web).
 * Tous les champs sauf `theme` et `title` sont optionnels — l'utilisateur peut compléter
 * progressivement.
 */
export const createWatchSchema = z.object({
  theme: VeilleThemeEnum,
  title: z.string().trim().min(2, 'Titre trop court').max(300, 'Maximum 300 caractères'),
  url: z.string().url('URL invalide').nullable().optional(),
  source: z.string().trim().max(150).nullable().optional(),
  modeSuivi: z.string().trim().max(150).nullable().optional(),
  typeSource: z.string().trim().max(150).nullable().optional(),
  responsable: z.string().trim().max(100).nullable().optional(),
  frequency: z.string().trim().max(100).nullable().optional(),
  exploitation: z.string().trim().max(5000).nullable().optional(),
});

/**
 * Édition d'une entrée existante hors exploitation (kebab menu "Modifier la source").
 *
 * Tous les champs deviennent optionnels (patch sémantique) + `id` obligatoire.
 * L'édition d'exploitation passe par `updateExploitationSchema` séparé (qui déclenche
 * `dateLastReviewed=now()` et trace AuditLog `regulatoryWatch.exploitation_updated`).
 */
export const updateWatchSchema = createWatchSchema.partial().extend({
  id: z.string().uuid('ID watch invalide'),
});

/**
 * Inline edit du champ exploitation (cellule du tableau Plan 03).
 *
 * Côté action : déclenche `dateLastReviewed = new Date()` + AuditLog
 * `regulatoryWatch.exploitation_updated` avec diff before/after.
 *
 * `min(1)` car un appel à updateExploitation avec chaîne vide n'a pas de sens
 * (utiliser updateWatch pour effacer un champ).
 */
export const updateExploitationSchema = z.object({
  id: z.string().uuid('ID watch invalide'),
  exploitation: z
    .string()
    .trim()
    .min(1, 'Exploitation requise')
    .max(5000, 'Maximum 5000 caractères'),
});

/**
 * Rejet d'une suggestion inbox (suggestedBy='AUTO', status='DRAFT').
 *
 * `reason` obligatoire (≥ 2 chars) — l'audit Qualiopi exige que les rejets
 * soient documentés (traçabilité humaine = valeur d'audit, D-08 CONTEXT).
 *
 * Côté action : passe le watch à `status='ARCHIVED'` et trace AuditLog
 * `regulatoryWatch.rejected` avec `reason` dans le diff.
 */
export const rejectWatchSchema = z.object({
  id: z.string().uuid('ID watch invalide'),
  reason: z
    .string()
    .trim()
    .min(2, 'Raison trop courte')
    .max(500, 'Maximum 500 caractères'),
});

// Types inférés — consommés par server actions veille.ts + UI Plan 03
export type CreateWatchInput = z.infer<typeof createWatchSchema>;
export type UpdateWatchInput = z.infer<typeof updateWatchSchema>;
export type UpdateExploitationInput = z.infer<typeof updateExploitationSchema>;
export type RejectWatchInput = z.infer<typeof rejectWatchSchema>;
