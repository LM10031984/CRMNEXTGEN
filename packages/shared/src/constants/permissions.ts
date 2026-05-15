/**
 * RBAC permissions matrix — Phase 8 source de vérité unique (D-02 CONTEXT.md).
 *
 * 6 rôles × 16 sections UI. Chaque cellule contient :
 *  - `'RW'` : lecture + écriture
 *  - `'R'`  : lecture seule
 *  - absent : section cachée dans la sidebar + route protégée serveur
 *
 * Note Phase 8 : FORMATEUR sur `sessions` = `'R'` (le scoping personnel
 * "ses sessions uniquement" est reporté Phase 9 — nécessite `User.personId`
 * link qui n'existe pas encore).
 *
 * Consommateurs :
 *  - `apps/web/src/lib/rbac.ts` : `requireRole` côté server action
 *  - `apps/web/src/components/layout/nav-config.ts` : `allowedRoles` par item
 *  - Pages `/app/parametres/utilisateurs` & `/app/parametres/historique` :
 *    encadrer l'accès par `canRead(role, 'users')` etc.
 */

import type { UserRole } from '@qualiof/db';

/** Sections fonctionnelles de l'UI alignées sur la sidebar + paramètres. */
export type AppSection =
  | 'dashboard'
  | 'learners'
  | 'sessions'
  | 'products'
  | 'trainers'
  | 'leads'
  | 'preenrollments'
  | 'opcoFiles'
  | 'budgetAgefice'
  | 'invoices'
  | 'funders'
  | 'organizations'
  | 'qualiopiBilan'
  | 'tenantSettings'
  | 'users'
  | 'auditHistory';

export type Permission = 'R' | 'RW';

/**
 * Matrice canonique D-02. Une cellule absente = accès interdit (cellule "–" dans
 * la table CONTEXT.md). Une présence avec `'R'` ou `'RW'` = lecture ou écriture.
 */
export const PERMISSIONS: Record<AppSection, Partial<Record<UserRole, Permission>>> = {
  dashboard: {
    ADMIN: 'RW',
    MANAGER: 'RW',
    COMMERCIAL: 'R',
    FORMATEUR: 'R',
    COMPTABLE: 'R',
    LECTEUR: 'R',
  },
  learners: {
    ADMIN: 'RW',
    MANAGER: 'RW',
    COMMERCIAL: 'RW',
    FORMATEUR: 'R',
    COMPTABLE: 'R',
    LECTEUR: 'R',
  },
  // Phase 8 : FORMATEUR=R sur sessions. Phase 9 ajoutera le scoping personnel
  // ("ses sessions uniquement") via `User.personId` ↔ `SessionTrainer.personId`.
  sessions: {
    ADMIN: 'RW',
    MANAGER: 'RW',
    COMMERCIAL: 'RW',
    FORMATEUR: 'R',
    COMPTABLE: 'R',
    LECTEUR: 'R',
  },
  products: {
    ADMIN: 'RW',
    MANAGER: 'RW',
    COMMERCIAL: 'R',
    FORMATEUR: 'R',
    COMPTABLE: 'R',
    LECTEUR: 'R',
  },
  trainers: {
    ADMIN: 'RW',
    MANAGER: 'RW',
    FORMATEUR: 'R',
    LECTEUR: 'R',
  },
  leads: {
    ADMIN: 'RW',
    MANAGER: 'RW',
    COMMERCIAL: 'RW',
  },
  preenrollments: {
    ADMIN: 'RW',
    MANAGER: 'RW',
    COMMERCIAL: 'RW',
  },
  opcoFiles: {
    ADMIN: 'RW',
    MANAGER: 'RW',
    COMMERCIAL: 'RW',
    COMPTABLE: 'RW',
    LECTEUR: 'R',
  },
  budgetAgefice: {
    ADMIN: 'RW',
    MANAGER: 'RW',
    COMMERCIAL: 'R',
    COMPTABLE: 'RW',
    LECTEUR: 'R',
  },
  invoices: {
    ADMIN: 'RW',
    MANAGER: 'RW',
    COMPTABLE: 'RW',
    LECTEUR: 'R',
  },
  funders: {
    ADMIN: 'R',
    MANAGER: 'R',
    COMMERCIAL: 'R',
    COMPTABLE: 'R',
  },
  organizations: {
    ADMIN: 'RW',
    MANAGER: 'RW',
    COMMERCIAL: 'RW',
    FORMATEUR: 'R',
    COMPTABLE: 'R',
    LECTEUR: 'R',
  },
  qualiopiBilan: {
    ADMIN: 'RW',
    MANAGER: 'RW',
    FORMATEUR: 'R',
    COMPTABLE: 'R',
  },
  tenantSettings: {
    ADMIN: 'RW',
  },
  users: {
    ADMIN: 'RW',
  },
  auditHistory: {
    ADMIN: 'R',
  },
};

/**
 * `true` si `role` peut lire (R ou RW) la section donnée.
 * Retourne `false` si le rôle n'a aucune entrée dans la matrice pour cette section.
 */
export function canRead(role: UserRole, section: AppSection): boolean {
  const p = PERMISSIONS[section][role];
  return p === 'R' || p === 'RW';
}

/**
 * `true` si `role` peut écrire (RW) la section donnée. Lecture seule renvoie `false`.
 */
export function canWrite(role: UserRole, section: AppSection): boolean {
  return PERMISSIONS[section][role] === 'RW';
}

/**
 * Liste les rôles ayant accès à `section` selon le mode demandé :
 *  - `'R'`  : tous les rôles avec R ou RW (lecteurs + éditeurs)
 *  - `'RW'` : seulement ceux avec RW
 *
 * Utile pour générer la prop `allowedRoles` d'un item de navigation, ou pour
 * paramétrer `requireRole` à partir d'une section : `requireRole(rolesWithAccess('users', 'RW'))`.
 */
export function rolesWithAccess(section: AppSection, mode: Permission): UserRole[] {
  const entries = Object.entries(PERMISSIONS[section]) as [UserRole, Permission][];
  return entries
    .filter(([, p]) => (mode === 'R' ? p === 'R' || p === 'RW' : p === 'RW'))
    .map(([r]) => r);
}
