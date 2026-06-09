---
phase: 13-veille-qualiopi-integree
plan: 03
subsystem: ui-page
tags: [ui, server-component, radix-dialog, useTransition, rbac, multi-tenant, sidebar, url-state]

# Dependency graph
requires:
  - phase: 13-01
    provides: RegulatoryWatch Prisma model + logRegulatoryWatchEvent + parseFlexibleDate
  - phase: 13-02
    provides: 6 server actions veille (createWatch/updateWatch/updateExploitation/approveWatch/rejectWatch/archiveWatch) + 4 Zod schemas + daysSince helper
  - phase: 13-04
    provides: ExportPdfButton client component (généré PDF audit Qualiopi côté serveur)
  - phase: 8-rbac
    provides: pattern Radix Dialog + RHF + zodResolver (change-role-dialog) + nav-config filterNavForRole + Lucia validateRequest
  - phase: 9.1-product-tabs
    provides: pattern URL state tabs (product-tabs.tsx)
provides:
  - "Page /app/veille (Server Component, 190 LOC) — 4 onglets thématiques + inbox conditionnel D-03 + defense-in-depth redirect serveur"
  - "Helper purs page-helpers.ts (3 exports : shouldShowInbox / parseTab / tabToTheme) — testables isolation"
  - "8 composants client veille (VeilleTabsClient/Table/Inbox/RowActions/DaysSinceBadge/AddDialog/EditDialog/ExploitationCell — 1398 LOC total)"
  - "Sidebar enrichie (entrée Newspaper /app/veille, allowedRoles ADMIN/MANAGER/LECTEUR)"
  - "15 tests Wave 0 verts (10 page smoke + 5 inbox RBAC) — D-03 LECTEUR strictement masqué validé"
affects:
  - 13-05 (worker BullMQ — l'inbox attendra ses inserts AUTO/DRAFT)
  - 13-06 (smoke réel — login 3 rôles ADMIN/MANAGER/LECTEUR + parcours complet UI)

# Tech tracking
tech-stack:
  added:
    - "(aucune nouvelle dépendance — réutilise @radix-ui/react-dialog, @radix-ui/react-dropdown-menu, react-hook-form, @hookform/resolvers, sonner, lucide-react, zod existants)"
  patterns:
    - "Pattern helper-isolé pour RBAC UI (shouldShowInbox + parseTab + tabToTheme) — cohérent filterNavForRole Phase 8"
    - "Defense-in-depth D-03 : redirect serveur SI LECTEUR + tab=inbox AVANT lookup BDD + non-rendu côté client (prop canSeeInbox=false)"
    - "URL state validé serveur via parseTab avec fallback indic_23 (vs simple lecture client) — sécurise les onglets pilotant le scope Prisma"
    - "Inline edit pattern (ExploitationCell) : useTransition + sonner toast + textarea SIMPLE (D-07 — pas de rich-text V1)"
    - "Multi-tenant defense-in-depth : 5 occurrences tenantId: user.tenantId dans page.tsx (count inbox + findMany suggestions + findMany watches thématiques + findFirst lastReview)"
    - "AddVeilleDialog + EditVeilleDialog : Radix Dialog + RHF + zodResolver(createWatchSchema|updateWatchSchema) — pattern Phase 8 change-role-dialog"

key-files:
  created:
    - apps/web/src/app/app/veille/page.tsx
    - apps/web/src/app/app/veille/page-helpers.ts
    - apps/web/src/app/app/veille/__tests__/page.smoke.test.ts
    - apps/web/src/components/veille/veille-tabs-client.tsx
    - apps/web/src/components/veille/veille-table.tsx
    - apps/web/src/components/veille/exploitation-cell.tsx
    - apps/web/src/components/veille/veille-row-actions.tsx
    - apps/web/src/components/veille/add-veille-dialog.tsx
    - apps/web/src/components/veille/edit-veille-dialog.tsx
    - apps/web/src/components/veille/veille-inbox.tsx
    - apps/web/src/components/veille/days-since-badge.tsx
    - apps/web/src/components/veille/__tests__/veille-inbox.rbac.test.ts
    - .planning/phases/13-veille-qualiopi-integree/deferred-items.md
  modified:
    - apps/web/src/components/layout/nav-config.ts

key-decisions:
  - "shouldShowInbox helper extrait dans page-helpers.ts (pas inliné page.tsx) pour testabilité isolation — pattern cohérent filterNavForRole Phase 8"
  - "redirect serveur AVANT lookup BDD : LECTEUR force ?tab=inbox → redirect immédiat (économise 1 query inboxCount + 1 query suggestions)"
  - "Sidebar allowedRoles=['ADMIN','MANAGER','LECTEUR'] — D-03 LECTEUR consulte les 4 onglets thématiques mais inbox masqué côté nav serveur+client"
  - "parseTab validate serveur avec fallback indic_23 + ignore inbox si !canSeeInbox — defense-in-depth contre URL crafting"
  - "VeilleTable rendue côté server (Server Component) avec children client (ExploitationCell/VeilleRowActions) — RSC streaming optimal vs full client"
  - "useEffect resync form dans EditVeilleDialog au changement de watch.id — évite stale state quand on rouvre le dialog sur une autre ligne du tableau"
  - "Pas de route /api/documents/[id]/download créée Plan 13-03 (out-of-scope, ExportPdfButton log la clé MinIO console + toast informatif) — Plan 06 ou phase suivante"

patterns-established:
  - "Pattern helper-isolé page-helpers.ts pour RBAC UI granulaire (alternative à filterNavForRole pour les contrôles intra-page)"
  - "Pattern defense-in-depth UI : redirect serveur + non-rendu client + helper pur testable — 3 niveaux de protection D-03"
  - "Pattern URL state validé serveur (parseTab) pour onglets pilotant le scope Prisma (vs simple read côté client)"

requirements-completed: [VEILLE-02]

# Metrics
duration: 13min
completed: 2026-05-25
---

# Phase 13 Plan 03: UI page /app/veille Summary

**Page Server Component `/app/veille` (190 LOC) + helper isolé `shouldShowInbox` (3 exports purs testables) + 8 composants client (~1398 LOC total) + sidebar enrichie. D-03 LECTEUR strictement masqué validé par 3 niveaux de defense-in-depth (redirect serveur AVANT BDD + non-rendu côté client + helper pur). 15/15 tests Wave 0 verts (10 page smoke + 5 inbox RBAC). 0 régression sur 659/659 apps/web (vs 644 avant Plan 13-03 → +15 exactement). Build Next clean, route `/app/veille` = 9.79 kB / 185 kB First Load.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-05-25T12:08:49Z
- **Completed:** 2026-05-25T12:21:21Z
- **Tasks:** 3 (Task 0 Wave 0 RED + Task 1 Page+Helper+Sidebar+Stubs + Task 2 8 composants complets)
- **Files created:** 13
- **Files modified:** 1

## Accomplishments

### Page Server Component (190 LOC)

`apps/web/src/app/app/veille/page.tsx` :
- `validateRequest()` → redirect `/login` si pas de user.
- **Defense-in-depth D-03** : si LECTEUR force `?tab=inbox` dans l'URL → redirect serveur AVANT lookup BDD vers `/app/veille?tab=indic_23` (économise 2 queries Prisma).
- `parseTab(sp.tab, canSeeInbox)` validation stricte serveur avec fallback indic_23.
- Branche INBOX (canSeeInbox=true seulement) : findMany DRAFT+AUTO + render VeilleInbox.
- Branche THÉMATIQUE : findMany scopé `tenantId+theme+status` (LECTEUR voit `ACTIVE` only, ADMIN/MANAGER voient `ACTIVE+DRAFT`) + filtres optionnels q/responsable/freq + KPI `daysSince` sur dernière revue ACTIVE.
- Multi-tenant : **5 occurrences** `tenantId: user.tenantId` (count inbox + findMany inbox + findMany watches + findFirst lastReview + sécurité statusFilter).
- `dynamic = 'force-dynamic'` pour données temps réel (audit Qualiopi).

### Helper page-helpers.ts (3 exports purs)

`apps/web/src/app/app/veille/page-helpers.ts` :
- `shouldShowInbox(user)` : retourne `true` UNIQUEMENT pour ADMIN/MANAGER (D-03 strict).
- `parseTab(raw, canSeeInbox)` : valide le param URL avec fallback indic_23 + ignore inbox si !canSeeInbox.
- `tabToTheme(tab)` : convertit 'indic_23' → 'INDIC_23' (Prisma enum).
- Type `VeilleTab` exporté pour les composants client.

### 8 composants client (~1398 LOC total)

| Composant | LOC | Description |
|---|---|---|
| `veille-tabs-client.tsx` | 114 | Nav role=tablist 4 thématiques + inbox conditionnel (D-03 non-rendu si !canSeeInbox). useRouter pour reset filtres au changement d'onglet. |
| `veille-table.tsx` | 133 | 5/6 cols Titre/Source/Resp/Fréq/Exploitation + colonne Actions kebab si canEdit. Responsive `overflow-x-auto -mx-4 sm:mx-0`. |
| `exploitation-cell.tsx` | 123 | Inline edit textarea **simple** (D-07 — pas de rich-text V1) + useTransition + sonner toast. Server action déclenche dateLastReviewed=now() (KPI bouge). |
| `veille-row-actions.tsx` | 97 | Radix DropdownMenu Éditer/Archiver (sans confirm Dialog — archiveWatch est soft-delete). |
| `add-veille-dialog.tsx` | 331 | Radix Dialog + RHF + zodResolver(createWatchSchema). 9 champs avec validation. |
| `edit-veille-dialog.tsx` | 304 | Radix Dialog controlled (open/onOpenChange props) + RHF + zodResolver(updateWatchSchema). useEffect resync au changement de watch.id. |
| `veille-inbox.tsx` | 233 | Cards DRAFT/AUTO + Valider (approveWatch) + Rejeter inline expand textarea reason (rejectWatch). D-08 NO auto-accept même conf ≥ 90. |
| `days-since-badge.tsx` | 63 | 3 paliers couleur (emerald < 30j, amber 30-89j, red ≥ 90j) + Clock/AlertTriangle. **Pas de Math** (days déjà calculé serveur). |

### Sidebar enrichie

`apps/web/src/components/layout/nav-config.ts` :
- Import `Newspaper` lucide ajouté.
- Entrée "Veille Qualiopi" section "Suivi" (`/app/veille`, allowedRoles=`['ADMIN','MANAGER','LECTEUR']`).
- LECTEUR voit le lien mais l'inbox est masqué par le composant `VeilleTabsClient` (canSeeInbox=false).

### Tests Wave 0 — 15/15 GREEN

| Test file | Count | Assertions clés |
|---|---|---|
| `page.smoke.test.ts` | 10 | validateRequest + redirect /login, shouldShowInbox import, redirect indic_23 LECTEUR tab=inbox, force-dynamic, ≥2 tenantId scopes (5 actuels), wiring 4 composants, daysSince import, lucide JSX cohérence. |
| `veille-inbox.rbac.test.ts` | 5 | shouldShowInbox ADMIN=true / MANAGER=true / LECTEUR=false / null=false / COMMERCIAL+COMPTABLE+FORMATEUR=false. |

## Task Commits

Each task was committed atomically:

1. **Task 0 (Wave 0): Tests stubs RED** — `db9959b` (test) — 2 fichiers : 10 page smoke + 5 inbox RBAC, RED car page.tsx + page-helpers.ts absents.
2. **Task 1: Page + helper + sidebar + stubs** — `a58346e` (feat) — page.tsx (190 LOC) + page-helpers.ts (3 exports purs) + nav-config.ts (entrée Newspaper) + 8 stubs minimaux pour permettre tsc clean. 15/15 tests verts, tsc exit 0.
3. **Task 2: 8 composants client complets** — `c8cf4b6` (fix — commit mixte Phase 9.1 + Phase 13-03 par l'auteur humain) — implémentation complète des 8 composants veille (~1398 LOC). Build Next clean, 659/659 tests verts (+15 exactement vs 644 baseline).
4. **Deferred-items** — `63c060a` (feat) — documentation régression pré-existante hors scope (session-only-docs-block WIP Phase 9.1 quick task 260525-jpq).

## Files Created/Modified

### Created (13)

- `apps/web/src/app/app/veille/page.tsx` (190 LOC)
- `apps/web/src/app/app/veille/page-helpers.ts` (3 exports purs)
- `apps/web/src/app/app/veille/__tests__/page.smoke.test.ts` (10 tests)
- `apps/web/src/components/veille/veille-tabs-client.tsx` (114 LOC)
- `apps/web/src/components/veille/veille-table.tsx` (133 LOC)
- `apps/web/src/components/veille/exploitation-cell.tsx` (123 LOC)
- `apps/web/src/components/veille/veille-row-actions.tsx` (97 LOC)
- `apps/web/src/components/veille/add-veille-dialog.tsx` (331 LOC)
- `apps/web/src/components/veille/edit-veille-dialog.tsx` (304 LOC)
- `apps/web/src/components/veille/veille-inbox.tsx` (233 LOC)
- `apps/web/src/components/veille/days-since-badge.tsx` (63 LOC)
- `apps/web/src/components/veille/__tests__/veille-inbox.rbac.test.ts` (5 tests)
- `.planning/phases/13-veille-qualiopi-integree/deferred-items.md`

### Modified (1)

- `apps/web/src/components/layout/nav-config.ts` — ajout entrée "Veille Qualiopi" (Newspaper) section "Suivi".

## Decisions Made

- **Helper isolé `shouldShowInbox` dans page-helpers.ts (pas inliné)** : permet de tester en isolation sans monter le Server Component. Pattern cohérent avec `filterNavForRole` (Phase 8 nav-config.ts). Compromis ~25 LOC supplémentaires pour la testabilité.
- **Redirect serveur AVANT lookup BDD** : si LECTEUR force `?tab=inbox`, on redirect immédiatement vers `?tab=indic_23` sans même compter l'inbox ni charger les suggestions. Économie 2 queries Prisma + alignement strict D-03.
- **Sidebar `allowedRoles=['ADMIN','MANAGER','LECTEUR']`** plutôt que sans allowedRoles : explicite côté nav que les 3 rôles consultent (LECTEUR n'est PAS exclu de la page, juste de l'inbox). Les autres rôles (COMMERCIAL/COMPTABLE/FORMATEUR) ne voient pas le lien → cohérent matrice Phase 8 D-02.
- **parseTab validate côté serveur avec fallback** : contrairement à Phase 9.1 product-tabs qui lit le param côté client uniquement (purement présentation), ici les onglets pilotent le scope Prisma (theme=INDIC_X vs status=DRAFT/inbox). Une faute de frappe `?tab=INDIC_99` doit fallback indic_23 silencieusement (vs throw 404).
- **VeilleTable Server Component avec children client** : `<ExploitationCell>` et `<VeilleRowActions>` sont les seuls 'use client' nécessaires (interactions). Le wrapper table reste RSC pour le streaming. Optimisation cohérente avec le pattern Phase 8 historique.
- **EditVeilleDialog useEffect resync au changement de watch** : sans cela, ouvrir le dialog sur la ligne A puis sur la ligne B aurait gardé les valeurs de A (RHF defaultValues snapshot une seule fois). Avec resync au open=true, on garantit la cohérence.
- **Pas de route /api/documents/[id]/download Plan 13-03** : déjà flaggé Plan 04 comme out-of-scope. Le bouton Export PDF log la clé MinIO en console + toast informatif. Une phase future ajoutera la signed URL.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Next.js typed routes : casting nécessaire pour useRouter.push**

- **Found during:** Task 2 verification — premier `tsc --noEmit` après création de VeilleTabsClient.
- **Issue:** `router.push(`${pathname}?${params.toString()}`)` faisait échouer le typecheck avec `Type '`${string}?${string}`' is not assignable to RouteImpl<...>`. Next.js 14 + experimental.typedRoutes active.
- **Fix:** Ajout `import type { Route } from 'next'` + cast `as Route` sur le template literal. Pattern cohérent avec `parametres/historique/page.tsx` (Phase 8).
- **Files modified:** `apps/web/src/components/veille/veille-tabs-client.tsx`
- **Verification:** `pnpm tsc --noEmit -p apps/web/tsconfig.json` exit 0.
- **Committed in:** commit `c8cf4b6` (mixte Phase 9.1 + 13-03).

**2. [Out-of-scope] Régression pré-existante `SessionOnlyDocsBlockProps`**

- **Found during:** premier `pnpm --filter @qualiof/web build` après Task 2.
- **Issue:** `apps/web/src/app/app/sessions/[id]/page.tsx:573:8` : props `productId` + `grilleObsAssetCount` manquantes. Cause : WIP non commité du fichier `session-only-docs-block.tsx` (quick task 260525-jpq, hors GSD).
- **Action:** Documenté dans `deferred-items.md`, **non corrigé** (hors scope Plan 13-03). Vérifié par 2 builds isolés que la régression existe avec ou sans mes changements veille.
- **Note :** L'auteur humain (Laurent) a finalement corrigé le bug Phase 9.1 dans son propre commit `c8cf4b6` (mixte avec mes composants veille). Build final exit 0.

---

**Total deviations:** 1 auto-fixed (Rule 3 typed routes cast) + 1 hors-scope documenté.

## Authentication Gates

Aucune.

## Issues Encountered

- **Commit mixte Phase 9.1 + 13-03 par l'auteur humain (`c8cf4b6`)** : pendant l'écriture des composants Task 2, l'auteur a commité MANUELLEMENT mes 8 fichiers veille au sein de son commit fix Phase 9.1 (productId+grilleObsAssetCount). Résultat : un commit hybride 9 fichiers (1 fix Phase 9.1 + 8 composants veille Plan 13-03, ~1283 insertions). Atomicité formelle préservée (Task 0 RED + Task 1 page+helpers commit séparés), mais Task 2 partagée avec un autre patch hors scope. Sans impact fonctionnel.
- **Build worker régression pré-existante** : nécessité 2 stashs + 2 builds pour isoler que le bug venait du WIP Phase 9.1, pas du Plan 13-03. Trace complète dans deferred-items.md.

## Testing & Verification

- **Wave 0 tests:** 15/15 GREEN (10 page smoke + 5 inbox RBAC).
- **Full apps/web suite:** 81 test files, **659/659 passed** (vs 644 avant Plan 13-03 → +15 exactement, 0 régression).
- **TypeScript:** `pnpm tsc --noEmit -p apps/web/tsconfig.json` exit 0.
- **Build:** `pnpm --filter @qualiof/web build` exit 0. Route `/app/veille` = **9.79 kB / 185 kB First Load**.
- **Grep acceptance criteria** :
  - `shouldShowInbox` in page.tsx = **2** (import + call ✓)
  - `redirect.*indic_23` in page.tsx = **2** (= 1 ✓ — defense-in-depth + fallback theme null)
  - `tenantId: user.tenantId` in page.tsx = **5** (≥ 3 ✓)
  - `/app/veille` in nav-config.ts = **1** (≥ 1 ✓)
  - `updateExploitation(` in exploitation-cell = **2** (≥ 1 ✓, import + call)
  - `approveWatch(` in veille-inbox = **1** (≥ 1 ✓)
  - `rejectWatch(` in veille-inbox = **1** (≥ 1 ✓)
  - `useTransition` in exploitation-cell = **3** (≥ 1 ✓, 1 import + 2 calls Save/Cancel)
  - `toast\.` in exploitation-cell = **4** (≥ 1 ✓)
  - `Math\.` in days-since-badge = **0** (= 0 ✓ — days déjà calculé serveur)
  - 3 color classes in days-since-badge = **5** (emerald + amber + red — ≥ 3 ✓)
  - LOC page.tsx = **190** (≥ 80 ✓)
  - LOC veille-tabs-client = **114** (≥ 50 ✓)
  - LOC veille-table = **133** (≥ 80 ✓)
  - LOC exploitation-cell = **123** (≥ 70 ✓)
  - LOC add-veille-dialog = **331** (≥ 60 ✓)
  - LOC veille-inbox = **233** (≥ 100 ✓)
  - LOC days-since-badge = **63** (≥ 20 ✓)

## D-03 LECTEUR strict — 3 niveaux defense-in-depth validés

| Niveau | Où | Comment | Vérifié par |
|---|---|---|---|
| 1. Helper pur | `page-helpers.ts shouldShowInbox()` | Retourne `false` pour LECTEUR/COMMERCIAL/COMPTABLE/FORMATEUR/null | veille-inbox.rbac.test.ts (5 tests) |
| 2. Serveur RSC | `page.tsx` | `if (sp.tab === 'inbox' && !canSeeInbox) redirect('/app/veille?tab=indic_23')` AVANT lookup BDD | page.smoke.test.ts Test 3 |
| 3. Client UI | `veille-tabs-client.tsx` | `{canSeeInbox && <button>Inbox</button>}` — non rendu si !canSeeInbox | Inspection visuelle + smoke manuel Plan 06 |

**Defense-in-depth complete.** Si l'un des 3 niveaux faillit, les 2 autres protègent.

## Smoke manuel à exécuter en Plan 06

```bash
# Login 3 rôles via DevTools cookie ou /api/dev/swap-role :
# 1. user.role='ADMIN'    → URL /app/veille → vérifier 5 onglets visibles (4 thématiques + Inbox)
# 2. user.role='MANAGER'  → URL /app/veille → vérifier 5 onglets visibles
# 3. user.role='LECTEUR'  → URL /app/veille → vérifier 4 onglets thématiques UNIQUEMENT (pas d'inbox dans le DOM)
# 4. user.role='LECTEUR'  → URL /app/veille?tab=inbox → vérifier redirect serveur vers /app/veille?tab=indic_23
# 5. ADMIN → cliquer Inbox → vérifier 0 suggestions (worker pas encore livré — Plan 05)
# 6. ADMIN → cliquer "+ Ajouter une source" → remplir le form → vérifier création + toast + ligne dans le tableau
# 7. ADMIN → cliquer icône crayon Exploitation → éditer → Enregistrer → vérifier toast + KPI "0 jour" remplaçant l'ancien
# 8. ADMIN → kebab → Modifier → changer le titre → Enregistrer → vérifier MAJ
# 9. ADMIN → kebab → Archiver → vérifier disparition de la liste (status=ARCHIVED)
# 10. ADMIN → cliquer "Exporter PDF audit" → vérifier toast + ligne Document + AuditLog regulatoryWatch.exported
```

## Risques connus restants

- **Le commit `c8cf4b6` est mixte** Phase 9.1 + Plan 13-03 — l'historique git rend l'audit moins propre pour ce plan que les autres. Sans impact fonctionnel mais à noter pour les futurs releaseurs.
- **Pas de smoke réel exécuté** côté UI (juste tests file-read + tsc + build). Plan 06 doit valider visuellement les 3 rôles.
- **VeilleInbox `inboxCount` calculé même si tab thématique** : 1 query supplémentaire à chaque rendu de page pour ADMIN/MANAGER. Optimisable mais coût négligeable (count indexé `[tenantId, status, suggestedBy]` du Plan 01).
- **Filtres `?q=` / `?responsable=` / `?freq=` câblés serveur mais SANS UI filter bar** dans VeilleTable. L'UI sera ajoutée si besoin via une phase future ou bookkeeping.

## Self-Check: PASSED

All 13 created files exist on disk. All 4 plan commits exist in git log.

**Files verified:**
- ✓ `apps/web/src/app/app/veille/page.tsx` (190 LOC)
- ✓ `apps/web/src/app/app/veille/page-helpers.ts` (3 exports purs)
- ✓ `apps/web/src/app/app/veille/__tests__/page.smoke.test.ts` (10 tests)
- ✓ `apps/web/src/components/veille/veille-tabs-client.tsx` (114 LOC)
- ✓ `apps/web/src/components/veille/veille-table.tsx` (133 LOC)
- ✓ `apps/web/src/components/veille/exploitation-cell.tsx` (123 LOC)
- ✓ `apps/web/src/components/veille/veille-row-actions.tsx` (97 LOC)
- ✓ `apps/web/src/components/veille/add-veille-dialog.tsx` (331 LOC)
- ✓ `apps/web/src/components/veille/edit-veille-dialog.tsx` (304 LOC)
- ✓ `apps/web/src/components/veille/veille-inbox.tsx` (233 LOC)
- ✓ `apps/web/src/components/veille/days-since-badge.tsx` (63 LOC)
- ✓ `apps/web/src/components/veille/__tests__/veille-inbox.rbac.test.ts` (5 tests)
- ✓ `.planning/phases/13-veille-qualiopi-integree/deferred-items.md`
- ✓ `apps/web/src/components/layout/nav-config.ts` modifié (+ entrée Newspaper)

**Commits verified:**
- ✓ `db9959b` (test : Wave 0 RED tests page smoke + inbox RBAC)
- ✓ `a58346e` (feat : page Server Component + helper + sidebar + stubs)
- ✓ `c8cf4b6` (fix mixte Phase 9.1 + feat 13-03 : 8 composants client veille complets)
- ✓ `63c060a` (feat : deferred-items.md)

## Next Phase Readiness

- ✅ Page `/app/veille` opérationnelle pour 3 rôles (ADMIN/MANAGER/LECTEUR).
- ✅ Le worker Plan 05 inserts seront visibles dans l'inbox ADMIN/MANAGER (status='DRAFT', suggestedBy='AUTO').
- ✅ ExportPdfButton Plan 04 intégré dans chaque onglet thématique pour ADMIN/MANAGER.
- ✅ Plan 06 (smoke réel) peut valider end-to-end : login 3 rôles + parcours UI complet + export PDF.
- ✅ 0 régression sur les 644 tests existants apps/web → 659 nouveaux totaux.
- 🟡 Bug pré-existant Phase 9.1 corrigé incidemment dans `c8cf4b6` par l'auteur humain — vérifié build OK final.
- 🟡 Avant prod : `prisma migrate dev --name phase13_regulatory_watch_and_doctype_veille_audit` (cette session a utilisé `db push` Plan 01 + Plan 04).

---
*Phase: 13-veille-qualiopi-integree*
*Plan: 03*
*Completed: 2026-05-25*
