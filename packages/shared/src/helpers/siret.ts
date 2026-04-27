/**
 * Validation SIRET / SIREN — algorithme de Luhn.
 * SIRET = 14 chiffres, SIREN = 9 chiffres.
 *
 * Note : pour les SIRET de La Poste (commencent par "356000000"), Luhn ne fonctionne pas
 * avec la règle standard — la somme doit être un multiple de 5 au lieu de 10.
 * On gère ce cas comme l'INSEE le recommande.
 */

/** Nettoie un SIRET : retire espaces et caractères non numériques. */
export function cleanSiret(input: string | null | undefined): string {
  if (!input) return '';
  return input.replace(/\D/g, '');
}

/** Vérifie qu'une chaîne est un SIRET valide (14 chiffres + Luhn). */
export function isValidSiret(input: string | null | undefined): boolean {
  const clean = cleanSiret(input);
  if (clean.length !== 14) return false;

  // Cas spécial La Poste
  if (clean.startsWith('356000000')) {
    const sum = clean.split('').reduce((acc, d) => acc + parseInt(d, 10), 0);
    return sum % 5 === 0;
  }

  return luhnCheck(clean);
}

/** Vérifie qu'une chaîne est un SIREN valide (9 chiffres + Luhn). */
export function isValidSiren(input: string | null | undefined): boolean {
  const clean = cleanSiret(input);
  if (clean.length !== 9) return false;
  return luhnCheck(clean);
}

/** Extrait le SIREN (9 premiers chiffres) depuis un SIRET. */
export function sirenFromSiret(siret: string | null | undefined): string | null {
  const clean = cleanSiret(siret);
  if (clean.length < 9) return null;
  return clean.substring(0, 9);
}

/** Algorithme de Luhn standard. */
function luhnCheck(digits: string): boolean {
  let sum = 0;
  let alternate = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    const ch = digits.charAt(i);
    if (!ch) return false;
    let n = parseInt(ch, 10);
    if (Number.isNaN(n)) return false;
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}
