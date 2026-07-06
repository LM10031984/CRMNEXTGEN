# Phase 8: Multi-utilisateurs et RBAC - Context

**Gathered:** 2026-05-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Activer la gestion fine d'utilisateurs et appliquer concrètement les 6 rôles (ADMIN, MANAGER, FORMATEUR, COMMERCIAL, COMPTABLE, LECTEUR) :
- Page Utilisateurs dans Paramètres (CRUD, invitation, désactivation, reset MDP)
- Flow invitation email tokenisé "définir votre mot de passe"
- Sidebar filtrée selon rôle
- Guards serveur dans les server actions sensibles
- Vue admin AuditLog (qui a fait quoi quand)

Hors scope : Distribution leads auto (Phase 9), Audit Qualiopi blanc (Phase 10), Factures cycle (Phase 11).

</domain>

<decisions>
## Implementation Decisions

### D-01 — Périmètre quantitatif
- **1 à 5 utilisateurs total** (petite équipe Start Academy : Laurent, équipe noyau).
- Conséquence : pas besoin de fonctionnalités haut volume (filtres complexes, exports massifs, suspension temporaire avec re-activation). UI simple = mieux.

### D-02 — Matrice permissions par rôle

Source de vérité à créer dans `packages/shared/src/constants/permissions.ts` (déjà mentionné dans REQUIREMENTS.md).

| Section UI | ADMIN | MANAGER | COMMERCIAL | FORMATEUR | COMPTABLE | LECTEUR |
|---|---|---|---|---|---|---|
| Dashboard `/app` | RW | RW | R | R | R | R |
| Apprenants | RW | RW | RW | R | R | R |
| Sessions | RW | RW | RW | RW (ses sessions uniquement) | R | R |
| Produits | RW | RW | R | R | R | R |
| Formateurs | RW | RW | – | R | – | R |
| Leads | RW | RW | RW | – | – | – |
| Pré-inscriptions | RW | RW | RW | – | – | – |
| Dossiers OPCO | RW | RW | RW | – | RW | R |
| Budget AGEFICE | RW | RW | R | – | RW | R |
| Factures | RW | RW | – | – | RW | R |
| Financeurs | R | R | R | – | R | – |
| Organisations | RW | RW | RW | R | R | R |
| Qualiopi bilan | RW | RW | – | R | R | – |
| **Paramètres OF** | **RW** | – | – | – | – | – |
| **Utilisateurs** | **RW** | – | – | – | – | – |
| **Historique (AuditLog)** | **R** | – | – | – | – | – |

- `RW` = lecture + écriture
- `R` = lecture seule
- `–` = section cachée dans la sidebar + route protégée serveur

Note FORMATEUR : "ses sessions uniquement" sur Sessions → filtre BDD `where: { trainers: { some: { userId } } }`. **DECISION POST-RESEARCH** : punter à Phase 9 — nécessite `User.personId String?` link (User Lucia ↔ Person formateur) qui n'existe pas encore. Phase 8 : FORMATEUR = **lecteur seul des sessions** (toutes les sessions du tenant). Phase 9 ajoutera le scoping personnel quand User-Person link existera.

### D-03 — Schema Prisma User
Ajouter au model `User` :
- `disabledAt: DateTime?` (soft-delete, null = actif)
- `lastLoginAt: DateTime?` (pour info "Connecté pour la dernière fois...")
- `invitedAt: DateTime?` (date envoi invitation)
- `invitedBy: String?` (User.id de l'admin qui a invité)

Nouveau model `UserInvitation` :
- `id` (UUID)
- `tenantId` (FK Tenant)
- `email` (unique pour un tenantId actif)
- `token` (random 32 char, hashé en BDD)
- `expiresAt: DateTime` (création + 7 jours)
- `usedAt: DateTime?` (null = pas encore utilisée)
- `userId` (FK User, set after acceptance)
- `role: UserRole` (rôle assigné à l'invitation)

### D-04 — Flow invitation email
1. Admin clique "Inviter un utilisateur" → modale avec email + prénom + nom + rôle.
2. Server action `inviteUser` :
   - Crée User en BDD avec `hashedPwd = ''` (placeholder, ne peut pas se connecter)
   - Crée UserInvitation avec token random + expiresAt à J+7
   - Envoie email depuis `formation@start-academy.fr` (Tenant.emailFrom Phase 7) :
     - Sujet : "Bienvenue sur QualiOF — définissez votre mot de passe"
     - Lien : `{NEXTAUTH_URL}/invitation/{token}` (route publique, comme `/preinscription/[token]`)
   - AuditLog action `users.invite`
3. User clique le lien → page publique `/invitation/[token]` :
   - Valide token (non expiré, non utilisé)
   - Formulaire "Définir votre mot de passe" (8 chars min, double saisie)
   - Server action met `hashedPwd` (Argon2) + `UserInvitation.usedAt`
   - Login automatique (Lucia session) + redirect `/app`
4. Si token expiré : page "Lien expiré, contactez votre admin" + bouton "Re-envoyer" (qui notifie l'admin par email).

### D-05 — Désactivation user (soft-delete)
- Bouton "Désactiver" dans la page Utilisateurs (icône power-off).
- Server action `disableUser` : set `User.disabledAt = now()` + invalide toutes les `AuthSession` du user (force logout) + AuditLog action `users.disable`.
- User désactivé ne peut plus se connecter (`validateRequest` retourne `null` si `user.disabledAt != null`).
- User désactivé reste en BDD pour conserver `AuditLog.userId`, `Lead.assignedTo`, etc.
- Bouton "Réactiver" pour annuler : `disabledAt = null` + AuditLog `users.enable`.
- Pas de hard-delete dans la phase (out of scope, RGPD réservé phase ultérieure).

### D-06 — Reset MDP par admin
- Bouton "Réinitialiser mot de passe" dans la liste des utilisateurs.
- Confirmation AlertDialog.
- Server action `resetUserPassword` : génère nouveau UserInvitation (token + 7j) + envoie email "Réinitialisation MDP demandée" + AuditLog `users.password.reset_requested`.
- L'user reçoit l'email + clique → même flow que l'invitation initiale pour redéfinir.

### D-07 — Sidebar filtrée par rôle
- Étendre `nav-config.ts` (déjà refactorisé Phase 2) : chaque item nav reçoit `allowedRoles: UserRole[]`.
- Layout serveur lit `user.role` (déjà disponible via Lucia) et filtre la liste passée à `SidebarNav` / `MobileNavDrawer`.
- Aucune route serveur n'utilise allowedRoles pour la sécurité — ce n'est qu'un filtre VISUEL. La sécurité réelle est dans D-08.

### D-08 — Guards server actions
Helper `requireRole(allowed: UserRole[])` dans `apps/web/src/lib/rbac.ts` :
```ts
export async function requireRole(allowed: UserRole[]): Promise<User> {
  const { user } = await validateRequest();
  if (!user) throw new UnauthorizedError();
  if (user.disabledAt) throw new UnauthorizedError('Compte désactivé');
  if (!allowed.includes(user.role)) throw new ForbiddenError(`Rôle ${user.role} non autorisé`);
  return user;
}
```

À appliquer dans server actions sensibles (au-delà du `validateRequest` actuel) :
- Toutes les mutations dans `tenant-settings.ts`, `tenant-assets.ts` → ADMIN only
- Server actions invitation/désactivation users → ADMIN only
- Mutations Factures → ADMIN, MANAGER, COMPTABLE
- Mutations Budget AGEFICE → ADMIN, MANAGER, COMPTABLE, COMMERCIAL
- Suppressions destructives (apprenants, sessions, organisations) → ADMIN, MANAGER

Le helper retourne le User pour éviter `validateRequest()` doublon.

### D-09 — Page Historique (AuditLog) admin
- Route `/app/parametres/historique` (sous-section de Paramètres) ou item sidebar séparé "Historique" — à arbitrer planning (préférence : item sidebar séparé sous "Paramètres" group).
- ADMIN only.
- Liste paginée des `AuditLog` rows, **toutes actions** (pas seulement les sensibles — Laurent Q5 "tout ce qui se passe").
- Filtres : qui (User select), quand (date range), type d'action (action enum select).
- Colonnes : Date · User · Action · Entité · Diff (modal détail JSON).
- Pas d'export pour phase 8 (deferred si besoin).

### D-10 — Conventions AuditLog actions étendues
Convention `action` enrichie depuis Phase 7 :
- `parameters.update` / `parameters.upload.*` / `parameters.reset.*` (Phase 7, déjà OK)
- `users.invite` / `users.invitation.resend`
- `users.password.reset_requested` / `users.password.set` (par user lui-même via invitation/reset)
- `users.disable` / `users.enable`
- `users.role.change`
- `auth.login.success` / `auth.login.failed` (optionnel — à arbitrer planning, peut polluer si trop verbeux)

Décision : tracker login.success + login.failed pour permettre détection brute-force (utile même pour 5 users — bonne pratique). Logout pas tracké (peu utile).

### Claude's Discretion
- UI listing users : tableau avec colonnes Email · Nom · Rôle · Statut · Dernière connexion · Actions
- Modal "Inviter un user" : Radix Dialog (cohérent Phase 7 paramètres)
- Email templates dans `apps/web/src/lib/mailer-templates/` (créer dossier)
- Page publique `/invitation/[token]` : layout minimaliste (cohérent `/preinscription/[token]`)
- Sidebar filter : implémentation côté Layout (Server Component, lit user.role)
- Toast confirmations (sonner) sur chaque mutation
- Tests Vitest : helper requireRole + server action inviteUser + smoke page utilisateurs

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Code existant
- `packages/db/prisma/schema.prisma` model User + enum UserRole + model AuthSession + model AuditLog
- `apps/web/src/lib/auth.ts` (Lucia setup, validateRequest)
- `apps/web/src/app/login/actions.ts` (pattern Argon2 hashedPwd)
- `apps/web/src/app/p/[token]/page.tsx` (pattern public token route — pour invitation)
- `apps/web/src/lib/mailer.ts` (SMTP transport + dry-run, post-Phase 7 `getOfConfig().emailFrom`)
- `apps/web/src/lib/preinscription-reminder-template.ts` (pattern email HTML)
- `apps/web/src/lib/audit-log.ts` (helpers `computeDiff` + `logTenantSettingsChange` Phase 7 — à généraliser pour users actions)
- `apps/web/src/components/layout/sidebar.tsx` + `nav-config.ts` (sidebar à filtrer)
- `apps/web/src/server/actions/tenant-settings.ts` (pattern Server Action discriminée `{ ok, ... }`)

### Specs / contraintes
- CLAUDE.md — pattern Server Action, tenantId scope, kebab-case, Radix UI primitives, sonner toasts
- Phase 7 SUMMARY (`.planning/phases/07-param-tres-organisme-ditables/07-04-SUMMARY.md`) — pattern Settings inline-edit + AlertDialog pour confirmations destructives
- REQUIREMENTS.md RBAC-01..05 (lignes 51-55)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `validateRequest()` — déjà partout, à compléter pour rejeter `user.disabledAt`
- `Argon2` hash — pattern `apps/web/src/app/login/actions.ts`
- `AuthSession` Prisma + Lucia adapter — invalider sessions sur disable user
- Pattern public token route — `/app/p/[token]` (preinscription) → réutiliser pour `/invitation/[token]`
- Email mailer dry-run en dev — déjà OK depuis Phase 7
- `lib/audit-log.ts` (helpers Phase 7) — étendre pour actions users.*
- `AlertDialog` Radix — pour confirmer désactivation user

### Established Patterns
- Server Actions discriminées `{ ok, ... }` partout
- Zod schemas dans `packages/shared/src/schemas/` (créer `user.ts`)
- AuditLog convention action namespaced (`parameters.*`, `users.*`) — Phase 7 a posé la base
- Sidebar nav config centralisée (Phase 2 refactor)

### Integration Points
- Layout `/app/layout.tsx` lit user via validateRequest → passer user.role à SidebarNav
- Tous les server actions sensibles : ajouter `await requireRole([...])` au début
- Page Paramètres (Phase 7) : ajouter un nouvel onglet/section "Utilisateurs" OU créer item sidebar séparé
- Email mailer : nouveau template `userInvitationEmail({ token, firstName, expiresAt, fromUser })`

</code_context>

<specifics>
## Specific Ideas

- Q1 Laurent : "1 à 5 utilisateurs" → simplicité UI, pas de pagination complexe.
- Q2 Laurent : matrice par défaut acceptée (ADMIN/MANAGER/COMMERCIAL/FORMATEUR/COMPTABLE/LECTEUR).
- Q5 Laurent : "tout ce qui se passe" → AuditLog UI affiche tous types d'actions, pas seulement sensibles.
- Q3/Q4 délégués → 7 jours invitation, soft-delete uniquement (décision Claude validée Laurent "yes").

</specifics>

<deferred>
## Deferred Ideas

- **2FA / authentification multi-facteur** → hors scope, sécurité avancée pour phase ultérieure.
- **SSO / OAuth Google** → out of scope, Lucia password classique suffit pour OF interne.
- **Hard-delete user (RGPD)** → phase ultérieure si demande explicite RGPD.
- **Audit log export CSV / FEC** → phase ultérieure.
- **Suspension temporaire avec date de réactivation** → over-engineering pour 5 users.
- **Audit log retention policy** → phase ultérieure.
- **Permissions granulaires fine-grain** (ex. user X peut modifier session Y mais pas Z) → over-engineering, role-based suffit.
- **Transfert de tâches / leads à un autre user lors de désactivation** → manuel, pas automatisé phase 8.

</deferred>

---

*Phase: 08-multi-utilisateurs-et-rbac*
*Context gathered: 2026-05-15*
