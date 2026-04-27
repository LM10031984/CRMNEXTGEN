import { z } from 'zod';
import { LegalForm } from '@qualiof/db';
import { addressSchema } from './address';
import { isValidSiret } from '../helpers/siret';

export const organizationSchema = z.object({
  legalName: z.string().min(1, 'Raison sociale requise'),
  legalForm: z.nativeEnum(LegalForm),
  siret: z
    .string()
    .optional()
    .nullable()
    .refine((s) => !s || isValidSiret(s), { message: 'SIRET invalide' }),
  siren: z.string().optional().nullable(),
  naf: z.string().optional().nullable(),
  vatNumber: z.string().optional().nullable(),
  address: addressSchema.optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  emailBilling: z.string().email().optional().nullable().or(z.literal('')),
  phoneBilling: z.string().optional().nullable(),
  opcoCode: z.string().optional().nullable(),
  network: z.string().optional().nullable(),
  brandName: z.string().optional().nullable(),
  representative: z.string().optional().nullable(),
  activityDescription: z.string().optional().nullable(),
});
export type OrganizationInput = z.infer<typeof organizationSchema>;
