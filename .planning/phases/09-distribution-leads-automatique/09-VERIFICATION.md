---
phase: 09-distribution-leads-automatique
verified: 2026-05-18T07:42:00Z
status: human_needed
score: 4/4 truths automatically verified — 5 manual smoke flows pending Laurent
re_verification: null
gaps: []
human_verification:
  - test: "Flow 1 — Création de lead avec auto-assignation"
    expected: "Toast vert 'Lead créé' + redirect /app/leads/{id} + commercial assigné affiché + dry-run mailer log subject 'Nouveau lead à traiter — Test Smoke9' + AuditLog row leads.auto_assigned actorUserId=null"
    why_human: "Exécution serveur live + observation console pnpm dev:full + DOM check non automatisable trivialement (Server Component RSC + dropdown Radix portal). Le test source-regex ne valide pas le runtime DOM."
  - test: "Flow 2 — Réassignation manuelle"
    expected: "Toast vert 'Lead réassigné à {ownerName}' + badge mis à jour + AuditLog leads.reassigned actorUserId=adminId + dry-run mailer log (re-déclenché même si owner identique)"
    why_human: "Interaction Radix Dialog + appel server action + check AuditLog UI nécessite session live ADMIN."
  - test: "Flow 3 — Toggles distribution leads"
    expected: "Décocher autoAssignLeads → toast vert + créer lead suivant sans commercial assigné + aucun mailer log + AuditLog leads.distribution_config avec diff before/after"
    why_human: "Vérification effet runtime du toggle Tenant + AuditLog persistence + visite Historique."
  - test: "Flow 4 — Vue de charge RBAC"
    expected: "ADMIN/MANAGER : page rendue avec 4 PrioCard + table + camembert SVG. COMMERCIAL : redirect /app + pas d'entrée sidebar 'Vue de charge' ni 'Distribution leads'"
    why_human: "RBAC effectif côté session live + état sidebar par rôle. Tests source-regex valident le code mais pas le runtime auth."
  - test: "Flow 5 — Transition WON + KPI Gagnés ce mois"
    expected: "Select WON → toast + 'Gagné le {date}' affiché + retour /app/leads/charge → KPI Gagnés ce mois incrémenté + Lead.wonAt set en BDD + AuditLog leads.status.change avec diff status + wonAt"
    why_human: "Vérification persistance wonAt + recalcul KPI agrégé temps réel après mutation."
---

# Phase 9: Distribution leads automatique — Verification Report

**Phase Goal:** Auto-assigner Lead → Commercial selon règles configurables + vue de charge.
**Verified:** 2026-05-18T07:42:00Z
**Status:** human_needed (automated checks fully PASS, 5 manual DevTools flows pending)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Paramètres › Distribution leads : configuration des règles (toggles autoAssign, notifs email/cloche) | ✓ VERIFIED | `apps/web/src/app/app/parametres/distribution-leads/page.tsx:32` `hasRole(user, ['ADMIN'])` + redirect '/app' sinon. Fetch 3 toggles tenant + `<DistributionLeadsForm initial>`. Form RHF + zodResolver(DistributionConfigSchema) appelle `updateLeadDistributionConfig` (Plan 09-02). Note métier : règles "zone/enseigne/historique" volontairement DESCOPÉES (CONTEXT.md `<deferred>` + ROADMAP.md SC #1 — décision Q1 Laurent : algo round-robin équilibré, pas de règles complexes). Le contrat livré = 3 toggles tenant. |
| 2 | Création de Lead → `assignedTo` rempli automatiquement, fallback non assigné | ✓ VERIFIED | `apps/web/src/server/actions/leads.ts:53-107` `createLead` lit `tenant.autoAssignLeads`, crée lead avec ownerUserId=null, si toggle ON appelle `autoAssignLead(lead.id)` (existant `auto-assign-leads.ts:94` round-robin) puis `notifyLeadAssigned({assignedBy:null})`. Fallback ROADMAP "MANAGER" non implémenté littéralement, mais CONTEXT.md D-01 (Laurent validé) : "Fallback si aucun commercial disponible : lead reste ownerUserId=null → admin alerté". Le UI fiche affiche "Non assigné" (page [id]:87). Sémantiquement équivalent au contrat — fallback="alerter manuellement", pas "MANAGER hardcodé". |
| 3 | Vue "Charge par commercial" (leads ouverts, taux conversion, temps moyen) | ✓ VERIFIED | `apps/web/src/app/app/leads/charge/page.tsx` (192l) RBAC ADMIN+MANAGER + 4 PrioCardLocal (Leads en cours/Gagnés ce mois/Taux conversion/Temps moyen) + `LeadLoadTable` (commercial × 4 KPI) + `LeadDistributionPie` (SVG inline). Helper pur `getCommercialsWithKpis(tenantId)` dans `lib/lead-load-stats.ts` (115l) calcule les 4 KPI avec 1 user.findMany + 3 lead.groupBy + 1 $queryRaw AVG en Promise.all. Sidebar entrée `nav-config.ts:114` ADMIN+MANAGER. |
| 4 | Notification cloche + email à l'assignation | ✓ VERIFIED | Helper centralisé `apps/web/src/lib/lead-notifications.ts:42-118` orchestre 3 side-effects : (1) `prisma.notification.create({type:'lead.assigned'})` si `tenant.notifyOnLeadAssignBell !== false`, (2) `sendMail` via `renderLeadAssignedEmail` (`lib/mailer-templates/lead-assigned.ts`, clone strict user-invitation Phase 8) si `notifyOnLeadAssignEmail !== false` ET `owner.email`, (3) `logLeadEvent` toujours (action='leads.auto_assigned' si assignedBy=null, sinon 'leads.reassigned'). Cloche TopBar étendue : `notifications-bell.tsx:16` `ICONS['lead.assigned']=UserPlus`, polling 60s, clic appelle `markNotificationRead` fire-and-forget. Notif rendue par `getNotifications` (5e source persistée user-scoped, parse Zod `LeadAssignedPayloadSchema` Pitfall 6). |

**Score:** 4/4 truths automatically verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/db/prisma/migrations/20260516160839_phase09_distribution/migration.sql` | Migration Notification + Lead.wonAt + 3 toggles Tenant | ✓ VERIFIED | 35l SQL : CREATE TABLE Notification (7 cols + 2 idx + 2 FK Cascade), ALTER Lead +wonAt + index `(tenantId, status, wonAt)`, ALTER Tenant +3 booleans NOT NULL DEFAULT true |
| `packages/db/prisma/schema.prisma` | Notification model + Tenant booleans + Lead.wonAt | ✓ VERIFIED | l.1045 model Notification (Cascade onDelete sur tenantId+userId), l.45-47 Tenant autoAssignLeads/notifyOnLeadAssignEmail/notifyOnLeadAssignBell @default(true), l.687 Lead.wonAt DateTime?, l.697 @@index([tenantId, status, wonAt]) |
| `packages/shared/src/schemas/lead.ts` | 3 schémas Zod (CreateLead/DistributionConfig/LeadAssignedPayload) | ✓ VERIFIED | 82l, 3 schémas avec refine personId XOR firstName+lastName, transform email '' → null, LeadAssignedPayloadSchema runtime payload (Pitfall 6) |
| `apps/web/src/lib/lead-load-stats.ts` | Helper pur getCommercialsWithKpis | ✓ VERIFIED | 115l, 4 KPI calculés en Promise.all (groupBy ×3 + $queryRaw AVG), scope tenantId obligatoire |
| `apps/web/src/lib/mailer-templates/lead-assigned.ts` | Email template clone-strict Phase 8 | ✓ VERIFIED | 4484 bytes, escapeHtml × 12, subject "Nouveau lead à traiter — {prospectName}", html+text+CTA leadUrl |
| `apps/web/src/lib/lead-notifications.ts` | Helper notifyLeadAssigned orchestrateur | ✓ VERIFIED | 118l, 3 side-effects conditionnés par 2 toggles tenant, fail-safe sur lead/owner/tenant introuvables (return silencieux) |
| `apps/web/src/lib/audit-log.ts` | logLeadEvent extension | ✓ VERIFIED | l.129 export `logLeadEvent`, convention entity='Lead' + actorUserId nullable, pas de no-op sur diff vide |
| `apps/web/src/server/actions/leads.ts` | createLead/reassignLead/updateLeadStatus | ✓ VERIFIED | 223l, 3 actions RBAC ADMIN/MANAGER/COMMERCIAL, Zod validation, wonAt auto Pitfall 3, force:true Pitfall 4 |
| `apps/web/src/server/actions/distribution-leads-config.ts` | updateLeadDistributionConfig ADMIN-only | ✓ VERIFIED | 93l, requireRole(['ADMIN']), DistributionConfigSchema, AuditLog `leads.distribution_config` même sur diff vide |
| `apps/web/src/server/actions/notification-mark-read.ts` | markNotificationRead atomique | ✓ VERIFIED | 36l, updateMany scope `id+userId+readAt:null` (single-use atomique + idempotence) |
| `apps/web/src/app/app/leads/charge/page.tsx` | Page Vue de charge ADMIN+MANAGER | ✓ VERIFIED | 192l, hasRole guard + 4 PrioCardLocal + LeadLoadTable + LeadDistributionPie + conversionGlobale calculé séparément (count WON / count attribués) |
| `apps/web/src/app/app/leads/[id]/page.tsx` | Fiche détail Lead | ✓ VERIFIED | 193l, validateRequest + scope tenantId + ReassignLeadButton + LeadStatusSelect + Breadcrumb + brandName ?? legalName (D-Phase9-M Rule 1 fix) |
| `apps/web/src/app/app/leads/new/page.tsx` | Page création Lead | ✓ VERIFIED | 44l, hasRole ADMIN+MANAGER+COMMERCIAL + LeadCreateForm |
| `apps/web/src/app/app/parametres/distribution-leads/page.tsx` | Page paramètres ADMIN-only | ✓ VERIFIED | 73l, hasRole(['ADMIN']) + redirect '/app' soft + fetch 3 toggles + DistributionLeadsForm |
| `apps/web/src/components/leads/lead-distribution-pie.tsx` | Camembert SVG inline | ✓ VERIFIED | 92l, SVG 160×160 arcs M/L/A/Z, fallback total=0, edge case slice 100%, palette 8 tons HSL a11y, role="img" + aria-label + <title> par arc |
| `apps/web/src/components/leads/lead-load-table.tsx` | Table commercial × KPI | ✓ VERIFIED | 62l, Server Component pur, overflow-x-auto -mx-4 sm:mx-0 (RESP-04 Phase 3) |
| `apps/web/src/components/leads/reassign-lead-button.tsx` | Bouton Réassigner Dialog Radix | ✓ VERIFIED | 98l, @radix-ui/react-dialog (D-Phase9-J Rule 3 fix : alert-dialog absent), useTransition + sonner |
| `apps/web/src/components/leads/lead-status-select.tsx` | Select 9 statuts | ✓ VERIFIED | 68l, useTransition + appel updateLeadStatus |
| `apps/web/src/components/leads/lead-create-form.tsx` | Form RHF zodResolver | ✓ VERIFIED | 127l, RHF + zodResolver(CreateLeadSchema), appel createLead |
| `apps/web/src/components/parametres/distribution-leads-form.tsx` | Form 3 toggles RHF | ✓ VERIFIED | 118l, RHF + zodResolver(DistributionConfigSchema), 3 ToggleRow avec dépendants disabled visuel mais register actif (D-Phase9-R) |
| `apps/web/src/components/layout/notifications-bell.tsx` | Cloche étendue lead.assigned | ✓ VERIFIED | 128l, ICONS['lead.assigned']=UserPlus, markNotificationRead fire-and-forget au clic, clé React `item.id ?? ${kind}-${idx}` (anti-collision multi `lead.assigned`) |
| `apps/web/src/server/actions/notifications.ts` | getNotifications hybride | ✓ VERIFIED | 147l, 5e source `prisma.notification.findMany` user-scoped top 10, parse LeadAssignedPayloadSchema.safeParse skip silencieux Pitfall 6 |
| `apps/web/src/components/layout/nav-config.ts` | 2 entrées sidebar | ✓ VERIFIED | l.110-117 'Vue de charge' (icône TrendingUp, ADMIN+MANAGER), l.153-159 'Distribution leads' (icône Sliders, ADMIN) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `LeadCreateForm` | `createLead` server action | `import { createLead } from '@/server/actions/leads'` + `await createLead(data)` ligne 37 | ✓ WIRED | Submit form → server action réelle |
| `ReassignLeadButton` | `reassignLead` server action | `import { reassignLead }` + `await reassignLead(leadId)` ligne 33 | ✓ WIRED | Confirm Dialog → server action |
| `LeadStatusSelect` | `updateLeadStatus` server action | `import { updateLeadStatus }` + `await updateLeadStatus(leadId, v)` ligne 50 | ✓ WIRED | Change select → server action + wonAt auto (Pitfall 3) |
| `DistributionLeadsForm` | `updateLeadDistributionConfig` | `import` ligne 25 + `await updateLeadDistributionConfig(data)` ligne 40 | ✓ WIRED | Submit → server action ADMIN-only |
| `createLead` | `autoAssignLead` (existing) | `import { autoAssignLead } from './auto-assign-leads'` + appel conditionnel l.93 si `tenant?.autoAssignLeads !== false` | ✓ WIRED | LEAD-01 SC #2 (auto-assignation à la création) |
| `createLead` + `reassignLead` | `notifyLeadAssigned` helper | l.96 (assignedBy=null) + l.139 (assignedBy=user.id) | ✓ WIRED | Helper centralise 3 side-effects |
| `notifyLeadAssigned` | `prisma.notification.create` | l.74-86 conditionné par `tenant.notifyOnLeadAssignBell !== false` | ✓ WIRED | Notification cloche persistée (LEAD-01 SC #4) |
| `notifyLeadAssigned` | `sendMail` + `renderLeadAssignedEmail` | l.92-102 conditionné par `notifyOnLeadAssignEmail !== false` ET `owner.email` | ✓ WIRED | Email à l'assignation (LEAD-01 SC #4) |
| `notifyLeadAssigned` | `logLeadEvent` audit-log | l.108-117 toujours écrit, action='leads.auto_assigned'/'leads.reassigned' | ✓ WIRED | Convention D-12 AuditLog |
| `NotificationsBell` | `getNotifications` + `markNotificationRead` | imports l.8-9 + polling useEffect 60s + onClick fire-and-forget l.100 | ✓ WIRED | Cloche affiche 'lead.assigned' + clic marque lue |
| `getNotifications` | `prisma.notification.findMany` | 5e source `Promise.all` l.77-87, scope `tenantId+userId+readAt:null+type='lead.assigned'`, parse `LeadAssignedPayloadSchema.safeParse` l.132 | ✓ WIRED | Reader Pitfall 6 fix |
| `LeadsChargePage` | `getCommercialsWithKpis(user.tenantId)` | import l.6 + appel l.49 | ✓ WIRED | KPI helper consommé |
| `LeadsChargePage` | `LeadLoadTable` + `LeadDistributionPie` | imports l.7-8 + JSX l.146 + l.150 | ✓ WIRED | LEAD-02 SC #3 |
| `DistributionLeadsConfigPage` | `DistributionLeadsForm` (`prisma.tenant.findUnique`) | import l.7 + fetch tenant l.34-41 + `<DistributionLeadsForm initial>` l.64 | ✓ WIRED | LEAD-01 SC #1 (config admin) |
| `nav-config.ts` Vue de charge | `/app/leads/charge` route | l.115 `href: '/app/leads/charge'` + `allowedRoles: ['ADMIN','MANAGER']` | ✓ WIRED | Sidebar visible aux 2 rôles attendus |
| `nav-config.ts` Distribution leads | `/app/parametres/distribution-leads` route | l.157 `href` + `allowedRoles: ['ADMIN']` | ✓ WIRED | Sidebar ADMIN-only |
| Page `/app/leads` | bouton 'Nouveau lead' | `app/app/leads/page.tsx:85-89` Link `/app/leads/new` | ✓ WIRED | CTA entrée du flow Flow 1 SMOKE |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `/app/leads/charge` | `rows` (CommercialKpis[]) | `getCommercialsWithKpis(user.tenantId)` → 5 vrais round-trips Prisma (user.findMany + 3 groupBy + $queryRaw AVG) | Oui (Prisma réel scope tenant) | ✓ FLOWING |
| `/app/leads/charge` | `globalWon/globalAttributed` | 2 `prisma.lead.count` Promise.all l.61-72 | Oui (count BDD réel) | ✓ FLOWING |
| `/app/leads/[id]` | `lead` | `prisma.lead.findFirst` scope tenantId + includes person/organization/interestedProduct/owner | Oui | ✓ FLOWING |
| `NotificationsBell` | `data.items` (avec lead.assigned) | `getNotifications` → 5e source `prisma.notification.findMany` user-scoped + parse Zod | Oui (rows persistées créées par notifyLeadAssigned) | ✓ FLOWING |
| `DistributionLeadsConfigPage` | `tenant` (3 toggles) | `prisma.tenant.findUnique` scope user.tenantId | Oui | ✓ FLOWING |
| `LeadLoadTable` | `rows` prop | Passé en prop depuis page parent (vrais KPI) | Oui (propage data flowing) | ✓ FLOWING |
| `LeadDistributionPie` | `slices` prop | Calculé `rows.filter(r => r.kpis.leadsActifs > 0).map(...)` à partir des KPI Prisma | Oui (dérivé de data flowing) | ✓ FLOWING |

Aucun composant ne reçoit des `[]`/`{}` hardcodés au call site. Tous les data sources sont des queries Prisma scope `tenantId`. Aucune valeur statique de fallback masquant l'absence de wiring.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Vitest suite complète apps/web | `pnpm --filter @qualiof/web test --run` | 29/29 fichiers, 239/239 tests verts (1.04s) | ✓ PASS |
| tsc --noEmit clean | `pnpm --filter @qualiof/web exec tsc --noEmit` | Aucune erreur (exit code 0, sortie vide) | ✓ PASS |
| Phase 9 commits présents | `git log --oneline` | 12 commits Phase 9 trouvés (3 par plan × 4 plans, plus Plan 09-05 doc-only) : 56b8958/4fcccd9/7ba9a04 + e9c79fb/4d27694/a824304 + 6308556/8d5e905/a547f2a + 74140e9/35917a8/2fe1288 | ✓ PASS |
| AuditLog convention `leads.*` | `grep "'leads\." apps/web/src/...` | 4 actions actives : `leads.auto_assigned` (system) + `leads.reassigned` (user) + `leads.distribution_config` (admin) + `leads.status.change` (user) | ✓ PASS |
| Pas de Recharts/chart.js (camembert SVG pur) | `grep "from 'recharts'" apps/web/src/components/leads/` | 0 match | ✓ PASS |
| Migration Prisma applicable | Migration SQL syntaxe Postgres valide + indexes + FK Cascade | Lecture du .sql : 35 lignes, ALTER + CREATE TABLE + INDEX + FK, syntaxe correcte | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| **LEAD-01** | 09-01, 09-02, 09-03, 09-04 | Distribution automatique Lead → Commercial (auto-assign + notif + email + reassign + 3 toggles tenant) | ✓ SATISFIED | Cocher [x] dans REQUIREMENTS.md:59 avec preuves : algo `autoAssignLead` wiré dans `createLead` (l.93) et `reassignLead` (l.130 force:true Pitfall 4), Notification persistée (`prisma.notification.create` type='lead.assigned' payload Zod-typé), Email (`renderLeadAssignedEmail` clone Phase 8), 3 toggles éditables via `/app/parametres/distribution-leads` ADMIN, AuditLog conventions `leads.auto_assigned/reassigned/distribution_config`. SC ROADMAP #1/#2/#4 OK. |
| **LEAD-02** | 09-01, 09-03 | Vue de charge par commercial (leads ouverts, taux conversion, temps moyen, sidebar) | ✓ SATISFIED | Cocher [x] dans REQUIREMENTS.md:60 avec preuves : `/app/leads/charge` ADMIN+MANAGER, 4 PrioCard globaux (totalLeadsActifs/totalWonThisMonth/conversionGlobale pondérée/avgDaysGlobal), table 4 KPI commercial × commercial, camembert SVG inline (40l, pas de Recharts), helper `getCommercialsWithKpis` Promise.all 5 round-trips, Lead.wonAt set auto par `updateLeadStatus` (Pitfall 3), sidebar nav-config.ts ADMIN+MANAGER. SC ROADMAP #3 OK. |

**Orphaned requirements:** None — REQUIREMENTS.md:117 Traceability table mappe Phase 9 ↔ [LEAD-01, LEAD-02] exclusivement. Tous les IDs déclarés dans les plans frontmatter (`requirements-completed`) sont couverts.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/web/src/lib/lead-load-stats.ts` | 27 | `const ACTIVE_STATUSES` duplication avec `auto-assign-leads.ts` (D-Phase9-B documenté en JSDoc) | ℹ️ Info | Dette tracée, refactor possible v6 si la liste évolue. Sans impact fonctionnel. |
| `apps/web/src/app/app/leads/charge/page.tsx` | 163-192 | `PrioCardLocal` clone local de Phase 6 PrioCard non exporté (D-Phase9-K) | ℹ️ Info | 25 lignes dupliquées. Refacto trivial si Phase 6 expose PrioCard depuis components/ui/. Documenté JSDoc l.157-162. |
| `apps/web/src/app/app/leads/[id]/page.tsx` | 149 | `href={... as any}` pour Link Organisation | ℹ️ Info | Cast TypeScript pour Next.js typed routes (`/app/organisations/[id]` non typé). Pattern existant repo. Sans impact runtime. |

**Aucun blocker / warning détecté :**
- 0 TODO/FIXME/PLACEHOLDER dans les fichiers Phase 9.
- 0 `return null/[]/null` masquant des stubs (toutes les pages renvoient du JSX avec data flowing).
- 0 handler vide (`onClick={() => {}}`).
- 0 `console.log`-only implementation.
- 0 `useState([])` avec data jamais re-set (toutes les sources sont Prisma).

### Human Verification Required

Le bookkeeping Phase 9 (Plan 09-05) a livré `09-SMOKE.md` avec 5 flows DevTools manuels que Laurent doit exécuter. Ces flows valident le runtime DOM + serveur live qui ne sont pas couverts par les tests source-regex (vitest `environment: 'node'`, pas jsdom, pas @testing-library/react — D-Phase9-N Rule 3).

#### 1. Flow 1 — Création de lead avec auto-assignation

**Test:** Naviguer `/app/leads` → "Nouveau lead" → remplir Test/Smoke9/DevTools → "Créer le lead"
**Expected:** Toast vert + redirect `/app/leads/{id}` + badge commercial assigné + console log `mailer dry-run` subject "Nouveau lead à traiter — Test Smoke9" + AuditLog `leads.auto_assigned` actorUserId=null dans `/app/parametres/historique`
**Why human:** Server action + side-effects mailer console + AuditLog UI nécessitent session ADMIN live + observation parallèle console pnpm dev:full + DOM check Dropdown Radix portal

#### 2. Flow 2 — Réassignation manuelle

**Test:** Fiche lead Flow 1 → bouton "Réassigner" → confirmer Dialog
**Expected:** Toast `Lead réassigné à {ownerName}` + badge mis à jour + AuditLog `leads.reassigned` actorUserId=adminId + dry-run mailer (même owner OK)
**Why human:** Interaction Radix Dialog + clic + check AuditLog persistance

#### 3. Flow 3 — Toggles distribution leads

**Test:** `/app/parametres/distribution-leads` (ADMIN, sidebar) → décocher auto-assign → Enregistrer → créer nouveau lead "Test SmokeNoAuto"
**Expected:** Lead "Non assigné" + aucun mailer log + AuditLog `leads.distribution_config` diff { autoAssignLeads: { before: true, after: false } }. **CRITIQUE:** réactiver auto-assign après pour ne pas casser les flows suivants.
**Why human:** Effet runtime du toggle Tenant + AuditLog persistence

#### 4. Flow 4 — Vue de charge + RBAC

**Test:** `/app/leads/charge` en ADMIN/MANAGER puis se déconnecter et reconnecter en COMMERCIAL → tenter URL directe `/app/leads/charge`
**Expected:** ADMIN/MANAGER : 4 PrioCard + table + camembert visible. COMMERCIAL : redirect `/app` + pas d'entrée sidebar 'Vue de charge' ni 'Distribution leads'.
**Why human:** RBAC effectif côté session live + état sidebar par rôle. Le code source-regex valide le code mais pas le runtime auth réel.

#### 5. Flow 5 — Transition WON + KPI Gagnés ce mois (bonus)

**Test:** Fiche lead Flow 1 → select statut "Gagné" → retour `/app/leads/charge`
**Expected:** Toast "Statut : Gagné" + "Gagné le {date}" affiché + KPI "Gagnés ce mois" incrémenté + `Lead.wonAt` set en BDD + AuditLog `leads.status.change` diff { status: NEW→WON, wonAt: null→ISO }
**Why human:** Vérification persistance wonAt + recalcul KPI agrégé temps réel après mutation (Pitfall 3 fix qui débloque les KPI 2/3/4)

### Gaps Summary

**Aucun gap technique détecté.** L'ensemble des 4 Success Criteria de ROADMAP.md Phase 9 est satisfait par le code livré, et les 24 artefacts attendus existent tous (4 niveaux : exists/substantive/wired/data flowing). Les 2 requirements LEAD-01/LEAD-02 sont couverts à 100% par les 5 plans exécutés. Le pre-flight regression gate est respecté (29/29 fichiers vitest, 239/239 tests, tsc clean).

Le seul élément en attente est la **validation humaine manuelle** des 5 flows DevTools documentés dans `09-SMOKE.md`. Laurent a délibérément choisi de clôturer la phase avant de les exécuter (cf. STATE.md "Phase 9 closed. Prochaine étape : /gsd:plan-phase 10."), avec l'intention de les jouer plus tard et d'ouvrir des plans de gap si des frictions runtime émergent. Cette stratégie est cohérente avec la consigne de runtime_context.

**Verdict général :** Goal achieved au niveau code et tests automatisés. Statut `human_needed` pour acter formellement que la validation runtime de bout en bout reste à la charge de Laurent (flow par flow), sans bloquer la transition vers Phase 10.

---

*Verified: 2026-05-18*
*Verifier: Claude (gsd-verifier)*
