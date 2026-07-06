---
phase: 21-app-vercel-filet-ci-tests
plan: 06
subsystem: testing
tags: [playwright, e2e, closure, openrouter, teardown, supabase-storage, vercel, railway, gh]

# Dependency graph
requires:
  - phase: 21-app-vercel-filet-ci-tests (plan 21-05)
    provides: infra Playwright (config 4 projets, user e2e dédié, storageState, projet authenticated matchant closure-flow)
  - phase: 21-app-vercel-filet-ci-tests (plan 21-04)
    provides: staging Vercel LIVE https://qualiof.vercel.app + GOTENBERG_URL/WEASYPRINT_URL/DOC_ENGINE_TOKEN posés
  - phase: 20-worker-3-h-te-doc-engines
    provides: worker Railway (queue Postgres SKIP LOCKED) + proxy Caddy gotenberg public /health ouvert
provides:
  - TEST-01 prouvé 100 % cloud : session E2E- créée via l'UI staging → pack closure IA OpenRouter RÉEL (16/16 en 89 s, 0 stub) → PDF %PDF- valides → teardown 0 résiduel
  - APP-03 prouvé : PDF synchrone (convocation) rendu PAR VERCEL via doc-engine Railway public + Bearer → %PDF-
  - teardown-e2e-data.ts idempotent (purge exclusive E2E-, base + storage, garde anti-deleteMany-global, réutilisé en afterAll)
  - e2e/README.md — commandes à la demande (D-10)
  - 21-SMOKE.md consolidé (phase gate — evidence datée des 6 requirements) + 21-VALIDATION.md map 17/17 green
  - PR #7 cloud-migration→main mergée (merge commit) après gate CI vert — main = cloud-migration (0/0)
affects: [phase-22 (bascule domaine final — re-jouer les E2E via STAGING_BASE_URL), verify-work-21]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Poll d'un composant client auto-pollant : waitFor sur le badge terminal (JAMAIS count() instantané post-reload — l'hydratation prend 1-2 s), reload = filet de secours seulement"
    - "E2E longs et payants (IA réelle) : retries=0 dans le spec — un échec se diagnostique, ne se rejoue pas en aveugle"
    - "Runs Playwright automatisés : reporter [['list'],['html',{open:'never'}]] — le serveur HTML auto-servi sur échec bloque le process"
    - "Download target=_blank en headless : écouter l'event download sur la page ET sur les popups du context (attribution Chromium variable)"

key-files:
  created:
    - apps/web/e2e/teardown-e2e-data.ts
    - apps/web/e2e/README.md
    - apps/web/e2e/closure-flow.spec.ts
    - .planning/phases/21-app-vercel-filet-ci-tests/21-SMOKE.md
  modified:
    - apps/web/playwright.config.ts
    - .gitignore
    - .planning/phases/21-app-vercel-filet-ci-tests/21-VALIDATION.md

key-decisions:
  - "Fixtures : produit + personnes (avec Organization/LegalLink) créés via Prisma en beforeAll ; session + participants via l'UI (cœur de TEST-01) — le picker exige ≥1 casquette et ne crée pas de LegalLink inline"
  - "Produit E2E en DISTANCIEL : Location non exigée par getSessionCompleteness → wizard déterministe"
  - "retries=0 sur closure-flow : un retry relançait un pack OpenRouter payant en aveugle (constat run 1)"
  - "PR #7 mergée en MERGE COMMIT (règle 21-04 anti-squash) ; check Vercel preview fail = attendu (env Production-only, déviation actée 21-04), le gate requis reste [test]"

patterns-established:
  - "Teardown E2E : garde structurelle assertScopedWhere (throw si where vide) + clés storage collectées AVANT les deleteMany + compteurs par table (0 PII)"

requirements-completed: [TEST-01, APP-03]

# Metrics
duration: ~70min (dont 2 runs E2E closure réels ~25 min + CI PR #7)
completed: 2026-07-06
---

# Phase 21 Plan 06: E2E closure réel + teardown + phase gate + PR finale Summary

**Pilier #1 prouvé 100 % cloud : session jetable E2E- créée dans l'UI staging Vercel → pack closure IA OpenRouter réel consommé par le worker Railway (16/16 en 89 s, 0 stub) → PDFs `%PDF-` valides (pack + convocation synchrone Vercel = APP-03) → teardown idempotent 0 résiduel — et PR #7 cloud-migration→main mergée après gate CI vert**

## Performance

- **Duration:** ~70 min
- **Started:** 2026-07-06T14:12:24Z
- **Completed:** 2026-07-06T15:22:00Z (env.)
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- **Task 1 — filet de nettoyage AVANT les données** : `teardown-e2e-data.ts` (imports `@qualiof/db` + supabase-js seulement, garde `pathToFileURL`, `startsWith: 'E2E-'/'e2e-'` sur CHAQUE deleteMany, ordre FK sûr Document→ClosureBatch→…→TrainingProduct, objets storage collectés avant delete puis supprimés en service role, garde-fou `assertScopedWhere` anti-purge globale, `export teardownE2EData()` réutilisée en afterAll). **Run à blanc sur base cloud propre : exit 0, tous compteurs 0** (idempotence prouvée avant toute création). `e2e/README.md` : 4 commandes exactes (smoke / upload / closure / teardown) + prérequis (worker Railway UP via `railway status`, budget OpenRouter, D-10 hors gate PR).
- **Task 2 — TEST-01 de bout en bout (sortie du run vert ci-dessous)** : préflight `GET /health` proxy Caddy → 200 ; wizard `/app/sessions/nouvelle` (produit E2E- recherché puis sélectionné, dates auto 1 jour, formateur existant « Dispo » cliqué, 2 participants E2E-Alice/E2E-Bob ajoutés via le picker) ; CTA « Pack fin de formation » → modale sans blocker → **batch 16 jobs, VRAIE génération OpenRouter** (worker Railway, `cloud:fast` = claude-haiku-4.5, prompts claude-v10) ; badge **« Terminé » en 89 s** ; **0 stub** (UI : aucun « à régénérer (IA) » + Prisma : 16/16 DONE, usedStub=false, errorMessage=null) ; download d'un doc du pack → **`head="%PDF-"`** ; **APP-03** : « Générer Convocation — E2E-Alice » (server action synchrone Vercel → `renderHtmlToPdf` → proxy Caddy public + Bearer) → download → **`head="%PDF-"`** (annotation : CE PDF porte le filigrane STAGING, les docs du pack non — attendu, flag Vercel uniquement). afterAll → teardown. **Post-run standalone : tous compteurs 0.**
- **Task 3 — phase gate + PR finale** : `21-SMOKE.md` consolidé (sections APP-01/02/03, CI-01, TEST-01/02 avec tableaux datés + sorties brutes + note de divergence `/p/[token]`→`/preinscription/[token]` + 4 items MANUAL/reportés listés séparément) ; `21-VALIDATION.md` : map 17/17 ✅ green, `wave_0_complete: true`, approval 2026-07-06 ; **PR #7** « feat(21): filet tests staging » : push → gate CI **test pass (1m34s)** → **merge commit `77c3f20`** → resync `git merge origin/main` → **cloud-migration = main (0 behind / 0 ahead)** → CI + Deploy migrations **success** sur main post-merge.

## Sortie du run final (staging https://qualiof.vercel.app, 2026-07-06)

```
Running 2 tests using 1 worker
  ✓  1 [setup] › e2e/auth.setup.ts:16:1 › login réel → storageState (5.1s)
[closure-flow] session créée via UI : cc0c300a-ad22-4531-9970-71a75cb0fc4b
[closure-flow] batch lancé : 83f8e1d3-001e-4ffb-ba1a-dcdd119b18ff (16 jobs attendus)
[closure-flow] batch "Terminé" en 89s
[closure-flow] doc du pack : head="%PDF-" OK
[closure-flow] convocation : génération synchrone déclenchée depuis l'UI
[closure-flow] PDF synchrone (convocation) : head="%PDF-" OK — APP-03 prouvé
[teardown-e2e] compteurs : {"document":7,"closureJob":16,"closureBatch":1,"pedagogicalAsset":12,...}
  ✓  2 [authenticated] › e2e/closure-flow.spec.ts:151:1 › TEST-01 … (2.1m)
  2 passed (2.3m)
```

**Durée réelle du pack : 89 s** (16 docs, worker chaud — témoin SES-0093 ≈ 3 min à froid).
**Coût OpenRouter du plan : ~quelques centimes, < 1 €** (3 packs au total : 2 runs de mise au point + 1 vert ≈ 48 docs Haiku fast).

## Task Commits

1. **Task 1: Teardown E2E idempotent + README e2e** - `b4ea34a` (feat)
2. **Task 2: Spec closure-flow — session E2E- via UI, pack IA réel, 0 stub, %PDF** - `ec424f9` (feat)
3. **Task 3: 21-SMOKE.md + 21-VALIDATION + PR finale** - `42bdf0e` (docs) + merge PR #7 `77c3f20`

## Files Created/Modified

- `apps/web/e2e/teardown-e2e-data.ts` - purge exclusive E2E- (base + storage), idempotente, worker/CLI-safe
- `apps/web/e2e/README.md` - commandes à la demande (D-10) + prérequis
- `apps/web/e2e/closure-flow.spec.ts` - TEST-01 + APP-03, préflight health, retries=0, teardown en afterAll
- `apps/web/playwright.config.ts` - reporter list + html open:never (déblocage runs automatisés)
- `.gitignore` - `.e2e-tmp-admin-pwd.txt` (hygiène fichier mot de passe local)
- `.planning/.../21-SMOKE.md` - evidence consolidée phase 21 (phase gate)
- `.planning/.../21-VALIDATION.md` - map 17/17 green, approval

## Decisions Made

- **Fixtures Prisma vs UI** : produit + personnes (avec Organization + LegalLink) en beforeAll Prisma, session + participants via l'UI — TEST-01 porte sur « création session → participants » ; le PersonOrOrgPicker exige ≥1 casquette et ne crée pas de LegalLink inline (choix documenté en tête du spec).
- **Produit DISTANCIEL** : Location non exigée par la completeness → un champ de moins dans le wizard, déterminisme accru.
- **retries=0 sur le spec closure** : un retry Playwright relance un pack IA payant complet en aveugle (constaté au run 1 : le retry a régénéré 16 docs).
- **PR #7 en merge commit** (règle 21-04) ; le check « Vercel » (preview) FAIL est attendu et non requis (env Production-only, déviation actée 21-04 #5) — le gate protégé reste `["test"]`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Poll du badge batch inopérant (TIMEOUT malgré batch COMPLETED)**
- **Found during:** Task 2 (1er run complet)
- **Issue:** la boucle vérifiait `count()` du badge « Terminé » IMMÉDIATEMENT après `page.reload()` — le composant client (`ClosureBatchProgress`) met 1-2 s à hydrater/fetcher → le badge n'était jamais vu ; le batch était pourtant COMPLETED 16/16 err=0 en base (~9 min, worker à froid)
- **Fix:** `waitFor({ timeout: 45_000 })` sur le badge terminal (la page se poll elle-même toutes les 2 s), reload = filet de secours uniquement
- **Files modified:** apps/web/e2e/closure-flow.spec.ts
- **Verification:** run 2 vert — badge détecté en 89 s
- **Committed in:** ec424f9

**2. [Rule 3 - Blocking] Serveur HTML Playwright bloquant sur échec**
- **Found during:** Task 2 (post-mortem run 1)
- **Issue:** sur échec local, le reporter HTML par défaut auto-sert le rapport et NE REND PAS LA MAIN → le run automatisé reste suspendu (process node vivant après la fin des tests)
- **Fix:** `reporter: [['list'], ['html', { open: 'never' }]]` dans playwright.config.ts (rapport toujours écrit, jamais servi)
- **Files modified:** apps/web/playwright.config.ts
- **Committed in:** ec424f9

**3. [Rule 2 - Missing Critical] retries=0 sur le spec closure**
- **Found during:** Task 2 (run 1 : le retry global retries=1 a relancé un pack OpenRouter complet en aveugle)
- **Issue:** un E2E long ET payant ne doit pas se rejouer automatiquement — coût réel + fixtures dupliquées
- **Fix:** `test.describe.configure({ retries: 0 })` dans closure-flow.spec.ts (le reste de la suite garde retries=1)
- **Committed in:** ec424f9

**4. [Rule 2 - Missing Critical] `.e2e-tmp-admin-pwd.txt` ajouté au .gitignore**
- **Found during:** Task 2 (revue git status avant commit)
- **Issue:** fichier local de mot de passe (reset admin du jour, contexte orchestrateur) non couvert par .gitignore → risque de commit accidentel d'un secret
- **Fix:** entrée .gitignore
- **Committed in:** ec424f9

---

**Total deviations:** 4 auto-fixed (2 bugs/blocking outillage test, 2 missing critical)
**Impact on plan:** aucun sur les preuves — le pipeline cloud (Vercel → queue Postgres → worker Railway → OpenRouter → Supabase) n'a JAMAIS été en défaut (3/3 batches COMPLETED, 0 stub, 0 erreur). Les corrections portent sur l'outillage de test uniquement.

## Issues Encountered

- **Run 1 échoué sur bug du spec (pas du produit)** : détail en déviation #1. Les données du run interrompu ont été purgées par le teardown standalone (preuve d'utilité immédiate : compteurs non-zéro puis re-run = 0). Transparence consignée dans 21-SMOKE.md (« Note mise au point »).
- `E2E_DOCENGINE_HEALTH_URL` ajoutée au `.env` racine local (gitignoré) — URL non-secrète du /health public du proxy Caddy, documentée dans e2e/README.md.

## User Setup Required

None - no external service configuration required. (Rappel hérité : DNS `app.start-academy.fr` toujours PENDING webmaster — CNAME + TXT, détail 21-DEPLOY-VERCEL.md §9.)

## Next Phase Readiness

- **Phase 21 complète (6/6 plans)** — evidence consolidée dans `21-SMOKE.md`, prête pour `/gsd:verify-work 21`.
- **main = cloud-migration** (PR #7 mergée, resync 0/0) — le code de tests vit dans main via le gate CI qu'il a lui-même prouvé.
- **Phase 22 (bascule)** : re-jouer les 2 checks APP-01 sur le domaine final quand le DNS tombe, re-pointer `NEXT_PUBLIC_APP_URL`/`OPENROUTER_SITE_URL`, re-jouer la suite E2E via `STAGING_BASE_URL=https://app.start-academy.fr`, re-audit storage DRY→WRITE contre le dump final, MinIO non purgé (destructif = étape séparée).

---
*Phase: 21-app-vercel-filet-ci-tests*
*Completed: 2026-07-06*

## Self-Check: PASSED

- 5 fichiers clés (teardown, README, spec, 21-SMOKE.md, SUMMARY) : présents sur disque
- Commits b4ea34a / ec424f9 / 42bdf0e + merge PR #7 77c3f20 : trouvés dans l'historique
- Run final : 2 passed (2.3 min), pack 16/16 en 89 s, 0 stub, 0 donnée E2E- résiduelle (base + storage)
- main = cloud-migration (0 behind / 0 ahead), CI + Deploy migrations success post-merge
