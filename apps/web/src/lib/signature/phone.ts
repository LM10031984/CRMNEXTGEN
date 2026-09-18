/**
 * Format international pour DocuSeal. Les numéros nationaux sont supposés
 * français ; les autres pays doivent être saisis avec leur indicatif.
 * Ne modifie pas les coordonnées enregistrées dans le CRM.
 */
export function signaturePhone(input: string | undefined): string {
  let phone = (input ?? '').trim().replace(/[\s.()\-]/g, '');
  if (phone.startsWith('00')) phone = `+${phone.slice(2)}`;
  if (/^0[67]\d{8}$/.test(phone)) phone = `+33${phone.slice(1)}`;
  if (/^\+330[67]\d{8}$/.test(phone)) phone = `+33${phone.slice(4)}`;
  if (!/^\+[1-9]\d{7,14}$/.test(phone) ||
      (phone.startsWith('+33') && !/^\+33[67]\d{8}$/.test(phone))) {
    throw new Error('Vérification SMS : numéro mobile valide obligatoire (06/07 français ou format international).');
  }
  return phone;
}
