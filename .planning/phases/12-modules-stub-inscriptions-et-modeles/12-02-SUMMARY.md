---
phase: 12-modules-stub-inscriptions-et-modeles
plan: 02
subsystem: ui

tags: [next-app-router, server-component, rbac-sidebar, templates-catalog, qualiopi, agefice, email-templates]

# Dependency graph
requires:
  - phase: 08-rbac-multi-utilisateurs
    provides: "nav-config.ts `allowedRoles` + filterNavForRole pattern + requireRole helper (lib/rbac.ts)"
  - phase: 02-pack-fin-formation
    provides: "10 templates closure-* + qualiopi-prompts.ts (mistral-small:24b)"
  - phase: 04-preinscriptions
    provides: "AGEFICE form-fill 92 champs + preinscription-reminder-template"
  - phase: 09-leads
    provides: "mailer-templates/lead-assigned"
  - phase: 11-factures
    provides: "invoice-template + mailer-templates/invoice-reminder"
provides:
  - "Page `/app/templates` Server Component listing read-only des 27 templates (D-06)"
  - "Catalogue centralisé `apps/web/src/lib/templates-catalog.ts` (source unique D-10)"
  - "Types TS publics : `TemplateCategory`, `TemplateCatalogEntry`, exports `TEMPLATES_CATALOG`, `getTemplatesByCategory`, `getTemplateById`, `countByCategory`, `CATEGORY_LABELS`"
  - "RBAC stricte ADMIN+MANAGER+LECTEUR appliquée côté page (requireRole) ET côté sidebar (allowedRoles D-09)"
  - "Composant `<Placeholder>` désormais orphelin (à confirmer/agir Plan 12-03)"
affects: [12-03-doc-state, 10-audit-qualiopi-blanc, futurs-tableaux-catalogue]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pattern catalogue centralisé code-driven : 1 fichier `lib/<feature>-catalog.ts` typé (interface + ReadonlyArray entries + helpers filtres) — réutilisable Phase 10 (audit Qualiopi blanc)"
    - "Pattern Server Component listing par catégorie : sections triées par `ORDERED_CATEGORIES`, icône par catégorie, table responsive overflow-x-auto"
    - "Note V1 affichée à l'utilisateur (aside dashed border) pour transparence sur les limitations connues (D-11)"

key-files:
  created:
    - "apps/web/src/lib/templates-catalog.ts (NEW — 27 entries, types, helpers, JSDoc D-06/D-10/D-11)"
    - "apps/web/src/lib/__tests__/templates-catalog.test.ts (NEW Wave 0 — 6 tests)"
    - "apps/web/src/app/app/templates/__tests__/page.smoke.test.tsx (NEW Wave 0 — 4 tests)"
  modified:
    - "apps/web/src/app/app/templates/page.tsx (OVERWRITE stub Placeholder → Server Component listing)"
    - "apps/web/src/components/layout/nav-config.ts (entrée Modèles enrichie allowedRoles ADMIN+MANAGER+LECTEUR)"

key-decisions:
  - "D-06 read-only strict : page = liste, 0 BDD, 0 éditeur, 0 versioning"
  - "D-07 inventory exhaustif : 19 qualiopi (13 closure-* + 6 lib root) + 3 agefice + 5 email = 27 entrées"
  - "D-08 schéma fixe par entrée : id (slug stable kebab-case), label FR, category, sourcePath repo-relatif, description 1-2 phrases, variables[] indicatives 3-8 principales"
  - "D-09 RBAC double : requireRole côté page.tsx (sécurité réelle) + allowedRoles côté sidebar (filtre visuel) — FORMATEUR/COMMERCIAL/COMPTABLE exclus"
  - "D-10 1 fichier source de vérité : lib/templates-catalog.ts — pas de mapping disséminé, helpers exportés réutilisables"
  - "D-11 V1 sans aperçu Gotenberg : décision documentée en JSDoc + Note V1 affichée user. V2 possible via screenshots statiques ou lib/pdf-render.ts"

patterns-established:
  - "Catalogue centralisé code-driven : 1 lib/<feature>-catalog.ts par feature, exports ReadonlyArray + helpers filter/find/count + Record<Category,string> labels FR — réutilisable pour tout catalogue futur (rôles, permissions, statuts, etc.)"

requirements-completed: [MOD-02]

# Metrics
duration: ~25min
completed: 2026-05-27
---

# Phase 12 Plan 02: Page Modèles read-only Summary

**Page `/app/templates` désormais un Server Component listing read-only des 27 templates QualiOF (19 Qualiopi + 3 AGEFICE + 5 Email), avec catalogue centralisé `lib/templates-catalog.ts` source unique D-10 et RBAC stricte ADMIN+MANAGER+LECTEUR (page + sidebar).**

## Performance

- **Duration:** ~25 min (Wave 0 RED → catalogue → page+sidebar → smoke build → SUMMARY)
- **Started:** 2026-05-27T15:00:43Z
- **Completed:** 2026-05-27T15:13:00Z
- **Tasks:** 3 (Task 0 Wave 0 + Task 1 catalogue + Task 2 page+sidebar ; Task 3 smoke build sans commit dédié)
- **Files modified:** 5 (3 NEW + 2 modified)

## Accomplishments

- Catalogue centralisé `apps/web/src/lib/templates-catalog.ts` créé avec **27 entrées** : 19 Qualiopi (13 closure-* + convention + programme + convocation + legal-docs + invoice + veille-audit), 3 AGEFICE (fiche HTML + form-fill PDF 92 champs + attendance attestation), 5 Email (preinscription-reminder + user-invitation + user-password-reset + invoice-reminder + lead-assigned)
- Page `/app/templates` désormais Server Component listing tableau par catégorie (sections Qualiopi/AGEFICE/Email avec icônes lucide-react FileCheck2/FileText/Mail, badges count par catégorie, table responsive `overflow-x-auto`, variables max 6 + "+N de plus")
- Stub Placeholder (20 LOC) supprimé : `grep -c "<Placeholder" apps/web/src/app/app/templates/page.tsx` = 0
- RBAC double-defense : `requireRole(['ADMIN','MANAGER','LECTEUR'])` côté page.tsx (sécurité réelle) + `allowedRoles: ['ADMIN','MANAGER','LECTEUR']` côté nav-config.ts (filtre visuel sidebar) — FORMATEUR/COMMERCIAL/COMPTABLE exclus
- Helpers exportés réutilisables : `getTemplatesByCategory`, `getTemplateById`, `countByCategory`, constantes `TEMPLATES_CATALOG`, `CATEGORY_LABELS`
- D-11 V1 sans aperçu : décision documentée en JSDoc du catalog + Note V1 affichée à l'utilisateur (aside dashed border) — transparence sur les limitations
- Wave 0 TDD 10/10 GREEN (6 catalogue + 4 page.smoke) + zéro régression : **707/707 tests verts** (+10 vs 697 baseline Plan 12-01)
- Build Next.js exit 0 (`pnpm --filter @qualiof/web build`), `/app/templates` listée dans le build output (152 B, 87.6 kB First Load)

## Task Commits

Each task was committed atomically:

1. **Task 0: Wave 0 RED tests** - `3b52409` (test) — 10 tests créés (6 catalogue + 4 page.smoke), RED confirmé (4 page.smoke fail + module load fail catalogue)
2. **Task 1: Catalogue centralisé** - `b9ee1d0` (feat) — 27 entries, types TS, helpers, 6/6 Wave 0 catalogue GREEN
3. **Task 2: Page Server Component + sidebar RBAC** - `5f4b4df` (feat) — stub Placeholder → Server Component listing, nav-config enrichi, 4/4 Wave 0 page.smoke GREEN
4. **Task 3: Smoke build + grep validation** - (no commit — verification only) — `pnpm build` exit 0, 707/707 tests verts, 0 usage Placeholder restant côté `/app/templates`

## Files Created/Modified

### Created
- `apps/web/src/lib/templates-catalog.ts` — 368 LOC, 27 entries, types TS publics + helpers (D-10 source unique)
- `apps/web/src/lib/__tests__/templates-catalog.test.ts` — 6 tests Wave 0 (length>=15, 3 categories, qualiopi>=10, schéma D-08, ids uniques, getTemplateById)
- `apps/web/src/app/app/templates/__tests__/page.smoke.test.tsx` — 4 tests Wave 0 (Placeholder absent, TEMPLATES_CATALOG imported, requireRole ADMIN+MANAGER+LECTEUR, async function)

### Modified
- `apps/web/src/app/app/templates/page.tsx` — Stub Placeholder (20 LOC) → Server Component listing par catégorie (114 LOC, 3 sections, table responsive, Note V1 aside)
- `apps/web/src/components/layout/nav-config.ts` — Entrée "Modèles de documents" enrichie : `allowedRoles: ['ADMIN', 'MANAGER', 'LECTEUR']` + commentaire D-09 (FORMATEUR/COMMERCIAL/COMPTABLE exclus)

## Decisions Made

### D-06..D-11 appliquées verbatim (CONTEXT.md)

- **D-06** : Page = listing read-only. 0 éditeur, 0 BDD, 0 versioning. Seulement HTML+RSC.
- **D-07** : Inventory final = **19 qualiopi + 3 agefice + 5 email = 27 entrées** (dépasse le minimum 15 du plan). Tous les fichiers code-driven scannés inclus.
- **D-08** : Schéma figé `{ id, label, category, sourcePath, description, variables[] }`. Variables indicatives (3-8 par entrée, pas exhaustif). Noms reflètent la convention `ClosureContext` réelle (`apprenantPrenom` / `apprenantNom` côté closure, `commercialFirstName` / `prospectName` côté mailer leads, etc.).
- **D-09** : RBAC double-defense :
  - **Sécurité réelle** : `requireRole(['ADMIN','MANAGER','LECTEUR'])` côté `page.tsx` (lève ForbiddenError côté serveur si rôle non autorisé)
  - **Filtre visuel** : `allowedRoles: ['ADMIN','MANAGER','LECTEUR']` côté `nav-config.ts` (cache l'entrée sidebar pour FORMATEUR/COMMERCIAL/COMPTABLE)
- **D-10** : `lib/templates-catalog.ts` = 1 source de vérité. Helpers exportés réutilisables pour Phase 10 (Audit Qualiopi blanc — possible export PDF du catalogue).
- **D-11 V1 sans preview** : justifié dans JSDoc du catalog : Gotenberg/WeasyPrint nécessite données fictives propres à chaque template (~3h boulot pour nice-to-have). Note V1 affichée user (transparence). V2 possible via screenshots statiques dans `apps/web/public/templates-previews/` ou réutilisation `lib/pdf-render.ts`.

### Preuves grep (defense-in-depth)

- `grep -c "<Placeholder" apps/web/src/app/app/templates/page.tsx` → **0**
- `grep -c "TEMPLATES_CATALOG" apps/web/src/app/app/templates/page.tsx` → **3**
- `grep -c "requireRole" apps/web/src/app/app/templates/page.tsx` → **2** (1 import + 1 appel)
- `grep -c "'ADMIN', 'MANAGER', 'LECTEUR'" apps/web/src/app/app/templates/page.tsx` → **1**
- `grep -c "export const TEMPLATES_CATALOG" apps/web/src/lib/templates-catalog.ts` → **1**
- `grep -c "id: 'closure-" apps/web/src/lib/templates-catalog.ts` → **13** (≥10 D-07)
- `grep -c "category: 'qualiopi'" apps/web/src/lib/templates-catalog.ts` → **19** (≥10 D-07)
- `grep -c "category: 'agefice'" apps/web/src/lib/templates-catalog.ts` → **3** (≥2 D-07)
- `grep -c "category: 'email'" apps/web/src/lib/templates-catalog.ts` → **5** (≥4 D-07)
- `grep -c "allowedRoles.*LECTEUR" apps/web/src/components/layout/nav-config.ts` → **6** (Dossiers OPCO + Factures + Budget AGEFICE + Formateurs + Veille + Modèles)

## Known Stubs

None — la page est désormais wired sur le vrai catalogue, pas de placeholder hardcodé. La Note V1 affichée à l'utilisateur n'est PAS un stub : c'est un message informatif transparent sur la limitation D-11 (V1 sans preview), documentée en code et plan.

## Deviations from Plan

None - plan executed exactly as written. L'inventory réel (27 entrées) dépasse le minimum 15 du plan, ce qui est conforme aux fichiers source effectivement présents.

## Issues Encountered

1. **Première commit Task 0 a inclus des fichiers `.planning/*` parallèles** (REQUIREMENTS.md, ROADMAP.md, STATE.md déjà staged par une autre session avant ce plan) : non bloquant — ces mises à jour sont en faveur du tracking, et le commit reste correctement scopé sur les fichiers tests. À éviter idéalement : `git reset` du staging area en début de plan exécution. Sans impact fonctionnel.

2. **Commit en parallèle `f49426a feat(devis): nouveau module Devis`** : une autre session a committé un module Devis pendant ce plan (entre Task 2 et Task 3). Aucun fichier conflictuel avec ce plan (zones disjointes). Les 707 tests passent globalement, build OK. Pas d'action.

3. **Composant `<Placeholder>` (`apps/web/src/components/ui/placeholder.tsx`) est désormais orphelin** : `grep -rn "from '@/components/ui/placeholder'" apps/web/src/` retourne 0 résultat après ce plan (les 2 derniers usages — `/app/inscriptions` Plan 12-01 et `/app/templates` Plan 12-02 — sont supprimés). Décision déférée à Plan 12-03 : soit supprimer le composant, soit le garder pour de futurs stubs courts. **Recommandation : garder** (12 LOC inoffensives, utile pour itérations rapides futures). À documenter en STATE.md par Plan 12-03.

## Next Phase Readiness

- **Plan 12-03 (STATE.md convention + cleanup)** : prêt. Doit :
  1. Documenter le pattern "catalogue centralisé code-driven `lib/<feature>-catalog.ts`" comme convention projet (1ère application).
  2. Décider du sort du composant `<Placeholder>` orphelin (suppression vs conservation).
  3. Marquer Phase 12 100% complete dans ROADMAP.md (MOD-01 + MOD-02 livrés).
- **Validation Laurent (optionnelle)** :
  - Visiter `http://localhost:3010/app/templates` en tant qu'ADMIN → doit voir 3 sections (Qualiopi 19 / AGEFICE 3 / Email 5).
  - Se connecter en FORMATEUR ou COMPTABLE → l'entrée sidebar "Modèles de documents" doit avoir disparu + l'URL directe `/app/templates` doit lever ForbiddenError (page d'erreur).
- **Phase 10 (Audit Qualiopi blanc)** : peut désormais réutiliser `lib/templates-catalog.ts` pour exporter au format CSV/PDF la liste des documents générés à l'auditeur (cf. JSDoc du catalog).

## Self-Check: PASSED

- `apps/web/src/lib/templates-catalog.ts` FOUND
- `apps/web/src/lib/__tests__/templates-catalog.test.ts` FOUND
- `apps/web/src/app/app/templates/__tests__/page.smoke.test.tsx` FOUND
- `apps/web/src/app/app/templates/page.tsx` FOUND (overwrite stub)
- `apps/web/src/components/layout/nav-config.ts` FOUND (allowedRoles enrichi)
- Commit `3b52409` FOUND (Task 0)
- Commit `b9ee1d0` FOUND (Task 1)
- Commit `5f4b4df` FOUND (Task 2)
- `pnpm --filter @qualiof/web build` exit 0 (Compiled successfully + `/app/templates` listée)
- `pnpm --filter @qualiof/web test --run` exit 0 (**707/707 tests verts**, 91 test files)
- Grep defense-in-depth all PASS (0 Placeholder, 27 entries split 19/3/5)

---

*Phase: 12-modules-stub-inscriptions-et-modeles*
*Completed: 2026-05-27*
