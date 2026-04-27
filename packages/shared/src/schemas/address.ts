import { z } from 'zod';

export const addressSchema = z.object({
  street: z.string().optional(),
  street2: z.string().optional(),
  postalCode: z.string().optional(),
  city: z.string().optional(),
  country: z.string().default('France'),
});
export type AddressInput = z.infer<typeof addressSchema>;
