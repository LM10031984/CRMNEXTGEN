/**
 * Qui peut recevoir une alerte interne — SOURCE UNIQUE.
 *
 * `equipe()` renvoyait TOUS les `User` du tenant, sans filtre. Or deux d'entre
 * eux n'ont pas de boîte : `e2e@start-academy.fr`, le compte dont Playwright a
 * besoin, et `admin@startacademy.fr`, un compte historique. Chaque alerte A-2
 * produisait donc deux bounces sur `formation@`, la boîte expéditrice
 * elle-même (constat Laurent du 11/09/2026).
 *
 * Une alerte qui salit la boîte qu'elle est censée servir finit par être
 * ignorée, et les bounces répétés abîment la réputation d'envoi du domaine.
 *
 * DEUX MOTIFS D'EXCLUSION, distincts à dessein :
 *
 *  - `disabledAt` — le compte a été désactivé. Il ne doit plus rien recevoir,
 *    et `validateRequest` le rejette déjà côté connexion.
 *
 *  - `isServiceAccount` — le compte existe pour une machine. Il doit rester
 *    ACTIF, parce que Playwright s'y connecte, mais ne jamais être écrit.
 *    Désactiver `e2e@` casserait la suite E2E ; ne pas le marquer laisserait
 *    les bounces. D'où un drapeau séparé plutôt qu'un détournement de
 *    `disabledAt`.
 *
 * MODULE PUR : le filtre Prisma n'importe qu'un type.
 */

import type { Prisma } from '@qualiof/db';

/** Filtre Prisma sur `User`. À fusionner avec le `where` de l'appelant. */
export const EQUIPE_JOIGNABLE: Prisma.UserWhereInput = {
  disabledAt: null,
  isServiceAccount: false,
};

/** Forme minimale d'un utilisateur déjà chargé, vue par la règle. */
export interface UtilisateurJoignableLike {
  id: string;
  role: string;
  email: string | null;
  disabledAt?: Date | null;
  isServiceAccount?: boolean | null;
}

/**
 * Même règle, appliquée en mémoire — pour les appelants qui ont déjà la liste
 * et ne veulent pas d'une requête de plus. Le résultat doit rester identique à
 * celui de `EQUIPE_JOIGNABLE`, à l'adresse près : on vérifie ici qu'elle est
 * réellement renseignée, ce qu'un `where` ne dit pas d'une chaîne vide.
 */
export function estJoignable(u: UtilisateurJoignableLike): boolean {
  if (u.disabledAt != null) return false;
  if (u.isServiceAccount === true) return false;

  return typeof u.email === 'string' && u.email.trim() !== '';
}

/** Le même filtre, sur une liste, dans l'ordre reçu. */
export function filtrerJoignables<T extends UtilisateurJoignableLike>(users: readonly T[]): T[] {
  return users.filter(estJoignable);
}
