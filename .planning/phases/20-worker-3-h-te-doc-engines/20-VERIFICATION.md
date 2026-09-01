---
phase: 20-worker-3-h-te-doc-engines
verified: 2026-07-30T00:00:00Z
status: gaps_found
score: 3/4 must-haves verified
re_verification: false
gaps:
  - truth: "L'OCR/pdftoppm est explicitement tranché et implémenté — aucune dégradation silencieuse du pilier #4"
    status: partial
    reason: "Le chemin PUBLIC (formulaire /p/[token] → SUBMITTED → worker Railway poll SKIP LOCKED → pdftoppm → EXTRACTED) est implémenté et prouvé E2E (smoke P6d). MAIS l'UAT test 2 (severity: major) a révélé 2 chemins OCR inline résiduels exécutés sur Vercel (runtime SANS poppler), toujours présents dans le code au moment de cette vérification : le plan de gap closure 20-06 est écrit mais NON exécuté (aucun 20-06-SUMMARY.md, marqueurs code absents)."
    artifacts:
      - path: "apps/web/src/server/actions/preinscription-public.ts"
        issue: "retriggerExtraction (ligne 123) exécute extractPreEnrollmentDocuments inline (ligne 132, fire-and-forget) sur Vercel — risque de passer une row en EXTRACTED avec cni:null (dégradation silencieuse) et de voler le job au worker Railway ; submitPreEnrollmentForm legacy toujours exporté (ligne 39) avec son fire-and-forget (ligne 111)"
      - path: "apps/web/src/server/actions/extract-apprenant-docs.ts"
        issue: "Wizard admin « Créer un apprenant » : extractDocsFromBuffers appelé inline (ligne 67) sur Vercel — tout PDF scanné échoue à la rasterisation (pdftoppm ENOENT)"
      - path: "apps/web/src/lib/pdf-extract.ts"
        issue: "Message utilisateur avec hint « brew install poppler » (ligne 152) affiché en prod dans le wizard — message absurde hors macOS ; option rasterizeScannedPdf inexistante (grep = 0)"
    missing:
      - "Exécuter le plan 20-06 (gap_closure, déjà écrit) : retriggerExtraction → re-flag SUBMITTED + purge extractedData (délégation au worker Railway, plus d'OCR inline)"
      - "Wizard admin : refus clair des PDF scannés côté Vercel (message JPEG/PNG, sans hint brew, sans tentative pdftoppm) via rasterizeScannedPdf: false"
      - "Suppression du legacy submitPreEnrollmentForm (0 call-site UI)"
human_verification: []
---

# Phase 20: Worker 3ᵉ hôte + doc engines Verification Report

**Phase Goal:** Un 3ᵉ hôte (Railway/Fly EU) porte les 3 workers BullMQ + Gotenberg + WeasyPrint + poppler, expose les doc-engines en HTTPS public authentifié, et génère un pack closure complet 100 % dans le cloud (Mac hors boucle) avec un worker recalibré pour la latence cloud — sans jamais dégrader l'OCR en silence.
**Verified:** 2026-07-30
**Status:** gaps_found
**Re-verification:** No — initial verification

> Note d'interprétation : la mention « workers BullMQ » et « Redis » dans le goal/les critères est réévaluée à l'aune de la décision actée D-03 (milestone v6) : Redis VIRÉ partout — closure via Postgres `FOR UPDATE SKIP LOCKED`, crons via `croner`. Le critère « décision Redis tranchée » est satisfait par cette décision architecturale, pas par un Upstash provisionné.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Un pack closure complet se génère de bout en bout avec le worker sur le 3ᵉ hôte et le Mac éteint — 0 stub, contenu Qualiopi conforme, worker recalibré | VERIFIED | `20-SMOKE.md` P4e : ClosureBatch SES-0094 (21 jobs, 3 participants × 7 kinds) claim par le worker Railway (Amsterdam) avec le `dev:full` Mac TUÉ → **21/21 DONE en ~113 s, 0 stub (0/21), 21/21 PDF `%PDF` dans Supabase Storage**. Contenu validé visuellement par Laurent le 2026-07-06 (« Ok on est bons », après fix footers OF_* + prompt positionnement v11). Recalibrage vérifié dans le code : `ecosystem.config.cjs` `QUEUE_CONCURRENCY=3`/`QUEUE_POLL_INTERVAL_MS=3000`, timeout LLM branche cloud = `240_000` ms (`ollama-generators.ts:690` — la branche 600 s est Ollama-only, hors prod). Corroboration indépendante : le même worker a servi les E2E closure Phase 21 (16/16, 89 s, 0 stub). |
| 2 | Un appel Vercel→Gotenberg/WeasyPrint réussit après cold start (endpoint public + Bearer), et le worker joint la base directe (+ Redis → caduc D-03) | VERIFIED | `20-SMOKE.md` P2 : sur les domaines HTTPS publics Railway, `/health`=200 sans auth, POST sans Bearer=**401**, avec Bearer=**200 + PDF réel** (`%PDF-`, proxy 8720 bytes / weasyprint 3455 bytes) — re-vérifié post-migration EU 2026-07-06 ; UAT test 4 = pass (curl 07-07). P4a : round-trip Prisma depuis le conteneur (pooler :6543, `tenant.count`×3 + pg_trgm, 0 prepared-stmt error). Volet Redis réévalué D-03 : 0 Redis vérifié DANS LE CODE ce jour (voir Requirements WORK-02). Le chemin Vercel→engines est en plus prouvé en réel par la Phase 21 (APP-03 complete, 9 PDF synchrones via ingress authentifié). |
| 3 | La décision Redis est tranchée, coût mensuel projeté sous budget, worker stable 24 h | VERIFIED | Décision D-03 actée (Redis viré partout) et **implémentée de bout en bout, vérifiée ce jour par greps** : 0 `bullmq`/`ioredis` dans src+scripts, 0 `REDIS_URL` dans `env.ts`/`turbo.json`/`.env.example`/`package.json`, fichiers queue/redis supprimés. Coût : plan Hobby $5/mo (décision Laurent) vs budget ~20-25 € — sous budget. Stabilité : `20-SMOKE.md` addendum 2026-07-30 (P7b/c) — même déploiement `4f72cfdb` SUCCESS actif depuis le 2026-07-06 (**24 jours**, fenêtre 24 h très largement dépassée), crons vivants au relevé (veille fetched 744/inserted 7, ticks reminders), 0 marqueur restart/exited/SIGTERM/crash dans les logs. Limite honnête consignée : compteur pm2 exact non extractible en CLI ; chiffrage dashboard précis délégué au plan 22-08. |
| 4 | L'OCR/pdftoppm est explicitement tranché et implémenté — aucune dégradation silencieuse du pilier #4 | PARTIAL | Décision D-05 tranchée (rasterisation relocalisée worker) et implémentée pour le chemin PUBLIC : `preinscription-ocr-queue.ts` (claim SKIP LOCKED SUBMITTED→EXTRACTING, filet D-06 lignes 38-44 : échec → SUBMITTED + aiErrorMsg, jamais EXTRACTING bloqué), prouvé E2E smoke P6d (PDF image-only → EXTRACTED via pdftoppm 144dpi + vision Haiku, 0 row stuck). **MAIS gap UAT test 2 (major) toujours ouvert dans le code** : `retriggerExtraction` exécute l'OCR inline sur Vercel (`preinscription-public.ts:132`) — risque EXTRACTED avec cni:null = dégradation silencieuse potentielle ; wizard admin inline (`extract-apprenant-docs.ts:67`) avec hint « brew install poppler » en prod (`pdf-extract.ts:152`) ; legacy `submitPreEnrollmentForm` toujours présent. Plan 20-06 (gap_closure) écrit, NON exécuté (0 SUMMARY, `rasterizeScannedPdf` grep = 0). |

**Score:** 3/4 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/web/scripts/veille-worker.ts` | Entry-point croner lundi 8h Europe/Paris | VERIFIED | 43 lignes. `import '@qualiof/shared/env'` fail-loud (l.16), `new Cron` avec `timezone: 'Europe/Paris'` (l.21-25). Boot prouvé conteneur (P1b) + tick réel relevé 2026-07-30. |
| `apps/web/scripts/invoice-reminder-worker.ts` | Entry-point croner quotidien 8h | VERIFIED | 44 lignes. `new Cron('0 8 * * *', …)`, Europe/Paris. Ticks quotidiens observés dans les logs Railway (UAT test 3 pass). |
| `apps/web/src/lib/preinscription-ocr-queue.ts` | Driver poll SKIP LOCKED + filet D-06 | VERIFIED | 61 lignes. `FOR UPDATE SKIP LOCKED` (l.27), claim SUBMITTED→EXTRACTING, filet échec→SUBMITTED (l.44). Wired : importé par `preinscription-ocr-worker.ts:13`. |
| `apps/web/scripts/preinscription-ocr-worker.ts` | Worker OCR long-vivant | VERIFIED | 43 lignes. env fail-loud, `OCR_CONCURRENCY`/poll, appelle `processNextPreEnrollmentOcr` (l.23). Online en conteneur (P6b) + EXTRACTED réel (P6d). |
| `apps/web/src/lib/closure/queue-postgres.ts` | `enqueueClosureJob` Postgres idempotent, 0 Redis | VERIFIED | 155 lignes. `enqueueClosureJob` = update `status:'QUEUED'` (l.48-52), claim `FOR UPDATE SKIP LOCKED` via `$queryRaw`. Wired : importé par les 3 server actions prod (`closure-pack.ts`, `dispatch-generate-doc.ts`, `prepare-training.ts`) + `requeue.ts`. |
| `docker/worker/Dockerfile` | Multi-stage turbo prune + poppler + pm2 | VERIFIED | 73 lignes. `node:20-slim`, `turbo prune @qualiof/web --docker` (l.27), poppler-utils, prisma generate, pm2-runtime. Build réel Railway SUCCESS, `pdftoppm version 22.12.0` dans le conteneur (P1d). |
| `ecosystem.config.cjs` | 4 apps pm2 + recalibrage cloud | VERIFIED | 79 lignes. Spot-check exécuté ce jour : `node -e require(…)` → `apps pm2: closure,veille,reminders,ocr`. `QUEUE_CONCURRENCY=3`/`QUEUE_POLL_INTERVAL_MS=3000`/`OCR_CONCURRENCY=2`/`OCR_POLL_INTERVAL_MS=5000`. |
| `railway.json` | Builder Dockerfile → worker | VERIFIED | Spot-check ce jour : JSON valide, `builder: DOCKERFILE`, `dockerfilePath: docker/worker/Dockerfile`. |
| `docker/weasyprint/server.py` | Enforcement Bearer Flask conditionnel | VERIFIED | 68 lignes. `@app.before_request` (l.28), `/health` exempté (l.31), 401 si mauvais Bearer (l.37-38), conditionnel `DOC_ENGINE_TOKEN` (l.35). 5 tests pytest + 401/200 prouvés sur HTTPS public (P2d-f). |
| `docker/gotenberg-proxy/Caddyfile` + `Dockerfile` | Proxy Caddy Bearer devant Gotenberg | VERIFIED | 40 + 6 lignes. `@unauthorized not header Authorization "Bearer {$DOC_ENGINE_TOKEN}"` → 401 (l.31-33), `/health` ouvert, `reverse_proxy gotenberg.railway.internal:3000` (l.38). 401/200+PDF prouvés HTTPS public (P2a-c). |
| `apps/web/src/lib/invoice-reminders/invoice-reminder-core.ts` | Cœur neutre worker-safe (fix bug #6) | VERIFIED | 169 lignes. Créé au smoke pour respecter la règle « worker jamais d'imports auth React ». |
| `.planning/…/20-DEPLOY.md` | Runbook Railway non-technicien | VERIFIED | Présent. ⚠ Contient encore l'hypothèse OVH/Pro invalidée au smoke (SMTP réel = Google Workspace, plan retenu = Hobby) et devait être complété avec les 22 vars OF_* (dette notée dans 20-05-SUMMARY). Non bloquant. |
| Fichiers supprimés (purge Redis) | redis.ts, queue.ts ×3, closure-worker.ts absents | VERIFIED | Les 5 fichiers confirmés absents du disque ce jour. Deps `bullmq`/`ioredis` absentes de `package.json` ; `croner@^10.0.1` et `ws@^8.21.0` (polyfill WebSocket Node 20, bug #7) présents. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| Server actions closure (×3) | `queue-postgres.ts` | `enqueueClosureJob` | WIRED | `closure-pack.ts`, `dispatch-generate-doc.ts`, `prepare-training.ts` importent `closure/queue-postgres` (grep ce jour). Prouvé en réel : enqueue SES-0094 → worker Railway claim (P4e). |
| `preinscription-ocr-worker.ts` | `preinscription-ocr-queue.ts` | `processNextPreEnrollmentOcr` | WIRED | Import l.13, appel l.23. Prouvé runtime P6d (SUBMITTED→EXTRACTED sur le conteneur). |
| `confirmPreEnrollmentUpload` | queue OCR worker | laisse la row SUBMITTED (0 déclenchement inline) | WIRED | 20-02 : fire-and-forget retiré de `storage-upload.ts`, test 4 inversé. Chemin public → worker prouvé P6d. |
| Worker Railway | Supabase (pooler :6543) | Prisma `DATABASE_URL` | WIRED | P4a : round-trip ×3 + pg_trgm depuis le conteneur, 0 prepared-stmt error. |
| Worker/Vercel | gotenberg-proxy / weasyprint | Bearer `DOC_ENGINE_TOKEN` (client Phase 17 `authHeaders()`) | WIRED | P2 : 401 sans / 200+`%PDF` avec, sur les 2 engines HTTPS publics ; le 200 proxy prouve la traversée Caddy → Gotenberg privé `railway.internal:3000`. |
| `retry-extraction-button.tsx` | worker Railway | `retriggerExtraction` re-flag SUBMITTED | **NOT_WIRED** | **GAP** : `retriggerExtraction` (`preinscription-public.ts:123`) exécute `extractPreEnrollmentDocuments` inline (l.132) au lieu de re-flaguer SUBMITTED. Cible du plan 20-06 non exécuté. |
| Wizard admin « Créer un apprenant » | OCR capable de rasteriser | `extractApprenantDocs` → `extractDocsFromBuffers` | **PARTIAL** | **GAP** : appel inline sur Vercel (`extract-apprenant-docs.ts:67`) — les images JPEG/PNG passent (vision LLM OK sur Vercel), mais tout PDF scanné échoue (pas de poppler) avec le hint brew. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| Worker closure (pipeline complet) | `ClosureJob` → PDF Supabase | table `ClosureJob` (SKIP LOCKED) → LLM OpenRouter → Gotenberg/WeasyPrint → Storage | Oui — 21/21 PDF réels `%PDF`, contenu validé visuellement (footers 22 OF_*, positionnement v11 varié) | FLOWING |
| Worker OCR | `PreEnrollment.extractedData` | pdftoppm 144dpi → vision Claude Haiku | Oui — champs CNI réels extraits (fictifs RGPD) : BERTRAND-TESTOCR, 1988-03-14, QOF20TEST0094 | FLOWING |
| Crons veille/reminders | ingestion RSS / relances | croner → handlers métier intacts | Oui — relevé 2026-07-30 : veille fetched 744 / classified 48 / inserted 7 ; ticks reminders quotidiens | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Purge BullMQ/Redis effective dans le code | `grep -rc "from 'bullmq'\|from 'ioredis'\|getWorkerRedis" apps/web/src apps/web/scripts` | 0 occurrence | PASS |
| `REDIS_URL` éradiqué | `grep -c REDIS_URL env.ts turbo.json .env.example package.json` | 0 partout | PASS |
| ecosystem pm2 charge 4 apps | `node -e "require('./ecosystem.config.cjs')"` | `closure,veille,reminders,ocr` | PASS |
| railway.json valide | parse JSON | `DOCKERFILE` → `docker/worker/Dockerfile` | PASS |
| Gap 20-06 fermé ? | `grep -rn rasterizeScannedPdf pdf-extract.ts preinscription-extractor.ts` | 0 occurrence — hint brew toujours présent l.152 | **FAIL** (gap confirmé ouvert) |
| Smoke runtime (déjà exécutés, non rejoués) | 20-SMOKE.md P1-P7 + addendum 24 j | tous ✅ (P5 différé) | PASS (evidence documentaire datée) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| WORK-01 | 20-03, 20-04, 20-05 | Image Docker prunée (pm2 × workers, poppler) déployée Railway EU ; Gotenberg + WeasyPrint siblings | SATISFIED | P1 (build SUCCESS, 4 pm2 online restarts=0, pdftoppm 22.12.0) + P2 (Bearer 401/200 + PDF réel sur HTTPS public, 2 engines, re-vérifié EU). Région `europe-west4-drams3a` re-vérifiée sur les 4 services. Artefacts vérifiés sur disque ce jour. |
| WORK-02 | 20-01, 20-04, 20-05 | Décision Redis tranchée (réévaluée D-03 : Redis viré) sur observation | SATISFIED | D-03 implémentée et prouvée code (0 bullmq/ioredis/REDIS_URL ce jour) + crons croner enregistrés et VIVANTS 24 jours après (relevé 2026-07-30). Coût Hobby $5/mo sous budget. |
| WORK-03 | 20-04, 20-05 | Pack closure 100 % cloud Mac éteint, worker recalibré | SATISFIED | P4e : 21/21 DONE ~113 s, 0 stub, Mac worker OFF ; recalibrage vérifié code (concurrency 3 / poll 3 s / timeout cloud 240 s). Validation visuelle Laurent 2026-07-06. ⚠ Bookkeeping : la case WORK-03 dans REQUIREMENTS.md est encore `[ ]`/Pending — à cocher à la clôture (l'évidence est complète). |
| WORK-04 | 20-02, 20-05, (20-06 pending) | Décision pdftoppm/OCR tranchée et implémentée, pas de dégradation silencieuse | **PARTIAL** | Chemin public relocalisé worker + prouvé P6d + filet D-06 vérifié code. MAIS 2 chemins inline Vercel résiduels (retriggerExtraction, wizard admin) confirmés dans le code ce jour — gap UAT major, plan 20-06 écrit non exécuté. |

Aucun requirement ORPHANED : les 4 IDs mappés à la Phase 20 dans REQUIREMENTS.md sont tous revendiqués par les plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/web/src/lib/pdf-extract.ts` | 152 | Message utilisateur prod avec hint dev macOS (« installer poppler-utils via brew install poppler ») | ⚠️ Warning (🛑 dans le contexte du gap WORK-04) | Affiché tel quel dans le wizard admin sur Vercel — message absurde pour l'utilisateur, symptôme du chemin inline non relocalisé. Cible 20-06. |
| `apps/web/src/server/actions/preinscription-public.ts` | 111, 132 | Fire-and-forget OCR inline (`.catch(console.error)`) sur runtime sans poppler | 🛑 Blocker (pour la truth 4) | `retriggerExtraction` peut produire EXTRACTED dégradé / voler le job au worker ; `submitPreEnrollmentForm` legacy mort-mais-exporté. Cible 20-06. |
| `20-DEPLOY.md` | — | Hypothèses périmées (OVH, plan Pro, 22 vars OF_* absentes) vs réalité déployée | ℹ️ Info | Runbook à rafraîchir (dette notée 20-05-SUMMARY) — sans impact runtime. |
| Flux RSS veille | — | 2 sources en échec géré (travail-emploi.gouv.fr entité invalide, service-public.gouv.fr 404) | ℹ️ Info | Le catch croner fonctionne comme conçu ; sources à rafraîchir (dette cosmétique). |

Aucun TODO/FIXME/placeholder dans les artefacts livrés par la phase (grep = 0).

### Human Verification Required

Aucune en attente : le phase gate visuel a déjà été passé par Laurent le 2026-07-06 (« Ok on est bons » — pack témoin SES-0094 + OCR CNI, consigné 20-SMOKE.md), et le relevé 24 h a été clôturé le 2026-07-30 (24 jours d'observation).

### Dettes assumées (hors gate — ne bloquent pas la phase)

- **P5 egress SMTP différé** (décision Laurent, plan Hobby bloque :465/:587) — mailer en dry-run ; options documentées (Pro + Gmail app password OU API HTTPS Brevo/Gmail). Coquille `SMTP_FROM=noreply@startacademy.fr` à corriger au traitement P5.
- **3 corrections cosmétiques fiche AGEFICE** (deferred-items.md, décision Laurent 2026-07-06).
- **Flakiness test pré-existante** `invoice-reminders/__tests__/worker.test.ts` en suite parallèle (antérieure, hors scope).
- **`ClosureBatch.doneDocs` double-compté après re-run** (42/21 → statut PARTIAL affiché à tort) — cosmétique UI.
- **Nettoyage PreEnrollment `TEST-OCR-P6D-…`** — destructif = étape séparée gatée Laurent.
- L'item storage MinIO→Supabase est **RÉSOLU** (plan 21-02, re-vérifié 902/902 le 2026-07-06).

### Gaps Summary

La phase atteint son goal sur 3 critères sur 4, avec des preuves runtime datées solides (smokes P1-P7 contre l'infra Railway réelle, validation visuelle Laurent, 24 jours de stabilité observée, et corroboration indépendante par les E2E de la Phase 21 servis par ce même worker).

Le seul gap bloquant la clôture concerne la truth 4 (WORK-04, pilier #4) : le plan 20-02 n'a relocalisé vers le worker Railway QUE le chemin public `confirmPreEnrollmentUpload`. L'UAT (test 2, major, root cause prouvée dans `.planning/debug/uat20-ocr-pdftoppm-cni.md`) a identifié 2 chemins OCR inline résiduels sur Vercel — vérifiés TOUJOURS PRÉSENTS dans le code ce jour : `retriggerExtraction` (risque d'EXTRACTED dégradé silencieux + vol de job) et le wizard admin (échec de rasterisation avec hint brew absurde). Le plan de gap closure **20-06 est déjà écrit** (must_haves précis, TDD) mais n'a pas été exécuté. La fermeture du gap = exécuter 20-06 (`/gsd:execute-phase 20` reprendra le plan restant), puis re-vérifier.

---

_Verified: 2026-07-30_
_Verifier: Claude (gsd-verifier)_
