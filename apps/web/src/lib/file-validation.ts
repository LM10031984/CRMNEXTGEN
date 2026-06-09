/**
 * Validation MIME via magic-bytes (server-only).
 *
 * Sprint 1 — Sécurité : on ne fait JAMAIS confiance au `Content-Type` envoyé par
 * le client (trivialement falsifiable). On lit les premiers octets du buffer
 * et on vérifie qu'ils correspondent à une signature connue.
 *
 * Couverture limitée et volontaire : on accepte uniquement les formats utiles
 * pour les pièces apprenants (CNI / RIB / CFP / signature) et les PDF générés.
 * Tout autre format est rejeté — pas d'extension de la liste sans revue.
 *
 * Pas de dépendance npm : `file-type` est ESM-only avec une API qui change
 * entre majeures et qui ramène 70+ détecteurs dont on n'a pas besoin. Ici on
 * lit 8 octets max et on compare en `Uint8Array` natif Node.
 */

export type AllowedMime = 'application/pdf' | 'image/jpeg' | 'image/png';

interface MagicSignature {
  mime: AllowedMime;
  bytes: number[]; // -1 = wildcard (octet à ignorer)
  offset: number;
}

const SIGNATURES: MagicSignature[] = [
  // PDF — "%PDF-" (les 5 premiers octets sont toujours identiques)
  { mime: 'application/pdf', offset: 0, bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  // JPEG — SOI marker FF D8 FF
  { mime: 'image/jpeg', offset: 0, bytes: [0xff, 0xd8, 0xff] },
  // PNG — 89 50 4E 47 0D 0A 1A 0A
  { mime: 'image/png', offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
];

function matches(buf: Uint8Array, sig: MagicSignature): boolean {
  if (buf.length < sig.offset + sig.bytes.length) return false;
  for (let i = 0; i < sig.bytes.length; i++) {
    const expected = sig.bytes[i];
    if (expected === -1) continue;
    if (buf[sig.offset + i] !== expected) return false;
  }
  return true;
}

/**
 * Détecte le vrai MIME d'un buffer à partir de ses premiers octets.
 * Retourne `null` si aucun format supporté n'est détecté.
 */
export function detectMime(buffer: Buffer | Uint8Array): AllowedMime | null {
  const view = buffer instanceof Buffer ? buffer.subarray(0, 16) : buffer.slice(0, 16);
  for (const sig of SIGNATURES) {
    if (matches(view, sig)) return sig.mime;
  }
  return null;
}

export interface ValidateOptions {
  /** Liste blanche des MIME acceptés. Par défaut : tous les MIME supportés. */
  allowed?: AllowedMime[];
  /** Taille max en octets. Par défaut : 10 Mo. */
  maxBytes?: number;
  /** Taille min en octets — utile pour détecter les fichiers vides. Défaut : 100. */
  minBytes?: number;
}

export type ValidationResult =
  | { ok: true; mime: AllowedMime; size: number }
  | { ok: false; error: string };

const DEFAULT_MAX = 10 * 1024 * 1024; // 10 Mo
const DEFAULT_MIN = 100; // 100 octets — en dessous c'est forcément invalide

/**
 * Valide un buffer uploadé :
 *  - taille dans les bornes
 *  - magic-bytes correspondent à un MIME supporté
 *  - MIME détecté présent dans la liste blanche `allowed`
 *
 * Retourne le MIME détecté côté serveur (à utiliser pour `ContentType` du upload,
 * jamais celui envoyé par le client).
 */
export function validateFileBuffer(
  buffer: Buffer | Uint8Array,
  opts: ValidateOptions = {},
): ValidationResult {
  const max = opts.maxBytes ?? DEFAULT_MAX;
  const min = opts.minBytes ?? DEFAULT_MIN;

  if (buffer.length < min) {
    return { ok: false, error: `Fichier vide ou trop petit (${buffer.length} octets, min ${min})` };
  }
  if (buffer.length > max) {
    const sizeMb = (buffer.length / 1024 / 1024).toFixed(1);
    const maxMb = (max / 1024 / 1024).toFixed(1);
    return { ok: false, error: `Fichier trop volumineux (${sizeMb} Mo, max ${maxMb} Mo)` };
  }

  const detected = detectMime(buffer);
  if (!detected) {
    return {
      ok: false,
      error: 'Format de fichier non reconnu. Formats acceptés : PDF, JPG, PNG.',
    };
  }

  const allowed = opts.allowed ?? (['application/pdf', 'image/jpeg', 'image/png'] as AllowedMime[]);
  if (!allowed.includes(detected)) {
    return {
      ok: false,
      error: `Format ${detected} non autorisé pour ce type de pièce. Acceptés : ${allowed.join(', ')}.`,
    };
  }

  return { ok: true, mime: detected, size: buffer.length };
}
