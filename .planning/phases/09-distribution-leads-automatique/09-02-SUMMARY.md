---
phase: 09-distribution-leads-automatique
plan: 02
subsystem: server-actions
tags: [server-actions, rbac, audit-log, notifications, lead, vitest, tdd]

# Dependency graph
requires:
  - phase: 09-distribution-leads-automatique
    plan: 01
    provides: "CreateLeadSchema + DistributionConfigSchema + renderLeadAssignedEmail + Tenant 3 toggles + Lead.wonAt + Notification model"
  - phase: 08-multi-utilisateurs-et-rbac
    provides: "requireRole + UnauthorizedError/ForbiddenError + ActionResult pattern + AuditLog conventions"
  - phase: 07-parametres-organisme-editables
    provides: "loadOfConfig(tenantId) + computeDiff + Tenant.address Json pattern"
provides:
  - "Server action `createLead(input)` — RBAC + Zod + create + auto-assign conditionnel + notification (LEAD-01)"
  - "Server action `reassignLead(leadId)` — bouton manuel force:true + notification user.id (LEAD-01)"
  - "Server action `updateLeadStatus(leadId, newStatus)` — set wonAt automatique (LEAD-02, Pitfall 3 fix)"
  - "Server action `updateLeadDistributionConfig(input)` — 3 toggles tenant ADMIN-only + AuditLog convention `leads.distribution_config`"
  - "Helper `notifyLeadAssigned(opts)` — orchestrateur centralise des 3 side-effects (Notification + Email + AuditLog) conditionne par 2 toggles tenant"
  - "Helper `logLeadEvent` (extension audit-log.ts) — convention `entity='Lead'` + actorUserId nullable + pas de no-op sur diff vide"
affects: [09-03-page-charge-fiche-lead, 09-04-cloche-config-tenant, 09-05-bookkeeping-phase-9]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Helper centralise des side-effects post-evenement (notifyLeadAssigned) — 1 seul site decide email/bell/audit en fonction des toggles Tenant. Patron reutilisable Phase 10+ (session.to_close, dossier.incomplete)."
    - "Convention AuditLog entity='Lead' (premier usage hors Tenant/User), action namespacees `leads.*` : auto_assigned, reassigned, distribution_config, status.change. Distinction `logUserAction` (Phase 8) vs `logLeadEvent` (Phase 9) par entity-specifique."
    - "Pattern de wonAt automatique (set/clear sur transition WON) — set side-effect implicite dans `updateLeadStatus`, audit-trace via diff before/after. Pourra etre etendu a d'autres dates de transition (`signedAt` sur dossier, `closedAt` sur session)."
    - "TDD strict (RED → GREEN) — tests d'abord pour les 3 tasks, fail confirme avant implementation. Permis par les mocks @qualiof/db cohérents (factory exposant les fonctions necessaires par module SUT)."
    - "Mock @/lib/auth AVANT @/lib/rbac dans les tests — empeche la cascade `cache()` (React Server Components) qui crash Vitest node. Pattern aligne tenant-users.test.ts (Phase 8)."

key-files:
  created:
    - "apps/web/src/lib/lead-notifications.ts (115 lignes — helper notifyLeadAssigned)"
    - "apps/web/src/lib/__tests__/audit-log.test.ts (3 tests logLeadEvent)"
    - "apps/web/src/lib/__tests__/lead-notifications.test.ts (9 tests notifyLeadAssigned)"
    - "apps/web/src/server/actions/leads.ts (195 lignes — 3 server actions LEAD-01/LEAD-02)"
    - "apps/web/src/server/actions/__tests__/leads.test.ts (9 tests 3 actions)"
    - "apps/web/src/server/actions/distribution-leads-config.ts (91 lignes — toggle 3 admin-only)"
    - "apps/web/src/server/actions/__tests__/distribution-leads-config.test.ts (5 tests)"
  modified:
    - "apps/web/src/lib/audit-log.ts (+30 lignes — `logLeadEvent` export)"
    - ".env.example (+5 lignes — APP_URL pour liens emails 'lead.assigned')"

key-decisions:
  - "Pitfall 3 fix : `wonAt` set automatiquement par `updateLeadStatus` (passage vers WON => now(), passage hors WON => null, autres transitions => valeur inchangee). Sans ce fix, les KPI 2 (leadsWonThisMonth), 3 (conversionPct sur 60j), 4 (avgDaysToWin) retournaient toujours 0/null."
  - "Pitfall 4 decide (option a) : `reassignLead` IGNORE le toggle `tenant.autoAssignLeads`. L'admin/manager qui clique sait ce qu'il fait — sinon le bouton serait inutile quand le toggle est OFF. Le toggle regit uniquement le declenchement automatique a la creation."
  - "Pitfall 5 decide (option b) : le `dryRun` flag de `sendMail` est IGNORE dans l'AuditLog `leads.auto_assigned/reassigned`. La trace atteste la DECISION d'envoi (toggle ON + owner.email present), pas la livraison physique. Eviter de coupler audit-trail metier a la sante SMTP."
  - "D-07 `logLeadEvent` vs generalisation de `logUserAction` : 2 helpers distincts plutot qu'un seul generique. Avantages : signature semantique (`targetLeadId` au lieu de `targetUserId`), pas de refacto Phase 7/8, pas de no-op surprise sur diff vide (`logLeadEvent` ecrit toujours, `logTenantSettingsChange` no-op)."
  - "`notifyLeadAssigned` centralise plutot qu'inline : permet 2 call-sites (`createLead` + `reassignLead`) sans duplication, testable en isolation avec mocks Prisma+mailer. Le couplage va lib → mailer/of-config/audit-log, jamais l'inverse (pas de circular import)."
  - "`updateLeadDistributionConfig` ne no-op PAS sur diff vide (contrairement a `logTenantSettingsChange` Phase 7) : trace toute consultation/sauvegarde admin de l'ecran (audit-trail Plan 08-05 plus complet)."
  - "APP_URL ajoute dans `.env.example` avec fallback `NEXT_PUBLIC_APP_URL` puis `''` (liens relatifs — fonctionnels mais peu lisibles dans clients mail). Documente comme variable utilisee par les emails 'lead.assigned' (Plan 09-04 reutilisera le meme pattern pour les notifications cloche)."

patterns-established:
  - "Convention AuditLog `entity='Lead'` + namespacing action `leads.*` : `leads.auto_assigned` (system), `leads.reassigned` (user.id), `leads.distribution_config` (admin.id), `leads.status.change` (user.id). Filtrable Plan 08-05 page Historique : `WHERE entity='Lead' AND action LIKE 'leads.%'`."
  - "Helper de notification multi-channels (`notifyLeadAssigned`) — 1 helper consomme 2 toggles Tenant + ecrit 1 AuditLog. Patron reutilisable pour les futurs evenements metier (session.to_close, dossier.incomplete, qualiopi.audit.due)."
  - "Set/clear automatique de timestamps de transition (`wonAt`) en server action de transition status — sans coupler le caller (UI). Evite que chaque CTA de changement de statut doive savoir gerer `wonAt` separement."

requirements-completed: [LEAD-01]

# Metrics
duration: ~7min
completed: 2026-05-16
---

# Phase 09 Plan 02: Server Actions + Wiring Summary

**4 server actions Lead (createLead/reassignLead/updateLeadStatus + updateLeadDistributionConfig), helper centralise `notifyLeadAssigned` (Notification cloche + Email + AuditLog conditionnes par 2 toggles tenant), extension `logLeadEvent` pour entity='Lead', `wonAt` set automatique (Pitfall 3 fix KPI 2/3/4), APP_URL .env.example, 26 tests Vitest verts.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-05-16T16:20:22Z
- **Completed:** 2026-05-16T16:27:16Z
- **Tasks:** 3
- **Files created:** 7 (3 src + 4 tests)
- **Files modified:** 2 (audit-log.ts +30 lignes, .env.example +5 lignes)

## Accomplishments

- **4 server actions exportees** depuis 2 nouveaux fichiers :
  - `createLead(input: unknown)` RBAC ADMIN/MANAGER/COMMERCIAL : valide Zod `CreateLeadSchema`, lit `tenant.autoAssignLeads`, cree le lead avec `ownerUserId=null`, si toggle ON appelle `autoAssignLead(lead.id)` puis `notifyLeadAssigned({ assignedBy: null })`. Retourne `{ ok:true, data:{ leadId, ownerUserId } }`.
  - `reassignLead(leadId: string)` RBAC ADMIN/MANAGER/COMMERCIAL : appel `autoAssignLead(leadId, { force: true })` (Pitfall 4 : IGNORE le toggle autoAssignLeads), puis `notifyLeadAssigned({ assignedBy: user.id })`. Retourne `{ ownerUserId, ownerName }`.
  - `updateLeadStatus(leadId, newStatus: LeadStatus)` RBAC ADMIN/MANAGER/COMMERCIAL : lit lead existant, calcule `wonAt` (passage vers WON => now() ; passage hors WON => null ; sinon inchange), update + AuditLog `leads.status.change` avec diff before/after.
  - `updateLeadDistributionConfig(input: unknown)` RBAC ADMIN-only : valide Zod `DistributionConfigSchema`, lit before, update les 3 toggles, AuditLog `leads.distribution_config` (PAS de no-op sur diff vide — distinct de `logTenantSettingsChange`).
- **Helper `notifyLeadAssigned`** (`apps/web/src/lib/lead-notifications.ts`) orchestre les 3 side-effects post-assignation :
  1. **Notification cloche** (`prisma.notification.create` type='lead.assigned') — conditionne par `tenant.notifyOnLeadAssignBell !== false`.
  2. **Email** (`sendMail` via template `renderLeadAssignedEmail`) — conditionne par `tenant.notifyOnLeadAssignEmail !== false` ET `owner.email` renseigne. `dryRun` SMTP ignore dans l'AuditLog (Pitfall 5 option b).
  3. **AuditLog** (`logLeadEvent`) — TOUJOURS ecrit. Action = `leads.auto_assigned` si `assignedBy=null` (system, depuis `createLead`), sinon `leads.reassigned` (depuis `reassignLead`).
  - Return silencieux si lead/owner/tenant introuvable (defense contre race conditions).
  - `prospectName` resolu : `person.firstName+lastName` (priorite Person canonique CRM) → `lead.firstName+lastName` → `'Prospect'` (fallback litteral).
- **Helper `logLeadEvent`** (extension `apps/web/src/lib/audit-log.ts`) — convention `entity='Lead'`, `entityId=targetLeadId`, `actorUserId` nullable (null = system). Pas de no-op sur diff vide.
- **APP_URL documente dans `.env.example`** avec fallback chaine `NEXT_PUBLIC_APP_URL` puis `''`. Utilise par `notifyLeadAssigned` pour construire les liens absolus dans les emails ("Voir le lead").
- **26 tests Vitest verts** (cible plan : ≥ 17) : 3 audit-log + 9 lead-notifications + 9 leads + 5 distribution-config.
- **Suite complete apps/web : 194/194 tests verts** (24 fichiers). `tsc --noEmit` clean.

## Task Commits

Each task was committed atomically (TDD : RED+GREEN par task, pas de commit REFACTOR car implementations directes) :

1. **Task 1: logLeadEvent + notifyLeadAssigned helper + 12 tests** — `e9c79fb`
2. **Task 2: server actions Leads (createLead/reassignLead/updateLeadStatus) + 9 tests** — `4d27694`
3. **Task 3: updateLeadDistributionConfig (ADMIN-only, 3 toggles) + 5 tests** — `a824304`

## Files Created/Modified

### Created
- `apps/web/src/lib/lead-notifications.ts` — 115 lignes. Helper centralise `notifyLeadAssigned` qui consomme les 2 toggles Tenant et ecrit toujours l'AuditLog. Pas d'effet secondaire si lead/owner/tenant introuvable (defense race condition).
- `apps/web/src/lib/__tests__/audit-log.test.ts` — 3 tests `logLeadEvent` (actorUserId=null + actorUserId="admin-1" + diff omis).
- `apps/web/src/lib/__tests__/lead-notifications.test.ts` — 9 tests : lead null, owner null, toggle bell=false, toggle bell=true (payload typé verifie), toggle email=true sendMail appele, owner sans email pas de sendMail, assignedBy=null → action 'leads.auto_assigned', assignedBy='admin-1' → 'leads.reassigned', prospectName resolution via person.
- `apps/web/src/server/actions/leads.ts` — 195 lignes. 3 server actions `'use server'` : `createLead`, `reassignLead`, `updateLeadStatus`. Toutes RBAC `['ADMIN','MANAGER','COMMERCIAL']` avec try/catch UnauthorizedError/ForbiddenError → return `{ ok:false, error }`. JSDoc explicite les Pitfalls 1/3/4.
- `apps/web/src/server/actions/__tests__/leads.test.ts` — 9 tests : 3 createLead (validation, autoAssign=true, autoAssign=false) + 2 reassignLead (failure path, success path) + 4 updateLeadStatus (NEW→WON, WON→LOST, CONTACTED→QUALIFIED, lead 404).
- `apps/web/src/server/actions/distribution-leads-config.ts` — 91 lignes. 1 server action `updateLeadDistributionConfig` ADMIN-only. AuditLog `leads.distribution_config` ecrit MEME si diff vide.
- `apps/web/src/server/actions/__tests__/distribution-leads-config.test.ts` — 5 tests : ForbiddenError, validation, tenant 404, diff non-vide → update + audit, diff vide → audit quand meme.

### Modified
- `apps/web/src/lib/audit-log.ts` — ajout `logLeadEvent` (lignes 113-143). Convention `entity='Lead'` + actorUserId nullable. JSDoc liste les 4 actions du namespace `leads.*` (auto_assigned, reassigned, distribution_config, status.change).
- `.env.example` — ajout APP_URL avec valeur defaut `http://localhost:3002` (port dev QualiOF, coherent avec `tenant-users.ts:79`). Commentaire FR documente l'usage par les emails Phase 9 et le fallback `NEXT_PUBLIC_APP_URL`.

## Decisions Made

1. **Pitfall 3 fix : `wonAt` automatique** — `updateLeadStatus` calcule `wonAt` selon la transition : passage vers WON => `new Date()`, passage hors WON => `null`, autres transitions => valeur d'origine inchangee. Sans ce fix les KPI 2/3/4 (leadsWonThisMonth, conversionPct, avgDaysToWin) du helper `getCommercialsWithKpis` retournaient toujours 0/null. AuditLog trace les transitions via `diff: { status: {before,after}, wonAt: {before,after} }`.
2. **Pitfall 4 decide (option a : oui)** — `reassignLead` IGNORE le toggle `tenant.autoAssignLeads`. Le toggle regit uniquement le declenchement automatique a la creation (`createLead`). Si on l'appliquait au bouton manuel, le bouton ne servirait a rien quand le toggle est OFF. JSDoc explicite cette intention.
3. **Pitfall 5 decide (option b)** — `notifyLeadAssigned` IGNORE `mailResult.dryRun` dans l'AuditLog `leads.auto_assigned/reassigned`. La trace atteste la DECISION d'envoi (toggle ON + owner.email present), pas la livraison physique. Evite de coupler audit-trail metier a la sante SMTP : si SMTP est down, on logge quand meme l'evenement metier.
4. **`logLeadEvent` nouveau helper plutot que generalisation de `logUserAction`** — 2 helpers distincts plutot qu'un seul `logEvent` generique. Avantages : signature semantique (`targetLeadId` au lieu de `targetUserId`), pas de refacto Phase 7/8 induit, pas de no-op surprise sur diff vide (logLeadEvent ecrit toujours, logTenantSettingsChange no-op). Cohérent avec `logUserAction` (Phase 8) qui suit le meme patron entity-specifique.
5. **`notifyLeadAssigned` centralise vs inline** — extraction en helper pour 2 raisons : (1) reutilise par 2 server actions sans duplication (`createLead` + `reassignLead`) ; (2) testable en isolation avec mocks Prisma+mailer (9 tests, distincts des tests des server actions). Pas de couplage circulaire : `lead-notifications.ts` importe `mailer/of-config/audit-log` ; aucun de ces fichiers n'importe `lead-notifications.ts`.
6. **`updateLeadDistributionConfig` ne no-op PAS sur diff vide** — contrairement a `logTenantSettingsChange` Phase 7 qui filtre les diff vides. Choix : tracer TOUTE sauvegarde admin de l'ecran toggle, meme sans modification, comme un acces audit-trail explicite. Permet a Plan 08-05 page Historique de voir les "verifications" admin sans rien manquer.
7. **Mock `@/lib/auth` AVANT `@/lib/rbac` dans les tests** — sinon `vi.importActual('@/lib/rbac')` cascade vers `auth.ts` qui utilise `cache()` de React (non disponible en environnement Vitest node). Pattern aligne `tenant-users.test.ts` (Phase 8 Plan 08-02). Documente en commentaire dans les 2 nouveaux fichiers de tests.

## Deviations from Plan

**None - plan executed exactly as written.**

Seules deux ajustements mineurs vs la lettre du plan, sans impact sur les acceptance criteria :

- **Test 9 supplementaire dans `lead-notifications.test.ts`** — j'ai ajoute un 9e test pour la resolution `prospectName` via `lead.person` (le plan demandait "5 cas" mais j'ai livre 9 pour couvrir tous les branches du code, dont la priorite person > lead.firstName). Bonus de couverture, pas une deviation au sens scope.
- **Test 9 supplementaire dans `leads.test.ts`** — ajout du cas `lead introuvable` pour `updateLeadStatus` (return ok:false / Lead introuvable). Plan demandait "8 cas", livre 9. Couvre la branche `if (!existing) return ...` qui sinon n'aurait aucun test.

**Total deviations:** 0
**Impact on plan:** Plan strictement applique. Aucun ecart, aucun scope creep, aucune Rule 1/2/3/4 declenchee.

## Issues Encountered

- **Mocking `@/lib/rbac` declenche un cascade vers React `cache()`** (premiere erreur Task 2 RED) : `auth.ts` utilise `cache()` (React Server Components) qui n'est pas disponible dans l'environnement Vitest `node`. Resolu en mockant `@/lib/auth` AVANT `@/lib/rbac` dans les 2 fichiers de tests, pattern identique a `tenant-users.test.ts`.
- **`@qualiof/db` mock incomplet** (deuxieme erreur Task 2 RED) : le package `@qualiof/shared` importe `LegalForm` depuis `@qualiof/db` (via `packages/shared/src/constants/legal-form.ts`). Le mock initial n'exposait que `UserRole`. Ajoute le mock `LegalForm` (9 valeurs) dans les 2 fichiers de tests pour faire passer le module loading.

Aucun de ces ajustements n'a constitue une deviation au sens des regles 1-4 (auto-fix bug / missing critical / blocking / architectural). Ce sont des fixes d'infrastructure de test conforme aux patterns Phase 7/8 existants.

## User Setup Required

**Aucun setup utilisateur immediat.** Le nouveau `APP_URL` dans `.env.example` est optionnel (fallback vers `NEXT_PUBLIC_APP_URL` puis `''`). Si l'utilisateur veut des liens absolus propres dans les emails 'lead.assigned' a partir du Plan 09-04 (cloche fonctionnelle), il pourra copier la ligne dans son `.env` reel. Sans cela, les emails fonctionnent (dry-run actuel SMTP non configure) mais avec liens relatifs.

## Next Phase Readiness

**Ready for Plan 09-03 (UI page charge + fiche Lead) :**
- `createLead`, `reassignLead`, `updateLeadStatus` consommables directement dans les formulaires UI (LeadForm, ReassignButton, StatusSelect). Pattern `ActionResult` discrimine + `fieldErrors` pret pour `react-hook-form`.
- `notifyLeadAssigned` declenche automatiquement les emails et notifications cloche (Notification cree, lisible par Plan 09-04).
- `wonAt` est maintenant mis a jour cote BDD a chaque transition status — les KPI du helper `getCommercialsWithKpis` (Plan 09-01) deviennent fonctionnels des qu'un lead est marque WON.

**Ready for Plan 09-04 (cloche notifications + page parametres distribution) :**
- `updateLeadDistributionConfig` cablera directement le formulaire des 3 toggles dans la page `/app/parametres/distribution-leads`.
- Les rows `Notification` ecrites par `notifyLeadAssigned` sont lisibles via une future query (Plan 09-04 extension `getNotifications`).

**Ready for Plan 09-05 (bookkeeping fin de phase) :**
- LEAD-01 termine (createLead + auto-assign + notif + reassign + config).
- LEAD-02 partiellement avance via `updateLeadStatus` (set wonAt) — finalisation UI Plan 09-03.

**Aucun blocker.**

## Known Stubs

Aucun stub introduit. Toutes les server actions retournent des donnees reelles (Prisma create/update + AuditLog row reelle + sendMail dry-run silencieux acceptable). `notifyLeadAssigned` n'a pas de fallback simulé : il fait reellement les 3 appels Prisma + sendMail.

Note pedagogique : tant que Plan 09-03 n'aura pas livre la page `/app/leads/charge` et un formulaire CreateLeadForm, ces server actions ne sont pas declenchees depuis l'UI (mais peuvent etre testees via Vitest + appel direct depuis script tsx). C'est attendu — les actions Phase 9 sont implementées avant l'UI qui les consomme.

## Self-Check: PASSED

**Files verified (9/9):**
- FOUND: `apps/web/src/lib/audit-log.ts` (modifie +30 lignes)
- FOUND: `apps/web/src/lib/lead-notifications.ts`
- FOUND: `apps/web/src/lib/__tests__/audit-log.test.ts`
- FOUND: `apps/web/src/lib/__tests__/lead-notifications.test.ts`
- FOUND: `apps/web/src/server/actions/leads.ts`
- FOUND: `apps/web/src/server/actions/__tests__/leads.test.ts`
- FOUND: `apps/web/src/server/actions/distribution-leads-config.ts`
- FOUND: `apps/web/src/server/actions/__tests__/distribution-leads-config.test.ts`
- FOUND: `.env.example` (modifie : ligne APP_URL ajoutee)

**Commits verified (3/3):**
- FOUND: `e9c79fb` (Task 1 — logLeadEvent + notifyLeadAssigned + 12 tests)
- FOUND: `4d27694` (Task 2 — server actions leads.ts + 9 tests)
- FOUND: `a824304` (Task 3 — distribution-leads-config + 5 tests)

**Tests verified:** apps/web 194/194 verts (26 nouveaux + 168 existants). tsc --noEmit clean.

**Acceptance criteria globale (verification plan-level) :**
- `grep -rn "autoAssignLead(" apps/web/src/server/actions/ | grep -v auto-assign-leads.ts` → 2 matches actifs (leads.ts:93 createLead, leads.ts:130 reassignLead) ✓
- `grep -rn "notifyLeadAssigned" apps/web/src/` → 39 matches globaux (helper + 2 actions + 4 fichiers tests) ✓
- `grep -n "APP_URL" .env.example` → 1 ligne ajoutee ✓
- Pas d'import circulaire : lead-notifications.ts → mailer/of-config/audit-log/db ; leads.ts → auto-assign-leads/lead-notifications/audit-log/rbac/shared/db. Aucun de ces fichiers n'importe leads.ts ou lead-notifications.ts. ✓

---
*Phase: 09-distribution-leads-automatique*
*Plan: 02*
*Completed: 2026-05-16*
