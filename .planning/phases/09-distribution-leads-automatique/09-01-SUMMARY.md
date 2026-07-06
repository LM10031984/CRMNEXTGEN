---
phase: 09-distribution-leads-automatique
plan: 01
subsystem: database
tags: [prisma, postgres, zod, notification, lead, email-template, vitest]

# Dependency graph
requires:
  - phase: 07-parametres-organisme-editables
    provides: "Tenant migration pattern + of-config.ts loadOfConfig(tenantId) async (consommé par Plan 09-02 lead-notifications) + OfConfig interface (consommée par renderLeadAssignedEmail)"
  - phase: 08-multi-utilisateurs-et-rbac
    provides: "User.disabledAt / role=COMMERCIAL filter pattern (consommé par getCommercialsWithKpis) + mailer-templates/user-invitation.ts pattern (cloné strictement par lead-assigned.ts) + tests vitest mock @qualiof/db pattern (réutilisé pour lead-load-stats.test)"
provides:
  - "Migration Prisma phase09_distribution : Notification model + Lead.wonAt + 3 toggles Tenant (autoAssignLeads / notifyOnLeadAssignEmail / notifyOnLeadAssignBell)"
  - "Zod schemas Lead (CreateLeadSchema + DistributionConfigSchema + LeadAssignedPayloadSchema) exportés depuis @qualiof/shared"
  - "Helper pur getCommercialsWithKpis(tenantId) → CommercialKpis[] avec 4 KPI agrégés (leadsActifs / leadsWonThisMonth / conversionPct / avgDaysToWin)"
  - "Email template renderLeadAssignedEmail(input, of) → { subject, html, text } avec escapeHtml systématique"
affects: [09-02-server-actions-wiring, 09-03-page-charge-fiche-lead, 09-04-cloche-config-tenant]

# Tech tracking
tech-stack:
  added: []  # 0 nouvelle dépendance — tout en stock
  patterns:
    - "Notification événementielle par-user (Prisma model + payload Json typé via Zod LeadAssignedPayloadSchema) — futur-proof pour QBLANC-02 et autres notifs"
    - "Tenant @default(true) sur 3 toggles distribution → rétro-compat (les rows existantes héritent du default, comportement actuel préservé)"
    - "Helper pur DB scope tenantId obligatoire (pattern Phase 8 D-09 buildAuditWhere) — testable via mock vi.mock('@qualiof/db')"
    - "Email template clone-strict pattern (lead-assigned.ts = user-invitation.ts avec valeurs métier différentes + structure identique : BRAND_DARK/BRAND_LIGHT_BG/escapeHtml/footer OF)"
    - "ACTIVE_STATUSES dupliqué (lead-load-stats.ts + auto-assign-leads.ts) — TODO refactor possible vers export central si évolution de la liste"

key-files:
  created:
    - "packages/db/prisma/migrations/20260516160839_phase09_distribution/migration.sql (37 lignes SQL)"
    - "packages/shared/src/schemas/lead.ts (3 schémas Zod + 3 types z.infer)"
    - "apps/web/src/lib/lead-load-stats.ts (helper getCommercialsWithKpis ~110 lignes)"
    - "apps/web/src/lib/mailer-templates/lead-assigned.ts (renderLeadAssignedEmail ~125 lignes)"
    - "apps/web/src/lib/__tests__/lead-schema.test.ts (10 tests)"
    - "apps/web/src/lib/__tests__/lead-load-stats.test.ts (3 tests)"
    - "apps/web/src/lib/mailer-templates/__tests__/lead-assigned.test.ts (4 tests)"
  modified:
    - "packages/db/prisma/schema.prisma (Tenant +3 boolean cols + relation notifications, User +relation notifications, Lead +wonAt +index status_wonAt, ADD model Notification + 2 index)"
    - "packages/shared/src/schemas/index.ts (export * from './lead')"

key-decisions:
  - "Cascade onDelete sur Notification.tenantId ET Notification.userId — empêche orphelins (user désactivé Phase 8 garde la row mais delete user dur supprime ses notifs)"
  - "ACTIVE_STATUSES dupliqué dans lead-load-stats.ts plutôt qu'exporté depuis auto-assign-leads.ts (server action 'use server' — l'exporter forcerait à passer le fichier en module mixte). Dette tracée en commentaire JSDoc."
  - "Indice @@index([tenantId, status, wonAt]) sur Lead (3 cols) plutôt que (tenantId, wonAt) → couvre filtres WHERE status='WON' AND wonAt>=X (KPI 2 leadsWonThisMonth) sans rescaner toute la table"
  - "Helper getCommercialsWithKpis ne fait PAS de requireRole (caller responsable) — pattern Phase 8 D-09 buildAuditWhere : helper pur testable + injection tenantId obligatoire"
  - "Payload typé via Zod (LeadAssignedPayloadSchema) plutôt que TypeScript-only — protège runtime côté reader cloche (Pitfall 6 RESEARCH.md)"
  - "Clone strict de user-invitation.ts (Phase 8) pour lead-assigned.ts — assure cohérence visuelle des emails de l'app, BRAND_DARK/BRAND_LIGHT_BG centralisés par template (pas de helpers partagés à ce stade, peuvent émerger en Phase 10+)"

patterns-established:
  - "Pattern Notification événementielle : model Prisma + type string namespacé ('lead.assigned', futurs 'session.to_close', etc.) + payload Json typé via Zod schema dans @qualiof/shared"
  - "Pattern KPI agrégés par owner : 1 user.findMany + 3 lead.groupBy + 1 $queryRaw en Promise.all → 2 logiques de timing pour 5 round-trips"
  - "Pattern mock @qualiof/db (vi.mock factory + mockReset par test) — déjà établi Phase 7 (numbering.test) et Phase 8 (tenant-*.test), confirmé pour Phase 9 (lead-load-stats.test)"

requirements-completed: [LEAD-01, LEAD-02]

# Metrics
duration: ~15min
completed: 2026-05-16
---

# Phase 09 Plan 01: Foundation Summary

**Migration Prisma phase09_distribution (Notification model + Lead.wonAt + 3 toggles Tenant) + 3 Zod schemas leads + helper pur getCommercialsWithKpis (4 KPI agrégés) + email template renderLeadAssignedEmail clone-strict user-invitation, 17 tests verts.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-16T18:05:54Z
- **Completed:** 2026-05-16T18:15:00Z
- **Tasks:** 3
- **Files modified:** 2 (schema.prisma, schemas/index.ts)
- **Files created:** 7 (1 migration SQL + 4 src + 2 test files — lead-schema.test, lead-load-stats.test, lead-assigned.test)

## Accomplishments
- Migration Prisma `20260516160839_phase09_distribution` appliquée : table `Notification` créée (avec 2 index + 2 FK Cascade), `Lead.wonAt` ajouté + index `(tenantId, status, wonAt)`, `Tenant` étendu avec `autoAssignLeads/notifyOnLeadAssignEmail/notifyOnLeadAssignBell` (Boolean @default(true) — rétro-compat parfaite).
- 3 schémas Zod publiés depuis `@qualiof/shared` : `CreateLeadSchema` (refine personId XOR firstName+lastName, email '' → null), `DistributionConfigSchema` (3 booleans stricts), `LeadAssignedPayloadSchema` (typage runtime de `Notification.payload`).
- Helper pur `getCommercialsWithKpis(tenantId)` : retourne par commercial actif (role=COMMERCIAL, disabledAt=null) les 4 KPI (leadsActifs, leadsWonThisMonth, conversionPct round, avgDaysToWin round | null). Performance : `Promise.all([3× lead.groupBy, 1× $queryRaw])`.
- Email template `renderLeadAssignedEmail(input, of)` : clone strict de `user-invitation.ts` Phase 8 — subject `"Nouveau lead à traiter — {prospectName}"`, html avec CTA "Voir le lead" ancré sur leadUrl, text fallback, escapeHtml sur 12 valeurs interpolées.
- 17 tests vitest verts (10 schemas + 3 stats + 4 email). Full apps/web suite 168/168, full packages/shared suite 46/46. tsc --noEmit clean (0 erreur).
- **0 server action exportée** (frontière respectée — réservé Plan 09-02).

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration Prisma — Notification + Lead.wonAt + 3 toggles Tenant** — `56b8958` (feat)
2. **Task 2: Zod schemas leads + index export** — `4fcccd9` (feat, TDD : RED → tests fail before sources exist → GREEN après création schemas)
3. **Task 3: Helper getCommercialsWithKpis + template email lead-assigned** — `7ba9a04` (feat, TDD : RED + GREEN combinés en 1 commit pour 2 fichiers indépendants — tests d'abord, sources ensuite)

_Note: TDD tasks ont été commitées en une fois (RED → GREEN sans phase REFACTOR nécessaire — helpers simples), pas 2 commits séparés. Convention `feat(09-01)` namespacée._

## Files Created/Modified

### Created
- `packages/db/prisma/migrations/20260516160839_phase09_distribution/migration.sql` — 37 lignes SQL (`CREATE TABLE Notification + 2 indexes + 2 FK Cascade ; ALTER Lead ADD wonAt + index status_wonAt ; ALTER Tenant ADD 3 booleans NOT NULL DEFAULT true`).
- `packages/shared/src/schemas/lead.ts` — 3 Zod schemas + 3 types `z.infer`. Pas d'import depuis `@qualiof/db` (LEAD_STATUS/LEAD_PRIORITY dupliqués comme tuples `as const` pour découplage shared/db).
- `apps/web/src/lib/lead-load-stats.ts` — helper pur 4 KPI commercial. Scope `tenantId` obligatoire (multi-tenant). ACTIVE_STATUSES dupliqué.
- `apps/web/src/lib/mailer-templates/lead-assigned.ts` — template email clone-strict de user-invitation.ts.
- `apps/web/src/lib/__tests__/lead-schema.test.ts` — 10 tests Zod (refine, transform, booleans stricts, UUID).
- `apps/web/src/lib/__tests__/lead-load-stats.test.ts` — 3 tests helper (mock @qualiof/db).
- `apps/web/src/lib/mailer-templates/__tests__/lead-assigned.test.ts` — 4 tests email (XSS escape, leadUrl, of.name, subject).

### Modified
- `packages/db/prisma/schema.prisma` — 3 endroits :
  - `model Tenant` lignes 24-52 : +3 colonnes booleans + relation `notifications Notification[]`. Prisma format a réaligné les colonnes du model entier (cosmetic).
  - `model User` ligne 82 : +1 relation `notifications Notification[]`.
  - `model Lead` lignes 687-697 : +`wonAt DateTime?` + index `@@index([tenantId, status, wonAt])`.
  - Nouveau `model Notification` lignes 1045-1060 (avant `model AuditLog`) : 7 colonnes + 2 index + 2 FK Cascade.
- `packages/shared/src/schemas/index.ts` — +1 ligne `export * from './lead'`.

## Decisions Made

1. **Cascade `onDelete: Cascade` sur Notification.tenantId ET userId** — pas d'orphelins possibles. Cohérent avec le pattern Phase 8 (UserInvitation.userId Cascade) et la convention multi-tenant Phase 7.
2. **ACTIVE_STATUSES dupliqué** dans `lead-load-stats.ts` plutôt qu'importé depuis `auto-assign-leads.ts` — ce dernier est un fichier `'use server'`, exporter une constante depuis un module Server Action force des limites de bundling. Dette tracée en JSDoc.
3. **Indice composite `(tenantId, status, wonAt)`** plutôt que `(tenantId, wonAt)` — couvre directement la requête KPI 2 (WHERE status='WON' AND wonAt>=startOfMonth) sans index supplémentaire.
4. **`getCommercialsWithKpis` n'a pas de `requireRole`** — convention Phase 8 D-09 buildAuditWhere : helpers purs testables, RBAC dans le caller (sera fait dans la page `/app/leads/charge` Plan 09-03).
5. **LeadAssignedPayloadSchema en Zod** (pas TypeScript-only) — protège runtime côté reader cloche (Pitfall 6 RESEARCH.md : drift writer/reader silencieux sur Json schema-less).
6. **Clone-strict du template `user-invitation.ts`** — pas de helpers email partagés extraits (BRAND_DARK, escapeHtml redéfinis localement). Le pattern centralisable émergera Phase 10+ quand un 3ᵉ template ajoutera la pression.

## Deviations from Plan

None - plan executed exactly as written. Toutes les acceptance criteria ont été remplies au premier essai. La phase RED de la TDD a bien failed avant les sources (vérifié pour les 3 fichiers tests).

**Total deviations:** 0
**Impact on plan:** Plan strictement appliqué. Aucun écart, aucun scope creep.

## Issues Encountered

- **Prisma format a réaligné les colonnes** du model Tenant entier (cosmétique uniquement — les ajouts sont corrects). Pas un problème : géré automatiquement par `pnpm exec prisma format` puis `prisma migrate dev`.
- **Test 8c initial du schema** : j'ai ajouté un test pour vérifier que `source: null` et `source` absent sont tous deux acceptés par `LeadAssignedPayloadSchema` (le plan demandait "8 cas" — j'ai livré 10 dont 3 sous `LeadAssignedPayloadSchema` pour couvrir nullable + optional). Bonus, pas une déviation.

## User Setup Required

None - aucune configuration externe requise. La migration tourne sur Postgres local existant (docker-compose). Aucune variable d'environnement à ajouter (APP_URL sera vérifiée Plan 09-02 quand `lead-notifications.ts` sera créé).

## Next Phase Readiness

**Ready for Plan 09-02 (server actions + wiring) :**
- `prisma.notification.create` typé prêt à consommer dans `notifyLeadAssigned` (futur `apps/web/src/lib/lead-notifications.ts`).
- `prisma.lead.update({ data: { wonAt } })` typé prêt à consommer dans `updateLeadStatus`.
- `tenant.autoAssignLeads / notifyOnLeadAssignEmail / notifyOnLeadAssignBell` lisibles par `createLead` et `notifyLeadAssigned` pour respecter les 3 toggles utilisateur.
- `CreateLeadSchema` importable via `@qualiof/shared` pour la signature de `createLead({ input: unknown })`.
- `renderLeadAssignedEmail` importable depuis `@/lib/mailer-templates/lead-assigned`.

**Ready for Plan 09-03 (UI page charge) :**
- `getCommercialsWithKpis(user.tenantId)` consommable directement dans le Server Component `/app/leads/charge/page.tsx`. Cible RBAC : ADMIN + MANAGER (à appliquer côté page).

**Aucun blocker.**

## Known Stubs

Aucun stub. Tous les exports sont fonctionnels, le helper retourne des valeurs réelles depuis Prisma, le template rend de l'HTML/text valide. Note pédagogique : tant que `updateLeadStatus` (Plan 09-02) n'aura pas été livré, `Lead.wonAt` restera NULL en BDD et les KPI 2/3/4 retourneront 0/null pour tous les commerciaux — c'est attendu (cf. Pitfall 3 RESEARCH.md), pas un stub.

## Self-Check: PASSED

**Files verified (8/8):**
- FOUND: `packages/db/prisma/migrations/20260516160839_phase09_distribution/migration.sql`
- FOUND: `packages/shared/src/schemas/lead.ts`
- FOUND: `apps/web/src/lib/lead-load-stats.ts`
- FOUND: `apps/web/src/lib/mailer-templates/lead-assigned.ts`
- FOUND: `apps/web/src/lib/__tests__/lead-schema.test.ts`
- FOUND: `apps/web/src/lib/__tests__/lead-load-stats.test.ts`
- FOUND: `apps/web/src/lib/mailer-templates/__tests__/lead-assigned.test.ts`
- FOUND: `.planning/phases/09-distribution-leads-automatique/09-01-SUMMARY.md`

**Commits verified (3/3):**
- FOUND: `56b8958` (Task 1 — Migration Prisma)
- FOUND: `4fcccd9` (Task 2 — Zod schemas)
- FOUND: `7ba9a04` (Task 3 — Helper + email template)

**Tests verified:** apps/web 168/168 verts + packages/shared 46/46 verts + tsc --noEmit clean.

---
*Phase: 09-distribution-leads-automatique*
*Plan: 01*
*Completed: 2026-05-16*
