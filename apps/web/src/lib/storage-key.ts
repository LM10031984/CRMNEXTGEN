/**
 * Génération de clés storage non-prédictibles (anti-IDOR).
 *
 * Sprint 1 — Sécurité : les anciens chemins type
 *   `{token}/cni-{Date.now()}.pdf`
 * sont devinables si on connaît le token de pré-inscription (les pré-inscriptions
 * publiques exposent ce token dans l'URL `/preinscription/{token}`). Un attaquant
 * pouvait construire l'URL d'un fichier d'un autre dossier.
 *
 * Solution : on remplace le segment time-stamp par un UUID v4. Les chemins
 * deviennent imprévisibles même si l'attaquant connaît le préfixe tenant/token.
 *
 * On préserve un préfixe lisible (tenantId ou token) pour faciliter le debug
 * et l'organisation MinIO/Supabase, et on ajoute un fragment `YYYY-MM` pour
 * regrouper par mois (utile pour les politiques de rétention par lifecycle).
 */

import { randomUUID } from 'node:crypto';

/** Catégories de pièces — sert au préfixe lisible dans le chemin. */
export type StorageKind = 'cni' | 'rib' | 'cfp' | 'signature' | 'doc' | 'invoice' | 'closure';

/** Liste blanche des extensions acceptables (alignée sur file-validation.ts). */
const SAFE_EXT = new Set(['pdf', 'jpg', 'jpeg', 'png']);

function sanitizeExt(originalName: string | undefined, fallback = 'bin'): string {
  if (!originalName) return fallback;
  const ext = originalName.split('.').pop()?.toLowerCase() ?? fallback;
  if (!/^[a-z0-9]+$/.test(ext)) return fallback;
  return SAFE_EXT.has(ext) ? ext : fallback;
}

function yyyymm(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Génère une clé pour un fichier de pré-inscription publique.
 * Préfixe = token (utile pour scoper les permissions par dossier), puis UUID.
 *
 * Exemple : `abc123token/2026-06/cni-3f9d8e4b-...pdf`
 */
export function buildPreEnrollmentKey(
  token: string,
  kind: StorageKind,
  originalName?: string,
): string {
  const ext = sanitizeExt(originalName);
  return `${token}/${yyyymm()}/${kind}-${randomUUID()}.${ext}`;
}

/**
 * Génère une clé scopée par tenant (pour tout upload authentifié).
 *
 * Exemple : `tenant_abc/2026-06/invoice-3f9d8e4b-...pdf`
 */
export function buildTenantKey(
  tenantId: string,
  kind: StorageKind,
  originalName?: string,
): string {
  const ext = sanitizeExt(originalName);
  return `${tenantId}/${yyyymm()}/${kind}-${randomUUID()}.${ext}`;
}
