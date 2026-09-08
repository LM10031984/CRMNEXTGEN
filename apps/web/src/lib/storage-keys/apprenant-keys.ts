/**
 * Validation des clés de stockage remontées par le NAVIGATEUR après un upload
 * direct (pièces d'un apprenant : CNI, RIB, attestation CFP).
 *
 * Pourquoi ce module existe (quick 260908-lrj) : depuis l'upload direct-to-storage
 * (Phase 18), le client envoie son fichier à Supabase puis renvoie au serveur la
 * CLÉ de l'objet. Cette clé est une donnée d'entrée comme une autre — le serveur
 * la stocke sur la fiche apprenant, et désormais il la LIT pour le pré-remplissage
 * IA. Sans contrôle, un utilisateur pourrait renvoyer la clé d'un objet
 * appartenant à un autre tenant et se la faire lire ou attacher.
 *
 * `createApprenantUploadUrl` construit toujours `apprenants/<tenantId>/<uuid>/<kind>.<ext>` :
 * exiger ce préfixe suffit à garantir le cloisonnement, sans registre supplémentaire.
 */

/** Préfixe attendu pour toute pièce d'apprenant d'un tenant donné. */
export function apprenantKeyPrefix(tenantId: string): string {
  return `apprenants/${tenantId}/`;
}

/**
 * Vraie si la clé appartient bien à ce tenant. Rejette aussi les tentatives de
 * remontée d'arborescence (`..`) et les clés absolues, qu'un préfixe seul ne
 * couvrirait pas.
 */
export function isOwnApprenantKey(key: string | null | undefined, tenantId: string): boolean {
  if (!key || !tenantId) return false;
  if (key.includes('..') || key.startsWith('/')) return false;
  return key.startsWith(apprenantKeyPrefix(tenantId));
}

/**
 * Ne garde que les clés du tenant. Retourne les clés acceptées et les `kind`
 * refusés, pour que l'appelant puisse échouer bruyamment plutôt qu'ignorer en
 * silence une clé étrangère.
 */
export function filterOwnApprenantKeys<K extends string>(
  keys: Partial<Record<K, string>>,
  tenantId: string,
): { accepted: Partial<Record<K, string>>; rejected: K[] } {
  const accepted: Partial<Record<K, string>> = {};
  const rejected: K[] = [];
  for (const [kind, key] of Object.entries(keys) as Array<[K, string | undefined]>) {
    if (!key) continue;
    if (isOwnApprenantKey(key, tenantId)) accepted[kind] = key;
    else rejected.push(kind);
  }
  return { accepted, rejected };
}
