---
phase: 12-modules-stub-inscriptions-et-modeles
plan: 01
subsystem: routing

tags: [next-routes, rbac-sidebar, redirect-308, url-rename, preinscriptions, inscriptions]

# Dependency graph
requires:
  - phase: 08-rbac-multi-utilisateurs
    provides: "nav-config.ts `allowedRoles` + filterNavForRole pattern (Plan 08-04 D-07)"
  - phase: 04-preinscriptions
    provides: "Pages admin `/app/preinscriptions` + composants components/preinscriptions/* + server actions preinscription-*"
provides:
  - "Route admin `/app/inscriptions(/[id])` (ex-`/app/preinscriptions`)"
  - "Redirect 308 reverse `/app/preinscriptions(/:path*)` → `/app/inscriptions(/:path*)` (D-02)"
  - "Sidebar nettoyée : 1 seule entrée 'Inscriptions' (icône Inbox, RBAC ADMIN/MANAGER/COMMERCIAL héritée)"
  - "Pattern projet établi 'rename route + redirect 308 + grep update' — 1ère application"
affects: [12-02-page-templates, 12-03-doc-state, audits-futurs-routes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pattern 'rename route Next.js App Router' : git mv pages + redirect 308 (CLAUDE.md routes convention) + grep migration refs + Wave 0 TDD tests"
    - "Wave 0 TDD pour rename de routes : tests sur `nextConfig.redirects()` + tests structurels sur `NAV` array"

key-files:
  created:
    - "apps/web/src/server/actions/__tests__/redirect-308.test.ts (NEW Wave 0)"
  modified:
    - "apps/web/next.config.mjs (2 redirects 308 D-02 ajoutés)"
    - "apps/web/src/components/layout/nav-config.ts (renommage + suppression doublon + import ListChecks retiré)"
    - "apps/web/src/components/layout/__tests__/nav-config.test.ts (3 tests Wave 0 ajoutés)"
    - "apps/web/src/app/app/inscriptions/page.tsx (ex-preinscriptions/page.tsx via git mv + href interne migré)"
    - "apps/web/src/app/app/inscriptions/[id]/page.tsx (ex-preinscriptions/[id]/page.tsx via git mv + href interne migré)"
    - "apps/web/src/app/app/page.tsx (2 hrefs dashboard)"
    - "apps/web/src/components/command-palette/command-palette.tsx (1 href, keywords élargis 'inscription')"
    - "apps/web/src/components/preinscriptions/new-link-button.tsx (1 texte d'aide UI)"
    - "apps/web/src/components/preinscriptions/detail-actions.tsx (1 router.push)"
    - "apps/web/src/server/actions/notifications.ts (1 href notif)"
    - "apps/web/src/server/actions/preinscriptions.ts (2 revalidatePath)"
    - "apps/web/src/server/actions/preinscription-public.ts (3 revalidatePath)"
    - "apps/web/src/server/actions/preinscription-convert.ts (3 revalidatePath)"
    - "apps/web/src/server/actions/preinscription-reminders.ts (2 revalidatePath + 1 commentaire)"
  deleted:
    - "apps/web/src/app/app/preinscriptions/page.tsx (move via git mv)"
    - "apps/web/src/app/app/preinscriptions/[id]/page.tsx (move via git mv)"

key-decisions:
  - "Rename URL admin uniquement : /app/preinscriptions → /app/inscriptions. Le formulaire public /preinscription/[token] (D-03) et la constante MinIO PREENROLLMENT_BUCKET (D-05) sont préservés."
  - "Sidebar : 1 seule entrée 'Inscriptions' avec RBAC ADMIN/MANAGER/COMMERCIAL héritée de l'ancienne 'Pré-inscriptions'. Doublon stub (section Configuration, icône ListChecks) supprimé."
  - "Libellés métier 'Pré-inscriptions à valider' (notifications + command palette + PipelineRow dashboard) conservés volontairement — ce sont des termes métier (compteur de pipeline), pas des libellés de navigation."
  - "Imports internes @/components/preinscriptions/* et @/server/actions/preinscription-* conservés — D-05 : noms internes OK, seules les URLs publiques changent."
  - "Wave 0 TDD : test redirect-308.test.ts importe directement nextConfig.redirects() (assertion sur l'objet config Next, pas via curl)."

patterns-established:
  - "Pattern 'rename route Next.js' : 1) git mv pages 2) redirect 308 dans next.config.mjs (variantes `source` ET `source/:path*`) 3) grep -rn migration refs 4) Wave 0 tests sur nextConfig.redirects() + NAV sidebar. À documenter dans STATE.md par Plan 12-03."

requirements-completed: [MOD-01]

# Metrics
duration: 35min
completed: 2026-05-26
---

# Phase 12 Plan 01: Renommage `/app/preinscriptions` → `/app/inscriptions` Summary

**Route admin renommée en `/app/inscriptions` (ex-`/app/preinscriptions`), stub Placeholder remplacé par le vrai listing PreEnrollment, sidebar nettoyée (1 entrée 'Inscriptions' avec RBAC héritée), redirect 308 reverse et 17 refs hardcodées migrées — formulaire public et constante MinIO préservés.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-05-26T05:24:00Z
- **Completed:** 2026-05-26T06:00:26Z
- **Tasks:** 4 (Task 0 Wave 0 + Task 1 move + Task 2 migration + Task 3 smoke build)
- **Files modified:** 13 (+1 created, -2 deleted moved)

## Accomplishments

- Pages admin `/app/preinscriptions` déplacées vers `/app/inscriptions` (git mv préserve l'historique)
- Stub Placeholder `apps/web/src/app/app/inscriptions/page.tsx` (20 LOC) remplacé par le vrai listing PreEnrollment
- Redirect 308 reverse ajouté dans `next.config.mjs` : `/app/preinscriptions(/:path*)` → `/app/inscriptions(/:path*)`
- Sidebar nettoyée : 1 seule entrée 'Inscriptions' (icône Inbox, RBAC ADMIN/MANAGER/COMMERCIAL héritée). Doublon stub supprimé. Import `ListChecks` retiré.
- 17 refs hardcodées migrées (hrefs, router.push, revalidatePath) à travers 11 fichiers
- Préservation D-03 stricte : `/preinscription/[token]` (formulaire public tokenisé) NON TOUCHÉ
- Préservation D-05 stricte : constante MinIO `PREENROLLMENT_BUCKET = 'preinscriptions'` non touchée, noms internes `components/preinscriptions/*` et `server/actions/preinscription-*` conservés
- Wave 0 tests (5/5 GREEN) : 3 tests redirect-308 + 2 tests sidebar nav-config
- Build Next clean : 697/697 tests verts, build production OK avec `/app/inscriptions` listée et `/app/preinscriptions` absente du listing (n'existe plus que via redirect 308)

## Task Commits

Each task was committed atomically:

1. **Task 0: Wave 0 RED tests** - `fd51315` (test) — 3 redirect-308 + 2 nav-config (5 tests RED attendus avant Tasks 1+2)
2. **Task 1: git mv pages preinscriptions → inscriptions** - `b760abe` (feat) — git mv 2 pages + suppression stub Placeholder + hrefs internes migrés
3. **Task 2: Migration refs + redirect 308 + sidebar** - `0957f65` (feat) — 11 fichiers modifiés, 17 refs URL migrées, Wave 0 GREEN
4. **Task 3: Smoke build + grep defense-in-depth** - (no commit — verification only) — `pnpm --filter @qualiof/web build` exit 0, 0 URL admin résiduelle

## Files Created/Modified

### Created
- `apps/web/src/server/actions/__tests__/redirect-308.test.ts` — 3 tests Wave 0 : assertion sur `nextConfig.redirects()` (D-02 + préservation BUG-03)

### Modified
- `apps/web/next.config.mjs` — 2 redirects 308 D-02 (avec et sans `/:path*`)
- `apps/web/src/components/layout/nav-config.ts` — entrée 'Pré-inscriptions' renommée 'Inscriptions', doublon section Configuration supprimé, import `ListChecks` retiré
- `apps/web/src/components/layout/__tests__/nav-config.test.ts` — test ligne 56 mis à jour + 2 nouveaux tests structurels (1 seule entrée Inscriptions + absence totale Pré-inscriptions)
- `apps/web/src/app/app/inscriptions/page.tsx` — ex `preinscriptions/page.tsx` (git mv, 99% similitude) + 1 href interne migré
- `apps/web/src/app/app/inscriptions/[id]/page.tsx` — ex `preinscriptions/[id]/page.tsx` (git mv) + 1 href interne migré
- `apps/web/src/app/app/page.tsx` — 2 hrefs dashboard (CTA + PipelineRow)
- `apps/web/src/components/command-palette/command-palette.tsx` — 1 href Cmd+K, keywords élargis avec 'inscription'
- `apps/web/src/components/preinscriptions/new-link-button.tsx` — 1 texte d'aide UI (`<strong>/app/inscriptions</strong>`)
- `apps/web/src/components/preinscriptions/detail-actions.tsx` — 1 `router.push('/app/inscriptions')`
- `apps/web/src/server/actions/notifications.ts` — 1 href notification
- `apps/web/src/server/actions/preinscriptions.ts` — 2 `revalidatePath`
- `apps/web/src/server/actions/preinscription-public.ts` — 3 `revalidatePath` (dont 1 template `${id}`)
- `apps/web/src/server/actions/preinscription-convert.ts` — 3 `revalidatePath` (dont 1 template `${id}`)
- `apps/web/src/server/actions/preinscription-reminders.ts` — 2 `revalidatePath` (dont 1 template) + 1 commentaire JSdoc

### Deleted (via git mv — historique préservé)
- `apps/web/src/app/app/preinscriptions/page.tsx` (renommé en `inscriptions/page.tsx`)
- `apps/web/src/app/app/preinscriptions/[id]/page.tsx` (renommé en `inscriptions/[id]/page.tsx`)

## Decisions Made

### D-01..D-05 appliquées verbatim (CONTEXT.md)

- **D-01** : Pages admin déplacées `git mv preinscriptions/* inscriptions/*`. Stub Placeholder supprimé.
- **D-02** : 2 redirects 308 ajoutés dans `next.config.mjs` (verbatim selon plan, en cohabitation avec les 4 redirects historiques BUG-03 + Phase 11). Chaîne valide `pre-inscriptions → preinscriptions → inscriptions` pour browser double-hop.
- **D-03 PRÉSERVÉE STRICTEMENT** : `apps/web/src/app/preinscription/[token]/page.tsx` (formulaire public tokenisé) non touché. Vérifié par grep et `test -f`.
- **D-04** : Sidebar nettoyée. Entrée 'Pré-inscriptions' renommée 'Inscriptions' avec RBAC ADMIN/MANAGER/COMMERCIAL héritée. Doublon stub section Configuration supprimé. `ListChecks` retiré des imports car plus utilisé.
- **D-05** : 17 refs hardcodées migrées. Conservations strictes :
  - constante MinIO `PREENROLLMENT_BUCKET = 'preinscriptions'` (lib/storage.ts) → non touchée
  - imports `@/components/preinscriptions/*` (noms internes) → conservés
  - imports `@/server/actions/preinscription-*` (noms internes) → conservés
  - libellé métier `'Pré-inscriptions à valider'` (notifications, command palette, PipelineRow dashboard) → conservé volontairement (terme métier compteur, pas label nav)
  - commentaires JSdoc historiques `// Pattern repris de preinscriptions.ts` (tenant-users.ts) → conservés

### Preuves grep (defense-in-depth)

- `grep -rn "/app/preinscriptions" apps/web/src/ | grep -v "next.config|preinscription/\[token\]|PREENROLLMENT_BUCKET|__tests__|//"` → **0 lignes**
- `grep -c "label: 'Inscriptions'" apps/web/src/components/layout/nav-config.ts` → **1**
- `grep -c "label: 'Pré-inscriptions'" apps/web/src/components/layout/nav-config.ts` → **0**
- `grep -c "Placeholder" apps/web/src/app/app/inscriptions/page.tsx` → **0**
- `grep -c "PREENROLLMENT_BUCKET = 'preinscriptions'" apps/web/src/lib/storage.ts` → **1**
- `grep -c "source: '/app/preinscriptions'" apps/web/next.config.mjs` → **1**
- `test -f apps/web/src/app/preinscription/[token]/page.tsx` → **OK (D-03 préservé)**

## Deviations from Plan

None - plan executed exactly as written. Les 17 refs hardcodées migrées correspondent exactement à la liste D-05 du plan (les 17 sites concrets). Wave 0 TDD respecté (RED avant GREEN).

## Issues Encountered

- Une autre session/processus a modifié `apps/web/src/app/app/produits/page.tsx`, `packages/db/prisma/schema.prisma`, `apps/web/tsconfig.tsbuildinfo` et ajouté un dossier de migration `20260526100000_add_signature_request/` en parallèle de cette exécution. **Ces fichiers ont été volontairement exclus des commits** (scope discipline `feedback_aller_droit_au_but.md`) — ils seront committés par leur process d'origine.

## Next Phase Readiness

- **Plan 12-02 (page templates)** : prêt. La page `/app/templates` actuelle reste un stub Placeholder à remplacer par le catalogue read-only D-06..D-11.
- **Plan 12-03 (STATE.md convention)** : prêt. Le pattern 'rename route + redirect 308 + grep update' établi dans ce plan doit être documenté comme convention projet (1ère application).
- **Validation Laurent (Plan 12-03 checkpoint)** :
  - `curl -sI http://localhost:3010/app/preinscriptions` → doit retourner `HTTP/1.1 308` + `location: /app/inscriptions`
  - `curl -sI http://localhost:3010/app/preinscriptions/abc-123` → `308` + `location: /app/inscriptions/abc-123`
  - `curl -sI http://localhost:3010/app/pre-inscriptions` → `308` + `location: /app/preinscriptions` (qui redirigera à son tour vers `/app/inscriptions`)
  - Sidebar 3 rôles : vérifier que ADMIN/MANAGER/COMMERCIAL voient bien 'Inscriptions', et que FORMATEUR/COMPTABLE/LECTEUR ne voient PAS l'entrée.

## Self-Check: PASSED

- `apps/web/src/app/app/inscriptions/page.tsx` FOUND
- `apps/web/src/app/app/inscriptions/[id]/page.tsx` FOUND
- `apps/web/src/app/app/preinscriptions/` ABSENT (deleted)
- `apps/web/src/app/preinscription/[token]/page.tsx` FOUND (D-03 préservé)
- `apps/web/src/lib/storage.ts` contient `PREENROLLMENT_BUCKET = 'preinscriptions'` (D-05 préservé)
- `apps/web/next.config.mjs` contient 2 redirects D-02
- `apps/web/src/components/layout/nav-config.ts` : 1 entrée `label: 'Inscriptions'`, 0 entrée `label: 'Pré-inscriptions'`
- Commits FOUND : `fd51315` (Task 0), `b760abe` (Task 1), `0957f65` (Task 2)
- `pnpm --filter @qualiof/web build` exit 0
- `pnpm --filter @qualiof/web test -- redirect-308 nav-config` exit 0 (697/697 tests verts)
- Defense-in-depth grep : 0 URL admin résiduelle (hors exclusions explicites D-03/D-05/tests/commentaires)

---

*Phase: 12-modules-stub-inscriptions-et-modeles*
*Completed: 2026-05-26*
