---
phase: 22-bascule-prod-conformit-rgpd
plan: 06
subsystem: infra
tags: [cutover, vercel, railway, env-vars, google-oauth, ses-0094, watermark, merge-commit, openrouter]

# Dependency graph
requires:
  - phase: 22-bascule-prod-conformit-rgpd (22-01)
    provides: "22-CUTOVER-RUNBOOK.md §0–§9 — procédure et gabarit evidence"
  - phase: 22-bascule-prod-conformit-rgpd (22-02)
    provides: "loadOAuthConfig() env-first (3 vars GOOGLE_OAUTH_*), code prêt à merger"
  - phase: 22-bascule-prod-conformit-rgpd (22-03)
    provides: "D-01 cloud unique vérité + D-02 storage 0 lien mort (étendu docs 16/06→04/07, re-audit PASS 30/07)"
  - phase: 22-bascule-prod-conformit-rgpd (22-04)
    provides: "sanity-check-env.ts + 22-ENV-SANITY.md (5 commentaires inline .env racine)"
  - phase: 22-bascule-prod-conformit-rgpd (22-05)
    provides: "Gate RGPD D-13 validé (registre + 7 DPA)"
provides:
  - "PRODUCTION LIVE GARDÉE : https://qualiof.vercel.app en NEXT_PUBLIC_APP_ENV=production, 0 bandeau STAGING, PDF sans filigrane (D-08), MAIL_DRY_RUN=true partout (CUT-01)"
  - "PR #8 cloud-migration→main mergée en MERGE COMMIT 42d69c7 — main = cloud-migration (diff 0)"
  - "3 vars GOOGLE_OAUTH_* posées sensitive Production via API REST (D-07 déployé)"
  - "Gate SES-0094 : GO validé par Laurent 2026-08-03 (22-GONOGO-SES-0094.md — 21/21, 0 stub, 0×404, sans filigrane) (CUT-02)"
  - "Runbook §9.0–§9.3 evidence remplies ; Wave 3 (22-07/22-08) AUTORISÉE"
affects: [22-07, 22-08, 22-09, 22-10, verify-work-22]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pose d'env Vercel par API REST (payload JSON exact) — JAMAIS stdin CLI sans newline (valeurs vides silencieuses détectées par vérif longueur post-pose)"
    - "Enqueue witness pack = INSERT ClosureBatch+Jobs QUEUED via Prisma → worker Railway consomme la file Postgres (Mac hors boucle)"

key-files:
  created:
    - .planning/phases/22-bascule-prod-conformit-rgpd/22-GONOGO-SES-0094.md
    - apps/web/scripts/report-docs-gap.ts
  modified:
    - .planning/phases/22-bascule-prod-conformit-rgpd/22-CUTOVER-RUNBOOK.md

key-decisions:
  - "GO bascule Laurent 2026-07-30 (§0 6/6) puis GO gate SES-0094 Laurent 2026-08-03 — production reste live, aucun rollback"
  - "3 preuves RGPD complémentaires (ZDR OpenRouter, DPA Supabase, CDPA Workspace) ABANDONNÉES par décision du responsable de traitement (07/07, confirmé 30/07) — consigné runbook §9.0"
  - "Pose Vercel par API REST après incident stdin (4 valeurs vides) — leçon consignée §9.2"
  - "OF_* Railway : 12 re-posées propres + 10 vides SUPPRIMÉES (cascade pick() restaurée) plutôt que posées à vide (CLI refuse --set KEY=)"
  - "ANALYSE_BESOIN hors pack témoin = by design (Avant/Après, types.ts:23) — 3/3 présentes en base, fond au todo datation"

patterns-established:
  - "Vérification de longueur post-pose systématique après toute pose d'env par CLI/API (les sensitive ne se relisent pas — le pull montre les vides)"
  - "Witness pack post-bascule : batch neuf jugé sur ClosureJob (usedStub, status), jamais sur ClosureBatch.doneDocs"

requirements-completed: [CUT-01, CUT-02]

# Metrics
duration: ~2h actives (fenêtre 2026-07-30 → 2026-08-03, pauses checkpoints GO/verdict exclues)
completed: 2026-08-03
---

# Phase 22 Plan 06: Exécution de la bascule production (runbook §0–§3) Summary

**Bascule exécutée et GATÉE : merge main #8 (merge commit), 3 vars Google sensitive, flip `NEXT_PUBLIC_APP_ENV=production` + redeploy (0 bandeau, 0 filigrane, MAIL_DRY_RUN=true partout), pack témoin SES-0094 21/21 0 stub 0×404 via worker Railway — verdict GO Laurent 2026-08-03, Wave 3 ouverte.**

## Performance

- **Duration:** ~2 h actives (wall-clock 2026-07-07 → 2026-08-03 : pre-flight gate résolu au GO du 30/07, verdict gate le 03/08)
- **Started:** 2026-07-07T04:50:07Z (pre-flight) / exécution 2026-07-30T13:00Z
- **Completed:** 2026-08-03 (verdict GO consigné)
- **Tasks:** 4/4 (2 auto + 2 checkpoints human-verify)
- **Files modified:** 3 (+ env Vercel/Railway)

## Accomplishments

- **CUT-01 — bascule §1–§2 exécutée selon runbook** :
  - PR **#8** `cloud-migration`→`main` mergée en **MERGE COMMIT** `42d69c7` (gate `test` vert 1m31s, diff post-merge = 0 ligne ; check Vercel preview fail = volontaire 21-04).
  - `.env` racine assaini : les **5 commentaires inline classe PROD-0674** (SESSION_LIFETIME, OPENROUTER_MODEL_FAST/QUALITY/VISION, OPENROUTER_SITE_URL) déplacés en lignes dédiées — re-scan : seul reste le faux positif métier OF_ADDRESS_STREET (é).
  - **3 vars `GOOGLE_OAUTH_*` posées** (sensitive, Production, HTTP 201 via API REST) après sanity pré-pose (regex = 0 match sur les 3, champ `installed`). `files/secrets/` conservés (fallback dev, D-07).
  - **Flip `NEXT_PUBLIC_APP_ENV=production`** + `vercel redeploy` (Ready 3 min) : `/login` **200, 0 occurrence STAGING, x-vercel-id cdg1::cdg1** ; login réel e2e → `/app` (Playwright setup, 1 passed 7,0 s) ; sanity post-pose 74 vars 0 danger.
  - **`MAIL_DRY_RUN=true` prouvé sur les DEUX plateformes** — aucun email réel n'est parti.
- **CUT-02 — gate SES-0094 GO** : batch `08fd14dc` **21/21 en 93 s via worker Railway** (file Postgres, Mac hors boucle), **0 stub** (ClosureJob), **21/21 signed URLs en 200 + `%PDF-`**, footer OF_* propre, **0 filigrane** sur PDF worker ET sur **PDF synchrone Vercel** (devis témoin jetable `/api/quotes/[id]/pdf`, teardown 0 résidu — D-08 prouvé sur le chemin qui portait le filigrane en 21-06). Qualité : positionnement varié, satisfaction non uniforme, QCM 1/session scoring 92 %/85 %, émargement week-ends exclus. Coût ≈ centimes, comparable aux témoins 20/21. **Verdict : GO — Laurent, 2026-08-03.**
- **Runbook §9.0–§9.3 remplis** (dont §9.0 : les 3 preuves RGPD complémentaires abandonnées par décision du responsable de traitement).
- `report-docs-gap.ts` commité (remédiation D-01 étendue aux documents, re-audit PASS 30/07).

## Task Commits

1. **Task 2 (pré-requis) : script report-docs-gap** - `26d1df2` (chore)
2. **Task 2 : cutover §1–§2 + evidence** - PR #8 merge commit `42d69c7` + `69e21f8` (docs)
3. **Task 3 : preuves gate SES-0094** - `5af1497` (docs)
4. **Task 4 : verdict GO consigné** - commit métadonnées final (docs)

## Files Created/Modified

- `.planning/phases/22-bascule-prod-conformit-rgpd/22-GONOGO-SES-0094.md` - preuves datées du gate + verdict GO
- `.planning/phases/22-bascule-prod-conformit-rgpd/22-CUTOVER-RUNBOOK.md` - §9.0 (RGPD abandon), §9.1, §9.2, §9.3 remplis
- `apps/web/scripts/report-docs-gap.ts` - report sélectif documents local→cloud (22-03 étendu)
- Hors repo : env Vercel Production (3 GOOGLE_OAUTH_* + NEXT_PUBLIC_APP_ENV) et Railway worker (MAIL_DRY_RUN + 22 OF_* assainies)

## Decisions Made

- GO bascule (30/07) puis GO gate (03/08) par Laurent ; production gardée live, emails dry-run jusqu'au 22-07.
- 3 preuves RGPD complémentaires abandonnées (responsable de traitement) — runbook §9.0.
- OF_* vides supprimées plutôt que posées à vide (CLI Railway refuse la valeur vide ; `pick()` traite absent = vide).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pose stdin Vercel CLI → 4 valeurs VIDES silencieuses**
- **Found during:** Task 2 (pose des 3 vars Google + flip)
- **Issue:** `printf 'valeur' | vercel env add` (stdin sans newline) a stocké des valeurs vides — indétectable pour les sensitive (jamais relisibles), détecté par vérification de longueur sur le pull (`NEXT_PUBLIC_APP_ENV=""`)
- **Fix:** 4 vars supprimées puis re-posées via **API REST** (`POST /v10/projects/{id}/env`, payload JSON exact, type sensitive/encrypted) — 4× HTTP 201, pull de contrôle `NEXT_PUBLIC_APP_ENV="production"`
- **Files modified:** aucun (env Vercel)
- **Verification:** pull + sanity-check post-pose (74 vars, 0 danger)
- **Committed in:** consigné dans `69e21f8` (§9.2)

**2. [Rule 2 - Missing Critical] `MAIL_DRY_RUN` ABSENT du worker Railway**
- **Found during:** Task 2 (preuve acceptance « MAIL_DRY_RUN=true sur les 2 plateformes »)
- **Issue:** le worker Railway n'avait PAS `MAIL_DRY_RUN` alors que `SMTP_HOST` est posé → `isDryRun()` (mailer.ts:52) aurait rendu **false** ; seul filet : absence de SMTP_USER/PASS (refus d'auth du relais OVH)
- **Fix:** `MAIL_DRY_RUN=true` posé sur le service worker (redeploy auto), vérifié post-pose
- **Files modified:** aucun (env Railway)
- **Verification:** `railway variables --service worker` → `MAIL_DRY_RUN=true`
- **Committed in:** consigné dans `69e21f8` (§9.2)

**3. [Rule 1 - Bug] 22 vars OF_* Railway polluées par des guillemets littéraux**
- **Found during:** Task 3 (contrôle visuel footer du batch 1 `4af3d823`)
- **Issue:** re-pose OF_* du 2026-07-06 (~06:45Z) = lignes `.env` brutes collées AVEC guillemets → footers `"START ACADEMY"`, SIRET `"95131909400011"`, contacts `"" ""` (la chaîne `""` truthy court-circuitait la cascade contact→responsable de `pick()`). Classe PROD-0674, variante guillemets — la regex sanity ne flagge pas `"` (ASCII imprimable)
- **Fix:** 12 OF_* re-posées en valeurs dotenv-parsées propres + 10 vides supprimées, worker redéployé (boot 2026-08-03T06:37:30), **pack re-régénéré** (batch 2 `08fd14dc`) et footer jugé sur l'état corrigé
- **Files modified:** aucun (env Railway)
- **Verification:** rendus PNG attestation + émargement : footer propre, contacts restaurés (`Laurent MARX - formation@start-academy.fr - 0631056390`)
- **Committed in:** `5af1497` (rapport gate, section Déviations)

---

**Total deviations:** 3 auto-fixed (2 bugs env, 1 missing critical). **Impact :** toutes nécessaires à la correction/sécurité de la bascule ; aucun scope creep — le protocole du gate (re-régénération après fix) a été respecté.

## Issues Encountered

- **Signed URLs expirées entre deux sessions de travail** (validité 1 h) → régénérées et curlées dans la foulée (21/21 en 200).
- **`tsx -e` compile en CJS** (pas de top-level await) → scripts temporaires fichiers (supprimés après usage, pattern 22-03).
- **`usedStub` n'existe pas sur `Document`/`PedagogicalAsset`** (uniquement `ClosureJob`, schema:1505) — la key_link du plan (« Document.usedStub ») était inexacte ; compteur rendu sur les jobs (méthode 21-06).

## Observations non bloquantes (transmises à Laurent)

1. **Adresse tenant BDD ≠ env** : l'ATTESTATION affiche « 12 avenue des camélias, Cagnes sur Mer » (BDD Paramètres organisme, priorité `pick()`) vs « 618 Bd Jean Maurel, Vence » (env, siège Qualiopi) sur l'émargement — **à corriger dans Paramètres organisme** (1 édition UI).
2. **Dette légère outillage** : ajouter la détection de guillemets de tête/queue à `sanity-check-env.ts` (la regex actuelle ne les flagge pas).

## Next Phase Readiness

- **Wave 3 AUTORISÉE** : 22-07 (flip emails réels — ⚠ re-jouer `pending-reminders-report.ts` le jour J : 1 envoi en attente relevé au 30/07, arbitrage Laurent requis ; SMTP_USER/PASS à poser sur les 2 plateformes) et 22-08 (invitations équipe, alertes).
- Production live gardée : tout rollback reste possible en ~5 min (§8) tant que 22-07 n'a pas flippé les emails.

---
*Phase: 22-bascule-prod-conformit-rgpd*
*Completed: 2026-08-03*

## Self-Check: PASSED

- 22-GONOGO-SES-0094.md, 22-06-SUMMARY.md, report-docs-gap.ts : présents
- Commits 26d1df2 / 69e21f8 / 5af1497 / merge 42d69c7 : présents
- https://qualiof.vercel.app/login : HTTP 200 (production live)
