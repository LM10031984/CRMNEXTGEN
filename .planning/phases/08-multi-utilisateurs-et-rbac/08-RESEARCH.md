# Phase 8: Multi-utilisateurs et RBAC — Research

**Researched:** 2026-05-15
**Domain:** Auth (Lucia 3) · RBAC · Invitation tokenisée · AuditLog UI
**Confidence:** HIGH (stack figée, patterns Phase 7 directement réutilisables, API Lucia vérifiée dans `core.d.ts`)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01** — 1 à 5 utilisateurs total → UI simple, pas de pagination complexe, pas de bulk actions.
- **D-02** — Matrice 6 rôles (ADMIN/MANAGER/COMMERCIAL/FORMATEUR/COMPTABLE/LECTEUR) figée. Source de vérité = `packages/shared/src/constants/permissions.ts` (à créer). FORMATEUR "ses sessions uniquement" sur Sessions via filtre BDD `where: { trainers: { some: { personId } } }`.
- **D-03** — User reçoit 4 nouveaux champs (`disabledAt`, `lastLoginAt`, `invitedAt`, `invitedBy`). Nouveau model `UserInvitation` (id, tenantId, email, token hashé, expiresAt J+7, usedAt, userId, role).
- **D-04** — Flow invitation :
  1. Server action `inviteUser` crée User avec `hashedPwd=''` placeholder + crée UserInvitation token + envoie email depuis `tenant.emailFrom`
  2. Email contient lien `{NEXTAUTH_URL}/invitation/{token}` (route publique nouvelle)
  3. User clique → page publique : valide token (non expiré, non utilisé) → formulaire "Définir mot de passe" (8 chars min, double saisie)
  4. Server action met `hashedPwd` (Argon2) + `UserInvitation.usedAt` + login auto Lucia + redirect `/app`
  5. AuditLog `users.invite` au moment de l'envoi
- **D-05** — Soft-delete uniquement : `disableUser` set `disabledAt=now()` + `lucia.invalidateUserSessions(userId)` + AuditLog `users.disable`. Réactivation via `enableUser` (disabledAt=null + AuditLog `users.enable`). `validateRequest()` rejette si `user.disabledAt != null`.
- **D-06** — Reset MDP admin : génère nouveau UserInvitation (7j) + email "Réinitialisation MDP demandée" + AuditLog `users.password.reset_requested`. Flow user identique à l'invitation initiale.
- **D-07** — Sidebar filtrée par `user.role`. **VISUEL UNIQUEMENT** — la sécurité réelle est dans D-08. Layout serveur lit `user.role`, filtre la liste passée à `SidebarNav` et `MobileNavDrawer`.
- **D-08** — Helper `requireRole(allowed: UserRole[]): Promise<User>` dans `apps/web/src/lib/rbac.ts`. Throw `UnauthorizedError` si pas user OU `disabledAt`. Throw `ForbiddenError` si rôle non autorisé. Retourne user (évite double `validateRequest()`).
- **D-09** — Page Historique AuditLog admin only à `/app/parametres/historique` (ou sidebar séparée). Liste paginée, **toutes actions**, filtres (qui/quand/action). Colonnes : Date · User · Action · Entité · Diff (modal détail JSON). Pas d'export.
- **D-10** — Conventions AuditLog étendues : `users.invite` / `users.invitation.resend` / `users.password.reset_requested` / `users.password.set` / `users.disable` / `users.enable` / `users.role.change` + `auth.login.success` / `auth.login.failed` (logout non tracké).

### Claude's Discretion

- UI listing users : tableau colonnes Email · Nom · Rôle · Statut · Dernière connexion · Actions
- Modal "Inviter user" : Radix Dialog (cohérent Phase 7)
- Email templates dans `apps/web/src/lib/mailer-templates/` (créer dossier)
- Page publique `/invitation/[token]` : layout minimaliste cohérent `/preinscription/[token]`
- Sidebar filter : Server Component, lit user.role
- Toast confirmations (sonner) sur chaque mutation
- Tests Vitest : helper requireRole + server action inviteUser + smoke page utilisateurs

### Deferred Ideas (OUT OF SCOPE)

- 2FA / MFA
- SSO / OAuth Google
- Hard-delete user (RGPD article 17)
- Audit log export CSV / FEC
- Suspension temporaire avec date de réactivation
- Audit log retention policy
- Permissions fine-grain (user X peut modifier session Y mais pas Z)
- Transfert auto de tâches/leads à un autre user lors de désactivation

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RBAC-01 | Page Utilisateurs (liste, ajout = create User + email invitation, désactivation soft-delete, reset MDP) | Findings #1, #3, #4, #5 — schema, server actions, modèle User étendu |
| RBAC-02 | Flow invitation email — lien tokenisé "définir mot de passe" → première connexion | Findings #4, #5 — pattern token route `/preinscription/[token]`, template email réutilisable |
| RBAC-03 | Sidebar filtrée par rôle (cacher Factures pour FORMATEUR, Paramètres pour non-ADMIN) | Finding #6 — nav-config + filter au Server Component layout |
| RBAC-04 | Guards par rôle dans server actions sensibles (delete, settings update, financial mutations) | Finding #7 — `requireRole` helper, application stratégique |
| RBAC-05 | AuditLog UI admin — vue paginée avec filtres (qui/quand/action) | Finding #8 — pagination simple, react-hook-form + URL state, diff JSON pretty-print |
</phase_requirements>

## Summary

Phase 8 active concrètement le RBAC sur un socle déjà solide : Lucia 3.2.2 + Argon2 sont en production, l'enum `UserRole` est déjà en BDD avec 6 valeurs, l'AuditLog model existe et a déjà une convention `parameters.*` posée Phase 7, et le pattern public token route `/preinscription/[token]` est directement transposable à `/invitation/[token]`. Les Server Actions Phase 7 (`tenant-settings.ts` + helpers `audit-log.ts`) fournissent le modèle exact (validate → before/after → diff → AuditLog → revalidatePath).

Le travail principal est donc **extension** (User schema +4 champs, +1 model UserInvitation, +1 enrichissement validateRequest) plus **création** (page Utilisateurs CRUD, page publique `/invitation/[token]`, page AuditLog UI, helper `requireRole`). Toutes les briques techniques sont validées : `lucia.invalidateUserSessions(userId)` existe dans `core.d.ts` Lucia 3.2.2 (vérifié), `argon2.hash` est déjà utilisé dans seed, et le pattern `randomUUID().replace(/-/g, '')` génère les tokens (cohérent avec `preinscriptions.ts`).

**Primary recommendation:** Découper en **5 plans + 1 bookkeeping** : (1) Schema/migration + permissions matrix + rbac helper, (2) Server actions users + invalidation sessions, (3) Pages publiques invitation/[token] + email templates, (4) UI page Utilisateurs (paramètres), (5) UI page Historique AuditLog + login hooks, (6) bookkeeping smoke + validation.

## Project Constraints (from CLAUDE.md)

Sécurité multi-tenant non négociable :

- **`tenantId` scope sur toute mutation** — `prisma.user.findMany({ where: { tenantId: user.tenantId } })`, jamais de query globale.
- **Server Actions discriminées `{ ok: true } | { ok: false; error: string; fieldErrors? }`** — pattern `tenant-settings.ts` à dupliquer.
- **Zod schemas dans `packages/shared/src/schemas/`** — réutilisables client+server. Nouveau fichier `user.ts` à créer.
- **Pas de secrets dans variables custom** (CLAUDE.md global Make.com → applicable ici : `hashedPwd` reste serveur uniquement, jamais exposé via Lucia `getUserAttributes`).
- **kebab-case partout** : fichiers (`rbac.ts`, `user-invitation-template.ts`), URLs (`/app/parametres/historique`).
- **Tests Vitest** : pattern `__tests__/` colocaté.
- **AuditLog convention** : Phase 7 a posé `parameters.*`. Phase 8 ajoute `users.*` et `auth.*` — namespace strict.

## Standard Stack

### Core (déjà en place, à utiliser tel quel)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Lucia | 3.2.2 | Session-based auth, prisma adapter | Déjà branché, `lucia.invalidateUserSessions(userId)` natif |
| `@lucia-auth/adapter-prisma` | 4.0.1 | Pont Lucia↔Prisma | Adapter officiel, déjà câblé sur `prisma.authSession` + `prisma.user` |
| Argon2 | 0.41.1 | Hash mot de passe | Standard 2026 (recommandé OWASP), pattern déjà dans `seed.ts` + `login/actions.ts` |
| Zod | 3.23.8 | Validation schemas | Patterns établis dans `packages/shared/src/schemas/` |
| react-hook-form | 7.54.2 | Form state client | Avec `@hookform/resolvers/zod` |
| sonner | 2.0.7 | Toasts | Déjà mounté dans `app/layout.tsx` |
| Radix UI | latest | Dialog, DropdownMenu, AlertDialog | Pattern UserMenuButton Phase 4, AlertDialog Phase 7 |
| Vitest | 2.1.8 | Tests unitaires | Pattern mocks `vi.mock('@qualiof/db', ...)` éprouvé Phase 7 |
| nodemailer | 8.0.7 | SMTP transport | `sendMail()` dans `lib/mailer.ts`, dry-run auto si SMTP_HOST vide |

### Supporting (à créer / consommer)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:crypto` (`randomUUID`) | built-in | Génération token invitation | Suivre pattern `preinscriptions.ts:20` — `randomUUID().replace(/-/g, '')` (32 hex chars sans dash) |
| Argon2 (re-hash token côté serveur) | 0.41.1 | Hash du token en BDD | Optionnel selon D-03 ("hashé en BDD"). **Recommandation : NON** — voir Finding #4 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Argon2 hash du token | `crypto.timingSafeEqual` sur token clair | Argon2 ajoute ~50ms par validation et empêche query directe `where: { token }`. Pour un token random 32 hex (entropy 128 bits) **avec expiration 7j et single-use**, le risque brute-force est négligeable. **Recommandation : token clair en BDD, comparaison `where: { token }`** — cohérent avec PreEnrollment qui fait pareil. |
| Throw exceptions dans requireRole | Return `{ ok, ... }` discriminé | Throw est ergonomique pour les server actions (early return naturel). Le pattern `{ ok, ... }` est pour les **retours d'action** (UI consumer-side). `requireRole` est un **guard interne**, throw OK. |
| Pagination cursor (Prisma) | Pagination offset `take/skip` | 5 users × ~100 actions/mois × 12 mois = 6000 rows AuditLog/an. Offset + index `[tenantId, createdAt]` suffit. KISS. |

**Installation:** Aucune nouvelle dépendance npm. Toutes les briques sont déjà installées.

**Version verification:**
- Lucia 3.2.2 : vérifié en lisant `/Users/laurentmarx/Documents/CRM Next gen/files/node_modules/.pnpm/lucia@3.2.2/node_modules/lucia/dist/core.d.ts` — `invalidateUserSessions(userId): Promise<void>` et `getUserSessions(userId): Promise<Session[]>` confirmés.
- Argon2 0.41.1 : déjà utilisé dans `seed.ts` (`argon2.hash('admin')`) et `login/actions.ts` (`argon2.verify`).

## Architecture Patterns

### Recommended Project Structure

```
apps/web/src/
├── lib/
│   ├── rbac.ts                      # NEW — requireRole, hasRole, error types
│   ├── audit-log.ts                 # EXTEND — ajouter helper logUserAction()
│   ├── auth.ts                      # EXTEND — validateRequest rejette disabledAt
│   ├── mailer.ts                    # EXTEND (optionnel) — accept tenantEmailFrom
│   └── mailer-templates/            # NEW dossier (déjà recommandé Phase 8 CONTEXT)
│       ├── user-invitation.ts       # renderInvitationHtml(input, of)
│       └── user-password-reset.ts   # renderPasswordResetHtml(input, of)
├── server/actions/
│   ├── users.ts                     # NEW — inviteUser, disableUser, enableUser, resetUserPassword, changeUserRole, resendInvitation
│   └── user-invitation-accept.ts    # NEW — server action publique pour finaliser le MDP (appelée depuis /invitation/[token])
├── app/
│   ├── invitation/[token]/page.tsx  # NEW — page publique tokenisée (analogue preinscription/[token])
│   └── app/
│       ├── layout.tsx               # EXTEND — pass user.role aux Sidebar/MobileNavDrawer
│       └── parametres/
│           ├── utilisateurs/page.tsx        # NEW — liste users + bouton "Inviter"
│           └── historique/page.tsx          # NEW — AuditLog UI
└── components/
    ├── layout/
    │   ├── nav-config.ts            # EXTEND — chaque NavItem reçoit allowedRoles?
    │   └── sidebar-nav.tsx          # EXTEND — accepter prop userRole, filtrer
    └── users/                       # NEW dossier
        ├── invite-user-button.tsx   # Radix Dialog
        ├── users-table.tsx
        ├── user-row-actions.tsx     # DropdownMenu (disable/enable/reset/role)
        ├── change-role-dialog.tsx
        └── set-password-form.tsx    # client form pour /invitation/[token]

packages/db/prisma/
└── schema.prisma                    # EXTEND — User +4 champs, +UserInvitation model

packages/shared/src/
├── schemas/
│   ├── index.ts                     # EXTEND — export user
│   └── user.ts                      # NEW — inviteUserSchema, setPasswordSchema, changeRoleSchema
└── constants/
    └── permissions.ts               # NEW — PERMISSIONS matrix, can(role, section, op)
```

### Pattern 1: requireRole helper (D-08)

**What:** Guard server-side qui combine auth + role check + disabled check en 1 appel.

**When to use:** Au début de toute server action sensible — remplace `validateRequest()` ; retourne directement le `user` typé.

**Example:**
```typescript
// apps/web/src/lib/rbac.ts
import type { User as LuciaUser } from 'lucia';
import type { UserRole } from '@prisma/client';
import { validateRequest } from './auth';

export class UnauthorizedError extends Error {
  constructor(msg = 'Non authentifié') { super(msg); this.name = 'UnauthorizedError'; }
}
export class ForbiddenError extends Error {
  constructor(msg = 'Accès refusé') { super(msg); this.name = 'ForbiddenError'; }
}

export async function requireRole(allowed: UserRole[]): Promise<LuciaUser> {
  const { user } = await validateRequest();
  if (!user) throw new UnauthorizedError();
  // Note: user.disabledAt n'est PAS exposé via Lucia getUserAttributes par défaut.
  // Option A : étendre getUserAttributes pour inclure disabledAt
  // Option B : faire un extra query dans validateRequest (déjà cache() via React)
  // Recommandation : Option A — voir Finding #2
  if ((user as LuciaUser & { disabledAt?: Date | null }).disabledAt) {
    throw new UnauthorizedError('Compte désactivé');
  }
  if (!allowed.includes(user.role as UserRole)) {
    throw new ForbiddenError(`Rôle ${user.role} non autorisé`);
  }
  return user;
}

export function hasRole(user: LuciaUser, allowed: UserRole[]): boolean {
  return allowed.includes(user.role as UserRole);
}
```

Usage en server action :
```typescript
'use server';
export async function disableUser(userId: string): Promise<ActionResult> {
  try {
    const admin = await requireRole(['ADMIN']);
    // ...
  } catch (e) {
    if (e instanceof UnauthorizedError) return { ok: false, error: e.message };
    if (e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}
```

Wrapper utilitaire conseillé pour réduire la boilerplate (`withRole(['ADMIN'], async (admin) => {...})`).

### Pattern 2: Token public route (réutilisation /preinscription/[token])

**What:** Server-rendered page publique qui valide un token avant d'afficher un form.

**Source vérifiée :** `apps/web/src/app/preinscription/[token]/page.tsx` (lignes 14-32).

**Example pour `/invitation/[token]/page.tsx`:**
```typescript
export const dynamic = 'force-dynamic';

export default async function InvitationPage({
  params,
}: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await prisma.userInvitation.findUnique({
    where: { token },
    select: { id, token, email, role, expiresAt, usedAt, userId },
  });
  if (!invitation) notFound();

  const expired = invitation.expiresAt < new Date();
  const used = invitation.usedAt != null;

  if (expired) return <ExpiredState onResend={...} />;
  if (used) return <AlreadyUsedState />;

  return <SetPasswordForm token={token} email={invitation.email} role={invitation.role} />;
}
```

### Pattern 3: Sidebar filter (D-07 — visuel)

**Source actuelle :** `nav-config.ts` exporte `NAV: NavSection[]`. `SidebarNav` est `'use client'` — il ne peut pas lire `user.role` directement.

**Solution :**
1. Étendre `NavItem` avec `allowedRoles?: UserRole[]` (absent = tous rôles)
2. **Filtrer côté server** dans `app/app/layout.tsx` :
   ```typescript
   const visibleNav = NAV.map(s => ({
     ...s,
     items: s.items.filter(i => !i.allowedRoles || i.allowedRoles.includes(user.role)),
   })).filter(s => s.items.length > 0);
   ```
3. Passer `visibleNav` en prop à `<Sidebar nav={visibleNav}>` puis `<SidebarNav nav={visibleNav}>` (au lieu d'importer NAV en dur)
4. Idem pour `<MobileNavDrawer nav={visibleNav}>`

Bénéfice : nav-config reste source unique, le filtrage est centralisé Server-side et le client recoit la liste déjà filtrée.

### Pattern 4: AuditLog UI — pagination + filters

**Pagination :** offset (`take: 50, skip: page*50`) — KISS pour 5 users / quelques milliers de rows. Index `[tenantId, createdAt]` déjà en place dans `schema.prisma:1016`.

**Filters :** URL state (`?userId=X&action=users.disable&from=2026-05-01&to=2026-05-31&page=2`) pour rendre les liens shareable. Form client avec react-hook-form + push URL en `onChange`.

**Diff display :** Modal Radix Dialog déclenché par clic ligne. Inside : table 2 colonnes `Champ · Avant → Après` parsée depuis `diff` Json. Pour les actions sans diff (e.g. `auth.login.success`), n'afficher que le metadata (ip / userAgent — déjà en colonnes du schéma).

### Anti-Patterns to Avoid

- **Filter sidebar côté client** : la liste complète serait téléchargée puis filtrée — leak d'info (un FORMATEUR verrait "Factures existe mais cachée"). **Filtrer côté serveur exclusivement.**
- **Ne pas appeler `lucia.invalidateUserSessions(userId)` lors d'un disable** : l'user resterait connecté jusqu'à expiration cookie (`expires: false` dans `auth.ts` = session). **Toujours invalider explicitement.**
- **Tester rôle uniquement côté UI (D-07)** : même si la sidebar cache la route, un user mal intentionné peut taper l'URL. **`requireRole` côté serveur est non négociable** (D-08).
- **Hard-code rôles dans 30 server actions** : centraliser dans `permissions.ts` (matrice D-02) et faire `requireRole(can('users.invite'))` ou similaire. **Note :** D-08 décrit l'usage direct `requireRole(['ADMIN'])`. Acceptable pour 5 users si centralisé via constants exported from permissions.ts.
- **Token stocké en clair MAIS exposé via API publique** : la route `/invitation/[token]` n'est consultée que par le destinataire qui possède déjà le token (il vient de cliquer le lien). Aucune fuite. OK.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session invalidation après disable | Boucle manuelle `deleteMany({ where: { userId } })` sur AuthSession | `lucia.invalidateUserSessions(userId)` | Lucia 3.2.2 API officielle (vérifié `core.d.ts:41`), gère le cache adapter, robuste |
| Hash mot de passe | bcrypt, sha256 + salt maison, scrypt | `argon2.hash()` / `argon2.verify()` (déjà installé) | Argon2 = standard OWASP 2026, déjà utilisé partout dans le projet |
| Token random sécurisé | `Math.random().toString(36)` | `randomUUID().replace(/-/g, '')` (pattern préinscriptions) ou `randomBytes(16).toString('hex')` | UUID v4 = 122 bits d'entropie, généré via OS RNG |
| Validation IBAN/email/SIRET côté form | Regex maison | Zod schemas `tenantBillingSchema`/`tenantEmailSchema` (Phase 7) — pour SIRET : `isValidSiret` helper existant | Phase 7 a déjà tout fait. Pour email user : `z.string().email()` standard |
| AuditLog diff | Comparaison manuelle field-by-field | `computeDiff(before, after)` (Phase 7 `lib/audit-log.ts`) | Helper pur, testé, normalise null/undefined/objets/primitives |
| Pagination | Offset + skip à la main | Pattern `take/skip` + `count` Prisma | Index `[tenantId, createdAt]` déjà en place |
| Email HTML | Construire avec template literals fragiles | Pattern `preinscription-reminder-template.ts` (escapeHtml + inline CSS + brand colors) | Compatible tous clients mail, déjà éprouvé |
| Modal confirmation destructive | window.confirm | Radix AlertDialog (pattern Phase 7 `numbering-section` discontinuité) | A11y, animation, design system |
| Server action error normalization | try/catch dans chaque action | Helper `withRole(['ADMIN'], async (user) => {...})` qui catch Unauthorized/Forbidden et retourne `{ok:false, error}` | DRY |

**Key insight:** 90% du travail Phase 8 = combinaison de patterns existants. Le seul "vrai" nouveau code est `rbac.ts` (~80 LOC) + page `/invitation/[token]` (~150 LOC reusing preinscription template) + page Historique (~200 LOC).

## Runtime State Inventory

> Phase de création de modèles + extensions de schéma + nouvelles routes — pas un rename/refactor. Cette section reste informative.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Aucune donnée user existante à migrer. Le seed `packages/db/prisma/seed.ts` crée 1 admin (`admin@start-academy.fr`). Les 4 nouveaux champs User sont tous nullables → migration safe. | Migration Prisma ajoute colonnes nullables. Pas de backfill nécessaire (admin existant aura `disabledAt=null` = actif). |
| Live service config | n8n, Datadog, etc. — non applicable (pas de services externes liés aux users). | None |
| OS-registered state | Aucune. | None |
| Secrets/env vars | `SMTP_PASSWORD` reste en ENV (D-08 Phase 7), pas exposé via UI. Pas de nouveau secret introduit Phase 8. | None |
| Build artifacts | `prisma generate` doit être re-roulé après migration. Pattern Phase 7 : `pnpm --filter @qualiof/db prisma generate`. | Inclure dans Wave 1 du plan migration. |

**Nothing found in category:** "None — vérifié grep `disabledAt`, `UserInvitation`, `invitedAt` dans codebase = 0 occurrences."

## Common Pitfalls

### Pitfall 1: validateRequest cache (React `cache()`) et disabledAt
**What goes wrong:** `validateRequest` est wrappée par `cache()` (lib/auth.ts:47). Si on lit `disabledAt` en BDD à chaque appel, on perd le bénéfice du cache. Si on l'expose via Lucia `getUserAttributes`, on doit re-déclarer le typage `DatabaseUserAttributes`.

**Why it happens:** Lucia v3 a un design où **toutes les info user doivent passer par getUserAttributes** — sinon il faut faire une 2e query après `validateSession`.

**How to avoid:**
1. Étendre `getUserAttributes` dans `auth.ts` pour inclure `disabledAt` :
   ```typescript
   getUserAttributes: (data) => ({
     email: data.email, firstName: data.firstName, lastName: data.lastName,
     role: data.role, tenantId: data.tenantId,
     disabledAt: data.disabledAt,  // NEW
   })
   ```
2. Mettre à jour `declare module 'lucia'` (auth.ts:36-44) avec `disabledAt: Date | null`
3. Dans `validateRequest`, ajouter check après `lucia.validateSession`:
   ```typescript
   if (result.user && result.user.disabledAt) {
     await lucia.invalidateSession(result.session.id);
     return { user: null, session: null };
   }
   ```

**Warning signs:** Un user désactivé peut continuer à naviguer (signe que le check disabledAt est manquant). Test e2e : disable + reload → doit rediriger /login.

### Pitfall 2: Lucia session cookie après invalidateUserSessions
**What goes wrong:** L'admin disable user X. Les sessions DB de X sont supprimées. Mais X est connecté dans son navigateur — son cookie session pointe vers une session inexistante. Au prochain request, `lucia.validateSession` retourne null → `validateRequest` retourne `{ user: null, session: null }` → redirect /login. **Comportement attendu, OK.**

**Why it might fail:** Si le check `disabledAt` est dans `validateRequest` AVANT `validateSession`, on aurait un bug. **L'ordre correct : validateSession puis check disabledAt.**

**How to avoid:** Tester ce scénario en intégration. Au minimum :
1. Login user → session cookie créé
2. Admin disable user → DB session row supprimée
3. User reload → 200 /login (pas crash ni boucle redirect)

### Pitfall 3: UserInvitation token réutilisable
**What goes wrong:** User clique 2 fois sur le lien (1 fois mobile, 1 fois desktop). Sans single-use enforcement, le 2e clic crée une 2e session ou pire écrase le password.

**Why it happens:** Pas de check `usedAt` côté server.

**How to avoid:** Dans la server action `acceptInvitation`, faire un `update` atomique :
```typescript
const result = await prisma.userInvitation.updateMany({
  where: { token, usedAt: null, expiresAt: { gt: new Date() } },
  data: { usedAt: new Date() },
});
if (result.count === 0) return { ok: false, error: 'Lien expiré ou déjà utilisé' };
// Maintenant on est sûr d'être unique. Hash le MDP et update user.
```

**Warning signs:** `updateMany` retourne 0 → afficher message clair. Pas de race condition.

### Pitfall 4: Login attempts comme AuditLog spam
**What goes wrong:** `auth.login.failed` à chaque erreur de saisie → AuditLog rempli de bruit. Bot attaque = des milliers de rows.

**Why it happens:** Tracker chaque tentative sans dédup.

**How to avoid:**
- Pour `login.failed` : limiter à 1 row toutes les 5 minutes par email (window dédup côté server action), OU stocker count agrégé dans `diff: { attempts: 5, lastAt: ... }`.
- Pour le MVP Phase 8 : tracker simplement 1 row par tentative, ajouter un index sur `[tenantId, action, createdAt]` et purger plus tard si volume problématique (decision deferred).
- **Recommendation pratique** : tracker chaque tentative en V1 (visible pour Laurent dans le UI = "brute-force detection" gratuite). Si nuisible, ajouter dédup en V2.

**Warning signs:** Page Historique met > 2s à charger → vérifier volume rows + index `[tenantId, createdAt]`.

### Pitfall 5: FORMATEUR scope query — risque de leak via pages list non filtrées
**What goes wrong:** Le helper `getVisibleSessions(user)` filtre `/app/sessions` mais une autre page (`/app/dashboard`) fait un `prisma.trainingSession.count()` non scopé. → FORMATEUR voit "12 sessions" alors qu'il n'a accès qu'à 3.

**Why it happens:** Scope dispersé dans plusieurs server queries.

**How to avoid:**
- Centraliser le scope dans 1 helper `lib/visible-sessions.ts` :
  ```typescript
  export function sessionsWhereForRole(user: LuciaUser): Prisma.TrainingSessionWhereInput {
    if (user.role === 'FORMATEUR') {
      return { trainers: { some: { person: { /* match user.personId? */ } } } };
    }
    return {}; // pas de filtre supplémentaire pour les autres rôles
  }
  ```
- **Question ouverte :** `SessionTrainer.personId` (FK Person) ≠ `User.id`. Comment relier un User Lucia à un Person formateur ? Voir Open Question #1 ci-dessous.
- **Phase 8 minimal :** Implémenter le filtre uniquement sur `/app/sessions` (list + detail). Les autres vues (dashboard stats par formateur) peuvent rester globales pour Phase 8 — FORMATEUR a Sessions=R/W mais Dashboard=R sur la matrice D-02, donc voir les stats globales est acceptable.

**Warning signs:** Vitest test `getSessionsForUser({ role: 'FORMATEUR' })` retourne plus que les sessions de ce formateur.

### Pitfall 6: Mailer dry-run en dev silencieux
**What goes wrong:** `sendMail()` en dev (SMTP_HOST vide) loggue mais ne renvoie pas d'erreur. Si la server action inviteUser ne check pas `result.ok`, l'admin pense que le mail est parti mais en réalité c'est dry-run.

**Why it happens:** `sendMail` retourne `{ ok: true, dryRun: true }` — comportement voulu, mais propagation à l'UI ?

**How to avoid:**
- Toast côté UI : "Invitation envoyée (mode dev: mail non réellement envoyé)" si `result.dryRun === true`.
- Inclure le lien d'invitation directement dans le toast en dev pour copy-paste test (déjà fait par `console.log` mais pas accessible UI).

**Warning signs:** Laurent dit "j'ai pas reçu le mail" en dev — ajouter le hint dry-run dans le toast.

## Code Examples

### Example 1: Schema Prisma User extension (D-03)

```prisma
model User {
  id           String        @id @default(uuid())
  tenantId     String
  tenant       Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  email        String        @unique
  hashedPwd    String        // placeholder '' tant que user n'a pas accepté l'invitation
  firstName    String
  lastName     String
  role         UserRole      @default(LECTEUR)

  // Phase 8 — soft-delete + métadonnées
  disabledAt   DateTime?     // null = actif. Si !null → validateRequest rejette + sessions invalidées
  lastLoginAt  DateTime?     // mis à jour dans loginAction sur succès
  invitedAt    DateTime?     // null = créé manuellement (seed)
  invitedBy    String?       // FK User.id de l'admin qui a invité (pas de Prisma relation pour éviter cycle — query manuel si besoin)

  authSessions AuthSession[]
  auditLogs    AuditLog[]
  leadsOwned   Lead[]
  tasksOwned   Task[]
  invitations  UserInvitation[] @relation("UserInvitations")
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  @@index([tenantId])
  @@index([tenantId, disabledAt])  // pour filtrer "users actifs"
}

model UserInvitation {
  id        String     @id @default(uuid())
  tenantId  String     // pour scope multi-tenant
  email     String
  token     String     @unique  // random 32 hex, exposé dans URL — pas hashé (voir Finding #4)
  role      UserRole
  expiresAt DateTime   // J+7 par défaut
  usedAt    DateTime?  // null = pas encore utilisée
  userId    String?    // FK User.id du compte créé en attente (créé en même temps que l'invitation)
  user      User?      @relation("UserInvitations", fields: [userId], references: [id], onDelete: Cascade)
  // Audit
  invitedBy String     // FK User.id de l'admin qui a déclenché l'invitation
  createdAt DateTime   @default(now())

  @@index([tenantId])
  @@index([token])
  @@index([email, tenantId])
}
```

**Migration:** `pnpm --filter @qualiof/db prisma migrate dev --name phase_08_users_rbac` génère la migration. Pas de backfill data nécessaire (tous champs nullables ou avec FK + cascade).

### Example 2: Server Action inviteUser (cf. Phase 7 pattern)

```typescript
// apps/web/src/server/actions/users.ts
'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import { inviteUserSchema, type InviteUserInput } from '@qualiof/shared';
import { sendMail } from '@/lib/mailer';
import { renderInvitationHtml } from '@/lib/mailer-templates/user-invitation';
import { loadOfConfig } from '@/lib/of-config';

const INVITATION_VALIDITY_DAYS = 7;

export type ActionResult =
  | { ok: true; data?: unknown }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

export async function inviteUser(input: InviteUserInput): Promise<ActionResult> {
  let admin;
  try {
    admin = await requireRole(['ADMIN']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const parsed = inviteUserSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Validation échouée', fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { email, firstName, lastName, role } = parsed.data;
  const lcEmail = email.toLowerCase();

  // Unicité email
  const existing = await prisma.user.findUnique({ where: { email: lcEmail } });
  if (existing) return { ok: false, error: 'Email déjà utilisé', fieldErrors: { email: ['Email déjà utilisé'] } };

  const token = randomUUID().replace(/-/g, '');
  const expiresAt = new Date(Date.now() + INVITATION_VALIDITY_DAYS * 86400 * 1000);

  // Transactionnel : create User (hashedPwd='') + UserInvitation
  const { user: newUser, invitation } = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        tenantId: admin.tenantId,
        email: lcEmail,
        hashedPwd: '',  // placeholder — utilisateur définit son MDP via /invitation/[token]
        firstName, lastName,
        role,
        invitedAt: new Date(),
        invitedBy: admin.id,
      },
    });
    const invitation = await tx.userInvitation.create({
      data: { tenantId: admin.tenantId, email: lcEmail, token, role, expiresAt, userId: user.id, invitedBy: admin.id },
    });
    return { user, invitation };
  });

  // Envoi email avec OfConfig pour from = tenant.emailFrom
  const of = await loadOfConfig(admin.tenantId);
  const publicUrl = `${process.env.NEXTAUTH_URL || 'http://localhost:3002'}/invitation/${token}`;
  const { subject, html, text } = renderInvitationHtml(
    { firstName, publicUrl, expiresAt, invitedByName: `${admin.firstName} ${admin.lastName}` },
    of,
  );
  await sendMail({ to: lcEmail, subject, html, text });

  // AuditLog
  await prisma.auditLog.create({
    data: {
      tenantId: admin.tenantId, userId: admin.id,
      entity: 'User', entityId: newUser.id,
      action: 'users.invite',
      diff: { email: lcEmail, role, invitationId: invitation.id } as never,
    },
  });

  revalidatePath('/app/parametres/utilisateurs');
  return { ok: true, data: { userId: newUser.id } };
}
```

### Example 3: Accept invitation (page publique server action)

```typescript
// apps/web/src/server/actions/user-invitation-accept.ts
'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import argon2 from 'argon2';
import { prisma } from '@qualiof/db';
import { lucia } from '@/lib/auth';
import { setPasswordSchema, type SetPasswordInput } from '@qualiof/shared';

export async function acceptInvitation(
  input: SetPasswordInput & { token: string },
): Promise<{ ok: false; error: string } | never> {
  const parsed = setPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Mot de passe invalide' };

  // Atomic single-use
  const claim = await prisma.userInvitation.updateMany({
    where: { token: input.token, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (claim.count === 0) return { ok: false, error: 'Lien expiré ou déjà utilisé' };

  const invitation = await prisma.userInvitation.findUnique({
    where: { token: input.token },
    select: { userId: true, tenantId: true, email: true },
  });
  if (!invitation || !invitation.userId) return { ok: false, error: 'Invitation introuvable' };

  const hashedPwd = await argon2.hash(parsed.data.password);
  await prisma.user.update({
    where: { id: invitation.userId },
    data: { hashedPwd, lastLoginAt: new Date() },
  });
  await prisma.auditLog.create({
    data: {
      tenantId: invitation.tenantId, userId: invitation.userId,
      entity: 'User', entityId: invitation.userId,
      action: 'users.password.set',
      diff: {} as never,
    },
  });

  // Login auto
  const session = await lucia.createSession(invitation.userId, {});
  const cookie = lucia.createSessionCookie(session.id);
  (await cookies()).set(cookie.name, cookie.value, cookie.attributes);
  redirect('/app');  // → never
}
```

### Example 4: Disable user + session invalidation (D-05)

```typescript
export async function disableUser(userId: string): Promise<ActionResult> {
  let admin;
  try { admin = await requireRole(['ADMIN']); }
  catch (e) { return { ok: false, error: (e as Error).message }; }

  // Anti-shoot-foot : ne pas se désactiver soi-même
  if (userId === admin.id) return { ok: false, error: 'Tu ne peux pas désactiver ton propre compte' };

  const before = await prisma.user.findUnique({
    where: { id: userId, tenantId: admin.tenantId },  // scope tenant
    select: { id: true, email: true, disabledAt: true },
  });
  if (!before) return { ok: false, error: 'Utilisateur introuvable' };
  if (before.disabledAt) return { ok: false, error: 'Utilisateur déjà désactivé' };

  await prisma.user.update({
    where: { id: userId },
    data: { disabledAt: new Date() },
  });

  // Invalide TOUTES les sessions actives du user (Lucia 3 API vérifiée)
  await lucia.invalidateUserSessions(userId);

  await prisma.auditLog.create({
    data: {
      tenantId: admin.tenantId, userId: admin.id,
      entity: 'User', entityId: userId,
      action: 'users.disable',
      diff: { email: before.email } as never,
    },
  });

  revalidatePath('/app/parametres/utilisateurs');
  return { ok: true };
}
```

### Example 5: Permissions matrix (D-02 source de vérité)

```typescript
// packages/shared/src/constants/permissions.ts
import type { UserRole } from '@prisma/client';  // ou retype enum local pour packages/shared

export type AppSection =
  | 'dashboard' | 'learners' | 'sessions' | 'products' | 'trainers'
  | 'leads' | 'preenrollments' | 'opcoFiles' | 'budgetAgefice' | 'invoices'
  | 'funders' | 'organizations' | 'qualiopiBilan'
  | 'tenantSettings' | 'users' | 'auditHistory';

export type Permission = 'R' | 'RW' | 'HIDDEN';

export const PERMISSIONS: Record<AppSection, Partial<Record<UserRole, Permission>>> = {
  dashboard:      { ADMIN: 'RW', MANAGER: 'RW', COMMERCIAL: 'R', FORMATEUR: 'R', COMPTABLE: 'R', LECTEUR: 'R' },
  learners:       { ADMIN: 'RW', MANAGER: 'RW', COMMERCIAL: 'RW', FORMATEUR: 'R', COMPTABLE: 'R', LECTEUR: 'R' },
  sessions:       { ADMIN: 'RW', MANAGER: 'RW', COMMERCIAL: 'RW', FORMATEUR: 'RW', COMPTABLE: 'R', LECTEUR: 'R' },
  // ... (cf. matrice D-02 CONTEXT.md ligne 31-48)
  tenantSettings: { ADMIN: 'RW' /* others = HIDDEN par absence */ },
  users:          { ADMIN: 'RW' },
  auditHistory:   { ADMIN: 'R' },
};

export function canRead(role: UserRole, section: AppSection): boolean {
  const p = PERMISSIONS[section][role];
  return p === 'R' || p === 'RW';
}
export function canWrite(role: UserRole, section: AppSection): boolean {
  return PERMISSIONS[section][role] === 'RW';
}
export function rolesWithAccess(section: AppSection, mode: 'R' | 'RW'): UserRole[] {
  return Object.entries(PERMISSIONS[section])
    .filter(([_, p]) => mode === 'R' ? (p === 'R' || p === 'RW') : p === 'RW')
    .map(([r]) => r as UserRole);
}
```

Usage dans `nav-config.ts` :
```typescript
import { rolesWithAccess } from '@qualiof/shared';

export const NAV: NavSection[] = [
  { title: 'Essentiel', items: [
    { label: 'Tableau de bord', href: '/app', icon: LayoutDashboard, allowedRoles: rolesWithAccess('dashboard', 'R') },
    { label: 'Sessions', href: '/app/sessions', icon: Calendar, allowedRoles: rolesWithAccess('sessions', 'R') },
    // ...
  ]},
  // ...
];
```

### Example 6: AuditLog UI — filter + paginate

```typescript
// apps/web/src/app/app/parametres/historique/page.tsx
import { requireRole } from '@/lib/rbac';

export default async function HistoriquePage({
  searchParams,
}: { searchParams: Promise<{ userId?: string; action?: string; from?: string; to?: string; page?: string }> }) {
  const admin = await requireRole(['ADMIN']);  // throws → caught by error.tsx
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page ?? 0));
  const pageSize = 50;

  const where = {
    tenantId: admin.tenantId,
    ...(sp.userId && { userId: sp.userId }),
    ...(sp.action && { action: { startsWith: sp.action } }),  // 'users.' match 'users.invite', 'users.disable', ...
    ...((sp.from || sp.to) && { createdAt: {
      ...(sp.from && { gte: new Date(sp.from) }),
      ...(sp.to && { lte: new Date(sp.to) }),
    }}),
  };

  const [rows, total, users] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: pageSize, skip: page * pageSize,
      include: { user: { select: { firstName: true, lastName: true, email: true } } } }),
    prisma.auditLog.count({ where }),
    prisma.user.findMany({ where: { tenantId: admin.tenantId }, select: { id: true, firstName: true, lastName: true } }),
  ]);

  return <HistoriqueClient rows={rows} total={total} users={users} pageSize={pageSize} page={page} />;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `validateRequest` retourne user sans check disabled | `validateRequest` invalidate session + retourne null si disabledAt | Phase 8 | Désactivation = logout immédiat sur prochain request |
| Sidebar NAV en import statique partout | Sidebar reçoit `nav` filtré en prop depuis Server Component | Phase 8 | Filtrage centralisé + leak-free |
| Server actions sensibles utilisent `validateRequest` direct | Server actions utilisent `requireRole([...])` | Phase 8 | 1 ligne par action + check disabled + check role |
| Hash mot de passe ? | Argon2 + Phase 8 ajoute reset par admin via flow invitation | Déjà OK | Pas de "reset par email magique" sans hashed token |

**Deprecated/outdated:**
- Aucun. Lucia v3.2.2 est la version stable courante (Lucia ne reçoit plus de mises à jour majeures fin 2024 → considéré stable + maintenable, l'auteur recommande de copier directement la lib pour les nouveaux projets, mais le pattern actuel reste production-ready).

## Open Questions

1. **FORMATEUR ↔ Person link pour scope sessions**
   - **What we know:** `User` n'a pas de FK directe vers `Person`. `SessionTrainer.personId` pointe vers `Person`. Un User formateur dans Lucia n'est PAS automatiquement un Person formateur en BDD.
   - **What's unclear:** Comment lier ? Options :
     - (a) Ajouter `User.personId` (FK Person?) pour les Users avec rôle FORMATEUR
     - (b) Matcher par email : `Person.email == User.email`
     - (c) Saisie manuelle à l'invitation : "Choisir un Person formateur existant" si role=FORMATEUR
   - **Recommendation:** **Option (a)** — `User.personId String?` ajouté Phase 8. Quand admin invite un FORMATEUR, modal demande "Lier à un formateur existant ?". Si non lié, le filtre retourne `[]` (FORMATEUR ne voit aucune session — comportement défensif). Cohérent avec D-02 note "à implémenter Phase 8 (sinon FORMATEUR = lecteur seul des sessions)".
   - **Si trop complexe pour Phase 8:** Punter — FORMATEUR reste lecteur seul des sessions (matrice D-02 ligne 35 colonne FORMATEUR = "RW ses sessions uniquement" devient "R" temporaire), et la fonctionnalité scope est livrée Phase 9. À arbitrer planning avec Laurent.

2. **AuditLog page : sidebar séparée ou sous-section Paramètres ?**
   - **What we know:** D-09 dit "préférence : item sidebar séparé sous 'Paramètres' group".
   - **What's unclear:** Sidebar montre une seule entrée "Paramètres" actuellement. Faut-il une nouvelle entrée "Historique" sous le group "Configuration" ? Ou un onglet dans la page Paramètres ?
   - **Recommendation:** Pour MVP, route `/app/parametres/historique` accessible via lien depuis la page Paramètres (section dédiée "Historique" avec lien). Plus simple à livrer. Si Laurent demande explicitement item sidebar dédié, ajouter `{ label: 'Historique', href: '/app/parametres/historique', allowedRoles: ['ADMIN'] }` dans section "Configuration".

3. **Login.failed dédup vs spam**
   - **What we know:** Pitfall #4. Risque AuditLog spam.
   - **What's unclear:** Dédup-er ou pas en V1 ?
   - **Recommendation:** Tracker tel quel en V1, monitor volume après 1 semaine. Si > 100 rows / semaine → ajouter dédup. Décision déferrée volontaire pour livrer plus vite.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Lucia | Auth | ✓ | 3.2.2 | — |
| @lucia-auth/adapter-prisma | Auth | ✓ | 4.0.1 | — |
| Argon2 | MDP hashing | ✓ | 0.41.1 | — |
| Zod | Validation | ✓ | 3.23.8 | — |
| react-hook-form | UI forms | ✓ | 7.54.2 | — |
| Radix UI Dialog | UI modals | ✓ | latest | — |
| Radix UI DropdownMenu | UI actions menu | ✓ | latest | — |
| sonner | Toasts | ✓ | 2.0.7 | — |
| nodemailer | SMTP transport | ✓ | 8.0.7 | dry-run auto si SMTP_HOST vide |
| PostgreSQL | DB | ✓ | 16 | — |
| Vitest | Tests unitaires | ✓ | 2.1.8 | — |
| Playwright | Tests E2E | ✗ | — | **Smoke tests Vitest** (déjà pattern projet) — pas de bloquant Phase 8 |

**Missing dependencies with no fallback:** Aucun.

**Missing dependencies with fallback:**
- Playwright (E2E) — fallback : Smoke tests Vitest sur les pages clés + tests serveur sur les actions critiques (cf. Validation Architecture).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.8 (existing in `apps/web` + `packages/shared`) |
| Config file | `apps/web/vitest.config.ts` (existant — pattern Phase 7) |
| Quick run command | `pnpm --filter @qualiof/web test --run` |
| Full suite command | `pnpm --filter @qualiof/web test --run && pnpm --filter @qualiof/web typecheck && pnpm --filter @qualiof/web build` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RBAC-01 | Page utilisateurs : smoke imports + tableau rendu | smoke | `pnpm --filter @qualiof/web test --run app/parametres/utilisateurs` | ❌ Wave 0 |
| RBAC-01 | `inviteUser` server action : mock prisma + mailer → tx créé + audit logged | unit | `pnpm --filter @qualiof/web test --run server/actions/__tests__/users.test.ts` | ❌ Wave 0 |
| RBAC-01 | `disableUser` invalide sessions Lucia | unit | mock `lucia.invalidateUserSessions` → assert called avec userId | ❌ Wave 0 |
| RBAC-01 | `resetUserPassword` crée nouvelle UserInvitation + envoie email | unit | mock prisma + mailer | ❌ Wave 0 |
| RBAC-02 | Page `/invitation/[token]` : token expiré → expired state | smoke | grep `ExpiredState` + test parse page | ❌ Wave 0 |
| RBAC-02 | `acceptInvitation` : updateMany single-use atomique | unit | mock prisma — test count=0 retourne erreur | ❌ Wave 0 |
| RBAC-02 | setPasswordSchema valide 8 chars min + match confirmation | unit | `packages/shared/src/schemas/__tests__/user.test.ts` | ❌ Wave 0 |
| RBAC-03 | nav-config filter par role : ADMIN voit tout, LECTEUR ne voit pas Users/Settings/Historique | unit | test pure function `filterNavForRole(NAV, 'LECTEUR')` | ❌ Wave 0 |
| RBAC-04 | `requireRole(['ADMIN'])` throw ForbiddenError pour LECTEUR | unit | `apps/web/src/lib/__tests__/rbac.test.ts` | ❌ Wave 0 |
| RBAC-04 | `requireRole` throw UnauthorizedError si user.disabledAt | unit | mock validateRequest → user with disabledAt | ❌ Wave 0 |
| RBAC-04 | `validateRequest` retourne null si disabledAt + invalide la session | unit | mock lucia + prisma → assert invalidateSession called | ❌ Wave 0 |
| RBAC-05 | Page `/app/parametres/historique` : ADMIN OK, autres → redirect/error | smoke | grep `requireRole` + parse imports | ❌ Wave 0 |
| RBAC-05 | Filtres URL state : `?userId=X` → where clause appliquée | unit | test pure function `buildAuditWhere(searchParams, tenantId)` | ❌ Wave 0 |
| All | Build complet `pnpm build` reste vert | build | `pnpm --filter @qualiof/web build` | ✅ existant |

### Sampling Rate
- **Per task commit:** `pnpm --filter @qualiof/web test --run <pattern>` (test du fichier impacté)
- **Per wave merge:** `pnpm --filter @qualiof/web test --run` (full Vitest suite)
- **Phase gate:** Full suite green + `pnpm build` + `pnpm --filter @qualiof/db prisma migrate status` clean avant `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `apps/web/src/lib/__tests__/rbac.test.ts` — tests requireRole / hasRole / errors
- [ ] `apps/web/src/server/actions/__tests__/users.test.ts` — tests inviteUser / disableUser / enableUser / resetUserPassword (Vitest, mocks `@qualiof/db`, `@/lib/auth`, `@/lib/mailer`, `lucia.invalidateUserSessions`)
- [ ] `apps/web/src/server/actions/__tests__/user-invitation-accept.test.ts` — tests acceptInvitation (updateMany single-use, hash MDP, AuditLog)
- [ ] `packages/shared/src/schemas/__tests__/user.test.ts` — tests inviteUserSchema, setPasswordSchema, changeRoleSchema
- [ ] `apps/web/src/components/layout/__tests__/nav-config.test.ts` — tests filterNavForRole (pure fn)
- [ ] `apps/web/src/app/app/parametres/utilisateurs/__tests__/page.smoke.test.ts` — smoke imports
- [ ] `apps/web/src/app/app/parametres/historique/__tests__/page.smoke.test.ts` — smoke imports + requireRole guard
- [ ] `apps/web/src/app/invitation/[token]/__tests__/page.smoke.test.ts` — smoke
- [ ] `apps/web/src/app/app/parametres/historique/__tests__/build-audit-where.test.ts` — pure fn de construction du `where` Prisma

**Total Wave 0 :** ~9 fichiers de test à créer. Pattern réplicable depuis Phase 7 (`server/actions/__tests__/tenant-settings.test.ts` qui mock prisma + auth est le modèle exact pour les server actions Users).

## Recommendations

### Plan Breakdown (suggéré planner)

**Plan 08-01 — Foundation: schema + permissions + rbac helper**
- Task 1: Migration Prisma (User +4 champs + UserInvitation model + index)
- Task 2: `packages/shared/src/constants/permissions.ts` (matrix D-02 + helpers canRead/canWrite/rolesWithAccess)
- Task 3: `packages/shared/src/schemas/user.ts` (inviteUserSchema, setPasswordSchema, changeRoleSchema)
- Task 4: `apps/web/src/lib/rbac.ts` (requireRole, hasRole, UnauthorizedError, ForbiddenError) + tests Vitest
- Task 5: Étendre `apps/web/src/lib/auth.ts` (getUserAttributes inclut disabledAt + validateRequest invalide session si disabledAt)
- Verification : `pnpm test --run lib/__tests__/rbac.test.ts` + tsc OK + `prisma migrate dev` appliqué

**Plan 08-02 — Server actions users + email templates**
- Task 1: `apps/web/src/lib/mailer-templates/user-invitation.ts` + `user-password-reset.ts` (réutilise pattern preinscription-reminder-template.ts)
- Task 2: `apps/web/src/server/actions/users.ts` : inviteUser, disableUser, enableUser, resetUserPassword, changeUserRole, resendInvitation
- Task 3: `apps/web/src/server/actions/user-invitation-accept.ts` : acceptInvitation (updateMany single-use + Argon2 + lucia.createSession + redirect /app)
- Task 4: AuditLog conventions — étendre `lib/audit-log.ts` avec helper `logUserAction(opts: { tenantId, adminUserId, targetUserId, action, diff? })`
- Task 5: Tests Vitest (server/actions/__tests__/users.test.ts + user-invitation-accept.test.ts)
- Verification : tests verts, smoke tests OK

**Plan 08-03 — Page publique /invitation/[token]**
- Task 1: `apps/web/src/app/invitation/[token]/page.tsx` (Server Component, valide token, render SetPasswordForm | ExpiredState | AlreadyUsedState)
- Task 2: `apps/web/src/components/users/set-password-form.tsx` (client, react-hook-form + zodResolver, double saisie, action acceptInvitation)
- Task 3: API "resend invitation" déclenchée depuis ExpiredState (notifie l'admin par email)
- Task 4: Smoke test page
- Verification : test page expired/used/active, simulation manuel via dry-run mailer

**Plan 08-04 — UI Page Utilisateurs (RBAC-01)**
- Task 1: `apps/web/src/app/app/parametres/utilisateurs/page.tsx` (Server Component, requireRole(['ADMIN']), liste users tenant)
- Task 2: `apps/web/src/components/users/users-table.tsx` (tableau cols Email · Nom · Rôle · Statut · Dernière connexion · Actions)
- Task 3: `apps/web/src/components/users/invite-user-button.tsx` (Radix Dialog + form react-hook-form)
- Task 4: `apps/web/src/components/users/user-row-actions.tsx` (DropdownMenu : Modifier rôle / Réinitialiser MDP / Désactiver|Réactiver). Confirmations AlertDialog pour désactivation + reset MDP.
- Task 5: `apps/web/src/components/users/change-role-dialog.tsx`
- Task 6: Sidebar — étendre nav-config avec `allowedRoles?`, filter dans `app/app/layout.tsx`, propager prop `nav` à Sidebar + MobileNavDrawer
- Task 7: Smoke test + tests pure fn `filterNavForRole`
- Verification : tester en navigant en tant qu'ADMIN, manuel UAT

**Plan 08-05 — UI Page Historique + login hooks**
- Task 1: `apps/web/src/app/app/parametres/historique/page.tsx` (Server Component, requireRole(['ADMIN']), pagination + filters)
- Task 2: `apps/web/src/components/audit/audit-log-table.tsx` (client, URL state via useSearchParams + router.push)
- Task 3: `apps/web/src/components/audit/audit-diff-modal.tsx` (Radix Dialog, parse `diff` Json, render champ→avant/après)
- Task 4: Helper `buildAuditWhere(searchParams, tenantId)` pure + tests
- Task 5: Étendre `app/login/actions.ts` : sur succès → mettre à jour `user.lastLoginAt` + AuditLog `auth.login.success` ; sur échec → AuditLog `auth.login.failed` (avec email + ip optionnel)
- Task 6: Lien depuis page Paramètres vers Historique (CTA "Voir l'historique")
- Verification : tests pure fn build-audit-where, smoke test, UAT manuel (3 actions → 3 rows visibles)

**Plan 08-06 — Bookkeeping (smoke + validation)**
- Task 1: Apply `requireRole` dans server actions sensibles existantes (tenant-settings, tenant-assets → ADMIN only ; invoices mutations → ADMIN/MANAGER/COMPTABLE ; budget-agefice → ADMIN/MANAGER/COMPTABLE/COMMERCIAL ; suppressions destructives → ADMIN/MANAGER). Vérifier que ces actions existent et identifier le périmètre exact.
- Task 2: VALIDATION.md final + SMOKE.md
- Task 3: Tests d'intégration globale : `pnpm build` + tous Vitest verts + grep coverage requireRole

### Suggested Wave Structure (per plan)

- **Wave 0 :** Bootstrap test fixtures + mocks (1 wave par plan généralement)
- **Wave 1 :** Schema/types/pure helpers (testable sans I/O)
- **Wave 2 :** Server actions / pages (avec mocks I/O)
- **Wave 3 :** Smoke + integration

### Risk Hotspots

1. **Migration schéma + `getUserAttributes` extension** : changement transverse — toute la app re-typecheck. Tester avec `pnpm typecheck` après chaque modif.
2. **Session invalidation timing** : tester manuellement le scénario "admin disable + user reload" en local avant merge.
3. **Bookkeeping Plan 08-06** : application de `requireRole` dans actions existantes peut introduire des regressions (un user MANAGER qui faisait quelque chose peut être bloqué). Lister exhaustivement le périmètre AVANT d'éditer.

## Sources

### Primary (HIGH confidence)
- **Lucia 3.2.2 `core.d.ts`** : `/Users/laurentmarx/Documents/CRM Next gen/files/node_modules/.pnpm/lucia@3.2.2/node_modules/lucia/dist/core.d.ts:29-42` — confirme `invalidateUserSessions(userId)` + `getUserSessions(userId)` + `invalidateSession(sessionId)` natives.
- **Codebase Phase 7** : `apps/web/src/server/actions/tenant-settings.ts` (pattern Server Action discriminée + AuditLog helper), `apps/web/src/lib/audit-log.ts` (computeDiff + logTenantSettingsChange réutilisables), `apps/web/src/server/actions/__tests__/tenant-settings.test.ts` (pattern Vitest mocks).
- **Codebase pattern token public route** : `apps/web/src/app/preinscription/[token]/page.tsx` (lignes 14-32, Server Component force-dynamic, validation token + expired/done states) + `apps/web/src/server/actions/preinscriptions.ts:20` (randomUUID().replace(/-/g, '')).
- **Codebase pattern email** : `apps/web/src/lib/preinscription-reminder-template.ts` (HTML email template avec inline CSS + escapeHtml + OfConfig).
- **Codebase pattern UserMenuButton** : `apps/web/src/components/layout/user-menu-button.tsx` (Radix DropdownMenu + AlertDialog confirmation Phase 4 — pattern à dupliquer pour Désactiver/Reset).
- **Codebase Lucia/Argon2 setup** : `apps/web/src/lib/auth.ts` (lucia config), `apps/web/src/app/login/actions.ts` (Argon2.verify + lucia.createSession), `packages/db/prisma/seed.ts:44` (argon2.hash pattern).
- **Codebase schema** : `packages/db/prisma/schema.prisma:48-81` (UserRole enum + User + AuthSession actuels) ; `packages/db/prisma/schema.prisma:1002-1017` (AuditLog model + indexes [tenantId, createdAt]).
- **CONTEXT.md 08** : décisions D-01..D-10 figées (source de vérité).
- **Phase 7 SUMMARY** : `.planning/phases/07-param-tres-organisme-ditables/07-VALIDATION.md` (pattern test strategy reproductible).

### Secondary (MEDIUM confidence)
- **STACK declaration (CLAUDE.md)** : Lucia 3.2.2 + adapter-prisma 4.0.1 + Argon2 0.41.1 confirmés.
- **REQUIREMENTS.md** : RBAC-01..05 lignes 51-55 — couverture targetée.

### Tertiary (LOW confidence)
- Aucun finding LOW. Phase 8 est entièrement basée sur patterns existants éprouvés.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — tous les composants déjà installés et utilisés.
- Architecture: HIGH — patterns Phase 7 directement transposables (Server Actions, AuditLog, Zod schemas, Vitest mocks).
- Pitfalls: HIGH — Lucia API vérifiée dans .d.ts, pattern token route existant, behaviors observés en pré-inscriptions.
- Open Question #1 (FORMATEUR scope) : MEDIUM — recommandation User.personId proposée mais nécessite validation Laurent au planning. Fallback "punter à Phase 9" disponible.

**Research date:** 2026-05-15
**Valid until:** 2026-06-15 (30 jours — Lucia est stable + Phase 7 patterns figés)
