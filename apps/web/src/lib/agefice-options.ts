/**
 * Valeurs exactes des dropdowns AGEFICE — alignées mot pour mot sur le PDF officiel.
 * Source unique consommée par :
 *  - lib/agefice-form-fill.ts (resolveDiplome, mapping checkbox expérience)
 *  - server/actions/agefice-generator.ts (inferExperience)
 *  - components/forms/create-person-button.tsx (dropdown saisie)
 *  - components/forms/edit-person-button.tsx (dropdown édition)
 *
 * NE PAS MODIFIER sans vérifier dans le PDF source `apps/web/src/assets/agefice-template.pdf`.
 */

export const DIPLOME_OPTIONS = [
  'Fin de scolarité obligatoire',
  'BEP-CAP',
  'Bac-Bac pro-BT-BP',
  'Bac+2 : BTS-DUT-DEUG',
  'Bac+3 : Licence ou maîtrise',
  'Bac+5 : Supérieur à la maîtrise',
] as const;

export type DiplomeOption = (typeof DIPLOME_OPTIONS)[number];

export const EXPERIENCE_OPTIONS = [
  { value: 'MOINS_1_AN', label: '< 1 an' },
  { value: '1_3_ANS', label: '1 à 3 ans' },
  { value: '4_10_ANS', label: '4 à 10 ans' },
  { value: 'PLUS_10_ANS', label: '+ de 10 ans' },
] as const;

export type ExperienceValue = (typeof EXPERIENCE_OPTIONS)[number]['value'];

export function isCanonicalExperience(v: string | null | undefined): v is ExperienceValue {
  if (!v) return false;
  return EXPERIENCE_OPTIONS.some((o) => o.value === v);
}
