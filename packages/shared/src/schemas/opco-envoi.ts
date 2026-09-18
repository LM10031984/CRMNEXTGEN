import { z } from 'zod';
export const DossierStageSchema = z.enum(['PRISE_EN_CHARGE', 'FIN_FORMATION']);
export const OpcoIdSchema = z.string().min(1).max(128);
export const OpcoDraftPatchSchema = z
  .object({
    subject: z
      .string()
      .trim()
      .min(1)
      .max(300)
      .regex(/^[^\r\n]+$/)
      .optional(),
    bodyHtml: z.string().trim().min(1).max(20000).optional(),
    recipientEmail: z.string().trim().email().max(254).optional(),
    attachments: z
      .array(
        z.object({
          key: z.string().min(1).max(2048),
          filename: z.string().min(1).max(255),
          kind: z.string().min(1),
          included: z.boolean(),
          signe: z.boolean().optional(),
        }),
      )
      .max(30)
      .optional(),
  })
  .strict();
export const CfpPostalCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{5}$/);
