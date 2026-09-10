/**
 * Le lien public de la proposition (spec §9.4) — module PUR.
 *
 * Il vit ici, et pas dans les server actions, pour une raison de plateforme :
 * un module `'use server'` ne peut exporter que des fonctions asynchrones. Ces
 * deux-là sont synchrones par nature, et sont utilisées des deux côtés — par
 * l'action qui émet le lien, et par la route publique qui le vérifie. Une
 * seule définition, donc une seule façon de comparer.
 *
 * Doctrine portée du repo diag : le token brut n'est JAMAIS stocké. Seule son
 * empreinte SHA-256 vit en base, et la comparaison est à temps constant.
 */

import { createHash, timingSafeEqual } from 'node:crypto';

/** Longueur du token brut, en octets — 256 bits. */
export const PUBLIC_TOKEN_BYTES = 32;

export function hashPublicToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Comparaison à temps constant de deux empreintes.
 *
 * Les deux entrées font 64 caractères hexadécimaux par construction ; la garde
 * de longueur évite l'exception de `timingSafeEqual` sur une valeur tronquée,
 * sans jamais court-circuiter la comparaison utile.
 */
export function publicTokenMatches(candidateHash: string, storedHash: string): boolean {
  const a = Buffer.from(candidateHash, 'utf8');
  const b = Buffer.from(storedHash, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Un token brut a exactement cette forme — tout le reste est refusé d'emblée. */
export function isWellFormedPublicToken(token: string): boolean {
  return new RegExp(`^[0-9a-f]{${PUBLIC_TOKEN_BYTES * 2}}$`).test(token);
}
