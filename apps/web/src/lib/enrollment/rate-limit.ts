/**
 * Limitation de débit en mémoire, pour le formulaire public.
 *
 * Volontairement simple : en serverless, le compteur est par instance, donc
 * c'est un garde-fou contre le remplissage automatisé, PAS une protection
 * anti-DDoS. Suffisant ici — le lien n'est diffusé qu'aux stagiaires d'une
 * session, et la vraie contrainte (capacityMax) est déjà côté base.
 */

const compteurs = new Map<string, number[]>();

export function rateLimitOk(cle: string, max: number, fenetreMs: number): boolean {
  const maintenant = Date.now();
  const recents = (compteurs.get(cle) ?? []).filter((t) => maintenant - t < fenetreMs);
  if (recents.length >= max) {
    compteurs.set(cle, recents);
    return false;
  }
  recents.push(maintenant);
  compteurs.set(cle, recents);
  return true;
}

/** Réservé aux tests. */
export function _resetRateLimit(): void {
  compteurs.clear();
}
