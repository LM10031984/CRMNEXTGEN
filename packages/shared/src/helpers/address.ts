/**
 * Représentation canonique d'une adresse stockée en JSONB Postgres.
 * Volontairement simple : street/postalCode/city/country.
 */

export interface Address {
  street?: string;
  street2?: string;
  postalCode?: string;
  city?: string;
  country?: string;
}

/** Construit un objet Address à partir des champs SmartOF (Rue / Code postal / Ville). */
export function buildAddress(input: {
  street?: string | null;
  street2?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
}): Address {
  const cleaned: Address = {};
  if (input.street?.trim()) cleaned.street = input.street.trim();
  if (input.street2?.trim()) cleaned.street2 = input.street2.trim();
  if (input.postalCode?.trim()) cleaned.postalCode = input.postalCode.trim();
  if (input.city?.trim()) cleaned.city = input.city.trim();
  cleaned.country = input.country?.trim() ?? 'France';
  return cleaned;
}

/** Formate une adresse en chaîne (pour affichage UI / DOCX). */
export function formatAddress(addr: Address | null | undefined): string {
  if (!addr) return '';
  const parts = [
    addr.street,
    addr.street2,
    [addr.postalCode, addr.city].filter(Boolean).join(' '),
  ].filter(Boolean);
  return parts.join('\n');
}
