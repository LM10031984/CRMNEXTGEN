import { z } from 'zod';
const id = z.string().trim().min(1, 'Identifiant requis.').max(200);
const fields = {
  startsAt: z.string().datetime({ offset: true, message: 'Date de début invalide.' }),
  endsAt: z.string().datetime({ offset: true, message: 'Date de fin invalide.' }),
  status: z.enum(['busy', 'tentative']),
  note: z.string().trim().max(2000, 'La note est limitée à 2 000 caractères.').default(''),
};
const ordered = (v: { startsAt: string; endsAt: string }) =>
  Date.parse(v.startsAt) < Date.parse(v.endsAt);
const orderError = { message: 'La fin doit être strictement après le début.', path: ['endsAt'] };
export const CreateTrainerAvailabilitySchema = z
  .object({ trainerId: id, ...fields })
  .strict()
  .refine(ordered, orderError);
export const UpdateTrainerAvailabilitySchema = z
  .object({ id, ...fields })
  .strict()
  .refine(ordered, orderError);
export const DeleteTrainerAvailabilitySchema = z.object({ id }).strict();
