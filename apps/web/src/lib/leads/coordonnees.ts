/** Normalisation commune de recherche et de rapprochement, sans dépendance serveur. */
export function normaliserTelephone(value: unknown): string {
  let phone = String(value ?? '')
    .trim()
    .replace(/[^\d+]/g, '');
  if (phone.startsWith('00')) phone = '+' + phone.slice(2);
  // Colonne mobile MLS française : Excel numérique supprime le zéro initial.
  if (/^[67]\d{8}$/.test(phone)) phone = '+33' + phone;
  if (/^0\d{9}$/.test(phone)) phone = '+33' + phone.slice(1);
  if (/^33\d{9}$/.test(phone)) phone = '+' + phone;
  return phone;
}

export function cleEnseigne(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^(?:c\s*21|century\s*21)(?=\s|$)/, 'century 21')
    .replace(/^(?:kw|keller\s+williams)(?=\s|$)/, 'keller williams');
}

export function enseigneGenerique(value: string): boolean {
  return [
    'orpi',
    'century 21',
    'keller williams',
    'era',
    'laforet',
    'stephane plaza',
    'iad',
    'safti',
  ].includes(cleEnseigne(value));
}

export function libelleEnseigne(value: string): string {
  return value
    .trim()
    .replace(/^c\s*21(?=\s|$)/i, 'Century 21')
    .replace(/^kw(?=\s|$)/i, 'Keller Williams');
}

export function enseigneOrganisation(org: {
  legalName: string;
  brandName?: string | null;
  network?: string | null;
}): string {
  const name = org.brandName?.trim() || org.legalName.trim();
  const network = org.network?.trim() || '';
  return libelleEnseigne(
    network && enseigneGenerique(network) && !cleEnseigne(name).includes(cleEnseigne(network))
      ? `${network} ${name}`
      : name,
  );
}
