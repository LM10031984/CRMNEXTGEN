/**
 * RBAC guard — Phase 8 (D-08 CONTEXT.md).
 *
 * Helpers centralisés pour protéger les server actions sensibles.
 *
 * Pattern d'usage dans une server action :
 *
 *   'use server';
 *   import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
 *
 *   export async function disableUser(userId: string): Promise<ActionResult> {
 *     try {
 *       const admin = await requireRole(['ADMIN']);
 *       // ... admin.id, admin.tenantId, admin.role dispo (déjà tenant-scoped)
 *       return { ok: true };
 *     } catch (e) {
 *       if (e instanceof UnauthorizedError) return { ok: false, error: e.message };
 *       if (e instanceof ForbiddenError)    return { ok: false, error: e.message };
 *       throw e; // erreurs inattendues → 500
 *     }
 *   }
 *
 * Pourquoi `throw` plutôt que `{ ok: false }` directement ?
 *  - `requireRole` est un guard interne qui se compose avec `try/catch` ergonomique
 *    (early return naturel sans `if (!result.ok) return`).
 *  - Le pattern `{ ok, ... }` est réservé aux retours de Server Action (UI consumer).
 *
 * Le check `user.disabledAt` est déjà géré dans `validateRequest()` (auth.ts) —
 * si un user désactivé arrive ici, `validateRequest` a déjà retourné `user: null`
 * et invalidé la session.
 */

import type { User as LuciaUser } from 'lucia';
import type { UserRole } from '@qualiof/db';
import { validateRequest } from './auth';

/**
 * Pas d'utilisateur connecté (cookie session absent/invalide) OU compte désactivé
 * (session invalidée par `validateRequest`).
 * Côté UI Server Action : retourner `{ ok: false, error: e.message }` puis afficher toast.
 */
export class UnauthorizedError extends Error {
  constructor(message = 'Non authentifié') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Utilisateur authentifié mais son rôle ne lui permet pas cette action.
 * Distinct de `UnauthorizedError` : ici on sait qui est le user (utile pour audit).
 */
export class ForbiddenError extends Error {
  constructor(message = 'Accès refusé') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/**
 * Guard principal — combine auth + role check en 1 appel.
 *
 * - Lève `UnauthorizedError` si pas de session valide
 * - Lève `ForbiddenError` si le rôle n'est pas dans `allowed`
 * - Sinon retourne le `LuciaUser` (typé avec `id`, `email`, `role`, `tenantId`, …)
 *
 * Note : `disabledAt` est déjà géré dans `validateRequest()` — si on arrive ici,
 * l'user est forcément actif.
 *
 * @example
 *   const admin = await requireRole(['ADMIN']);
 *   const editor = await requireRole(['ADMIN', 'MANAGER']);
 */
export async function requireRole(allowed: UserRole[]): Promise<LuciaUser> {
  const { user } = await validateRequest();
  if (!user) throw new UnauthorizedError();
  if (!allowed.includes(user.role as UserRole)) {
    throw new ForbiddenError(`Rôle ${user.role} non autorisé`);
  }
  return user;
}

/**
 * Helper pur (pas d'I/O) pour tester un rôle déjà résolu côté Server Component
 * (par ex. dans un layout qui a déjà appelé `validateRequest`).
 *
 * @example
 *   const { user } = await validateRequest();
 *   if (user && hasRole(user, ['ADMIN'])) { ... afficher UI admin ... }
 */
export function hasRole(user: LuciaUser, allowed: UserRole[]): boolean {
  return allowed.includes(user.role as UserRole);
}
