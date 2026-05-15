/**
 * Zod schemas Utilisateurs — Phase 8 Plan 08-01 Task 2.
 *
 * 3 schémas indépendants consommés par les server actions `users.ts` (Plan 08-02)
 * et les UI Plan 08-04 :
 *  - `inviteUserSchema`     : modale "Inviter un utilisateur" + server action `inviteUser`
 *  - `setPasswordSchema`    : page publique `/invitation/[token]` (set MDP initial OU reset)
 *  - `changeUserRoleSchema` : action `changeUserRole` (admin change le rôle d'un user)
 *
 * Décisions clés :
 *  - email : preprocess `trim().toLowerCase()` puis validation (cohérent base
 *    de données Postgres case-insensitive sur les emails)
 *  - password : 8 chars min, 128 chars max (Argon2 OK >> 1KB, mais OWASP recommande
 *    ne pas être strict au-delà de 64-128)
 *  - role : enum littéral pour rester découplé de l'import Prisma côté client
 *    (cohérent pattern Phase 7 `tenantBillingSchema` qui n'importe rien de Prisma).
 */

import { z } from 'zod';

/**
 * Enum des 6 rôles RBAC. Doublon volontaire du `UserRole` Prisma — on évite
 * d'importer `@qualiof/db` dans `@qualiof/shared` (consommé côté client) pour
 * garder le bundle léger et éviter les soucis de tree-shaking. Si l'enum Prisma
 * change, ce literal doit être mis à jour (un seul endroit, vérifié au build
 * par TypeScript via les imports croisés dans `apps/web`).
 */
const userRoleEnum = z.enum([
  'ADMIN',
  'MANAGER',
  'FORMATEUR',
  'COMMERCIAL',
  'COMPTABLE',
  'LECTEUR',
]);

/**
 * Invitation d'un nouvel utilisateur par l'admin (D-04 flow).
 *
 * `email` est normalisé en lowercase + trim avant validation pour éviter les
 * doublons d'invitations à `Foo@bar.fr` vs `foo@bar.fr`.
 */
export const inviteUserSchema = z.object({
  email: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v),
    z.string().email('Email invalide').max(254, 'Email trop long (max 254 caractères)'),
  ),
  firstName: z
    .string()
    .min(1, 'Prénom requis')
    .max(80, 'Prénom trop long (max 80 caractères)'),
  lastName: z
    .string()
    .min(1, 'Nom requis')
    .max(80, 'Nom trop long (max 80 caractères)'),
  role: userRoleEnum,
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

/**
 * Définition initiale OU réinitialisation du mot de passe (D-04 + D-06).
 *
 * Double saisie obligatoire (`password` + `confirm`). Refine sur égalité — le
 * message d'erreur est attaché au champ `confirm` pour UX form (le user corrige
 * le 2e champ, pas le 1er qu'il a tapé correctement).
 *
 * 8 chars min = recommandation OWASP 2026 pour MDP utilisateur métier (avec
 * MFA en bonus = idéal, mais hors scope Phase 8).
 */
export const setPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, '8 caractères minimum')
      .max(128, '128 caractères maximum'),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirm'],
  });
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;

/**
 * Changement de rôle d'un utilisateur existant par l'admin (action `changeUserRole`).
 *
 * `userId` validé comme UUID strict (cohérent avec les IDs Prisma `@id @default(uuid())`).
 */
export const changeUserRoleSchema = z.object({
  userId: z.string().uuid('Identifiant utilisateur invalide'),
  role: userRoleEnum,
});
export type ChangeUserRoleInput = z.infer<typeof changeUserRoleSchema>;
