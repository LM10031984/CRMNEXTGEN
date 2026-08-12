import { LegalForm } from '@prisma/client';

/**
 * Mapping des libellés humains de "Forme juridique" rencontrés dans
 * les exports SmartOF + Airtable, vers l'enum Prisma `LegalForm`.
 *
 * Toute valeur non listée → `LegalForm.AUTRE` (et on log un warning à l'import).
 */
export const LEGAL_FORM_MAPPING: Record<string, LegalForm> = {
  'sas': LegalForm.SAS,
  'sa': LegalForm.SA,
  'sarl': LegalForm.SARL,
  'sasu': LegalForm.SASU,
  'eurl': LegalForm.EURL,
  'ei': LegalForm.EI,
  'eirl': LegalForm.EIRL,
  'entreprise individuelle': LegalForm.EI,
  'entreprise individuel (ei)': LegalForm.EI,
  'entreprise individuel': LegalForm.EI,
  'auto-entrepreneur': LegalForm.AUTO_ENTREPRENEUR,
  'auto entrepreneur': LegalForm.AUTO_ENTREPRENEUR,
  'autoentrepreneur': LegalForm.AUTO_ENTREPRENEUR,
  'micro-entreprise': LegalForm.AUTO_ENTREPRENEUR,
  'microentreprise': LegalForm.AUTO_ENTREPRENEUR,
  'association': LegalForm.ASSOCIATION,
  'particulier': LegalForm.PARTICULIER,
};

export function mapLegalForm(input: string | null | undefined): LegalForm {
  if (!input) return LegalForm.AUTRE;
  const normalized = input.trim().toLowerCase();
  return LEGAL_FORM_MAPPING[normalized] ?? LegalForm.AUTRE;
}

/** Helpers d'identification rapide. */
export const SOLO_LEGAL_FORMS: LegalForm[] = [
  LegalForm.EI,
  LegalForm.EIRL,
  LegalForm.AUTO_ENTREPRENEUR,
];

export function isSoloLegalForm(form: LegalForm): boolean {
  return SOLO_LEGAL_FORMS.includes(form);
}
