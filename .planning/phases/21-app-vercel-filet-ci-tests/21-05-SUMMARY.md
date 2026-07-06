---
phase: 21-app-vercel-filet-ci-tests
plan: 05
subsystem: testing
tags: [playwright, e2e, smoke, lucia, supabase-storage, vercel, staging]

# Dependency graph
requires:
  - phase: 21-app-vercel-filet-ci-tests (plan 21-04)
    provides: staging Vercel LIVE https://qualiof.vercel.app (public, cdg1, 50 vars env, WAF /preinscription 30/60s→403, fixes Prisma+argon2)
  - phase: 21-app-vercel-filet-ci-tests (plan 21-02)
    provides: backfill storage MinIO→Supabase (0 lien mort — pas de faux verts storage)
  - phase: 18-supabase-storage-migration-objets-direct-to-storage
    provides: direct-upload-field.tsx (XHR PUT signed URL), 3 PENDING 18-SMOKE à re-valider
provides:
  - Infra Playwright complète (config 4 projets, user e2e dédié, auth par storageState via vrai login UI)
  - TEST-02 prouvé : 9 routes protégées des 4 piliers (redirect anonyme + 200 authentifié avec contenu) + /login + form public /preinscription/[token] (200 valide / 404 bidon)
  - APP-02 COMPLET : login réel (storageState = cookie session fonctionnel) ET logout réel (UserMenu → Dialog → /login, session invalidée en base)
  - PENDING 18-SMOKE ① re-validé : upload 10 Mo direct-to-storage sans 413 sur Vercel déployé
  - Base pour 21-06 : projet authenticated matche déjà closure-flow.spec.ts
affects: [21-06 (E2E closure), phase-22 (bascule domaine final — re-pointer E2E_BASE via STAGING_BASE_URL)]

# Tech tracking
tech-stack:
  added: ["@playwright/test 1.61.1 (devDep apps/web) + Chromium headless shell"]
  patterns:
    - "E2E cible DISTANTE : baseURL = STAGING_BASE_URL (pas de webServer, D-10), exécution à la demande hors gate PR"
    - "Auth e2e = storageState via VRAI login UI d'un compte dédié (jamais les credentials de Laurent) ; spec logout en session fraîche SANS storageState (lucia.invalidateSession ne touche que sa session)"
    - "Données de test : préfixe E2E-/e2e-, création Prisma en beforeAll, suppression en afterAll, count=0 prouvé post-run"
    - "workers=1 : cible distante partagée + rate-limit WAF /preinscription (30 req/60 s → 403, pas 429)"

key-files:
  created:
    - apps/web/playwright.config.ts
    - apps/web/e2e/auth.setup.ts
    - apps/web/e2e/smoke-routes.spec.ts
    - apps/web/e2e/auth-logout.spec.ts
    - apps/web/e2e/upload-preenrollment.spec.ts
    - apps/web/scripts/create-e2e-user.ts
  modified:
    - apps/web/package.json
    - .gitignore

key-decisions:
  - "Vérifications sur https://qualiof.vercel.app (décision utilisateur 21-04 : domaine final app.start-academy.fr PENDING DNS) — re-pointage futur = STAGING_BASE_URL, zéro code"
  - "workers=1 dans playwright.config.ts : déterminisme sous la fenêtre WAF 30 req/60 s + cible distante partagée"
  - "upload-preenrollment.spec.ts : storageState neutralisé dans le fichier (test.use cookies vides) — le form public est anonyme, tout en restant dans le projet authenticated"

patterns-established:
  - "Preuve anti-413 STRUCTURELLE : asserter qu'AUCUNE requête vers le domaine Vercel ne porte un body ≥4 Mo (postDataBuffer), en plus du PUT supabase.co 200 et du zéro 413"
  - "setInputFiles avec buffer en mémoire (name/mimeType/buffer) — pas de fichier temporaire sur disque pour les payloads de test"

requirements-completed: [TEST-02, APP-02]

# Metrics
duration: 14min
completed: 2026-07-06
---

# Phase 21 Plan 05: Playwright smoke + login/logout + upload 10 Mo Summary

**Filet Playwright opérationnel contre le staging Vercel : 22/22 tests verts (43 s) — 9 routes des 4 piliers (redirect anonyme + 200 authentifié), login/logout réels avec session invalidée en base, et upload CNI 10 Mo direct-to-Supabase sans 413 (PENDING 18-SMOKE ① fermé)**

## Performance

- **Duration:** 14 min
- **Started:** 2026-07-06T12:59:05Z
- **Completed:** 2026-07-06T13:13:20Z
- **Tasks:** 3
- **Files modified:** 8 (6 créés + package.json/pnpm-lock + .gitignore)

## Accomplishments

- **Infra Playwright** : `@playwright/test` 1.61.1 + Chromium, config 4 projets (setup / anonymous / logout / authenticated), baseURL `STAGING_BASE_URL` (défaut localhost:3010), storageState `e2e/.auth/user.json` sur `authenticated` UNIQUEMENT, pas de webServer (cible distante D-10), support `x-vercel-protection-bypass` si besoin futur.
- **User e2e dédié** : `scripts/create-e2e-user.ts` worker-safe (0 import React/next, garde `pathToFileURL`), upsert idempotent `e2e@start-academy.fr` ADMIN en base cloud (re-run = même id, 0 doublon). Mot de passe fort `openssl rand -base64 24` posé UNIQUEMENT dans le `.env` racine gitignoré (`git grep E2E_LOGIN_PASSWORD` ne matche que du code lisant `process.env` + les plans).
- **TEST-02** : `smoke-routes.spec.ts` = 12 tests `@anon` + 8 authentifiés. Routes : `/app`, `/app/sessions`, `/app/sessions/[id]` (id résolu via Prisma, jamais en dur), `/app/apprenants`, `/app/dossiers-opco`, `/app/budget-agefice`, `/app/factures`, `/app/inscriptions` — redirect `/login` en anonyme, 200 + contenu (anti-200-vide `main h1/h2/table`) en authentifié. `/login` : 200 + formulaire + **bandeau STAGING visible (preuve APP-01 runtime)**. Form public : `/preinscription/<token E2E->` **200 avec formulaire**, token bidon **404 propre sans 500** — jamais `/p/[token]` (Pitfall 1 évité).
- **APP-02 COMPLET** : `auth.setup.ts` = vrai login UI → redirect `/app` → storageState (cookie session Lucia secure+lax fonctionnel sur le déploiement). `auth-logout.spec.ts` = login FRAIS sans storageState → UserMenu (`Menu utilisateur`) → item « Déconnexion » → Dialog « Confirmer la déconnexion » → « Se déconnecter » → `/login`, puis re-visite `/app` → re-redirect `/login` = **session invalidée EN BASE**. Les 8 specs `authenticated` passent APRÈS le run logout dans le même run → le storageState partagé est intact (prouvé).
- **PENDING 18-SMOKE ① fermé** : `upload-preenrollment.spec.ts` = JPEG factice 10 Mo (magic bytes `FF D8 FF E0` + EOI `FF D9`) sur le champ CNI du form public → **PUT `*.supabase.co/storage/v1/object/upload/sign/preinscriptions/…` → 200, zéro 413 sur toute la session, aucun body ≥ 4 Mo vers le domaine Vercel** (preuve anti-413 structurelle : le fichier ne transite pas par Next).
- **Hygiène données** : PreEnrollment de test créées avec `tenantId` du premier Tenant + champs `E2E-`, supprimées en `afterAll` ; objets storage supprimés via supabase-js service role. Vérifié post-run : **0 résidu** (`preEnrollment.count = 0` sur les 2 préfixes, 0 dossier storage `e2e-upload-*`).

## Sortie du run final (staging https://qualiof.vercel.app)

```
Running 22 tests using 1 worker
  ✓ [setup] auth.setup.ts › login réel → storageState (5.0s)
  ✓ [anonymous] 11 tests @anon (login+STAGING, 8 redirects, token valide 200, token bidon 404)
  ✓ [logout] login frais → Déconnexion (UserMenu + confirm) → /login, puis /app re-redirige (6.6s)
  ✓ [authenticated] 8 routes 200 + contenu
  ✓ [authenticated] upload CNI 10 Mo direct-to-storage : PUT supabase.co 200, zéro 413, aucun body ≥4 Mo via Vercel (6.2s)
  22 passed (43.2s)
```

## Sort des 3 PENDING 18-SMOKE

| # | Item | Statut |
|---|------|--------|
| ① | 413 sur Vercel réel (upload 10 Mo) | **RE-VALIDÉ** par `upload-preenrollment.spec.ts` (ce plan) |
| ② | Retry coupure réseau mobile réelle | **MANUEL/reporté** — non simulable de façon fiable en Playwright (le code retry D-07 est en place : 1 retry auto + bouton « Réessayer ») |
| ③ | Expiration signed URL 11 min temps réel | **Non re-testée** — déjà couverte par le mécanisme JWT `exp` prouvé en 18-04 (refus de token invalide, même mécanisme) |

## Task Commits

1. **Task 1: Infra Playwright + user e2e dédié + auth.setup** - `4cc20c6` (feat)
2. **Task 2: Smoke routes 4 piliers (TEST-02) + logout (APP-02)** - `5e4ef00` (feat)
3. **Task 3: Upload 10 Mo direct-to-storage sans 413** - `d73c89d` (feat)

## Files Created/Modified

- `apps/web/playwright.config.ts` - 4 projets, baseURL STAGING_BASE_URL, workers=1, storageState sur authenticated seul
- `apps/web/e2e/auth.setup.ts` - vrai login UI → e2e/.auth/user.json (preuve APP-02 login)
- `apps/web/e2e/smoke-routes.spec.ts` - table D-12 : 12 @anon + 8 authentifiés, PreEnrollment E2E- créée/supprimée
- `apps/web/e2e/auth-logout.spec.ts` - logout session fraîche, invalidation en base prouvée
- `apps/web/e2e/upload-preenrollment.spec.ts` - 10 Mo direct-to-storage, 3 assertions anti-413
- `apps/web/scripts/create-e2e-user.ts` - upsert idempotent user e2e ADMIN, worker-safe
- `apps/web/package.json` / `pnpm-lock.yaml` - @playwright/test devDep
- `.gitignore` - apps/web/e2e/.auth/ + artefacts Playwright

## Decisions Made

- **Cible = https://qualiof.vercel.app** (décision utilisateur 21-04, domaine final PENDING DNS webmaster) — le re-pointage vers app.start-academy.fr se fera par `STAGING_BASE_URL` sans toucher au code.
- **workers=1** : la cible distante est partagée et le WAF rate-limite `/preinscription` (30 req/60 s → 403) ; la sérialisation garantit le déterminisme sous la fenêtre.
- **Spec upload dans le projet `authenticated` avec storageState neutralisé** (`test.use({ storageState: { cookies: [], origins: [] } })`) — le form public est anonyme, mécanique conforme au plan.

## Deviations from Plan

**1. [Déviation actée — contexte orchestrateur] « domaine final » → https://qualiof.vercel.app**
- **Found during:** tout le plan (les tasks parlent de `https://<domaine>`)
- **Issue:** app.start-academy.fr PENDING DNS webmaster (21-04)
- **Fix:** toutes les exécutions ciblent `STAGING_BASE_URL=https://qualiof.vercel.app` (décision utilisateur consignée au 21-04) ; la config reste paramétrable par env var
- **Impact:** aucun sur les preuves (production Vercel publique, mêmes cookies secure/lax)

Aucune autre déviation — plan exécuté tel qu'écrit (aucun bug rencontré : 22/22 verts au premier run complet).

**Total deviations:** 1 (substitution d'URL actée en amont par l'utilisateur)
**Impact on plan:** nul — tous les must-haves atteints sur l'URL de staging décidée.

## Issues Encountered

None — le staging (fixes argon2/Prisma des PRs #2/#3/#5 de 21-04) a répondu correctement du premier coup.

## User Setup Required

None - no external service configuration required. (Rappel hérité 21-04 : DNS app.start-academy.fr toujours en attente côté webmaster.)

## Next Phase Readiness

- **21-06 (E2E closure)** : infra prête — le projet `authenticated` matche déjà `closure-flow.spec.ts`, storageState et user e2e ADMIN opérationnels, pattern données `E2E-` + teardown établi.
- Suite vitest inchangée (1176/1176) — `e2e/` hors glob vitest, aucune collision de runners ; `tsc --noEmit` exit 0.
- ⚠ Rappel : PRs cloud-migration→main en **merge commit** (jamais squash) au moment de pousser ces specs vers main.

---
*Phase: 21-app-vercel-filet-ci-tests*
*Completed: 2026-07-06*

## Self-Check: PASSED

- 6 fichiers créés + SUMMARY : présents sur disque
- Commits 4cc20c6 / 5e4ef00 / d73c89d : trouvés dans l'historique
- Run final : 22/22 verts, 0 donnée E2E- résiduelle (base + storage)
