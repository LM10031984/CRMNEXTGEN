import { z } from 'zod';
import { addressSchema } from './address.js';

export const personSchema = z.object({
  civility: z.string().optional().nullable(),
  firstName: z.string().min(1, 'Prénom requis'),
  lastName: z.string().min(1, 'Nom requis'),
  birthName: z.string().optional().nullable(),
  birthDate: z.coerce.date().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  phone: z.string().optional().nullable(),
  personalAddress: addressSchema.optional().nullable(),
  educationLevel: z.string().optional().nullable(),
  diplomas: z.string().optional().nullable(),
  professionalExperience: z.string().optional().nullable(),
  professionalStatus: z.string().optional().nullable(),
  bpfDefaultStatus: z.string().optional().nullable(),
});
export type PersonInput = z.infer<typeof personSchema>;
