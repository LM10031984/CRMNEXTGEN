import { Modality } from '@prisma/client';

/** Mapping des libellés humains "Mode d'organisation" → enum Modality. */
export function mapModality(input: string | null | undefined): Modality {
  if (!input) return Modality.PRESENTIEL;
  const norm = input.trim().toLowerCase();
  if (norm.includes('présentiel') && norm.includes('distan')) return Modality.MIXTE;
  if (norm.includes('e-learning') || norm.includes('elearning')) return Modality.ELEARNING;
  if (norm.includes('distanc') || norm.includes('foad')) return Modality.DISTANCIEL;
  if (norm.includes('mixte') || norm.includes('hybride')) return Modality.MIXTE;
  return Modality.PRESENTIEL;
}
