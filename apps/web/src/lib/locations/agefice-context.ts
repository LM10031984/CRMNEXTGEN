import type { OfConfig } from '../of-config';
import type { LieuInput } from './format-lieu';

function normalize(value: unknown): string {
  return typeof value === 'string'
    ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ').trim()
      .replace(/\bav\b/g, 'avenue').replace(/\bbd\b/g, 'boulevard')
    : '';
}

/** Le lieu de la session prime sur le défaut historique du catalogue. */
export function ageficeFormationEnEntreprise(
  location: LieuInput | null | undefined,
  of: Pick<OfConfig, 'name' | 'addressStreet' | 'addressCp'>,
  modality: string | null | undefined,
  fallback: boolean,
): boolean {
  if (modality?.toUpperCase() === 'DISTANCIEL') return false;
  if (!location) return fallback;

  const companyName = (value: unknown) => normalize(value).replace(/^(sas|sasu|sarl|eurl|sa)\b\s*/, '');
  const ofName = companyName(of.name);
  if (ofName && [location.legalName, location.name].some((name) => {
    const normalized = companyName(name);
    return normalized === ofName || normalized.startsWith(`${ofName} `);
  })) return false;

  const address = location.address && typeof location.address === 'object'
    ? location.address as Record<string, unknown> : null;
  if (address && normalize(of.addressStreet) && normalize(of.addressCp) &&
    normalize(address.street) === normalize(of.addressStreet) &&
    normalize(address.postalCode) === normalize(of.addressCp)) return false;

  // Les lieux clients renseignés (agence, enseigne...) sont distincts de l'OF.
  // Un lieu vide ne permet pas de remplacer la valeur de catalogue.
  return !!(normalize(location.legalName) || normalize(location.name) || normalize(address?.street)) || fallback;
}
