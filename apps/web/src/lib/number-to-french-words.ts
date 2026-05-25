/**
 * BUG-12 V2 — Conversion nombre → mots français (orthographe réformée 1990,
 * sans traits d'union — match le format AGEFICE Kristin "trois mille vingt quatre").
 *
 * Couvre 0 → 999_999_999. Décimales tronquées (l'attestation AGEFICE ne mentionne
 * pas les centimes en lettres, juste les euros). Si besoin V3 : décimales =
 * "trois mille vingt quatre euros et cinquante centimes".
 */

const UNITS = [
  '',
  'un',
  'deux',
  'trois',
  'quatre',
  'cinq',
  'six',
  'sept',
  'huit',
  'neuf',
  'dix',
  'onze',
  'douze',
  'treize',
  'quatorze',
  'quinze',
  'seize',
  'dix sept',
  'dix huit',
  'dix neuf',
];

const TENS = [
  '',
  '',
  'vingt',
  'trente',
  'quarante',
  'cinquante',
  'soixante',
  'soixante',
  'quatre vingt',
  'quatre vingt',
];

function below100(n: number): string {
  if (n < 20) return UNITS[n] ?? '';
  const t = Math.floor(n / 10);
  const u = n % 10;
  // 70-79 : soixante + (10..19), 90-99 : quatre vingt + (10..19)
  if (t === 7 || t === 9) {
    const base = TENS[t]!;
    const rest = UNITS[10 + u]!;
    return t === 7 && u === 1 ? `${base} et ${rest}` : `${base} ${rest}`;
  }
  // 80 → "quatre vingts" (pluriel terminal). 81-89 → "quatre vingt un..." (sans s).
  if (t === 8 && u === 0) return 'quatre vingts';
  // 21, 31, 41, 51, 61 → "et un"
  if (u === 1 && (t === 2 || t === 3 || t === 4 || t === 5 || t === 6)) {
    return `${TENS[t]} et un`;
  }
  if (u === 0) return TENS[t]!;
  return `${TENS[t]} ${UNITS[u]}`;
}

function below1000(n: number, isFinalGroup: boolean): string {
  if (n === 0) return '';
  if (n < 100) return below100(n);
  const h = Math.floor(n / 100);
  const r = n % 100;
  const cent = h === 1 ? 'cent' : `${UNITS[h]} cent`;
  // "cent" → "cents" si pluriel ET terminal du nombre (pas suivi d'autres digits)
  // ex 200 = "deux cents", 201 = "deux cent un", 200_000 = "deux cent mille"
  if (r === 0) {
    return h > 1 && isFinalGroup ? `${cent}s` : cent;
  }
  return `${cent} ${below100(r)}`;
}

export function numberToFrenchWords(value: number): string {
  if (!Number.isFinite(value)) return '';
  const n = Math.floor(Math.abs(value));
  if (n === 0) return 'zéro';

  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const units = n % 1000;

  const parts: string[] = [];

  if (millions > 0) {
    const word = millions === 1 ? 'un million' : `${below1000(millions, false)} millions`;
    parts.push(word);
  }

  if (thousands > 0) {
    // "mille" invariable, "un mille" → "mille"
    const word = thousands === 1 ? 'mille' : `${below1000(thousands, false)} mille`;
    parts.push(word);
  }

  if (units > 0) {
    parts.push(below1000(units, true));
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}
