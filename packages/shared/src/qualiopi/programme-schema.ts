/**
 * Schéma Zod du programme de formation Qualiopi (P0.2).
 *
 * Avant ce module, le pré-remplissage IA d'un produit de formation
 * (`ai-fill-product.ts`) renvoyait un `AiProductDraft` (interface TS)
 * sans aucune validation Zod — un objectif rédigé en « comprendre les
 * bases de X » passait silencieusement et finissait dans le PDF programme,
 * faisant tomber l'indicateur Qualiopi 2.
 *
 * Ce module pose un schéma Zod minimal avec UN refine critique : tous les
 * `objectives` doivent porter au moins un verbe Bloom mesurable (cf.
 * `bloom-verbs.ts`). Le reste des champs (publicCible, prerequisites,
 * méthodes pédagogiques…) reste en texte libre — le LLM doit pouvoir
 * écrire en prose normale.
 */

import { z } from 'zod';
import { hasMeasurableActionVerb } from './bloom-verbs';

export const ProgrammeSchema = z
  .object({
    // La validation critique vit dans le superRefine ci-dessous (verbes
    // Bloom). Les autres champs gardent des contraintes lâches pour ne
    // pas casser l'UX si un LLM renvoie un draft partiel — c'est l'UI qui
    // les rendra obligatoires au moment de la publication produit.
    objectives: z
      .array(z.string().trim().min(5))
      .min(2, 'Au moins 2 objectifs pédagogiques sont attendus.')
      .max(12, 'Pas plus de 12 objectifs — fractionner sinon le programme.'),
    targetAudience: z.string().trim().default(''),
    prerequisites: z.string().trim().default(''),
    pedagogicalMethods: z.string().trim().default(''),
    pedagogicalSupport: z.string().trim().default(''),
    evaluationMethods: z.string().trim().default(''),
    trainerProfile: z.string().trim().default(''),
    accessibility: z.string().trim().default(''),
    accessConditions: z.string().trim().default(''),
    programMd: z.string().trim().min(50, 'programMd trop court — minimum 50 caractères de plan structuré.'),
  })
  .superRefine((data, ctx) => {
    data.objectives.forEach((objective, idx) => {
      const check = hasMeasurableActionVerb(objective);
      if (!check.ok) {
        const msg = check.vagueDetected
          ? `Objectif ${idx + 1} commence par le verbe vague « ${check.vagueDetected} ». Reformule avec un verbe Bloom (identifier, appliquer, analyser, élaborer, évaluer, concevoir…).`
          : `Objectif ${idx + 1} : aucun verbe d'action mesurable détecté. Indicateur Qualiopi 2 — un objectif doit être observable et mesurable.`;
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['objectives', idx],
          message: msg,
        });
      }
    });
  });

export type Programme = z.infer<typeof ProgrammeSchema>;
