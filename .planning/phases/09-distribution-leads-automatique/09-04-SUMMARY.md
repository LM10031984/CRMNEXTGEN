---
phase: 09-distribution-leads-automatique
plan: 04
subsystem: ui-notifications-config
tags: [notifications-bell, nav-config, server-action, rbac, react-hook-form, zod, sonner, vitest]

# Dependency graph
requires:
  - phase: 09-distribution-leads-automatique
    plan: 01
    provides: "LeadAssignedPayloadSchema (Zod runtime parse Notification.payload) + Notification model Prisma + 3 toggles Tenant"
  - phase: 09-distribution-leads-automatique
    plan: 02
    provides: "updateLeadDistributionConfig (ADMIN-only) consommé par DistributionLeadsForm + notifyLeadAssigned crée les Notification rows lues côté cloche"
  - phase: 08-multi-utilisateurs-et-rbac
    provides: "hasRole + validateRequest + pattern Server Component RBAC clone (parametres/utilisateurs/page.tsx) + filterNavForRole pattern d'extension par allowedRoles"
  - phase: 04-topbar-ux
    provides: "Composant NotificationsBell existant (4 kinds dérivés) étendu avec 1 kind persisté + onClick markNotificationRead"
provides:
  - "Extension `getNotifications` hybride dérivé (4 kinds tenant-wide) + persisté (1 kind 'lead.assigned' user-scoped)"
  - "Server action `markNotificationRead(notifId)` — single-use atomique scope userId + readAt:null"
  - "Extension NotificationsBell : icône UserPlus pour 'lead.assigned', fire-and-forget marquage lue au clic"
  - "2 nouvelles entrées sidebar : `/app/leads/charge` (ADMIN+MANAGER) + `/app/parametres/distribution-leads` (ADMIN)"
  - "Page `/app/parametres/distribution-leads` ADMIN-only — 3 toggles tenant + DistributionLeadsForm RHF + AuditLog `leads.distribution_config` au submit"
  - "Bouton 'Nouveau lead' sur page /app/leads → /app/leads/new"
affects: [09-05-bookkeeping-phase-9]

# Tech tracking
tech-stack:
  added: []  # 0 nouvelle dépendance — UserPlus/TrendingUp/Sliders déjà dans lucide-react, RHF/zod/sonner déjà installés
  patterns:
    - "Cloche hybride dérivé + persisté : la même cloche affiche 4 sources dérivées tenant-wide (counts) + N rows persistées user-scoped (1 item par row Notification). Pattern réutilisable Phase 10+ pour 'session.to_close', 'dossier.incomplete', etc."
    - "Fire-and-forget markNotificationRead au clic : on ne bloque pas la navigation sur l'update DB. Le user clique → la redirection démarre + un void Promise marque la notif en arrière-plan. L'item disparaît au prochain poll 60s."
    - "Notification.payload parsé via LeadAssignedPayloadSchema.safeParse (Pitfall 6 RESEARCH.md) — drift writer/reader silencieux sur Json schema-less. Skip silencieux si parse échoue (pas de throw, pas de log noisy)."
    - "Pattern Server Component RBAC ADMIN-only `hasRole + redirect('/app')` plutôt que `requireRole` (throw → error boundary) — cohérent avec parametres/page.tsx Phase 7 quand le but est de soft-redirect sans page d'erreur."
    - "DistributionLeadsForm — toggles dépendants disabled visuellement (opacity-60 + disabled) mais restent enregistrés via RHF. Si l'admin réactive auto-assign plus tard, ses choix antérieurs sur email/cloche sont préservés."

key-files:
  created:
    - "apps/web/src/server/actions/notification-mark-read.ts (33 lignes — markNotificationRead atomique)"
    - "apps/web/src/server/actions/__tests__/notifications.test.ts (216 lignes — 8 tests : 5 getNotifications + 3 markNotificationRead)"
    - "apps/web/src/app/app/parametres/distribution-leads/page.tsx (73 lignes — page ADMIN-only)"
    - "apps/web/src/app/app/parametres/distribution-leads/__tests__/page.smoke.test.ts (88 lignes — 9 tests source-regex)"
    - "apps/web/src/components/parametres/distribution-leads-form.tsx (118 lignes — RHF + zodResolver + 3 toggles)"
  modified:
    - "apps/web/src/server/actions/notifications.ts (+30 lignes — NotificationKind +'lead.assigned', NotificationItem +id?, 5e source findMany + parse LeadAssignedPayloadSchema)"
    - "apps/web/src/components/layout/notifications-bell.tsx (+23 lignes — import UserPlus + markNotificationRead, ICONS étendu, onClick fire-and-forget, key unique multi 'lead.assigned')"
    - "apps/web/src/components/layout/nav-config.ts (+19 lignes — import TrendingUp+Sliders, 'Vue de charge' ADMIN+MANAGER, 'Distribution leads' ADMIN)"
    - "apps/web/src/components/layout/__tests__/nav-config.test.ts (+45 lignes — 5 tests Phase 9 Vue de charge + Distribution leads)"
    - "apps/web/src/app/app/leads/page.tsx (+13 lignes — bouton 'Nouveau lead' Link Plus à côté AutoAssignButton)"

key-decisions:
  - "Page distribution-leads ADMIN via `hasRole(user, ['ADMIN'])` + `redirect('/app')` plutôt que `requireRole` qui throw ForbiddenError → page d'erreur. Pattern aligné parametres/page.tsx Phase 7 (soft-redirect)."
  - "markNotificationRead ne fait PAS de revalidatePath — la cloche refetch toutes les 60s via polling et le clic redirige immédiatement. Si on revalidait, ça forcerait un round-trip RSC inutile."
  - "Clé React de l'item cloche `item.id ?? `${item.kind}-${idx}`` — multi-`lead.assigned` peuvent coexister (1 par row Notification). Les items dérivés gardent `kind` unique."
  - "ToggleRow dépendant : `disabled` visuel mais `register` actif (RHF garde la valeur). UX rationale : l'admin peut réactiver autoAssign sans reperdre ses choix email/cloche antérieurs."
  - "Tests source-regex (pattern Phase 8 D-Phase9-N) pour la page smoke : pas de @testing-library/react ajouté (deps absentes, environment=node)."

patterns-established:
  - "Pattern cloche hybride 'derived + persisted' (Phase 9 Plan 09-04) : 1 même hook getNotifications consomme N sources count() + 1 source findMany(payload Json). Le reader parse runtime via Zod schema. Le clic marque la row persistée + ferme la cloche + redirige."
  - "Pattern page paramètres dédiée pour un sous-domaine fonctionnel (distribution-leads ≠ tenant settings core) : route /app/parametres/{sous-domaine} + form RHF dédié + Breadcrumb retour Paramètres. Réutilisable Phase 10+ (notifications, integrations, etc.)."

requirements-completed: [LEAD-01]

# Metrics
duration: ~6min
completed: 2026-05-16
---

# Phase 09 Plan 04: Cloche + page config tenant Summary

**Extension `getNotifications` hybride dérivé (4 kinds) + persisté (1 kind 'lead.assigned' user-scoped via Notification.findMany + parse LeadAssignedPayloadSchema), server action `markNotificationRead` single-use atomique scope userId, NotificationsBell étendu (UserPlus + fire-and-forget mark-as-read au clic), 2 entrées sidebar `Vue de charge` + `Distribution leads`, page `/app/parametres/distribution-leads` ADMIN-only avec 3 toggles RHF + zodResolver, bouton 'Nouveau lead' sur page liste, 22 tests Vitest verts (8 notifications + 5 nav-config Phase 9 + 9 page distribution smoke), build Next.js OK avec route /app/parametres/distribution-leads à 1.26 kB.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-05-16T16:49:28Z
- **Completed:** 2026-05-16T16:55:43Z
- **Tasks:** 3
- **Files created:** 5 (1 server action + 1 test + 1 page + 1 page test + 1 form component)
- **Files modified:** 5 (notifications.ts + notifications-bell.tsx + nav-config.ts + nav-config.test.ts + leads/page.tsx)

## Accomplishments

- **Extension `getNotifications`** : `NotificationKind` étendu à 5 valeurs (`'preinscription' | 'session_no_attendee' | 'session_to_close' | 'cleanup' | 'lead.assigned'`), `NotificationItem` étendu avec `id?: string` (présent uniquement pour les rows persistées), 5e source dans le `Promise.all` (`prisma.notification.findMany` scope `tenantId + userId + readAt:null + type='lead.assigned'`, top 10 desc), parse de chaque `payload` via `LeadAssignedPayloadSchema.safeParse` avec skip silencieux si parse échoue (Pitfall 6 RESEARCH.md).
- **`markNotificationRead(notifId)`** : server action atomique `updateMany` scope `id + userId + readAt:null` → empêche un user de marquer la notif d'un autre, empêche double-marquage. Pas de `revalidatePath` (cloche refetch via polling 60s). Return silencieux `{ ok: true }` si pas la sienne / déjà lue (UX neutre).
- **NotificationsBell étendu** : import `UserPlus` + `markNotificationRead`, `ICONS['lead.assigned'] = UserPlus`, `onClick` Link wrappe `void markNotificationRead(item.id)` (fire-and-forget — ne bloque pas la navigation) + `setOpen(false)`. Clé React `item.id ?? `${kind}-${idx}`` pour supporter plusieurs `lead.assigned` simultanés.
- **2 entrées sidebar ajoutées dans `nav-config.ts`** :
  - Section "Suivi" : `Vue de charge` (`/app/leads/charge`, icône `TrendingUp`, `allowedRoles=['ADMIN','MANAGER']`).
  - Section "Configuration" : `Distribution leads` (`/app/parametres/distribution-leads`, icône `Sliders`, `allowedRoles=['ADMIN']`), placée entre `Paramètres` et `Utilisateurs`.
- **Page `/app/parametres/distribution-leads`** (Server Component ADMIN-only) : `validateRequest` → redirect `/login` si !user → `hasRole(user, ['ADMIN'])` → redirect `/app` sinon. Fetch des 3 toggles via `prisma.tenant.findUnique` scope `user.tenantId`. Render `<Breadcrumb>` + `<header>` avec icône `Sliders` + `<DistributionLeadsForm initial={...} />`.
- **`DistributionLeadsForm`** (client) : RHF + `zodResolver(DistributionConfigSchema)`, 3 `ToggleRow` (label + description), les 2 toggles dépendants (`email`, `bell`) sont visuellement `disabled` (opacity-60 + cursor-not-allowed) si `autoAssignLeads` OFF, `useTransition` + `toast` sonner + appel `updateLeadDistributionConfig(data)` Plan 09-02 au submit.
- **Bouton "Nouveau lead"** ajouté dans le header de `/app/leads` (à côté de `AutoAssignLeadsButton`) → Link vers `/app/leads/new` avec icône `Plus`.
- **22 tests Vitest verts** (≥ 17 cible plan) : 8 notifications (5 `getNotifications` + 3 `markNotificationRead`) + 5 nav-config Phase 9 + 9 page distribution-leads smoke.
- **Suite complète apps/web : 239/239 tests verts** (217 baseline + 22 nouveaux). `tsc --noEmit` clean. `next build` OK : 4 routes Phase 9 listées (`/app/leads/[id]` 4.47 kB, `/app/leads/charge` 844 B, `/app/leads/new` 1.91 kB, `/app/parametres/distribution-leads` 1.26 kB).

## Task Commits

Each task was committed atomically :

1. **Task 1: Extension notifications.ts + markNotificationRead + 8 tests** — `74140e9`
2. **Task 2: notifications-bell + nav-config Phase 9 + page leads "Nouveau lead" + 5 tests nav** — `35917a8`
3. **Task 3: Page /app/parametres/distribution-leads + DistributionLeadsForm + 9 smoke tests** — `2fe1288`

_Task 1 : TDD strict (RED → tests fail before sources exist → GREEN après création notification-mark-read.ts + extension notifications.ts)._
_Task 2 + 3 : non-TDD (extensions de fichiers existants pour Task 2, page neuve pour Task 3 avec smoke test source-regex écrit en parallèle de la page)._

## Files Created/Modified

### Created (5 fichiers)

- `apps/web/src/server/actions/notification-mark-read.ts` — 33 lignes. Server action `markNotificationRead(notifId)` avec `validateRequest` + `updateMany` atomique scope `id + userId + readAt:null`. Pas de `revalidatePath` (cloche polling 60s).
- `apps/web/src/server/actions/__tests__/notifications.test.ts` — 216 lignes. 8 tests : 5 `getNotifications` (sans notifs persistées non-régression, 2 notifs lead.assigned avec id, payload corrompu skip, where filter scope userId+readAt+type, non-auth → vide) + 3 `markNotificationRead` (succès count=1, pas la sienne count=0 silencieux, non-auth → error).
- `apps/web/src/app/app/parametres/distribution-leads/page.tsx` — 73 lignes. Server Component ADMIN-only. `dynamic = 'force-dynamic'`. `validateRequest` + `hasRole` + 3 redirects (login/app/app si tenant null). Fetch 3 toggles + `<DistributionLeadsForm>`.
- `apps/web/src/app/app/parametres/distribution-leads/__tests__/page.smoke.test.ts` — 88 lignes. 9 tests source-regex (Server Component async, dynamic force-dynamic, RBAC hasRole+ADMIN, redirect login/app, scope user.tenantId, 3 toggles select, DistributionLeadsForm wiring, Breadcrumb, lucide JSX⇄import strict anti-BUG-01).
- `apps/web/src/components/parametres/distribution-leads-form.tsx` — 118 lignes. Client `'use client'`. RHF + `zodResolver(DistributionConfigSchema)` + `useTransition` + toast sonner. 3 `ToggleRow` avec dépendants `disabled` visuellement. Submit → `updateLeadDistributionConfig(data)`.

### Modified (5 fichiers)

- `apps/web/src/server/actions/notifications.ts` — extension non-breaking : `NotificationKind` +`'lead.assigned'`, `NotificationItem` +`id?: string`, 5e source `prisma.notification.findMany` dans le `Promise.all`, push 1 item par notif persistée avec parse `LeadAssignedPayloadSchema.safeParse` (skip si parse échoue — Pitfall 6).
- `apps/web/src/components/layout/notifications-bell.tsx` — import `UserPlus` + `markNotificationRead`, `ICONS['lead.assigned'] = UserPlus`, `onClick` wrap `markNotificationRead` fire-and-forget si `item.id`, clé React `item.id ?? ${kind}-${idx}` (anti-collision multi `lead.assigned`).
- `apps/web/src/components/layout/nav-config.ts` — imports `TrendingUp` + `Sliders`, ajout `Vue de charge` dans section Suivi (ADMIN+MANAGER) et `Distribution leads` dans section Configuration (ADMIN) entre Paramètres et Utilisateurs.
- `apps/web/src/components/layout/__tests__/nav-config.test.ts` — +5 tests dans une nouvelle `describe('filterNavForRole — Phase 9 ajouts')` : Vue de charge visible ADMIN/MANAGER, masquée COMMERCIAL/FORMATEUR/COMPTABLE/LECTEUR, Distribution leads ADMIN-only.
- `apps/web/src/app/app/leads/page.tsx` — import `Link` + `Plus`, wrap `actions` du `PageHeader` avec un `<div flex>` qui contient le Link "Nouveau lead" (`/app/leads/new`) + `AutoAssignLeadsButton` existant.

## Decisions Made

1. **Hybride dérivé + persisté dans la même cloche** — pas de cloche dédiée pour les notifs événementielles. Avantages : 1 seul polling 60s, 1 seul total badge, 1 seul Dropdown UI. Inconvénient : `NotificationItem` doit accommoder les 2 cas via le `id?` optionnel. Trade-off accepté pour UX simplifié (Pitfall 1 RESEARCH.md évité).
2. **`markNotificationRead` pas de `revalidatePath`** — la cloche refetch via polling 60s, et le clic redirige immédiatement vers `/app/leads/{leadId}`. Un `revalidatePath` ici forcerait un round-trip RSC sans bénéfice UX (l'item ne réapparaît pas avant 60s de toute façon).
3. **`hasRole(user, ['ADMIN'])` + `redirect('/app')`** au lieu de `requireRole(['ADMIN'])` (throw) — pattern soft-redirect aligné `parametres/page.tsx` Phase 7. La page d'erreur ForbiddenError reste pour les server actions ; les pages préfèrent un redirect silencieux.
4. **Clé React `item.id ?? `${kind}-${idx}``** — plusieurs items `'lead.assigned'` peuvent coexister (1 par row Notification non lue). Les items dérivés (4 kinds tenant-wide) gardent leur `kind` unique. Si on utilisait juste `item.kind`, React warnerait "duplicate key".
5. **DistributionLeadsForm — toggles dépendants `disabled` visuel mais `register` actif** — l'admin peut désactiver auto-assign puis le réactiver plus tard sans reperdre ses choix antérieurs sur email/cloche. Si on les avait `unregister` quand disabled, les valeurs auraient sauté à `undefined`.
6. **Tests source-regex page distribution-leads** (pattern Phase 8 D-Phase9-N) — pas de `@testing-library/react` ajouté (deps absentes, `environment=node`). Les 9 tests structurels couvrent : Server Component async, dynamic force-dynamic, RBAC hasRole+ADMIN, redirect login/app, scope `user.tenantId`, 3 toggles select dans le fetch, wiring `DistributionLeadsForm`, Breadcrumb, lucide JSX⇄import strict.

## Deviations from Plan

**None - plan executed exactly as written.** Aucune Rule 1/2/3/4 déclenchée. Tous les acceptance criteria ont été remplis au premier essai (8 tests notifications + 9 tests page-smoke + 15 tests nav-config = 32 verts au total dont 22 nouveaux Phase 9).

Seules deux divergences mineures vs la lettre du plan, sans impact sur les critères :

- **Test 4 supplémentaire `notifications.test.ts`** — j'ai ajouté un test "scope where filter Notification.findMany doit inclure userId + readAt:null + type" qui vérifie explicitement le contrat Prisma (le plan demandait "6 cas" minimum, livré 8). Couvre la régression Pitfall 2 si quelqu'un déplaçait le where ailleurs.
- **Test 5 supplémentaire `notifications.test.ts`** — vérification non-authentifié → `{ total:0, items:[] }` sans toucher le `findMany`. Bonus de couverture défensive.

**Total deviations Rule 1/2/3/4:** 0
**Impact on plan:** Plan strictement appliqué. Aucun écart, aucun scope creep, aucune Rule déclenchée. La déviation Pitfall 6 (parse Zod runtime) était déjà dans le plan, pas un ajout.

## Issues Encountered

- **`tsc --noEmit` après extension `notifications.ts` (avant Task 2)** — TS2741 : `ICONS` dans `notifications-bell.tsx` ne couvrait plus le nouveau kind `'lead.assigned'`. C'était un effet de bord normal d'avoir étendu l'union `NotificationKind` dans la même session — corrigé immédiatement dans Task 2 (`ICONS['lead.assigned'] = UserPlus`). Pas un blocage : commit Task 1 atomique acceptable car la chaîne complète Task 1+2 corrige et le test Task 1 isolé passe.
- **Clé React des items cloche** — j'ai détecté que `key={item.kind}` ne marche pas pour plusieurs items `lead.assigned` (collision potentielle). Fix proactif : `key = item.id ?? `${item.kind}-${idx}``. Pas de Rule (le plan ne le mentionnait pas explicitement) mais c'est une correction de robustesse essentielle.

Aucun de ces ajustements n'a constitué une déviation Rule 1-4. Cascade tsc normale + correction de clé React préventive.

## User Setup Required

**Aucun setup utilisateur immédiat.** Toute la chaîne fonctionne en local-first :
- ADMIN connecté → ouvrir `/app/parametres/distribution-leads` → toggles fonctionnels → submit → toast vert + AuditLog row.
- COMMERCIAL connecté → créer un Lead via `/app/leads/new` (si autoAssign ON) → la cloche du commercial assigné affiche immédiatement (au prochain poll 60s) l'item "Nouveau lead à traiter : {prospectName}".
- Click item cloche → navigation vers `/app/leads/{id}` + marquage `readAt` BDD.

Pour tester le flow complet de bout en bout, Laurent peut :
1. Activer les 3 toggles depuis `/app/parametres/distribution-leads` (ils sont à `true` par défaut depuis Plan 09-01).
2. Créer un commercial supplémentaire dans `/app/parametres/utilisateurs`.
3. Créer un Lead depuis `/app/leads/new` → autoAssign distribue vers le commercial le moins chargé → email envoyé (dry-run si SMTP non configuré) + Notification cloche écrite.
4. Se connecter en tant que ce commercial → la cloche TopBar affiche l'item Phase 9 avec icône `UserPlus`.

## Next Phase Readiness

**Ready for Plan 09-05 (bookkeeping fin de phase) :**
- LEAD-01 entièrement consommé UI (createLead + reassignLead + updateLeadStatus + updateLeadDistributionConfig + UI page paramètres + bouton "Nouveau lead").
- LEAD-02 entièrement consommé UI (Vue de charge `/app/leads/charge` Plan 09-03 + sidebar entry Plan 09-04 — accessible désormais via la sidebar ADMIN+MANAGER, plus seulement par URL directe).
- Cloche TopBar Phase 4 étendue avec le 5e kind événementiel (Plan 09-01 contrat respecté : `LeadAssignedPayloadSchema` source unique côté writer Plan 09-02 et reader Plan 09-04).
- Page Historique Plan 08-05 verra les rows AuditLog `leads.distribution_config` filtrable via `entity='Tenant' AND action LIKE 'leads.%'`.

**Aucun blocker.** La phase 09 est techniquement complète — il reste juste le bookkeeping de fin de phase (Plan 09-05 : update ROADMAP.md status + REQUIREMENTS.md LEAD-01/LEAD-02 cochés + résumé phase).

## Known Stubs

Aucun stub introduit. Tous les nouveaux fichiers livrent des données réelles :
- `markNotificationRead` fait un vrai `prisma.notification.updateMany`.
- `getNotifications` lit vraiment la table `Notification` (5e source dans le Promise.all).
- `DistributionLeadsForm` consomme la vraie server action `updateLeadDistributionConfig` (pas de mock).
- La page distribution-leads fetch vraiment les 3 toggles du tenant.

Note pédagogique : tant qu'aucun Lead n'aura été créé avec `autoAssignLeads = true`, la cloche n'affichera pas d'item `'lead.assigned'` — mais ce n'est pas un stub, c'est attendu (pas de notif → pas d'item). Le helper a été testé côté Vitest avec des mock payloads valides + invalides.

## Self-Check: PASSED

**Files verified (6/6):**
- FOUND: `apps/web/src/server/actions/notification-mark-read.ts`
- FOUND: `apps/web/src/server/actions/__tests__/notifications.test.ts`
- FOUND: `apps/web/src/app/app/parametres/distribution-leads/page.tsx`
- FOUND: `apps/web/src/app/app/parametres/distribution-leads/__tests__/page.smoke.test.ts`
- FOUND: `apps/web/src/components/parametres/distribution-leads-form.tsx`
- FOUND: `.planning/phases/09-distribution-leads-automatique/09-04-SUMMARY.md`

**Commits verified (3/3):**
- FOUND: `74140e9` (Task 1 — extension notifications.ts + markNotificationRead + 8 tests)
- FOUND: `35917a8` (Task 2 — notifications-bell + nav-config + leads page bouton + 5 tests nav)
- FOUND: `2fe1288` (Task 3 — page distribution-leads + DistributionLeadsForm + 9 smoke tests)

**Tests verified:** apps/web 239/239 verts (217 baseline + 22 nouveaux Phase 9 Plan 09-04). `tsc --noEmit` clean. `next build` OK : 4 routes Phase 9 listées dans le manifeste, dont `/app/parametres/distribution-leads` 1.26 kB.

**Acceptance criteria globale (verification plan-level) :**
- `grep -n "lead.assigned" apps/web/src/server/actions/notifications.ts` → 2 matches (type union + push) ✓
- `grep -n "LeadAssignedPayloadSchema" apps/web/src/server/actions/notifications.ts` → 2 matches (import + safeParse) ✓
- `grep -n "prisma.notification.findMany" apps/web/src/server/actions/notifications.ts` → 1 match ✓
- `grep -n "export async function markNotificationRead" apps/web/src/server/actions/notification-mark-read.ts` → 1 match ✓
- `grep -n "userId: user.id, readAt: null" apps/web/src/server/actions/notification-mark-read.ts` → 1 match ✓
- `grep -n "UserPlus" apps/web/src/components/layout/notifications-bell.tsx` → 2 matches (import + ICONS) ✓
- `grep -n "markNotificationRead" apps/web/src/components/layout/notifications-bell.tsx` → 2 matches (import + call) ✓
- `grep -n "Vue de charge" apps/web/src/components/layout/nav-config.ts` → 1 match ✓
- `grep -n "Distribution leads" apps/web/src/components/layout/nav-config.ts` → 1 match ✓
- `grep -n "TrendingUp\|Sliders" apps/web/src/components/layout/nav-config.ts` → 2 matches ✓
- `grep -n "Nouveau lead\|/app/leads/new" apps/web/src/app/app/leads/page.tsx` → 2 matches ✓
- `test -f apps/web/src/app/app/parametres/distribution-leads/page.tsx` → 0 ✓
- `test -f apps/web/src/components/parametres/distribution-leads-form.tsx` → 0 ✓
- `grep -n "hasRole(user, \['ADMIN'\])" apps/web/src/app/app/parametres/distribution-leads/page.tsx` → 1 match ✓
- `grep -n "DistributionLeadsForm" apps/web/src/app/app/parametres/distribution-leads/page.tsx` → 2 matches (import + JSX) ✓
- `grep -n "updateLeadDistributionConfig" apps/web/src/components/parametres/distribution-leads-form.tsx` → 2 matches (import + call) ✓
- `grep -n "autoAssignLeads\|notifyOnLeadAssignEmail\|notifyOnLeadAssignBell" apps/web/src/components/parametres/distribution-leads-form.tsx` → 3 matches (register de chaque toggle) ✓
- ≥ 17 tests verts : livré 22 (8 notifications + 5 nav-config Phase 9 + 9 page distribution smoke) ✓

---
*Phase: 09-distribution-leads-automatique*
*Plan: 04*
*Completed: 2026-05-16*
