# Phase 9 — Distribution leads automatique — SUMMARY

**Status:** Complete · **Closed:** 2026-05-16

## Requirements Delivered

- **LEAD-01** ✓ Distribution automatique Lead → Commercial (algo `autoAssignLead` wiré dans createLead + reassignLead + 4 server actions + 3 toggles tenant + notif cloche + email + audit)
- **LEAD-02** ✓ Vue de charge par commercial (page `/app/leads/charge` + 4 PrioCard globaux + tableau commercial × 4 KPI + camembert SVG inline + sidebar entrée ADMIN+MANAGER)

## Plans Executed

| Plan | Theme | Files (prod) | Tests | Key decisions |
|---|---|---|---|---|
| 09-01 | Foundation BDD + types | 4 | 3 fichiers tests (17 tests) | Notification model + Lead.wonAt + 3 toggles Tenant, schemas Zod (Create/Distribution/LeadAssignedPayload) |
| 09-02 | Server actions + wiring | 5 | 4 fichiers tests (26 tests) | notifyLeadAssigned orchestre 3 side-effects, wonAt auto Pitfall 3, force:true Pitfall 4, dryRun ignoré Pitfall 5 |
| 09-03 | UI pages métier | 8 | 3 fichiers tests (23 tests) | PrioCardLocal mini-clone + SVG inline pur (pas de Recharts), 3 deviations Rule 1/3 auto-fix |
| 09-04 | Cloche + config tenant | 6 | 3 fichiers tests (22 tests) | Hybride dérivé/persisté dans 1 même hook, markNotificationRead fire-and-forget, soft-redirect ADMIN |
| 09-05 | Bookkeeping | 2 docs | — | Smoke 5 flows DevTools manuel, REQUIREMENTS/ROADMAP/STATE alignés |

## Commits Phase 9 (15 commits atomiques)

**Plan 09-01:** `56b8958` · `4fcccd9` · `7ba9a04`
**Plan 09-02:** `e9c79fb` · `4d27694` · `a824304`
**Plan 09-03:** `6308556` · `8d5e905` · `a547f2a`
**Plan 09-04:** `74140e9` · `35917a8` · `2fe1288`
**Plan 09-05:** (bookkeeping fin de phase, commits doc local-only — `.planning/` gitignored)

## Architecture Drift / Discovered

- `getCommercialsWithLoad` reste privé dans `auto-assign-leads.ts` (`'use server'` ne permet pas l'export propre de constantes/helpers purs) ; `lead-load-stats.ts` duplique volontairement `ACTIVE_STATUSES`. Refactor possible v6 : extraire dans un module pur partagé si la liste évolue (faible pression actuelle).
- `Notification.payload` est `Json` ; Zod parse côté reader (Pitfall 6 fix). Si futurs types ajoutés (`session.to_close`, `dossier.incomplete`, etc.), créer un union schema dans `packages/shared/src/schemas/notification.ts`.
- Phase 9 a livré 9 décisions clés `D-Phase9-A..S` documentées dans STATE.md → 3 décisions de synthèse retenues (D-11/D-12/D-13).

## Anti-patterns évités

- **Aucune dépendance chart externe** : camembert en SVG pur (160×160, arcs M/L/A/Z, palette 8 tons HSL Phase 6 a11y). Cas edge slice 100% géré via path circle complet.
- **Pas d'email/notification dans `autoAssignLead`** : l'algo Phase 9 reste pur, les side-effects sont délégués au caller (`createLead`/`reassignLead` → `notifyLeadAssigned`).
- **Pas de `entity='AutoAssignment'`** : convention AuditLog `entity='Lead'` cohérente avec Phase 7 (`entity='Tenant'`) + Phase 8 (`entity='User'`).
- **Pas de `@radix-ui/react-alert-dialog`** : Rule 3 fix, le pattern AlertDialog Phase 4 (`@radix-ui/react-dialog` avec Dialog.Title/Description/Close) est sémantiquement équivalent et déjà installé.
- **Pas de `@testing-library/react`** : Rule 3 fix, vitest config est `environment: 'node'`, tests source-regex équivalents (pattern 22 fichiers existants apps/web).

## Decisions Clés Consolidées

- **D-11 Hybride cloche** : `getNotifications` retourne `[dérivé tenant-wide, persisté user-scoped]` dans le même hook. Pas de cloche dédiée pour les notifs événementielles. 1 polling 60s, 1 badge total, 1 Dropdown UI.
- **D-12 Convention AuditLog Phase 9** : `entity='Lead'` (3 actions : `leads.auto_assigned` system, `leads.reassigned` user, `leads.status.change` user) + `entity='Tenant'` (1 action : `leads.distribution_config` admin).
- **D-13 Marquage notification lue** : `markNotificationRead(notifId)` fire-and-forget au clic Link dans `notifications-bell.tsx`. Pas de bouton "Marquer tout comme lu" (deferred). Polling 60s rafraîchit naturellement.

## Validation

- **Build Next.js OK** : 4 nouvelles routes Phase 9 listées (`/app/leads/charge` 844 B, `/app/leads/[id]` 4.47 kB, `/app/leads/new` 1.91 kB, `/app/parametres/distribution-leads` 1.26 kB).
- **Suite Vitest 239/239** : 88 nouveaux tests Phase 9 cumulés (17 + 26 + 23 + 22).
- **tsc --noEmit clean** : 0 erreur.
- **Smoke DevTools 5 flows** documenté `09-SMOKE.md` — à exécuter manuellement par Laurent.
- **0 déviation Rule 2/4** sur l'ensemble de la phase. 3 déviations Rule 1/3 (auto-fix scope task) documentées Plan 09-03.

## Next: Phase 10 — Audit Qualiopi blanc (QBLANC-01..03)

Prochaine étape : `/gsd:plan-phase 10`.

Pré-requis Phase 10 satisfaits :
- STATE.md frontmatter cohérent (`completed_phases: 5`, `completed_plans: 24`, current Phase 10 Not started).
- REQUIREMENTS.md LEAD-01/LEAD-02 marqués `[x] DONE 2026-05-16`.
- ROADMAP.md Phase 9 marquée Complete + 5/5 plans listés.
- Convention AuditLog `leads.*` posée — Phase 10 pourra ajouter `qualiopi.*` sur le même pattern.
- Helper `notifyLeadAssigned` réutilisable comme template pour les futures notifications événementielles (QBLANC-02 alerte 7j avant fin session).

---

*Phase: 09-distribution-leads-automatique*
*Plans: 5/5 complete*
*Closed: 2026-05-16*
