/**
 * Zod schemas centralisés Sessions (Quick task 260523-oze).
 *
 * UpdateSessionDetailsInputSchema : input pour `updateSessionDetails`
 * — édition modale "Modifier la session" sur la fiche session.
 *
 * Tous les champs scalaires éditables sont optional (sauf sessionId) :
 * le client n'envoie QUE ce qui change ; la server action ne touche que
 * ce qui est `!== undefined`. `null` est autorisé pour les vrais nullable
 * BDD (name, pricePerLearner, internalNotes).
 *
 * Pattern cloné des patterns Phase 11 (invoice.ts) et Phase 8 (user.ts).
 *
 * Pas d'import depuis `@qualiof/db` : `packages/shared` ne doit pas dépendre
 * du client Prisma (cycle de deps). On duplique l'enum `Modality` ici (4
 * valeurs figées dans schema.prisma).
 */
import { z } from 'zod';

// ─── Enum Modality figé sur les 4 valeurs du schema.prisma ───────────────

export const ModalityEnum = z.enum(['PRESENTIEL', 'DISTANCIEL', 'MIXTE', 'ELEARNING']);
export type ModalityValue = z.infer<typeof ModalityEnum>;

// ─── Date "YYYY-MM-DD" envoyée par <input type="date"> ───────────────────
// Pattern wizard de création (apps/web/src/components/wizards/session-wizard.tsx).
// L'horaire est reconstruit côté server à partir de la valeur DB existante
// pour préserver l'heure d'origine (cf. updateSessionDetails server action).

const DateOnlyString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format YYYY-MM-DD');

// ─── UpdateSessionDetailsInputSchema (Quick task 260523-oze) ─────────────

export const UpdateSessionDetailsInputSchema = z
  .object({
    sessionId: z.string().uuid('sessionId doit être un UUID valide'),
    name: z.string().trim().max(200, 'Nom trop long (200 max)').nullable().optional(),
    startDate: DateOnlyString.optional(),
    endDate: DateOnlyString.optional(),
    capacityMin: z.number().int().min(1, 'Capacité min ≥ 1').optional(),
    capacityMax: z.number().int().min(1, 'Capacité max ≥ 1').optional(),
    modality: ModalityEnum.optional(),
    pricePerLearner: z.number().nonnegative('Prix HT ≥ 0').nullable().optional(),
    language: z
      .string()
      .trim()
      .min(1, 'Langue obligatoire')
      .max(8, 'Code langue trop long')
      .optional(),
    internalNotes: z.string().nullable().optional(),
  })
  .refine(
    (d) => d.startDate === undefined || d.endDate === undefined || d.endDate >= d.startDate,
    { message: 'Date de fin doit être ≥ date de début.', path: ['endDate'] },
  )
  .refine(
    (d) =>
      d.capacityMin === undefined ||
      d.capacityMax === undefined ||
      d.capacityMax >= d.capacityMin,
    { message: 'Capacité max doit être ≥ capacité min.', path: ['capacityMax'] },
  );

export type UpdateSessionDetailsInput = z.infer<typeof UpdateSessionDetailsInputSchema>;
