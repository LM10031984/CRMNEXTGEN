---
phase: 12-modules-stub-inscriptions-et-modeles
subsystem: phase-close
status: Complete
closed: 2026-06-01
plans-completed: 3
requirements-completed: [MOD-01, MOD-02]

tags: [phase-close, routing, ui-catalog, rename-route, code-driven-catalog]

# Dependency graph (phase-level)
requires:
  - phase: 08-rbac-multi-utilisateurs
    provides: "nav-config.ts allowedRoles + filterNavForRole + requireRole helper"
  - phase: 04-preinscriptions
    provides: "Pages admin preinscriptions + composants + server actions preinscription-*"
  - phase: 02-pack-fin-formation
    provides: "10 templates closure-* + qualiopi-prompts.ts"
  - phase: 04-preinscriptions
    provides: "AGEFICE form-fill 92 champs + reminder template"
  - phase: 09-leads
    provides: "lead-assigned email template"
  - phase: 11-factures
    provides: "invoice template + invoice-reminder email"
provides:
  - "Route admin /app/inscriptions (rename de /app/preinscriptions)"
  - "Redirect 308 reverse /app/preinscriptions(/:path*) → /app/inscriptions(/:path*)"
  - "Catalogue source unique lib/templates-catalog.ts (27 entries)"
  - "Page /app/templates Server Component listing read-only"
  - "Convention projet 'renommage de route' (1ère application) — documentée STATE.md"
  - "Convention projet 'catalogue centralisé code-driven lib/<feature>-catalog.ts' (1ère application) — documentée STATE.md"
  - "Composant <Placeholder> orphelin supprimé (0 placeholder restant dans la sidebar)"
affects: [10-audit-qualiopi-blanc]

tech-stack:
  added: []
  patterns:
    - "Pattern 'rename route Next.js App Router' : git mv + redirect 308 + grep migration refs + Wave 0 TDD"
    - "Pattern 'catalogue centralisé code-driven' : interface + ReadonlyArray + helpers + Server Component consumer"

key-files:
  created:
    - "apps/web/src/lib/templates-catalog.ts (27 entries — 19 qualiopi + 3 agefice + 5 email)"
    - "apps/web/src/lib/__tests__/templates-catalog.test.ts (6 tests Wave 0)"
    - "apps/web/src/app/app/templates/__tests__/page.smoke.test.tsx (4 tests Wave 0)"
    - "apps/web/src/server/actions/__tests__/redirect-308.test.ts (3 tests Wave 0)"
    - ".planning/phases/12-.../12-SUMMARY.md (ce fichier)"
    - ".planning/phases/12-.../12-SMOKE.md"
  modified:
    - "apps/web/src/app/app/inscriptions/page.tsx (via git mv depuis preinscriptions/page.tsx)"
    - "apps/web/src/app/app/inscriptions/[id]/page.tsx (via git mv)"
    - "apps/web/src/app/app/templates/page.tsx (stub Placeholder → Server Component listing)"
    - "apps/web/next.config.mjs (2 redirects 308 D-02)"
    - "apps/web/src/components/layout/nav-config.ts (rename + suppression doublon + allowedRoles Modèles)"
    - "apps/web/src/components/layout/__tests__/nav-config.test.ts (3 tests structurels)"
    - "apps/web/src/app/app/page.tsx (2 hrefs dashboard)"
    - "apps/web/src/components/command-palette/command-palette.tsx"
    - "apps/web/src/components/preinscriptions/new-link-button.tsx"
    - "apps/web/src/components/preinscriptions/detail-actions.tsx"
    - "apps/web/src/server/actions/notifications.ts"
    - "apps/web/src/server/actions/preinscriptions.ts"
    - "apps/web/src/server/actions/preinscription-public.ts"
    - "apps/web/src/server/actions/preinscription-convert.ts"
    - "apps/web/src/server/actions/preinscription-reminders.ts"
    - ".planning/REQUIREMENTS.md (MOD-01 + MOD-02 cochés avec preuves)"
    - ".planning/ROADMAP.md (Phase 12 Complete 3/3 plans)"
    - ".planning/STATE.md (frontmatter + Current Position + Roadmap Evolution + Workflow Conventions section)"
  deleted:
    - "apps/web/src/app/app/preinscriptions/page.tsx (via git mv)"
    - "apps/web/src/app/app/preinscriptions/[id]/page.tsx (via git mv)"
    - "apps/web/src/components/ui/placeholder.tsx (orphelin après Plans 12-01/02 — 0 import restant)"

key-decisions:
  - "D-01 Rename URL admin uniquement (route publique D-03 + constante MinIO PREENROLLMENT_BUCKET préservées)"
  - "D-04 Sidebar 1 seule entrée 'Inscriptions' RBAC ADMIN/MANAGER/COMMERCIAL héritée + suppression doublon stub"
  - "D-05 17 refs hardcodées migrées (URLs publiques uniquement, noms internes préservés)"
  - "D-06 Page templates read-only (pas d'éditeur, pas de BDD, pas de versioning)"
  - "D-07 Inventory final 27 entries (dépasse min 15 du plan) : 19 qualiopi + 3 agefice + 5 email"
  - "D-09 RBAC double-defense ADMIN+MANAGER+LECTEUR (requireRole page + allowedRoles sidebar)"
  - "D-10 Catalogue centralisé lib/templates-catalog.ts — 1 source de vérité réutilisable Phase 10"
  - "D-11 V1 sans preview Gotenberg (ROI insuffisant — note V1 affichée utilisateur)"
  - "Suppression <Placeholder> orphelin (success criterion #3 = 0 placeholder dans la sidebar)"

requirements-completed: [MOD-01, MOD-02]

# Metrics
duration: ~1h cumulé (3 plans, 35min + 25min + ~15min bookkeeping)
completed: 2026-06-01
---

# Phase 12: Modules stub Inscriptions et Modèles — SUMMARY

**Status:** Complete
**Closed:** 2026-06-01
**Plans:** 3/3
**Requirements:** MOD-01 ✅, MOD-02 ✅
**Tests Wave 0:** 15/15 verts (5 + 10)
**Test suite global:** 707/707 verts (91 test files)
**Build Next.js:** clean (exit 0)

---

## Goal

Trancher le périmètre des 2 modules placeholder restants dans la sidebar QualiOF et livrer la décision. Success criterion roadmap : **zéro placeholder dans la sidebar**.

---

## Decisions appliquées (verrouillées CONTEXT.md)

### MOD-01 — Renommage `/app/preinscriptions` → `/app/inscriptions`

| ID   | Décision                                | Preuve                                                                                                                                                                                                                                                |
| ---- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D-01 | Move physique de la page admin          | `git mv apps/web/src/app/app/preinscriptions/* → /app/inscriptions/*`. Stub Placeholder écrasé. Commit `b760abe`.                                                                                                                                     |
| D-02 | Redirect 308 reverse                    | `apps/web/next.config.mjs` : 2 entries `/app/preinscriptions(/:path*)` → `/app/inscriptions(/:path*)`. Test Wave 0 `redirect-308.test.ts` (3 assertions).                                                                                              |
| D-03 | Formulaire public PRÉSERVÉ              | `apps/web/src/app/preinscription/[token]/page.tsx` non touché. Vérifié par `test -f`.                                                                                                                                                                |
| D-04 | Sidebar nav-config                      | 1 entrée `'Inscriptions'` (icône Inbox, ADMIN/MANAGER/COMMERCIAL) + doublon stub Configuration supprimé. Test Wave 0 `nav-config.test.ts` (2 tests structurels).                                                                                       |
| D-05 | 17 refs migrées                         | Grep `preinscriptions` apps/web/src/ : 0 URL admin restante (les noms internes `components/preinscriptions/`, `server/actions/preinscription*`, constante MinIO `PREENROLLMENT_BUCKET` préservés intentionnellement). Commit `0957f65`.                |

### MOD-02 — Catalogue templates read-only

| ID   | Décision                                                        | Preuve                                                                                                                                                                                                                            |
| ---- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-06 | Read-only (pas d'éditeur, pas de versioning, pas de BDD)         | `apps/web/src/app/app/templates/page.tsx` : Server Component listing tableau, aucun handler de mutation                                                                                                                            |
| D-07 | Inventory 19+3+5 = 27 entrées                                    | `apps/web/src/lib/templates-catalog.ts` : `grep -c "category: 'qualiopi'"` = 19, `'agefice'` = 3, `'email'` = 5                                                                                                                     |
| D-08 | Schéma { id, label, category, sourcePath, description, variables[] } | Test Wave 0 `templates-catalog.test.ts:Test 4` (ids uniques + schéma respecté)                                                                                                                                                  |
| D-09 | RBAC ADMIN+MANAGER+LECTEUR (page + sidebar)                       | `requireRole(['ADMIN','MANAGER','LECTEUR'])` page.tsx (2 occurrences : import + call) + `allowedRoles: ['ADMIN','MANAGER','LECTEUR']` nav-config.ts                                                                                |
| D-10 | Catalogue centralisé lib/templates-catalog.ts                    | 1 source de vérité, exports `TEMPLATES_CATALOG` + helpers `getTemplatesByCategory/getTemplateById/countByCategory/CATEGORY_LABELS`. Commit `b9ee1d0`.                                                                              |
| D-11 | Aperçu V1 SKIPPED                                                | Décision planner — ROI insuffisant (~3h boulot pour nice-to-have). Note V1 affichée dans la page pour transparence. v2 possible via screenshots statiques `apps/web/public/templates-previews/`. Commit `5f4b4df`.                  |

---

## Plans

| Plan                  | Objective                                                            | Tests Wave 0          | Commits                          |
| --------------------- | -------------------------------------------------------------------- | --------------------- | -------------------------------- |
| [12-01](./12-01-PLAN.md) | Rename route admin + redirect 308 + sidebar + 17 refs migrées       | 5 verts (3 redirect + 2 nav) | fd51315 + b760abe + 0957f65      |
| [12-02](./12-02-PLAN.md) | Catalogue + Server Component templates + RBAC                       | 10 verts (6 catalogue + 4 page) | 3b52409 + b9ee1d0 + 5f4b4df      |
| [12-03](./12-03-PLAN.md) | Bookkeeping + SUMMARY + SMOKE + suppression Placeholder orphelin    | n/a                   | (local-only, .planning/ gitignored) |

---

## Fichiers modifiés (phase)

### Plan 12-01 (MOD-01)
- **Déplacés (git mv) :** `apps/web/src/app/app/preinscriptions/page.tsx` → `/app/inscriptions/page.tsx` ; `[id]/page.tsx` idem
- **Supprimés :** stub Placeholder `apps/web/src/app/app/inscriptions/page.tsx` (écrasé par git mv), dossier `apps/web/src/app/app/preinscriptions/`
- **Modifiés :** `apps/web/next.config.mjs` (2 redirects), `apps/web/src/components/layout/nav-config.ts` (rename + suppression doublon + retrait import `ListChecks`), `apps/web/src/app/app/page.tsx` (2 hrefs), `apps/web/src/components/command-palette/command-palette.tsx` (1 href + keywords), `apps/web/src/components/preinscriptions/{new-link-button,detail-actions}.tsx` (2 refs UI), `apps/web/src/server/actions/{preinscriptions,preinscription-public,preinscription-convert,preinscription-reminders,notifications}.ts` (10+ revalidatePath/href)
- **Tests Wave 0 :** `apps/web/src/server/actions/__tests__/redirect-308.test.ts` (NEW, 3 tests), `apps/web/src/components/layout/__tests__/nav-config.test.ts` (UPDATE, 2 tests ajoutés)

### Plan 12-02 (MOD-02)
- **Créés :** `apps/web/src/lib/templates-catalog.ts` (368 LOC, 27 entries, types + helpers)
- **Réécrits :** `apps/web/src/app/app/templates/page.tsx` (stub Placeholder → Server Component listing 114 LOC, 3 sections, table responsive, Note V1 aside)
- **Modifiés :** `apps/web/src/components/layout/nav-config.ts` (entrée Modèles enrichie `allowedRoles: ['ADMIN','MANAGER','LECTEUR']`)
- **Tests Wave 0 :** `apps/web/src/lib/__tests__/templates-catalog.test.ts` (NEW, 6 tests), `apps/web/src/app/app/templates/__tests__/page.smoke.test.tsx` (NEW, 4 tests)

### Plan 12-03 (Bookkeeping)
- `.planning/REQUIREMENTS.md` (MOD-01/MOD-02 cochés [x] avec preuves complètes)
- `.planning/ROADMAP.md` (Phase 12 Complete 3/3 + tableau Progress 3/3 + 2026-06-01)
- `.planning/STATE.md` (frontmatter + Current Position + Roadmap Evolution + Workflow Conventions section avec 2 conventions documentées)
- `.planning/phases/12-.../12-SUMMARY.md` (ce fichier)
- `.planning/phases/12-.../12-SMOKE.md` (flows manuels)
- **Supprimé :** `apps/web/src/components/ui/placeholder.tsx` (composant orphelin, 0 import restant après Plans 12-01/02 — success criterion #3 satisfait)

---

## Conventions établies / patterns nouveaux

### 1. « Renommage de route Next.js App Router » — 1ère application projet (Phase 12)

Documentée dans `STATE.md > Workflow Conventions`. Réutilisable pour futurs renames :

1. `git mv` physique des pages
2. Stub remplacement supprimé AVANT
3. Redirect 308 reverse dans `next.config.mjs` (avec `:path*`)
4. Grep update systématique des hrefs/redirects/revalidatePath
5. Sidebar nav-config : rename + suppression doublons
6. Tests Wave 0 (redirect + sidebar snapshot)
7. Préservations explicites (route publique, constantes externes)
8. Smoke build `pnpm --filter @qualiof/web build`
9. Grep defense-in-depth final = 0 URL résiduelle

### 2. « Catalogue centralisé code-driven `lib/<feature>-catalog.ts` » — 1ère application projet (Phase 12)

Documentée dans `STATE.md > Workflow Conventions`. Réutilisable Phase 10 (Audit Qualiopi blanc — 32 indicateurs) :

1. Interface typée
2. ReadonlyArray + `as const`
3. Helpers : `getByCategory`, `getById`, `countByCategory`
4. Pas de BDD — hardcodé code-driven
5. Server Component consommateur avec `requireRole`
6. Tests Wave 0 structurels
7. Helpers exportés réutilisables ailleurs (export PDF Phase 10, dashboard, audit)

---

## Smoke Pre-Checkpoint (validation Plan 12-03 Task 3)

| Check                                                                  | Résultat                          |
| ---------------------------------------------------------------------- | --------------------------------- |
| `pnpm --filter @qualiof/web build`                                     | ✅ exit 0 — build clean             |
| `pnpm --filter @qualiof/web test --run`                                | ✅ 707/707 verts (91 test files)    |
| `grep -rn "/app/preinscriptions" apps/web/src/` (hors exclusions)       | ✅ 0 lignes                          |
| `grep -c "label: 'Inscriptions'" nav-config.ts`                         | ✅ 1                                  |
| `grep -c "label: 'Pré-inscriptions'" nav-config.ts`                     | ✅ 0                                  |
| `grep -c "label: 'Modèles de documents'" nav-config.ts`                 | ✅ 1                                  |
| `grep -c "export const TEMPLATES_CATALOG"` templates-catalog.ts         | ✅ 1                                  |
| `grep -c "category: 'qualiopi\|agefice\|email'"` templates-catalog.ts   | ✅ 19 + 3 + 5 = 27                    |
| `grep -c "requireRole" templates/page.tsx`                              | ✅ 2 (import + call)                  |
| `grep -c "<Placeholder" templates/page.tsx`                             | ✅ 0                                  |
| `grep -c "<Placeholder" inscriptions/page.tsx`                          | ✅ 0                                  |
| `grep -rn "ui/placeholder" apps/web/src/` (post-suppression composant)  | ✅ 0 import restant (composant supprimé) |
| Build listing `/app/inscriptions` + `/app/templates`                    | ✅ Présents                           |
| Build listing `/app/preinscriptions`                                    | ✅ ABSENT (n'existe que via redirect 308) |

---

## Notes pour la suite

- **Composant `<Placeholder>` supprimé** (`apps/web/src/components/ui/placeholder.tsx`) : décision Plan 12-03. Les 2 derniers consommateurs ont été supprimés en Plans 12-01 (`/app/inscriptions`) et 12-02 (`/app/templates`). Aucun import restant (`grep -rn "ui/placeholder" apps/web/src/` = 0). Le composant ne servait qu'aux stubs des modules placeholder roadmap (Phase 12 cible) ; le success criterion #3 = « zéro placeholder dans la sidebar » → composant n'a plus de raison d'être.
- **Phase v5 RESTANTE : Phase 10 — Audit Qualiopi blanc** (QBLANC-01 + QBLANC-02 + QBLANC-03). Seule phase v5 non livrée. Le catalogue `lib/templates-catalog.ts` posé en Phase 12 sera réutilisé pour exporter en PDF la liste des documents à l'auditeur. La convention « catalogue centralisé code-driven » sera réutilisée pour `lib/qualiopi-indicators-catalog.ts` (32 indicateurs).
- **Aperçu rendu templates (D-11 V2)** : si Laurent en a besoin un jour, pattern recommandé = screenshots statiques `apps/web/public/templates-previews/{id}.png` (1 par template, généré 1× via Gotenberg en dev) + colonne "Aperçu" cliquable dans `/app/templates`. ~2h dans une v6.

---

## Self-Check: PASSED

- `apps/web/src/lib/templates-catalog.ts` FOUND
- `apps/web/src/app/app/templates/page.tsx` FOUND (Server Component, pas Placeholder)
- `apps/web/src/app/app/inscriptions/page.tsx` FOUND (depuis git mv Plan 12-01)
- `apps/web/src/app/app/inscriptions/[id]/page.tsx` FOUND
- `apps/web/src/app/app/preinscriptions/` ABSENT (supprimé via git mv)
- `apps/web/src/app/preinscription/[token]/page.tsx` FOUND (D-03 préservé)
- `apps/web/next.config.mjs` contient 2 redirects 308 D-02
- `apps/web/src/components/layout/nav-config.ts` : 1 entrée Inscriptions + 1 entrée Modèles avec allowedRoles
- `apps/web/src/components/ui/placeholder.tsx` ABSENT (supprimé en Plan 12-03 task 3 — orphelin)
- Commits FOUND : `fd51315` `b760abe` `0957f65` (Plan 12-01), `3b52409` `b9ee1d0` `5f4b4df` (Plan 12-02)
- `pnpm --filter @qualiof/web build` exit 0 (Compiled successfully + `/app/inscriptions` + `/app/templates` listées)
- `pnpm --filter @qualiof/web test --run` exit 0 (**707/707 tests verts**, 91 test files)
- Defense-in-depth greps : 0 URL admin résiduelle + 0 Placeholder usage + 27 entries catalogue split 19/3/5

---

*Phase: 12-modules-stub-inscriptions-et-modeles*
*Completed: 2026-06-01*
