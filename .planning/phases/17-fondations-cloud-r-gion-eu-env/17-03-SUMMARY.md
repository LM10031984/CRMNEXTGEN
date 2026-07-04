---
phase: 17-fondations-cloud-r-gion-eu-env
plan: 03
subsystem: infra
tags: [pdf, gotenberg, weasyprint, bearer, doc-engine-token, sharedenv, cloud-migration, vitest]

# Dependency graph
requires:
  - phase: 17-fondations-cloud-r-gion-eu-env
    provides: "17-02 : sharedEnv exporte GOTENBERG_URL/WEASYPRINT_URL/DOC_ENGINE_TOKEN + chokepoint boot réel + alias DOC_ENGINE_URL retiré"
provides:
  - "DOC_ENGINE_TOKEN câblé en Authorization: Bearer sur les 2 fonctions de rendu PDF (Gotenberg multipart + WeasyPrint body string), conditionnel au token (dev local sans token non cassé)"
  - "Helper authHeaders() dans pdf-render.ts (token ? { Authorization } : {})"
  - "GOTENBERG_URL/WEASYPRINT_URL migrés de process.env brut vers sharedEnv (0 process.env résiduel)"
  - "Test hermétique pdf-render.test.ts (4 tests, mock @qualiof/shared/env + global.fetch, mutation-safe sur les 2 fonctions)"
  - "Multipart Gotenberg préservé (0 Content-Type manuel, boundary FormData auto, footer HTML in-body intact)"
affects: [20-worker-3e-hote, 21-app-vercel, 22-bascule-prod]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bearer conditionnel au token optionnel : authHeaders() renvoie {} si pas de token → header omis (client-only Phase 17, enforcement server-side Phase 20/21)"
    - "Gotenberg multipart : headers-only (Authorization), JAMAIS de Content-Type manuel (casserait le boundary FormData)"
    - "Test hermétique avec token variable : mock @qualiof/shared/env via getter sur un objet mockEnv hoisté (vi.hoisted) — mockEnv doit exister AVANT le load de la source (constantes top-level)"

key-files:
  created:
    - apps/web/src/lib/__tests__/pdf-render.test.ts
  modified:
    - apps/web/src/lib/pdf-render.ts
    - apps/web/src/server/actions/__tests__/qualiopi-matrix.test.ts

key-decisions:
  - "D-06 : Bearer CONDITIONNEL au token (token ? { Authorization } : {}) pour ne pas casser le dev local sans token"
  - "Gotenberg (multipart) : ajouter QUE Authorization dans headers, laisser fetch générer Content-Type/boundary — anti-pattern Content-Type multipart manuel INTERDIT (casserait tous les PDF)"
  - "WeasyPrint (body string) : spread authHeaders() À CÔTÉ du Content-Type: text/html existant (coexistence)"
  - "URLs lues via sharedEnv (validées t3-env au boot) plutôt que process.env brut avec fallback ?? inline"

patterns-established:
  - "Câblage Bearer optionnel côté client : le token absent n'ajoute aucun header et ne throw pas"
  - "Un lib/* qui consomme sharedEnv exécute createEnv au load → tout test l'important transitivement doit le mocker (régression attrapée + corrigée ici, cf. 17-02)"

requirements-completed: [CLOUDENV-03]

# Metrics
duration: 6 min
completed: 2026-07-04
---

# Phase 17 Plan 03: Bearer DOC_ENGINE_TOKEN sur pdf-render + URLs sharedEnv Summary

**`DOC_ENGINE_TOKEN` (déclaré env.ts:54, jamais consommé jusqu'ici) est câblé en header `Authorization: Bearer` conditionnel sur les 2 chemins de rendu PDF (Gotenberg multipart + WeasyPrint body string) via un helper `authHeaders()`, les URLs migrent de `process.env` brut vers `sharedEnv`, et un test hermétique mutation-safe (4/4) prouve la présence du Bearer sur les 2 fonctions sans casser le dev local sans token.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-04T15:51:00Z
- **Completed:** 2026-07-04T15:57:00Z
- **Tasks:** 1 (TDD RED→GREEN)
- **Files modified:** 3 (1 créé)

## Accomplishments

- **`DOC_ENGINE_TOKEN` enfin CONSOMMÉ** : fondement de l'Option A « dual-ingress public authentifié » (décision v6). Les doc-engines seront exposés en HTTPS public (Phase 20/21) — le Bearer côté client est câblé dès maintenant.
- **Helper `authHeaders()`** : `const token = sharedEnv.DOC_ENGINE_TOKEN; return token ? { Authorization: \`Bearer ${token}\` } : {};` — conditionnel au token, dev local sans token non cassé.
- **Gotenberg (`renderHtmlToPdf`, multipart FormData)** : `headers: authHeaders()` ajouté, AUCUN Content-Type manuel → boundary FormData auto préservé, footer HTML in-body intact (anti-pattern CLAUDE.md évité).
- **WeasyPrint (`renderHtmlToPdfWeasy`, body string)** : Bearer spreadé à côté du `Content-Type: text/html; charset=utf-8` existant (coexistence).
- **URLs migrées vers sharedEnv** : `GOTENBERG_URL`/`WEASYPRINT_URL` lus depuis `sharedEnv` (validés t3-env), 0 `process.env` brut résiduel.
- **Test hermétique 4/4** : mock `@qualiof/shared/env` (getter sur `mockEnv` hoisté) + `global.fetch` — Bearer sur Gotenberg (T1), multipart préservé sans Content-Type manuel (T2), Bearer + Content-Type coexistent sur WeasyPrint (T3), sans token = aucun Authorization + pas de throw (T4).
- **Test de puissance PROUVÉ au gate** : retrait de `headers: authHeaders()` de Gotenberg → Test 1 (+2/4 lisant le même headers object) ROUGE → restauré → 4/4 (mutation NON commitée, `git diff --stat` = source restaurée).

## Task Commits

1. **Task 1: Test hermétique + câblage Bearer + migration URLs sharedEnv** — `756a7d7` (feat, TDD RED 4/4 rouges → GREEN 4/4)

_TDD : RED (4 tests rouges — source lisait process.env sans Bearer) → GREEN (source migrée sharedEnv + authHeaders). Regroupé en 1 commit car single feature indivisible (test + impl + fix hermeticité de la régression induite)._

## Files Created/Modified

- `apps/web/src/lib/pdf-render.ts` — import `sharedEnv`, constantes GOTENBERG_URL/WEASYPRINT_URL via sharedEnv, helper `authHeaders()`, `headers: authHeaders()` sur Gotenberg, `...authHeaders()` sur WeasyPrint
- `apps/web/src/lib/__tests__/pdf-render.test.ts` — **créé** : 4 tests hermétiques (mock env + fetch), protocole de mutation documenté en tête
- `apps/web/src/server/actions/__tests__/qualiopi-matrix.test.ts` — mock `@/lib/pdf-render` ajouté (fix régression hermeticité — cf. Déviations)

## Decisions Made

- Voir frontmatter `key-decisions`. Résumé : Bearer conditionnel (D-06), Gotenberg headers-only (pas de Content-Type multipart manuel), WeasyPrint spread à côté du Content-Type, URLs via sharedEnv.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Mock `@/lib/pdf-render` dans qualiopi-matrix.test.ts (régression d'hermeticité induite par la migration sharedEnv)**
- **Found during:** Task 1 (full suite web après GREEN)
- **Issue:** L'ajout de `import { sharedEnv } from '@qualiof/shared/env'` dans `pdf-render.ts` fait exécuter `createEnv()` au LOAD du module. `qualiopi-matrix.ts` importe `./convocation-generator` + `./agefice-attendance-generator` (NON mockés dans le test) qui importent `@/lib/pdf-render` → le test `qualiopi-matrix.test.ts` (vitest ne charge pas `.env`) échouait à la collection : `Invalid environment variables` (`0 test` collectés). Confirmé par stash : sans ma modif, 10/10 verts ; avec, la collection throw à `pdf-render.ts:1`.
- **Fix:** Ajout d'un `vi.mock('@/lib/pdf-render', () => ({ renderHtmlToPdf: vi.fn(), renderHtmlToPdfWeasy: vi.fn() }))` — cohérent avec la politique hermétique documentée en 17-02 (mocker le module qui exécute createEnv au load). Ces fonctions ne sont jamais invoquées dans ce test (chemins de génération pilotés par les mocks des générateurs).
- **Files modified:** apps/web/src/server/actions/__tests__/qualiopi-matrix.test.ts
- **Verification:** `qualiopi-matrix.test.ts` 10/10 vert ; suite web 1145/1146 (baseline pré-existant identique)
- **Committed in:** 756a7d7 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug hermeticité de test)
**Impact on plan:** Correction nécessaire pour que la suite reste non-régressée (le pattern « lib consommant sharedEnv casse les tests transitifs » était explicitement annoncé par 17-02 comme à surveiller). Périmètre inchangé — le câblage Bearer + migration URLs est exactement celui du plan.

## Verification — résultats

- **Test unitaire** : `pnpm --filter @qualiof/web exec vitest run src/lib/__tests__/pdf-render.test.ts` → **4/4 verts**.
- **Acceptance greps Task 1 (tous verts)** :
  - `Authorization.*Bearer` = 2 (≥1) · `headers: authHeaders()` = 1 (Gotenberg) · `...authHeaders()` = 1 (WeasyPrint)
  - `process.env.GOTENBERG_URL|WEASYPRINT_URL` = 0 (migrées) · `sharedEnv.` = 3 (GOTENBERG+WEASYPRINT+DOC_ENGINE_TOKEN)
  - `multipart/form-data|'Content-Type': 'multipart` = 0 (piège évité) · `position:fixed|footer` = 16 (footer non régressé) · test `Authorization` = 12 (≥2)
- **Test de puissance (phase gate, convention projet)** : mutation « retirer `headers: authHeaders()` de Gotenberg » → Test 1 ROUGE (3 failed | 1 passed) → restauration → 4/4 verts, `git diff --stat` propre. Mutation NON commitée.
- **tsc `--noEmit`** (apps/web) → **exit 0**, 0 erreur.
- **Full suite web** → **1145 verts / 1 échec** = `shared-template.test.ts:175` MIME jpeg/jpg **PRÉ-EXISTANT hors scope** (documenté 15-01→17-02, logué `deferred-items.md`). Baseline identique.

## Issues Encountered

- **Échec de suite PRÉ-EXISTANT (hors scope, non causé par 17-03)** : `apps/web/src/lib/closure/__tests__/shared-template.test.ts:175` attend MIME `image/jpg`, reçoit `image/jpeg`. Documenté depuis 15-01, logué `deferred-items.md`. Suite web = 1145/1146 (baseline stable).

## User Setup Required

None — aucune configuration de service externe requise. `DOC_ENGINE_TOKEN` reste **optionnel** en dev local (header omis si absent → rendu PDF Gotenberg/WeasyPrint local non impacté). Le token sera fourni côté doc-engines lors de l'exposition HTTPS publique (Phase 20/21).

## Next Phase Readiness

- **CLOUDENV-03 satisfait** — le client PDF porte le Bearer sur les 2 chemins de rendu. Phase 17 complète (3/3 plans : CLOUDENV-01 régions + CLOUDENV-02 boot fail-loud + CLOUDENV-03 Bearer doc-engine).
- **Phase 20/21** : l'enforcement server-side du Bearer (WeasyPrint/Gotenberg exposés en HTTPS public authentifié) s'appuiera sur ce câblage client. Les 9 PDF synchrones (Phase 21 APP-02) passeront par cet ingress public authentifié.
- Rappel pattern : tout nouveau `lib/*` consommant `sharedEnv` s'exécute createEnv au load → mocker dans les tests hermétiques (2ᵉ occurrence après storage.ts en 17-02).

## Self-Check: PASSED

- Fichiers créés/modifiés présents sur disque (3/3 vérifiés).
- Commit présent : `756a7d7` (Task 1).

---
*Phase: 17-fondations-cloud-r-gion-eu-env*
*Completed: 2026-07-04*
