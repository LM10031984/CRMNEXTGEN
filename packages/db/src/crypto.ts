/**
 * Chiffrement at-rest des données sensibles (Sprint 1 — RGPD).
 *
 * Pourquoi pgcrypto ?
 *  - Décision Laurent (2026-06-09) : on reste Postgres-native, pas de KMS.
 *  - L'extension `pgcrypto` est dispo sur Postgres 16 ET sur Supabase managé
 *    (déjà activée par défaut côté Supabase) → fonctionne en local ET prod.
 *  - Format "PGP armored" : ciphertext encodé en ASCII (lisible, copiable)
 *    → on garde le type `String?` dans Prisma, pas de churn sur le schéma.
 *
 * Algo : AES-256 + SHA-512 (defaults pgcrypto sont AES-128/SHA-1 = trop faible
 * en 2026). On passe explicitement `s2k-cipher-algo=aes256` et `s2k-digest-algo=sha512`.
 *
 * Clé : variable d'env `DATA_ENCRYPTION_KEY` (min 32 chars random).
 * Si absente en prod, on REFUSE de chiffrer/déchiffrer (throw) — préférable à
 * une falsy clé silencieuse qui rendrait les données illisibles plus tard.
 *
 * Rotation : pour rotation de clé, voir `scripts/rotate-encryption-key.ts`
 * (à venir si besoin — pas implémenté Sprint 1).
 */

import { prisma } from './index';

const PGP_OPTIONS = 's2k-cipher-algo=aes256, s2k-digest-algo=sha512, s2k-mode=3';

function getKey(): string {
  const key = process.env.DATA_ENCRYPTION_KEY;
  if (!key || key.length < 32) {
    throw new Error(
      'DATA_ENCRYPTION_KEY manquante ou < 32 chars. Génère avec `openssl rand -hex 32` et place dans .env.',
    );
  }
  return key;
}

/**
 * Chiffre une chaîne avec pgp_sym_encrypt_armor (ASCII output).
 * Retourne `null` si l'entrée est null/empty.
 *
 * Le résultat commence toujours par `-----BEGIN PGP MESSAGE-----` et fait
 * environ 200-300 chars pour un N° de Sécu (vs 15 chars en clair).
 */
export async function encryptSensitive(plaintext: string | null | undefined): Promise<string | null> {
  if (plaintext == null || plaintext === '') return null;
  const key = getKey();
  const rows = await prisma.$queryRaw<Array<{ enc: string }>>`
    SELECT pgp_sym_encrypt_armor(${plaintext}::text, ${key}, ${PGP_OPTIONS}) AS enc
  `;
  return rows[0]?.enc ?? null;
}

/**
 * Déchiffre une chaîne pgp_sym_encrypt_armor.
 * Retourne `null` si l'entrée est null/empty.
 *
 * Lève si le ciphertext est invalide ou si la clé ne correspond pas — un
 * appelant qui veut tolérer ces erreurs doit wrapper dans try/catch.
 */
export async function decryptSensitive(ciphertext: string | null | undefined): Promise<string | null> {
  if (ciphertext == null || ciphertext === '') return null;
  // Détection : si la valeur ne ressemble pas à un message PGP armored, on
  // suppose qu'elle est en clair (donnée pré-migration) et on la retourne telle quelle.
  // Permet une transition graceful sans casser les lectures avant migration data.
  if (!ciphertext.startsWith('-----BEGIN PGP MESSAGE-----')) {
    return ciphertext;
  }
  const key = getKey();
  const rows = await prisma.$queryRaw<Array<{ dec: string }>>`
    SELECT pgp_sym_decrypt_armor(${ciphertext}::text, ${key}) AS dec
  `;
  return rows[0]?.dec ?? null;
}

/**
 * Helper batch pour déchiffrer plusieurs champs en une seule round-trip SQL.
 * À privilégier dans les listes (sinon N+1 = N queries Postgres).
 *
 * Renvoie un tableau dans le même ordre que l'entrée, avec null aux positions
 * où le déchiffrement a échoué (au lieu de throw — utile pour les listes).
 */
export async function decryptSensitiveBatch(
  ciphertexts: Array<string | null | undefined>,
): Promise<Array<string | null>> {
  if (ciphertexts.length === 0) return [];
  const key = getKey();

  // On garde l'index original pour reconstituer l'ordre.
  const toDecrypt: Array<{ idx: number; ct: string }> = [];
  const result: Array<string | null> = new Array(ciphertexts.length).fill(null);

  ciphertexts.forEach((ct, idx) => {
    if (ct == null || ct === '') return;
    if (!ct.startsWith('-----BEGIN PGP MESSAGE-----')) {
      result[idx] = ct; // legacy plain — passe-through
      return;
    }
    toDecrypt.push({ idx, ct });
  });

  if (toDecrypt.length === 0) return result;

  // unnest pour batcher tous les déchiffrements dans une seule query.
  const ciphers = toDecrypt.map((x) => x.ct);
  const rows = await prisma.$queryRaw<Array<{ idx: number; dec: string | null }>>`
    SELECT
      gs.ord - 1 AS idx,
      pgp_sym_decrypt_armor(c.ct::text, ${key}) AS dec
    FROM unnest(${ciphers}::text[]) WITH ORDINALITY AS gs(ct, ord)
    JOIN LATERAL (SELECT gs.ct AS ct) c ON true
  `;

  rows.forEach((row) => {
    const target = toDecrypt[row.idx];
    if (target) result[target.idx] = row.dec;
  });

  return result;
}

/**
 * Détermine si une valeur est déjà chiffrée (commence par le header PGP).
 * Utile pour les scripts de migration data idempotents.
 */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith('-----BEGIN PGP MESSAGE-----');
}
