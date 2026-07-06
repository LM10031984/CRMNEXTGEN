---
phase: 21-app-vercel-filet-ci-tests
plan: 04
subsystem: infra
tags: [vercel, nextjs, staging, waf, rate-limit, prisma, dns, cdg1]

# Dependency graph
requires:
  - phase: 21-app-vercel-filet-ci-tests (plan 21-01)
    provides: gardes staging (NEXT_PUBLIC_APP_ENV, StagingBanner, filigrane PDF, vercel.json cdg1, postinstall prisma generate, sameSite lax)
  - phase: 21-app-vercel-filet-ci-tests (plan 21-03)
    provides: main = cloud-migration (contenu à jour), CI gate PR, flux PR gh opérationnel
  - phase: 20-worker-3-h-te-doc-engines (plan 20-05)
    provides: domaines publics Railway gotenberg-proxy + weasyprint, DOC_ENGINE_TOKEN partagé
provides:
  - App QualiOF déployée sur Vercel Pro, projet qualiof (prj_uI2HKJRGchDOXkI7fKuX9ckpfyY5), région fonctions cdg1, Node 24.x, production branch main
  - URL staging opérationnelle https://qualiof.vercel.app (bandeau STAGING, 307 /app→/login, 404 propre token bidon)
  - 50 variables d'environnement posées (28 app + 22 OF_* copiées du worker Railway), secrets en sensitive, MAIL_DRY_RUN=true, zéro clé morte
  - Règle WAF rate-limit publiée rule_rate_limit_preinscription_t0PSkN (/preinscription, 30 req/60 s par IP, deny → répond 403)
  - Fix Prisma serverless : experimental.outputFileTracingIncludes dans apps/web/next.config.mjs (moteur rhel-openssl-3.0.x tracé)
  - Runbook 21-DEPLOY-VERCEL.md complet avec section 9 RÉSULTATS remplie (evidence curl datée 2026-07-06)
affects: [21-05 (Playwright auth sur qualiof.vercel.app), 21-06 (E2E PDF), phase-22 (ouverture domaine final + équipe)]

# Tech tracking
tech-stack:
  added: [Vercel Pro (hébergement app), Vercel WAF rate-limit]
  patterns:
    - "Build Vercel monorepo = next build seul (PAS turbo run build — cycle db↔shared pré-existant, les packages ne buildent pas d'artefacts)"
    - "Prisma sur Vercel serverless pnpm : outputFileTracingIncludes glob RESSERRÉ *.node (jamais ** récursif — bloque Collecting build traces)"
    - "PRs cloud-migration→main : merge commit obligatoire, JAMAIS squash (le squash de la PR #2 a fait diverger les branches)"

key-files:
  created: []
  modified:
    - .planning/phases/21-app-vercel-filet-ci-tests/21-DEPLOY-VERCEL.md
    - apps/web/next.config.mjs

key-decisions:
  - "Déploiement piloté par Claude via API/CLI Vercel (autorisation explicite Laurent) au lieu du pattern dashboard-only du runbook"
  - "Domaine final app.start-academy.fr PENDING DNS webmaster (OVH) — vérifs et vagues 21-05/21-06 sur https://qualiof.vercel.app (décision utilisateur)"
  - "buildCommand Vercel = next build (contournement cycle turbo db↔shared, pattern projet)"
  - "WAF deny répond 403 (pas 429) — accepté comme fonctionnellement équivalent, consigné au runbook"

patterns-established:
  - "Retours terrain consignés DANS le runbook (sections 2/4) pour qu'il reste rejouable"

requirements-completed: [APP-01, APP-02, APP-03]

# Metrics
duration: ~3h15 (dont exécution dashboard/API par l'orchestrateur + upgrade Pro + fix Prisma 2 PRs)
completed: 2026-07-06
---

# Phase 21 Plan 04: Déploiement Vercel staging gardé Summary

**App QualiOF live sur Vercel Pro cdg1 (https://qualiof.vercel.app) : 50 vars d'env, staging gardé actif (bandeau/dry-run/filigrane), WAF rate-limit /preinscription vivant (403 après 30 req/60 s), fix Prisma serverless outputFileTracingIncludes — domaine final en attente DNS webmaster**

## Performance

- **Duration:** ~3h15
- **Started:** 2026-07-06T09:01:47Z (commit runbook Task 1)
- **Completed:** 2026-07-06T12:15:37Z
- **Tasks:** 3/3 (Task 2 = checkpoint human-action, exécuté par l'orchestrateur avec Laurent)
- **Files modified:** 2 (runbook + next.config.mjs via PRs #2/#3)

## Accomplishments

- **APP-01** : app déployée Vercel Pro, projet `qualiof` (team laurents-projects-3806ab87), Root Directory `apps/web`, Node 24.x, région fonctions **cdg1** (prouvé `x-vercel-id: cdg1::cdg1::…`), production branch `main`, build Ready en 90 s (dpl 7022c5c). Staging dégelé : bandeau STAGING présent sur /login (grep = 1), `MAIL_DRY_RUN=true`, filigrane armé.
- **APP-02 (infra)** : HTTPS actif, redirect auth prouvé (`/app` anonyme → 307 `location: /login`), production **publique** (ssoProtection → preview-only). Cookie `secure` garanti par NODE_ENV=production, `sameSite: 'lax'` posé au 21-01 — preuve login complète au 21-05.
- **APP-03 (câblage)** : `GOTENBERG_URL`/`WEASYPRINT_URL` = domaines publics Railway (20-SMOKE), `DOC_ENGINE_TOKEN` sensitive posé — preuve PDF au 21-06.
- **D-13** : règle WAF `rule_rate_limit_preinscription_t0PSkN` publiée (path starts-with `/preinscription`, fixed window 30 req/60 s par IP, deny). Prouvée par rafale 40× : 29× 404 propres puis **11× 403** (le 404 du check token-bidon comptait dans la fenêtre → exactement 30 passées).
- **Env complète** : 50 variables via API (upsert, 0 échec) = 28 app + 22 `OF_*` copiées du worker Railway ; secrets en type sensitive ; **aucune clé morte** (REDIS_URL, DOC_ENGINE_URL, SMARTOF_*, YOUSIGN_*, RESEND_API_KEY, SMTP_*) — dry-run mail garanti.
- **Crons Vercel : zéro** (vérifié — Pitfall 8, worker Railway seul consommateur de la file ClosureJob).
- Runbook `21-DEPLOY-VERCEL.md` : section 9 RÉSULTATS remplie avec sorties curl brutes datées + retours terrain (buildCommand, fix Prisma) réinjectés dans les sections 2/4.

## Task Commits

1. **Task 1: Runbook 21-DEPLOY-VERCEL.md** — `b25d99c` (docs)
2. **Task 2: Exécution runbook (checkpoint human-action)** — actions dashboard/API Vercel, pas de commit repo, SAUF le fix Prisma découvert au runtime : `38be3eb` (fix, PR #2 squashée `fee1a0d`), `f3ab56e` (fix glob resserré, PR #3 merge commit, main = `7022c5c`), résolution divergence `addecc3`
3. **Task 3: Vérification runtime + evidence** — `85e9102` (docs)

## Files Created/Modified

- `.planning/phases/21-app-vercel-filet-ci-tests/21-DEPLOY-VERCEL.md` — runbook complet (Task 1) + section 9 RÉSULTATS avec evidence + retours terrain (Tasks 2-3)
- `apps/web/next.config.mjs` — `experimental.outputFileTracingIncludes` pour tracer le moteur Prisma `rhel-openssl-3.0.x` dans le bundle serverless (PRs #2/#3)

## Decisions Made

- **Pattern d'exécution** : « Laurent clique au dashboard » remplacé par « Claude pilote par API/CLI Vercel » — déviation validée explicitement par Laurent. Plan Pro activé (20 $/mois ; add-on Speed Insights 10 $/mois d'un vieux projet désactivé avant l'upgrade).
- **Domaine final** : `app.start-academy.fr` attaché côté Vercel mais **PENDING DNS** — zone gérée par le webmaster de Laurent (compte OVH, registrar Scaleway/bookmydomain). À demander au webmaster : CNAME `app` → `cname.vercel-dns.com.` + TXT `_vercel` = `vc-domain-verify=app.start-academy.fr,c75f8d7f67609b827823`. **Décision utilisateur : vérifs + vagues 21-05/21-06 sur `https://qualiof.vercel.app` en attendant.**
- **Merge policy** : PRs cloud-migration→main en **merge commit, PAS squash** (le squash de la PR #2 avait fait diverger main/cloud-migration, résolu par `addecc3`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] buildCommand Vercel = `next build` (défaut `turbo run build` KO)**
- **Found during:** Task 2 (1er déploiement)
- **Issue:** le build par défaut échouait sur le cycle workspace pré-existant `@qualiof/db#build ↔ @qualiof/shared#build` (cf. deferred-items 21-03)
- **Fix:** override Build Command du projet Vercel = `next build` (les packages ne buildent pas d'artefacts, pattern projet)
- **Files modified:** config projet Vercel (hors repo) + runbook section 2 documenté
- **Verification:** build Ready 90 s (dpl 7022c5c)

**2. [Rule 1 - Bug] PrismaClientInitializationError au runtime (500 sur toutes les routes DB)**
- **Found during:** Task 2 (post-deploy, build vert mais runtime KO)
- **Issue:** moteur Prisma `rhel-openssl-3.0.x` du store pnpm non tracé dans le bundle serverless Vercel
- **Fix:** `experimental.outputFileTracingIncludes` dans `apps/web/next.config.mjs`. 1ʳᵉ version avec glob `**` récursif = build bloqué > 10 min sur « Collecting build traces » → glob resserré sur `@prisma+client*/node_modules/.prisma/client/*.node`
- **Files modified:** apps/web/next.config.mjs
- **Verification:** routes DB opérationnelles (login 200, redirect auth vivant)
- **Committed in:** `38be3eb` (PR #2, squashée `fee1a0d`) + `f3ab56e` (PR #3, merge commit, main = `7022c5c`)
- **Effet de bord réparé:** le squash de la PR #2 a fait diverger main/cloud-migration → merge de main dans cloud-migration (`addecc3`) ; règle posée : **merge commit obligatoire** pour les PRs suivantes

**3. [Déviation acceptée] WAF deny = 403, pas 429**
- **Found during:** Task 2/3 (test rafale)
- **Issue:** le runbook et le plan attendaient 429 ; la règle WAF Vercel action deny répond **403**
- **Fix:** aucun — protection fonctionnellement équivalente, prouvée (rafale 40× → exactement 30 passées puis blocage). Consigné au runbook section 9
- **Verification:** `11× 403` / `29× 404` sur rafale, fenêtre 60 s respectée

**4. [Déviation validée utilisateur] Exécution API au lieu du dashboard**
- **Found during:** Task 2 (checkpoint)
- **Issue:** le pattern runbook « Laurent clique » a été remplacé par « Claude pilote par API/CLI Vercel » avec l'autorisation explicite de Laurent
- **Impact:** projet, env (50 vars), protection, domaine, WAF posés par API — plus rapide et sans erreur de saisie

**5. [Déviation non bloquante] Previews Vercel de PR échouent volontairement**
- **Found during:** Task 2
- **Issue:** env vars posées en **Production uniquement** → previews KO (fail-loud t3-env)
- **Impact:** non bloquant — le gate CI GitHub « test » couvre les PRs (21-03). À revisiter si des previews deviennent utiles

---

**Total deviations:** 5 (1 bug, 1 blocking, 2 acceptées/validées, 1 non bloquante)
**Impact on plan:** tous les must-haves atteints sauf le domaine final (PENDING DNS webmaster, hors contrôle repo — décision utilisateur de basculer sur qualiof.vercel.app). Aucun scope creep.

## Issues Encountered

- **Domaine final `app.start-academy.fr` : PENDING DNS webmaster** — attaché côté Vercel, en attente CNAME + TXT chez le webmaster (compte OVH). Preuve « domaine final HTTPS » différée ; APP-02 infra prouvée sur qualiof.vercel.app (décision utilisateur). À suivre : quand le DNS est posé, re-jouer les 2 premiers checks de la section 9 contre app.start-academy.fr et mettre à jour `NEXT_PUBLIC_APP_URL`/`OPENROUTER_SITE_URL` (actuellement sur qualiof.vercel.app).

## User Setup Required

Une action externe reste ouverte (hors dashboard Vercel, délégué au webmaster) :
- **DNS start-academy.fr** : CNAME `app` → `cname.vercel-dns.com.` + TXT `_vercel` = `vc-domain-verify=app.start-academy.fr,c75f8d7f67609b827823` (détail dans 21-DEPLOY-VERCEL.md section 9).

## Next Phase Readiness

- **21-05 (Playwright auth)** : cible = `https://qualiof.vercel.app`, production publique, cookie sameSite lax posé — prêt.
- **21-06 (E2E PDF)** : doc-engines câblés (GOTENBERG_URL/WEASYPRINT_URL/DOC_ENGINE_TOKEN) — prêt.
- ⚠ Rappel : PRs cloud-migration→main en **merge commit** (jamais squash).

---
*Phase: 21-app-vercel-filet-ci-tests*
*Completed: 2026-07-06*

## Self-Check: PASSED

- 21-DEPLOY-VERCEL.md, 21-04-SUMMARY.md, apps/web/next.config.mjs (outputFileTracingIncludes) : présents
- Commits b25d99c / 38be3eb / f3ab56e / addecc3 / 85e9102 : trouvés dans l'historique
