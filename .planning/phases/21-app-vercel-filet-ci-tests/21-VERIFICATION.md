---
phase: 21-app-vercel-filet-ci-tests
verified: 2026-07-06T16:07:00Z
status: passed
score: 5/5 must-haves verified
requirements_satisfied: [APP-01, APP-02, APP-03, CI-01, TEST-01, TEST-02]
documented_deviations:
  - "Domaine final app.start-academy.fr PENDING DNS (webmaster externe) — preuves runtime sur https://qualiof.vercel.app, décision utilisateur 21-04 ; re-pointage = STAGING_BASE_URL sans code"
  - "WAF rate-limit /preinscription : blocage prouvé (30 req/60s) mais répond 403, pas 429 — équivalent fonctionnel consigné au 21-04"
  - "Déploiement Vercel exécuté par API/CLI (autorisation explicite Laurent) au lieu du pattern dashboard du runbook"
---

# Phase 21: App Vercel + filet CI/tests — Verification Report

**Phase Goal:** L'app Next.js tourne sur Vercel Pro EU avec login/logout et form public fonctionnels, les ~9 rendus PDF synchrones passent par l'ingress doc-engine public authentifié, et un filet de sécurité (CI GitHub Actions + E2E closure + smoke routes) est vert AVANT toute bascule prod.
**Verified:** 2026-07-06 (vérification indépendante : code + runs live, PAS seulement les SUMMARYs)
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Success Criteria ROADMAP)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | App déployée Vercel région EU, staging dégelé (flag, filigrane, garde PDF, vercel.json maxDuration) | ✓ VERIFIED | **Live re-testé au verify** : `curl -sI https://qualiof.vercel.app/login` → `HTTP/2 200`, `x-vercel-id: cdg1::cdg1::d4j2t-…` ; bandeau `STAGING` présent (grep=1). `apps/web/vercel.json` = `{"regions":["cdg1"]}`, AUCUN bloc crons. `maxDuration=300` sur les 5 pages PDF (sessions/[id], factures, factures/[id], veille, produits/[id]). Test filigrane **re-exécuté au verify : 5/5 verts** (`pdf-render.watermark.test.ts`, 77 lignes). `NEXT_PUBLIC_APP_ENV` validé t3-env (`packages/shared/src/env.ts`). `postinstall: prisma generate` (`packages/db/package.json:12`) |
| 2 | Login → app → logout (cookie secure, sameSite lax) + form public accessible | ✓ VERIFIED* | `sameSite: 'lax'` explicite (`auth.ts:25`). **Live re-testé** : `/app` anonyme → `307` + `location:/login` ; token bidon `/preinscription/token-bidon-verify-21` → `404` propre. Playwright réel : `auth.setup.ts` (login UI → storageState), `auth-logout.spec.ts` (Déconnexion UserMenu → session invalidée EN BASE, re-visite /app re-redirige). Run 22/22 verts (43 s) consigné 21-SMOKE. *Déviation documentée : preuves sur qualiof.vercel.app, domaine final PENDING DNS (décision utilisateur) |
| 3 | ~9 server actions PDF synchrones via doc-engine public authentifié (DOC_ENGINE_TOKEN), zéro binaire natif Vercel | ✓ VERIFIED | `pdf-render.ts` = chokepoint unique : `authHeaders()` (l.24) lit `sharedEnv.DOC_ENGINE_TOKEN` → Bearer sur `fetch(GOTENBERG_URL)` (l.94) ET `fetch(WEASYPRINT_URL)` (l.114) — aucun binaire, HTTP pur. Preuve runtime : `closure-flow.spec.ts` assert `%PDF-` sur la convocation générée synchrone depuis Vercel (`dispatchGenerateDoc` → proxy Caddy Railway + Bearer), log « APP-03 prouvé » dans le run 2 passed |
| 4 | GitHub Actions (lint+tsc+vitest) vert en gate branch protection, shared-template.test.ts corrigé | ✓ VERIFIED | **Live re-testé au verify** : `gh api …/branches/main/protection` → `{"contexts":["test"],"force_push":false}` ; `gh run list` → CI + Deploy migrations `success` sur les merges main (PR #6, #7). `ci.yml` : service `postgres:16`, `db push --skip-generate`, job `worker-image` (build sans push). `deploy.yml` : `prisma migrate deploy` + `secrets.DIRECT_URL`. **shared-template.test.ts re-exécuté au verify : 11/11 verts** (corrigé, plus quarantiné). PR témoin #1 BLOCKED→merged observée (21-SMOKE) |
| 5 | Playwright E2E closure (session→participants→pack→docs) + smoke routes protégées passent | ✓ VERIFIED | `closure-flow.spec.ts` (318 lignes) : assertions réelles — 16 jobs Prisma `status=DONE`, `usedStub=false`, `errorMessage=null`, magic bytes `%PDF-` ×2. Run consigné : 2 passed (2.3 min), batch Terminé 16/16 en 89 s, IA OpenRouter réelle. `smoke-routes.spec.ts` (122 lignes) : 9 routes des 4 piliers, redirect anonyme + 200 authentifié anti-200-vide. Teardown vérifié : garde structurelle anti-deleteMany-global (l.47-54), `startsWith 'E2E-'` sur chaque where, compteurs 0 post-run |

**Score:** 5/5 truths verified

### Required Artifacts (les 6 plans, vérifiés contre le code réel)

| Artifact | Provides | Status | Details |
|----------|----------|--------|---------|
| `apps/web/vercel.json` | Région cdg1, zéro cron | ✓ VERIFIED | `regions:["cdg1"]`, aucun bloc crons |
| `apps/web/src/lib/pdf-render.ts` | Filigrane + Bearer doc-engine | ✓ VERIFIED | Exports `withStagingWatermark`/`renderHtmlToPdf`/`renderHtmlToPdfWeasy` (l.47/57/111) ; filigrane câblé dans LES DEUX moteurs ; purement additif, footer in-body intact |
| `apps/web/src/lib/__tests__/pdf-render.watermark.test.ts` | Preuve unit filigrane | ✓ VERIFIED | 77 lignes, **5/5 verts re-run au verify** |
| `packages/shared/src/env.ts` | Flag NEXT_PUBLIC_APP_ENV | ✓ VERIFIED | 2 occurrences, validé t3-env |
| `packages/db/package.json` | postinstall prisma generate | ✓ VERIFIED | l.12 |
| `.planning/audit/STORAGE-BACKFILL-REPORT-2026-07-06.md` | Backfill D-06 (bug SES-0094) | ✓ VERIFIED | 62 lignes : 733 manquants → 871 copiés → re-audit 899/899, **0 lien mort**, MinIO NON purgé (strictement additif) |
| `.github/workflows/ci.yml` | Gate PR lint+tsc+vitest+worker | ✓ VERIFIED | 62 lignes : `postgres:16`, `db push --skip-generate`, job `worker-image` push:false sur PR |
| `.github/workflows/deploy.yml` | migrate deploy push main | ✓ VERIFIED | 21 lignes : `prisma migrate deploy` + `secrets.DIRECT_URL` |
| `.planning/…/21-DEPLOY-VERCEL.md` | Runbook + RÉSULTATS curl | ✓ VERIFIED | 351 lignes (min 80 requis) |
| `apps/web/playwright.config.ts` | baseURL paramétrable + projets | ✓ VERIFIED | `baseURL: process.env.STAGING_BASE_URL ?? localhost:3010`, projets setup/anonymous/logout/authenticated |
| `apps/web/e2e/auth.setup.ts` | Login UI réel → storageState | ✓ VERIFIED | 35 lignes, storageState ×3 |
| `apps/web/e2e/auth-logout.spec.ts` | Logout session invalidée en base | ✓ VERIFIED | 47 lignes, « Déconnexion » ×3 |
| `apps/web/e2e/smoke-routes.spec.ts` | TEST-02 routes 4 piliers | ✓ VERIFIED | 122 lignes (min 60), table `/app`, `/app/sessions`, `/app/apprenants`, `/app/dossiers-opco`, `/app/budget-agefice`, `/app/factures`, `/app/inscriptions` + `/app/sessions/[id]` |
| `apps/web/e2e/upload-preenrollment.spec.ts` | Upload 10 Mo anti-413 | ✓ VERIFIED | 131 lignes, PUT direct supabase.co |
| `apps/web/scripts/create-e2e-user.ts` | User e2e dédié | ✓ VERIFIED | 61 lignes, `e2e@start-academy.fr` (jamais les credentials Laurent) |
| `apps/web/e2e/closure-flow.spec.ts` | TEST-01 E2E closure réel | ✓ VERIFIED | 318 lignes, `E2E-` ×16, assertions Prisma usedStub/errorMessage |
| `apps/web/e2e/teardown-e2e-data.ts` | Purge E2E- exclusive | ✓ VERIFIED | 211 lignes, `pathToFileURL`, garde anti-purge-globale l.47-54 |
| `apps/web/e2e/README.md` | Commandes à la demande (D-10) | ✓ VERIFIED | 59 lignes, STAGING_BASE_URL ×4 |
| `.planning/…/21-SMOKE.md` | Evidence consolidée phase gate | ✓ VERIFIED | 172 lignes (min 40), sorties brutes datées par requirement |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `pdf-render.ts` | `packages/shared/src/env.ts` | `sharedEnv.NEXT_PUBLIC_APP_ENV` | ✓ WIRED | l.49 (défaut param) + l.87 (printBackground Gotenberg) |
| `calendar/sync-session.ts` | env staging | early-return `=== 'staging'` | ✓ WIRED | l.84 — garde D-02 en tête de syncSessionCalendar |
| `layout.tsx` | `staging-banner.tsx` | import + rendu body | ✓ WIRED | layout.tsx:3 (import) + :15 (rendu) ; **live : bandeau visible sur /login** |
| `migrate-storage.ts` | Supabase gntlqyscahbgjrmsbzil | DRY→WRITE upsert | ✓ WIRED | Script présent, WRITE ×13, rapport 899/899 avec re-audit lecture seule |
| `ci.yml` | schema Prisma | db push sur qualiof_test | ✓ WIRED | l.47 |
| `deploy.yml` | Supabase DIRECT_URL | secret chiffré | ✓ WIRED | l.21 `${{ secrets.DIRECT_URL }}` |
| branch protection main | job `test` | required_status_checks | ✓ WIRED | **Vérifié live via gh api** : `contexts:["test"]`, force-push off |
| env Vercel GOTENBERG/WEASYPRINT_URL | Railway public + Bearer | `authHeaders()` | ✓ WIRED | pdf-render.ts l.24-25 + l.94/114 ; preuve runtime %PDF- depuis Vercel |
| `auth.setup.ts` | staging /login | E2E_LOGIN_EMAIL → user.json | ✓ WIRED | Pattern présent, storageState réutilisé par 8 specs |
| `closure-flow.spec.ts` | worker Railway | UI → ClosureJob QUEUED → poll | ✓ WIRED | Batch 83f8e1d3 Terminé 16/16 en 89 s (run consigné) |
| `teardown-e2e-data.ts` | prisma cascade | WHERE startsWith E2E- uniquement | ✓ WIRED | Chaque deleteMany scopé + garde structurelle anti-where-vide |
| domaine final (CNAME) | projet Vercel | DNS registrar | ⚠ PENDING | **Déviation documentée, PAS un gap** : DNS webmaster externe, décision utilisateur 21-04, re-pointage via STAGING_BASE_URL sans code (Phase 22) |

### Behavioral Spot-Checks (exécutés au verify, indépendamment des SUMMARYs)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| App live cdg1 + HTTPS | `curl -sI https://qualiof.vercel.app/login` | `HTTP/2 200`, `x-vercel-id: cdg1::cdg1::…` | ✓ PASS |
| Bandeau STAGING | `curl -s …/login \| grep -c STAGING` | `1` | ✓ PASS |
| Redirect anonyme | `curl -w %{http_code} …/app` | `307` → `/login` | ✓ PASS |
| Token bidon 404 propre | `curl …/preinscription/token-bidon-verify-21` | `404` (jamais 500) | ✓ PASS |
| Filigrane unit | `dotenv -e ../../.env -- vitest run pdf-render.watermark.test.ts` | 5/5 passed | ✓ PASS |
| shared-template corrigé | `dotenv -e ../../.env -- vitest run shared-template.test.ts` | 11/11 passed | ✓ PASS |
| Branch protection live | `gh api …/branches/main/protection` | `{"contexts":["test"],"force_push":false}` | ✓ PASS |
| CI + migrate deploy sur main | `gh run list --branch main` | CI success + Deploy migrations success (merges #6/#7) | ✓ PASS |
| E2E closure / rafale WAF | — | non re-run au verify (coût IA / consommation rate-limit) — runs 21-05/21-06 consignés avec sorties brutes | ? SKIP (evidence 21-SMOKE) |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|---------------|-------------|--------|----------|
| APP-01 | 21-01, 21-04 | App déployée Vercel Pro EU, staging dégelé | ✓ SATISFIED | Truths 1 — live cdg1 + bandeau + filigrane 5/5 |
| APP-02 | 21-01, 21-04, 21-05 | Login/logout cookies + form public | ✓ SATISFIED | Truth 2 — sameSite lax, 307 live, logout Playwright session invalidée en base, 404 token bidon |
| APP-03 | 21-04, 21-06 | PDF synchrones via doc-engine public Bearer | ✓ SATISFIED | Truth 3 — authHeaders Bearer + %PDF- depuis Vercel |
| CI-01 | 21-03 | Gate PR + migrate deploy + image worker | ✓ SATISFIED | Truth 4 — protection live, CI verte, worker-image job |
| TEST-01 | 21-02 (préreq), 21-06 | E2E closure session→participants→pack→docs | ✓ SATISFIED | Truth 5 — 2 passed, 16/16 DONE 0 stub, teardown 0 résiduel |
| TEST-02 | 21-02 (préreq), 21-05 | Smoke routes protégées + upload | ✓ SATISFIED | Truth 5 — 22/22, upload 10 Mo zéro 413 structurel |

**Orphaned requirements:** aucun — REQUIREMENTS.md mappe exactement ces 6 IDs à la Phase 21 (tous marqués Complete), et chaque ID est revendiqué par au moins un plan.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/web/src/app/api/cron/closure-worker/route.ts` | — | Route cron héritée (maxDuration 60 « Vercel hobby ») toujours présente dans le code | ℹ Info | Aucun : `vercel.json` ne déclare AUCUN cron (truth 21-01 vérifiée) — la route n'est jamais planifiée ; le worker Railway est le seul consommateur ClosureJob. Candidat nettoyage Phase 22 |

Aucun TODO/FIXME/placeholder, aucun stub, aucun retour statique dans les fichiers de la phase.

### Human Verification Required

Aucun item bloquant. Items MANUEL/reportés déjà arbitrés par l'utilisateur (section dédiée 21-SMOKE, ce ne sont PAS des échecs) :

1. **Domaine final app.start-academy.fr** — PENDING DNS webmaster ; re-jouer les 2 checks APP-01 + re-pointer `NEXT_PUBLIC_APP_URL`/`OPENROUTER_SITE_URL` (Phase 22)
2. **Retry upload coupure réseau mobile réelle** — test terrain smartphone post-bascule (code retry en place)
3. **Re-audit storage contre le dump FINAL** avant bascule prod (MinIO non purgé, destructif = étape séparée Phase 22+)

### Gaps Summary

Aucun gap. Les 5 success criteria du ROADMAP sont vérifiés contre le code réel ET par re-exécution live indépendante (curl staging, gh api, vitest) — pas seulement contre les SUMMARYs. Les 3 déviations (domaine PENDING DNS, WAF 403 au lieu de 429, déploiement API/CLI autorisé) sont des décisions utilisateur documentées, conformes au contexte transmis, et n'affectent pas l'atteinte du goal : le filet de sécurité complet (CI gate + E2E closure 0 stub + smoke 22/22) est vert AVANT toute bascule prod.

---

_Verified: 2026-07-06T16:07:00Z_
_Verifier: Claude (gsd-verifier)_
