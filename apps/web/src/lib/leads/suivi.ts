import { z } from 'zod';

export const STATUTS = {
  NEW: 'Nouveau',
  CONTACTED: 'En cours d’appels',
  QUALIFIED: 'Qualifié',
  PROPOSAL_SENT: 'Proposition envoyée',
  NEGOTIATION: 'Négociation',
  WON: 'Gagné',
  LOST: 'Perdu',
  ON_HOLD: 'En attente',
  TO_FOLLOWUP: 'Relance longue / à réactiver',
} as const;
export const RESULTATS = {
  CONTACTED: 'Contacté',
  NO_ANSWER: 'Pas de réponse',
  VOICEMAIL: 'Messagerie',
  CALLBACK: 'Rappel demandé',
  NOT_INTERESTED: 'Non intéressé',
  QUALIFIED: 'Qualifié',
  APPOINTMENT: 'Rendez-vous pris',
  OUT_OF_SCOPE: 'Hors cible',
} as const;
export const MOTIFS_PERTE = {
  NOT_INTERESTED: 'Pas intéressé',
  OUT_OF_SCOPE: 'Hors cible',
  BUDGET: 'Budget insuffisant',
  COMPETITOR: 'Autre prestataire choisi',
  INVALID_CONTACT: 'Coordonnées invalides',
  OTHER: 'Autre motif',
} as const;
export const TYPES_ACTIVITE = {
  call: 'Appel',
  email: 'Email',
  note: 'Note',
  meeting: 'Rendez-vous',
  reminder: 'Relance',
} as const;
const status = z.enum(Object.keys(STATUTS) as [keyof typeof STATUTS, ...(keyof typeof STATUTS)[]]);
const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);
const nullableId = z
  .string()
  .uuid()
  .or(z.literal(''))
  .transform((v) => v || null);
const date = z.string().datetime({ offset: true });
const schedule = {
  status,
  nextAction: nullableText(500),
  nextActionAt: date.or(z.literal('')).transform((v) => (v ? new Date(v) : null)),
  lossReason: z
    .enum(
      Object.keys(MOTIFS_PERTE) as [keyof typeof MOTIFS_PERTE, ...(keyof typeof MOTIFS_PERTE)[]],
    )
    .or(z.literal(''))
    .transform((v) => v || null),
};
function validateSchedule(
  d: {
    status: string;
    nextAction: string | null;
    nextActionAt: Date | null;
    lossReason: string | null;
  },
  ctx: z.RefinementCtx,
) {
  if (!['WON', 'LOST'].includes(d.status) && (!d.nextAction || !d.nextActionAt))
    ctx.addIssue({
      code: 'custom',
      path: ['nextActionAt'],
      message: 'Indiquez la prochaine action et sa date pour ce lead ouvert.',
    });
  if (d.status === 'LOST' && !d.lossReason)
    ctx.addIssue({
      code: 'custom',
      path: ['lossReason'],
      message: 'Un motif de perte est obligatoire.',
    });
}
export const EditLeadSchema = z
  .object({
    updatedAt: date,
    firstName: nullableText(80),
    lastName: nullableText(80),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email()
      .or(z.literal(''))
      .transform((v) => v || null),
    phone: nullableText(40),
    jobTitle: nullableText(150),
    city: nullableText(150),
    organizationId: nullableId,
    ownerUserId: nullableId,
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
    notes: nullableText(10000),
    ...schedule,
  })
  .superRefine(validateSchedule);

export const ActivitySchema = z
  .object({
    requestId: z.string().uuid(),
    updatedAt: date,
    type: z.enum(['call', 'email', 'note', 'meeting', 'reminder']),
    occurredAt: date.transform((v) => new Date(v)),
    outcome: z
      .enum(Object.keys(RESULTATS) as [keyof typeof RESULTATS, ...(keyof typeof RESULTATS)[]])
      .or(z.literal(''))
      .transform((v) => v || null),
    durationSeconds: z.number().int().min(0).max(86400).nullable(),
    body: z.string().trim().min(1, 'Saisissez un commentaire.').max(10000),
    ...schedule,
  })
  .superRefine((d, ctx) => {
    validateSchedule(d, ctx);
    if (d.type === 'call' && !d.outcome)
      ctx.addIssue({
        code: 'custom',
        path: ['outcome'],
        message: 'Choisissez le résultat de l’appel.',
      });
    if (d.occurredAt.getTime() > Date.now() + 300000)
      ctx.addIssue({
        code: 'custom',
        path: ['occurredAt'],
        message: 'Une activité réalisée ne peut pas être datée dans le futur.',
      });
  });

export function transitionAppel(
  current: { status: string; callCount: number },
  input: z.infer<typeof ActivitySchema>,
) {
  const callCount = input.type === 'call' ? current.callCount + 1 : current.callCount;
  let nextStatus = input.status;
  if (input.type === 'call') {
    if (input.outcome === 'QUALIFIED') nextStatus = 'QUALIFIED';
    const failed = ['NO_ANSWER', 'VOICEMAIL'].includes(input.outcome ?? '');
    if (failed && callCount >= 7 && !['TO_FOLLOWUP', 'LOST', 'QUALIFIED'].includes(nextStatus))
      throw new Error(
        'Après l’appel 7, choisissez Qualifié, Relance longue ou Perdu (avec motif).',
      );
    if (failed && callCount < 7 && ['NEW', 'CONTACTED'].includes(nextStatus))
      nextStatus = 'CONTACTED';
    if (nextStatus === 'NEW') nextStatus = 'CONTACTED';
    if (
      failed &&
      nextStatus !== 'LOST' &&
      (!input.nextActionAt || input.nextActionAt <= input.occurredAt || !input.nextAction)
    )
      throw new Error('Un appel sans réponse nécessite une relance datée après l’appel.');
  }
  return { callCount, status: nextStatus };
}
export function libelleStatut(status: string, callCount = 0) {
  return status === 'CONTACTED' && callCount > 0
    ? `Appel ${Math.min(callCount, 7)}`
    : (STATUTS[status as keyof typeof STATUTS] ?? status);
}
