import { z } from 'zod';

import { DIAGNOSTIC_QUESTIONS } from '../diagnostic/questions';
import type { DiagnosticQuestion } from '../diagnostic/types';

/**
 * Schémas du diagnostic R1 — source unique serveur ET client.
 *
 * La règle qui gouverne ce fichier : une réponse est validée contre le TYPE
 * déclaré par sa question dans le référentiel. Pas de `z.any()` sur `value`,
 * sinon un « 12 000 € » saisi en toutes lettres se retrouve en base, et le
 * moteur budget rend un NaN au milieu d'un rendez-vous.
 */

const QUESTIONS_BY_ID = new Map<string, DiagnosticQuestion>(
  DIAGNOSTIC_QUESTIONS.map((q) => [q.id, q]),
);

/**
 * Nettoie une saisie humaine avant de la lire comme un nombre.
 * « 1 250,50 € », « 45 % », « 12 000 » sont ce qu'un commercial tape vraiment.
 */
function toNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .replace(/[€%\s  ]/g, '')
    .replace(/\.(?=\d{3}\b)/g, '')
    .replace(',', '.');
  if (cleaned.length === 0) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Le validateur d'une question donnée, dérivé de son type déclaré. */
export function answerSchemaFor(question: DiagnosticQuestion): z.ZodType<unknown> {
  switch (question.type) {
    case 'int':
      return z
        .preprocess(
          toNumber,
          z.number().int('Un nombre entier est attendu').min(0, 'Négatif impossible'),
        )
        .describe('int');
    case 'percent':
      return z
        .preprocess(
          toNumber,
          z
            .number()
            .min(0, 'Un pourcentage part de 0')
            .max(100, 'Un pourcentage ne dépasse pas 100'),
        )
        .describe('percent');
    case 'money':
      return z
        .preprocess(toNumber, z.number().min(0, 'Un montant négatif ne veut rien dire'))
        .describe('money');
    case 'yesno':
      return z.enum(['yes', 'no']).describe('yesno');
    case 'choice':
      return z
        .string()
        .refine((v) => (question.choices ?? []).includes(v), 'Choix inconnu')
        .describe('choice');
    case 'multichoice':
      return z
        .array(z.string().refine((v) => (question.choices ?? []).includes(v), 'Choix inconnu'))
        .describe('multichoice');
    case 'date':
      return z.coerce.date().describe('date');
    case 'url':
      return z.string().url('Adresse web invalide').describe('url');
    case 'text':
    default:
      return z.string().max(5000, 'Réponse trop longue').describe('text');
  }
}

/**
 * Valide une réponse contre le référentiel.
 * Retourne `{ ok: false }` plutôt que de lever : une saisie invalide en
 * rendez-vous est un cas courant, pas une panne.
 */
export function parseAnswerValue(
  questionId: string,
  value: unknown,
): { ok: true; value: unknown } | { ok: false; error: string } {
  const question = QUESTIONS_BY_ID.get(questionId);
  if (!question) return { ok: false, error: `Question inconnue : ${questionId}` };
  // Effacer une réponse est légitime (le dirigeant se reprend).
  if (value === null || value === undefined || value === '') return { ok: true, value: null };
  const parsed = answerSchemaFor(question).safeParse(value);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Réponse invalide' };
  }
  return { ok: true, value: parsed.data };
}

export const SaveAnswerSchema = z.object({
  diagnosticId: z.string().uuid(),
  questionId: z.string().refine((id) => QUESTIONS_BY_ID.has(id), 'Question hors référentiel'),
  value: z.unknown(),
  isSkipped: z.boolean().default(false),
});
export type SaveAnswerInput = z.infer<typeof SaveAnswerSchema>;

export const CreateDiagnosticSchema = z
  .object({
    variant: z.enum(['LEGER', 'COMPLET']),
    /** Diagnostic rattaché à un lead existant… */
    leadId: z.string().uuid().optional(),
    /** …ou créé à la volée depuis le nom de l'agence rencontrée. */
    newLeadCompanyName: z.string().trim().min(2, "Nom de l'agence trop court").optional(),
    newLeadContactFirstName: z.string().trim().optional(),
    newLeadContactLastName: z.string().trim().optional(),
    newLeadEmail: z.string().email('Email invalide').optional().or(z.literal('')),
    newLeadPhone: z.string().trim().optional(),
    meetingAt: z.coerce.date().optional(),
    r2PlannedAt: z.coerce.date().optional(),
    expectedParticipants: z.coerce.number().int().min(0).max(200).optional(),
  })
  .refine((d) => Boolean(d.leadId) !== Boolean(d.newLeadCompanyName), {
    message: "Rattacher à un lead existant OU saisir le nom de l'agence — pas les deux",
    path: ['leadId'],
  });
export type CreateDiagnosticInput = z.infer<typeof CreateDiagnosticSchema>;

export const DiagParticipantStatutSchema = z.enum(['INDEPENDANT', 'SALARIE', 'DIRIGEANT']);

/**
 * Fiche équipe. `displayName` est une donnée sensible (nom + production) :
 * elle ne sort ni en lien public, ni dans un prompt IA, ni dans un log.
 */
export const UpsertParticipantSchema = z.object({
  id: z.string().uuid().optional(),
  diagnosticId: z.string().uuid(),
  displayName: z.string().trim().min(1, 'Un nom est nécessaire').max(120),
  statut: DiagParticipantStatutSchema,
  fonction: z.string().trim().max(120).optional().or(z.literal('')),
  fullTime: z.boolean().optional(),
  experienceLevel: z.enum(['debutant', 'confirme', 'expert']).optional().or(z.literal('')),
  caN1: z.preprocess(toNumber, z.number().min(0).max(100_000_000)).nullable().optional(),
  caCurrent: z.preprocess(toNumber, z.number().min(0).max(100_000_000)).nullable().optional(),
  opcoEligible: z.boolean().optional(),
  trainings24mCount: z.preprocess(toNumber, z.number().int().min(0).max(500)).nullable().optional(),
  trainings24mHours: z
    .preprocess(toNumber, z.number().int().min(0).max(10_000))
    .nullable()
    .optional(),
  trainings24mFunded: z
    .preprocess(toNumber, z.number().min(0).max(1_000_000))
    .nullable()
    .optional(),
  wantsTraining: z.boolean().optional(),
  priorityNeed: z.string().trim().max(200).optional().or(z.literal('')),
  objectiveCa: z.preprocess(toNumber, z.number().min(0).max(100_000_000)).nullable().optional(),
  strengths: z.string().trim().max(2000).optional().or(z.literal('')),
  includedInProposal: z.boolean().default(true),
});
export type UpsertParticipantInput = z.infer<typeof UpsertParticipantSchema>;
