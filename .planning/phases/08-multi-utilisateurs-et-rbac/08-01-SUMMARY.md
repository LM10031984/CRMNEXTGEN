---
phase: 08-multi-utilisateurs-et-rbac
plan: 01
subsystem: rbac-foundation
tags: [rbac, prisma-migration, zod-schemas, lucia, auth]
dependency-graph:
  requires:
    - phase-07-AuditLog-convention (parameters.* namespace posée)
    - lucia-3.2.2 (validateRequest cache)
    - argon2 (déjà installé, pas modifié ici)
  provides:
    - User soft-delete (disabledAt) + invitation metadata (invitedAt/invitedBy/lastLoginAt)
    - UserInvitation model (token public route + role + expiresAt)
    - @qualiof/shared > PERMISSIONS matrix (16 sections × 6 rôles) + canRead/canWrite/rolesWithAccess
    - @qualiof/shared > inviteUserSchema + setPasswordSchema + changeUserRoleSchema
    - apps/web/lib/rbac.ts > requireRole + hasRole + UnauthorizedError + ForbiddenError
    - validateRequest() rejette automatiquement les users disabledAt != null + invalide leur session
    - Lucia DatabaseUserAttributes étendu (disabledAt: Date | null exposé via getUserAttributes)
  affects:
    - apps/web/src/lib/auth.ts (extension getUserAttributes + validateRequest check disabledAt)
    - packages/shared/src/constants/index.ts (barrel + permissions)
    - packages/shared/src/schemas/index.ts (barrel + user)
tech-stack:
  added: []
  patterns:
    - "Soft-delete via nullable timestamp column (disabledAt) au lieu de boolean isActive — préserve les FK historiques (AuditLog.userId, Lead.assignedTo)"
    - "Lucia DatabaseUserAttributes augmenté via declare module 'lucia' (typage globalement étendu, getUserAttributes hydraté)"
    - "Token clair en BDD (UserInvitation.token @unique) — single-use + expiresAt 7j + 128 bits entropie suffisent (cf RESEARCH Finding #4)"
    - "Zod preprocess pour normaliser email (trim + lowercase) avant validation — cohérent pattern Phase 7 tenant IBAN/BIC"
    - "Discriminated error classes (UnauthorizedError vs ForbiddenError) avec .name explicite pour `instanceof` dans server actions"
key-files:
  created:
    - packages/db/prisma/migrations/20260515130856_phase_08_users_rbac/migration.sql
    - packages/shared/src/constants/permissions.ts
    - packages/shared/src/constants/__tests__/permissions.test.ts
    - packages/shared/src/schemas/user.ts
    - packages/shared/src/schemas/__tests__/user.test.ts
    - apps/web/src/lib/rbac.ts
    - apps/web/src/lib/__tests__/rbac.test.ts
  modified:
    - packages/db/prisma/schema.prisma (User +4 cols nullables, +1 relation; +1 model UserInvitation; +1 index User[tenantId,disabledAt])
    - packages/shared/src/constants/index.ts (+ export permissions)
    - packages/shared/src/schemas/index.ts (+ export user)
    - apps/web/src/lib/auth.ts (getUserAttributes +disabledAt, DatabaseUserAttributes +disabledAt, validateRequest rejet user désactivé + invalidation session)
decisions:
  - "Token UserInvitation stocké en clair (pas Argon2 hashé) — single-use + expiration 7j + 128 bits via randomUUID = sécurité suffisante, et permet query directe where: { token } (cf RESEARCH Finding #4 + Alternative Considered RBAC-Argon2-token)"
  - "Enum UserRole dupliqué en literal Zod dans packages/shared/schemas/user.ts au lieu d'importer @qualiof/db — évite de polluer le bundle client + cohérent pattern tenantBillingSchema Phase 7 (n'importe pas Prisma)"
  - "Check disabledAt placé APRÈS lucia.validateSession et AVANT cookie maintenance dans validateRequest (cf RESEARCH Pitfall #1) — sinon impossible de lire user.disabledAt"
  - "@@index([tenantId, disabledAt]) ajouté sur User pour permettre la requête `where: { tenantId, disabledAt: null }` (liste des users actifs Phase 8 Plan 04) performante"
  - "UserInvitation.invitedBy laissé String (pas FK Prisma relation) pour éviter le cycle User -> UserInvitation -> User (Prisma relation explicite ferait planter le generate). Le constraint reste applicatif (server actions valident l'existence)"
metrics:
  duration: "~6 min"
  completed-date: "2026-05-15T13:13:50Z"
  tasks-completed: 3
  files-created: 7
  files-modified: 4
  tests-added: 32
---

# Phase 8 Plan 01: Foundation RBAC + Schemas — Summary

Fondations RBAC pour Phase 8 posées : extension du model `User` (soft-delete via `disabledAt`, métadonnées invitation), nouveau model `UserInvitation` (token public single-use), matrice permissions 16 sections × 6 rôles dans `@qualiof/shared`, 3 schémas Zod user, helper `requireRole`/`hasRole` côté server action, et extension Lucia `validateRequest()` qui invalide automatiquement la session des users désactivés.

## Tasks Completed

| Task | Name | Files | Tests |
|------|------|-------|-------|
| 1 | Migration Prisma User + UserInvitation | schema.prisma + migration 20260515130856_phase_08_users_rbac | n/a (BDD applied) |
| 2 | Matrice permissions + Zod schemas user | constants/permissions.ts + schemas/user.ts + 2 test files | 13 + 10 = 23 |
| 3 | lib/rbac.ts + extension auth.ts disabledAt | rbac.ts + auth.ts (extended) + rbac.test.ts | 9 |

**Total tests added** : **32 verts** (largement au-dessus du minimum 13 requis par le plan).

## Implementation Notes

### Task 1 — Migration Prisma

Migration `20260515130856_phase_08_users_rbac` appliquée sur la BDD locale Postgres :

- `User` reçoit 4 colonnes nullables : `disabledAt`, `lastLoginAt`, `invitedAt`, `invitedBy` (String, pas relation Prisma — évite cycle)
- `User` reçoit nouvel index `[tenantId, disabledAt]` pour query "users actifs du tenant" performante
- Nouveau model `UserInvitation` : id UUID, tenantId, email, **token @unique** (cleartext 32 hex per D-04), role enum, expiresAt, usedAt nullable, userId FK nullable (set après acceptance, onDelete: Cascade), invitedBy String requis, createdAt
- 3 index sur `UserInvitation` : `[tenantId]`, `[token]`, `[email, tenantId]`
- Relation inverse `User.invitations UserInvitation[] @relation("UserInvitations")` pour `prisma.user.findUnique({ include: { invitations: true } })` côté UI Plan 04

Migration safe (toutes colonnes nullables → seed admin existant reste actif avec `disabledAt=null`). Prisma Client régénéré, `UserInvitation` type exporté.

### Task 2 — Permissions matrix + Zod schemas

**`packages/shared/src/constants/permissions.ts`** encode D-02 exactement :

- 16 sections : dashboard, learners, sessions, products, trainers, leads, preenrollments, opcoFiles, budgetAgefice, invoices, funders, organizations, qualiopiBilan, tenantSettings, users, auditHistory
- Type `Permission = 'R' | 'RW'` ; absence d'entrée pour un rôle = section cachée
- 3 helpers : `canRead(role, section)`, `canWrite(role, section)`, `rolesWithAccess(section, mode)`
- **FORMATEUR=R sur sessions** (note explicite dans le commentaire : scoping personnel reporté Phase 9 via `User.personId`)

**`packages/shared/src/schemas/user.ts`** : 3 schémas Zod :

- `inviteUserSchema` : email avec preprocess `trim().toLowerCase()` + firstName/lastName 1-80 chars + role enum
- `setPasswordSchema` : password 8-128 chars + `confirm` + `.refine` égalité avec path `['confirm']`
- `changeUserRoleSchema` : userId UUID strict + role enum

Pattern enum littéral local (pas d'import `@qualiof/db`) cohérent avec `tenantBillingSchema` Phase 7 — évite de polluer le bundle client avec `@prisma/client`.

### Task 3 — rbac.ts + auth.ts extension

**`apps/web/src/lib/auth.ts`** modifié :

1. `getUserAttributes` retourne `disabledAt: data.disabledAt` (Lucia hydrate automatiquement depuis Prisma)
2. `declare module 'lucia'` étendu : `DatabaseUserAttributes.disabledAt: Date | null`
3. `validateRequest()` reçoit un check **après `validateSession`** : si `result.user.disabledAt != null` → `lucia.invalidateSession(result.session.id)` + blank cookie + retourne `{ user: null, session: null }`. Empêche les users désactivés de continuer à naviguer (au prochain request, ils sont déconnectés).

**`apps/web/src/lib/rbac.ts`** créé :

- `UnauthorizedError` (auth absente OU compte désactivé) avec `.name = 'UnauthorizedError'`
- `ForbiddenError` (auth OK mais rôle non autorisé) avec `.name = 'ForbiddenError'`
- `requireRole(allowed: UserRole[]): Promise<LuciaUser>` — async, throw or return user
- `hasRole(user, allowed): boolean` — pur, pour Server Components qui ont déjà appelé `validateRequest`

Le check `disabledAt` est déjà traité en amont dans `validateRequest`, donc `requireRole` peut considérer que tout `user` non-null est actif (pas de double check).

## Verification Results

```bash
# Migration appliquée + BDD en sync
pnpm --filter @qualiof/db db:migrate --skip-seed
# → "Already in sync, no schema change or pending migration was found."

# Tests @qualiof/shared : 46 passes (10 user + 13 permissions + 23 existants)
pnpm --filter @qualiof/shared test --run
# → Test Files  5 passed (5)
# → Tests  46 passed (46)

# Tests @qualiof/web : 84 passes (9 rbac + 75 existants)
pnpm --filter @qualiof/web test --run
# → Test Files  9 passed (9)
# → Tests  84 passed (84)

# Type-check apps/web : 0 erreur
pnpm --filter @qualiof/web exec tsc --noEmit
# → (silent, exit 0)

# Type-check packages/shared : 0 erreur
pnpm --filter @qualiof/shared exec tsc --noEmit
# → (silent, exit 0)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Test fix] `@ts-expect-error` directives unused dans user.test.ts**
- **Found during:** Task 2 — Type-check `pnpm --filter @qualiof/shared exec tsc --noEmit`
- **Issue:** `tsc` (strict mode) signalait `TS2578 Unused '@ts-expect-error' directive` sur les lignes `role: 'GOD'` et `role: 'SUPERUSER'`. Zod accepte `Record<string, unknown>` côté input (pas de typage strict du paramètre `.parse()` au compile-time), donc les valeurs invalides ne causent PAS d'erreur compile-time — uniquement runtime.
- **Fix:** Remplacement de `// @ts-expect-error` par `as unknown` (cast explicite équivalent fonctionnellement). Tests passent toujours (les `.parse()` lèvent bien à runtime).
- **Files modified:** `packages/shared/src/schemas/__tests__/user.test.ts` (2 occurrences)
- **Commit:** sera inclus dans le commit orchestrateur

**2. [Rule 1 — Bookkeeping] Suppression d'une migration "dummy_check" créée par erreur**
- **Found during:** Task 3 — vérification post-migration `prisma migrate dev --create-only --name dummy_check` exécutée pour debug a généré un dossier de migration vide (`20260515131320_dummy_check`).
- **Fix:** `rm -rf packages/db/prisma/migrations/20260515131320_dummy_check` avant qu'elle ne soit appliquée à la BDD. `prisma migrate status` confirme "Already in sync" — la migration n'a jamais été tracée dans `_prisma_migrations`.
- **Files modified:** suppression dossier `packages/db/prisma/migrations/20260515131320_dummy_check/` (avant qu'il ne soit committable)
- **Commit:** n/a (dossier supprimé, jamais committé)

### Plan Adherence

Aucune autre déviation. Les 3 tasks ont été exécutées exactement comme spécifié dans 08-01-PLAN.md. Les conventions Phase 7 (Zod preprocess pour normaliser, barrel exports `index.ts`, tests Vitest colocaliés `__tests__/`) ont été respectées à la lettre.

## Known Stubs

**Aucun stub introduit** — toutes les fondations sont fonctionnelles end-to-end :

- Migration appliquée, Prisma Client génère `UserInvitation` typé
- `PERMISSIONS` matrix complète (16 sections, valeurs réelles D-02)
- Schémas Zod fonctionnels (testés runtime sur 10 cas)
- `requireRole` opérationnel (mocké et testé sur 9 scénarios)
- `validateRequest` rejette réellement les users désactivés (path codé, pas de TODO)

Les Plans 08-02..08-06 consommeront ces briques sans avoir besoin de les compléter.

## Next Steps

Plan 08-02 peut maintenant être exécuté en Wave 2 :

- Server actions `users.ts` (`inviteUser`, `disableUser`, `enableUser`, `resetUserPassword`, `changeUserRole`, `resendInvitation`)
- Helper `lib/audit-log.ts` étendu avec `logUserAction` (convention `users.*` D-10)
- Email templates dans `apps/web/src/lib/mailer-templates/` (`user-invitation.ts`, `user-password-reset.ts`)
- Server action publique `acceptInvitation` (`apps/web/src/app/invitation/[token]/`)

Tous les imports nécessaires sont déjà exportés :

```typescript
import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import { inviteUserSchema, setPasswordSchema, changeUserRoleSchema, PERMISSIONS, canWrite, rolesWithAccess } from '@qualiof/shared';
```

## Self-Check: PASSED

**Files created (verified on disk):**

- `packages/db/prisma/migrations/20260515130856_phase_08_users_rbac/migration.sql` — FOUND
- `packages/shared/src/constants/permissions.ts` — FOUND
- `packages/shared/src/constants/__tests__/permissions.test.ts` — FOUND
- `packages/shared/src/schemas/user.ts` — FOUND
- `packages/shared/src/schemas/__tests__/user.test.ts` — FOUND
- `apps/web/src/lib/rbac.ts` — FOUND
- `apps/web/src/lib/__tests__/rbac.test.ts` — FOUND

**Files modified (verified contents):**

- `packages/db/prisma/schema.prisma` : `model UserInvitation` présent, `disabledAt`/`lastLoginAt`/`invitedAt`/`invitedBy` présents, `@@index([tenantId, disabledAt])` présent
- `packages/shared/src/constants/index.ts` : `export * from './permissions'` présent
- `packages/shared/src/schemas/index.ts` : `export * from './user'` présent
- `apps/web/src/lib/auth.ts` : `disabledAt` apparaît 4× (getUserAttributes + DatabaseUserAttributes + check validateRequest + commentaires)

**Acceptance Criteria:**

- [x] `grep -c "model UserInvitation" packages/db/prisma/schema.prisma` ≥ 1 ✓
- [x] `grep -c "disabledAt|lastLoginAt|invitedAt|invitedBy" packages/db/prisma/schema.prisma` ≥ 4 ✓ (7 occurrences)
- [x] Migration dir `20260515130856_phase_08_users_rbac` existe + appliquée
- [x] `prisma migrate status` → "Already in sync"
- [x] Prisma Client généré : `UserInvitation` exporté (vérifié dans `.prisma/client/index.d.ts`, 482 occurrences)
- [x] `grep -c "ADMIN|MANAGER|FORMATEUR|COMMERCIAL|COMPTABLE|LECTEUR" packages/shared/src/constants/permissions.ts` ≥ 30 ✓ (51 occurrences)
- [x] `grep -c "PERMISSIONS\[" packages/shared/src/constants/permissions.ts` ≥ 2 ✓ (3 usages dans canRead/canWrite/rolesWithAccess)
- [x] `grep -c "^export const" packages/shared/src/schemas/user.ts` ≥ 3 ✓ (inviteUserSchema, setPasswordSchema, changeUserRoleSchema)
- [x] Tests Vitest @qualiof/shared : 46 passes (largement ≥ 8)
- [x] `grep "^export \* from './user'" packages/shared/src/schemas/index.ts` ≥ 1 ✓
- [x] `grep -c "disabledAt" apps/web/src/lib/auth.ts` ≥ 3 ✓ (4 occurrences)
- [x] `grep -c "lucia.invalidateSession" apps/web/src/lib/auth.ts` ≥ 1 ✓ (1 nouveau call dans check disabledAt)
- [x] `grep -c "export " apps/web/src/lib/rbac.ts` ≥ 4 ✓ (4 exports: requireRole, hasRole, UnauthorizedError, ForbiddenError)
- [x] Tests Vitest rbac : 9 passes (largement ≥ 5)
- [x] `pnpm --filter @qualiof/web exec tsc --noEmit` → 0 erreur ✓
