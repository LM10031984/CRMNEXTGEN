---
phase: 21-app-vercel-filet-ci-tests
plan: 01
subsystem: infra
tags: [vercel, t3-env, gotenberg, weasyprint, lucia, google-calendar, staging, watermark, prisma]

# Dependency graph
requires:
  - phase: 17-fondations-cloud-r-gion-eu-env
    provides: "sharedEnv t3-env chokepoint boot fail-loud + DOC_ENGINE_TOKEN Bearer sur pdf-render.ts + 17-REGIONS.md"
  - phase: 18-supabase-storage-migration-objets-direct-to-storage
    provides: "Projet Supabase gntlqyscahbgjrmsbzil eu-west-1 Irlande (dérogation actée, amendée ici en D-05)"
  - phase: 20-worker-3-h-te-doc-engines
    provides: "Worker Railway sans NEXT_PUBLIC_APP_ENV (packs propres) + doc-engines Bearer server-side"
provides:
  - "Flag NEXT_PUBLIC_APP_ENV validé t3-env (development|staging|production, défaut development) — client + runtimeEnv + turbo globalEnv"
  - "withStagingWatermark exporté de pdf-render.ts : filigrane STAGING background SVG répété, purement additif, câblé Gotenberg (+printBackground) et WeasyPrint — 5 tests unit"
  - "Garde calendar staging D-02 : syncSessionCalendar early-return recap zéros en staging"
  - "StagingBanner Server Component dans le layout racine (couvre /login + /app)"
  - "sameSite: 'lax' explicite sur le cookie Lucia (APP-02 grep-vérifiable)"
  - "apps/web/vercel.json regions cdg1 sans crons + postinstall prisma generate (packages/db) + maxDuration=300 sur 5 pages PDF"
  - "17-REGIONS.md amendé D-05 : Supabase eu-west-1 Irlande DÉFINITIVE (ne plus proposer Paris)"
affects: [21-02, 21-03, 21-04, 21-05, 21-06, vercel-deploy, ci]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Filigrane PDF conditionnel = background SVG data-URI répété injecté avant </head> (jamais position:fixed, non répété multi-pages Chromium)"
    - "Gardes staging pilotées par sharedEnv.NEXT_PUBLIC_APP_ENV au chokepoint (pdf-render, sync-session, StagingBanner)"
    - "maxDuration par segment App Router (export const) plutôt que glob vercel.json functions"

key-files:
  created:
    - apps/web/vercel.json
    - apps/web/src/lib/__tests__/pdf-render.watermark.test.ts
    - apps/web/src/components/staging-banner.tsx
  modified:
    - packages/shared/src/env.ts
    - turbo.json
    - .env.example
    - packages/db/package.json
    - apps/web/src/lib/pdf-render.ts
    - apps/web/src/lib/calendar/sync-session.ts
    - apps/web/src/lib/auth.ts
    - apps/web/src/app/layout.tsx
    - .planning/phases/17-fondations-cloud-r-gion-eu-env/17-REGIONS.md

key-decisions:
  - "Filigrane activé UNIQUEMENT par l'env Vercel (NEXT_PUBLIC_APP_ENV=staging) — le worker Railway sans cette variable produit des packs propres (Open Q1 RESEARCH tranchée au plan)"
  - "printBackground=true envoyé à Gotenberg seulement en staging (les rendus production/development restent octet-identiques à l'existant)"
  - "vercel.json sans bloc crons (Pitfall 8 : éviter un 2e consommateur 60s concurrent du worker Railway)"
  - "maxDuration=300 posé sur 5 pages (produits/[id] existait → inclus comme prévu au plan)"

patterns-established:
  - "withStagingWatermark(html, appEnv?) : paramètre appEnv explicite pour tests hermétiques, défaut sharedEnv"
  - "Gardes staging documentées D-02 : mail (MAIL_DRY_RUN doc), calendar (early-return), PDF (filigrane)"

requirements-completed: [APP-01, APP-02]

# Metrics
duration: 9min
completed: 2026-07-06
---

# Phase 21 Plan 01: Gardes staging avant exposition Vercel Summary

**Flag NEXT_PUBLIC_APP_ENV t3-env + filigrane STAGING testé au chokepoint pdf-render.ts + garde calendar D-02 + bandeau UI + sameSite lax + vercel.json cdg1/postinstall/maxDuration — tout le code staging prêt à merger (21-03) puis déployer (21-04)**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-07-06T08:14:18Z
- **Completed:** 2026-07-06T08:23:30Z
- **Tasks:** 3 (dont 1 TDD)
- **Files modified:** 15 (12 code/config + 1 doc phase 17 + 2 fichiers créés test/composant)

## Accomplishments

- **APP-01 (code)** : `NEXT_PUBLIC_APP_ENV` validé t3-env (enum, défaut development) propagé env.ts client+runtimeEnv, turbo globalEnv, .env.example ; `vercel.json` région `cdg1` sans crons ; `postinstall: prisma generate` sur packages/db ; `maxDuration=300` sur les 5 pages App Router qui déclenchent des rendus PDF synchrones (sessions/[id], factures, factures/[id], veille, produits/[id]).
- **Filigrane STAGING** : `withStagingWatermark` (background SVG répété, jamais position:fixed) injecté au chokepoint des 9 actions PDF + worker — Gotenberg reçoit `printBackground=true` en staging seulement ; WeasyPrint câblé via `withStagingWatermark(html)`. 5 tests unit (TDD RED→GREEN) dont non-régression footer in-body (anti-pattern CLAUDE.md préservé) et identité stricte `===` en production/development.
- **D-02 les 3 sorties gardées** : mail (`MAIL_DRY_RUN` documenté .env.example — `isDryRun()` le lit déjà, 0 code mailer touché), calendar (`syncSessionCalendar` early-return recap `{0,0,0,0,[]}` en staging + raison secondaire : token OAuth absent de Vercel), PDF (filigrane).
- **APP-02 (code)** : cookie Lucia `sameSite: 'lax'` explicite (grep-vérifiable), `secure` garanti par NODE_ENV=production Vercel.
- **Bandeau UI** : `StagingBanner` Server Component (aucune directive client) inséré premier enfant du `<body>` du layout racine — couvre /login ET /app.
- **D-05** : `17-REGIONS.md` amendé — Supabase `eu-west-1` Irlande DÉFINITIVE (projet `gntlqyscahbgjrmsbzil`, base + 3109 objets prouvés Phases 18-19), ne plus re-proposer Paris.
- **Preuves** : watermark tests 5/5 verts ; suite apps/web **1176/1176** verte ; shared **113/113** verte ; `tsc --noEmit` exit 0 (web + shared) ; `vercel.json` JSON valide ; tous les greps acceptance verts ; aucun secret ajouté (placeholders uniquement).

## Task Commits

Each task was committed atomically:

1. **Task 1: Flag NEXT_PUBLIC_APP_ENV + plomberie config** - `57c609b` (feat)
2. **Task 2: Filigrane STAGING (TDD)** - `05b09f5` (test RED) + `2d6b328` (feat GREEN)
3. **Task 3: Garde calendar + bandeau + sameSite lax + maxDuration** - `f8b88e9` (feat)

**Plan metadata:** voir commit docs final (SUMMARY + STATE + ROADMAP + REQUIREMENTS).

## Files Created/Modified

- `packages/shared/src/env.ts` - NEXT_PUBLIC_APP_ENV z.enum client + runtimeEnv (2 occurrences exactement)
- `turbo.json` - NEXT_PUBLIC_APP_ENV dans globalEnv (invalidation cache)
- `.env.example` - bloc NEXT_PUBLIC_APP_ENV + MAIL_DRY_RUN (placeholders)
- `packages/db/package.json` - `postinstall: prisma generate` (sans dotenv, safe partout)
- `apps/web/vercel.json` - regions cdg1, AUCUN cron (créé)
- `apps/web/src/lib/pdf-render.ts` - WATERMARK_SVG/STYLE + withStagingWatermark + câblage Gotenberg (printBackground) / WeasyPrint
- `apps/web/src/lib/__tests__/pdf-render.watermark.test.ts` - 5 tests hermétiques (appEnv explicite, créé)
- `apps/web/src/lib/calendar/sync-session.ts` - garde staging D-02 en tête de syncSessionCalendar + import sharedEnv
- `apps/web/src/lib/auth.ts` - sameSite: 'lax' explicite
- `apps/web/src/components/staging-banner.tsx` - bandeau Server Component (créé)
- `apps/web/src/app/layout.tsx` - <StagingBanner /> premier enfant du body
- `apps/web/src/app/app/{sessions/[id],factures,factures/[id],veille,produits/[id]}/page.tsx` - export const maxDuration = 300
- `.planning/phases/17-fondations-cloud-r-gion-eu-env/17-REGIONS.md` - amendement D-05 Irlande définitive

## Decisions Made

- `produits/[id]/page.tsx` existe → maxDuration posé (5 fichiers, ≥4 requis).
- Insertion maxDuration à côté de `export const dynamic = 'force-dynamic'` existant quand présent (factures ×2, veille), sinon après les imports.
- Suite « complète » exécutée par package (`vitest run` web + shared) — le `pnpm test` racine casse sur un cycle turbo pré-existant (voir Deferred Issues).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Commentaire de staging-banner.tsx contenait la chaîne littérale `'use client'`**
- **Found during:** Task 3 (vérification)
- **Issue:** le doc-comment « pas de 'use client' » faisait échouer le critère d'acceptance `! grep -q "'use client'"` (faux positif garanti aussi chez le verifier)
- **Fix:** reformulé en « aucune directive client »
- **Files modified:** apps/web/src/components/staging-banner.tsx
- **Verification:** grep négatif vert, composant inchangé fonctionnellement
- **Committed in:** f8b88e9 (commit Task 3)

---

**Total deviations:** 1 auto-fixed (1 bug de vérifiabilité, 0 scope creep)
**Impact on plan:** négligeable — reformulation d'un commentaire.

## Deferred Issues

- **`pnpm test` racine (turbo run test) casse sur cycle workspace PRÉ-EXISTANT** `@qualiof/shared ↔ @qualiof/db` (deps workspace croisées présentes au commit pré-plan `7f68135` ; turbo résolu 2.9.6 refuse le graphe cyclique avant d'exécuter le moindre test). Hors scope 21-01 (non causé par ce plan) — consigné dans `deferred-items.md`, candidat naturel pour 21-02 (CI) : casser le cycle ou sortir `test` du `dependsOn: ["^build"]`. La preuve « suite verte » de ce plan est faite par package : web 1176/1176 + shared 113/113.

## Known Stubs

None — filigrane, garde calendar, bandeau et cookie sont câblés sur des données/chemins réels ; `MAIL_DRY_RUN` est volontairement documentation-only (déjà lu par `mailer.ts isDryRun()`, conforme au plan).

## Issues Encountered

None au-delà des points ci-dessus.

## User Setup Required

None côté code — les valeurs `NEXT_PUBLIC_APP_ENV=staging` / `MAIL_DRY_RUN=true` seront posées dans l'env Vercel au plan 21-04 (déploiement). Aucune variable à créer en local.

## Next Phase Readiness

- Contenu prêt à être mergé dans `main` par le plan 21-03 puis déployé par 21-04 (env Vercel : NEXT_PUBLIC_APP_ENV=staging + MAIL_DRY_RUN=true sur le projet staging).
- Le worker Railway ne définit PAS NEXT_PUBLIC_APP_ENV → packs closure propres, aucun filigrane (Open Q1 tranchée).
- Point d'attention 21-02 (CI) : cycle turbo shared↔db à casser pour `turbo run test`.

## Self-Check: PASSED

- Fichiers créés vérifiés présents (vercel.json, watermark.test.ts, staging-banner.tsx, SUMMARY, deferred-items) ✓
- Commits vérifiés dans le log : 57c609b, 05b09f5, 2d6b328, f8b88e9 ✓

---
*Phase: 21-app-vercel-filet-ci-tests*
*Completed: 2026-07-06*
