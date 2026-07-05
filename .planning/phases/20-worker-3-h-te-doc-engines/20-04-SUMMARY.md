---
phase: 20-worker-3-h-te-doc-engines
plan: 04
subsystem: infra-worker-conteneurisation
tags: [docker, pm2, turbo-prune, railway, bullmq-purge, redis-removal, poppler, runbook]
requires:
  - "20-01 (workers cron croner veille/relances)"
  - "20-02 (worker OCR pré-inscription poll)"
  - "20-03 (Bearer doc-engines WeasyPrint + proxy Caddy Gotenberg)"
  - "19 (Supabase pooler :6543 / direct :5432 câblés)"
provides:
  - "Image Docker worker monorepo prunée (turbo prune @qualiof/web) + poppler + pm2-runtime x4"
  - "ecosystem.config.cjs (4 workers pm2 + recalibrage cloud env)"
  - "railway.json (builder Dockerfile → worker)"
  - "0 dépendance/fichier BullMQ/ioredis (0 connexion Redis fantôme au boot)"
  - "queue-postgres.enqueueClosureJob (INSERT/reset QUEUED idempotent, sans Redis)"
  - "20-DEPLOY.md (runbook provisioning Railway pour non-technicien)"
affects:
  - "closure server actions (closure-pack, dispatch-generate-doc, prepare-training)"
  - "closure/worker.ts (retrait Worker BullMQ, garde processClosureJobPayload)"
  - "docker-compose.yml (service redis + volume supprimés)"
  - "packages/shared/src/env.ts, turbo.json, .env.example (REDIS_URL retiré)"
tech-stack:
  added:
    - "pm2 (pm2-runtime, superviseur PID-1 conteneur des 4 workers)"
    - "poppler-utils (apt, pdftoppm OCR — installé dans l'image)"
  removed:
    - "bullmq ^5.76.4"
    - "ioredis ^5.10.1"
  patterns:
    - "Dockerfile multi-stage turbo prune (pruner/installer/runner) node:20-slim glibc"
    - "File Postgres = table ClosureJob (SKIP LOCKED), enqueue = INSERT idempotent, 0 broker"
key-files:
  created:
    - "docker/worker/Dockerfile"
    - "ecosystem.config.cjs"
    - "railway.json"
    - ".planning/phases/20-worker-3-h-te-doc-engines/20-DEPLOY.md"
  modified:
    - "apps/web/src/lib/closure/queue-postgres.ts"
    - "apps/web/src/lib/closure/worker.ts"
    - "apps/web/src/lib/closure/requeue.ts"
    - "apps/web/src/server/actions/closure-pack.ts"
    - "apps/web/src/server/actions/dispatch-generate-doc.ts"
    - "apps/web/src/server/actions/prepare-training.ts"
    - "apps/web/package.json"
    - "packages/shared/src/env.ts"
    - "turbo.json"
    - ".env.example"
    - "docker-compose.yml"
  deleted:
    - "apps/web/src/lib/closure/redis.ts"
    - "apps/web/src/lib/closure/queue.ts"
    - "apps/web/src/lib/veille/queue.ts"
    - "apps/web/src/lib/invoice-reminders/queue.ts"
    - "apps/web/scripts/closure-worker.ts"
    - "apps/web/src/lib/veille/__tests__/worker.cron.test.ts"
key-decisions:
  - "enqueueClosureJob reste vivant mais devient Postgres (reset QUEUED idempotent) au lieu d'un no-op supprimé — préserve tous les call-sites (server actions + scripts + requeue) sans changer la sémantique SKIP LOCKED"
  - "queue.ts BullMQ NON dead (utilisé par 3 server actions prod + requeue + scripts) : l'interface du plan était factuellement inexacte → migration en profondeur plutôt que simple suppression"
  - "test cron BullMQ veille obsolète supprimé (couvert par cron-workers.test.ts en croner depuis 20-01) plutôt que réécrit"
requirements: [WORK-01, WORK-03]
duration: 27 min
completed: 2026-07-05
---

# Phase 20 Plan 04 : Conteneurisation worker + purge BullMQ + runbook Railway Summary

Image Docker monorepo prunée (`turbo prune @qualiof/web`) embarquant poppler-utils et pilotée par `pm2-runtime` pour lancer les 4 workers de fond (closure Postgres SKIP LOCKED, veille croner, relances croner, OCR poll), avec retrait complet de BullMQ/ioredis (0 connexion Redis fantôme au boot), recalibrage cloud encodé en variables pm2, et runbook de provisioning Railway lisible par un non-technicien.

**Durée :** 27 min · **Tâches :** 3/3 · **Fichiers :** 33 touchés (4 créés, 12 modifiés, 6 supprimés + lockfile/artefacts) · **Branche :** cloud-migration

## Ce qui a été fait

### Task 1 — Purge BullMQ/Redis mort (0 Redis fantôme au boot) · `199e3a4`
- **Supprimés** : `closure/redis.ts`, `closure/queue.ts`, `veille/queue.ts`, `invoice-reminders/queue.ts`, `scripts/closure-worker.ts`.
- **`enqueueClosureJob` déplacé dans `queue-postgres.ts`** : devient un `prisma.closureJob.update({ status: 'QUEUED', startedAt/completedAt/errorMessage: null })` idempotent (la file EST la table `ClosureJob` ; le worker Postgres reprend au prochain poll `FOR UPDATE SKIP LOCKED`). Aucune connexion Redis.
- **`worker.ts`** : retrait de `startClosureWorker`, du `Worker` BullMQ, de `getWorkerRedis` et de l'import `CLOSURE_QUEUE_NAME` ; **`processClosureJobPayload` conservé intact** (cœur métier partagé par le worker Postgres et les scripts de régénération).
- **`requeue.ts`** : import repointé sur `queue-postgres`, sémantique adaptée (reset QUEUED propre sans Redis).
- **Server actions repointées** (`closure-pack`, `dispatch-generate-doc`, `prepare-training`) + 8 scripts de régénération `closure/queue → closure/queue-postgres`. La branche BullMQ `getClosureQueue().getJob().remove()` de la relance closure supprimée (re-enqueue Postgres idempotent suffit).
- **Deps `bullmq`/`ioredis` retirées** (`pnpm remove`), service `redis` + volume `redis_data` retirés de `docker-compose.yml`, `REDIS_URL` retiré de `packages/shared/src/env.ts` (schema + runtimeEnv), `turbo.json` globalEnv, `.env.example`.
- **Scripts pnpm** : `worker:closure` (BullMQ) supprimé ; `dev:full`/`dev:full:reminders` repointés sur `worker:closure:pg`.
- **Preuves** : `tsc --noEmit` exit 0 (web + shared) ; suite Vitest **1166/1166 verte** (1169 - 3 tests du `worker.cron.test.ts` BullMQ obsolète supprimé) ; `grep -c bullmq/ioredis` package.json = 0 ; `grep from 'bullmq'|getWorkerRedis` src+scripts = 0 ; `REDIS_URL` = 0 dans tous les fichiers tracés.

### Task 2 — Dockerfile worker + ecosystem pm2 + railway.json · `0630c29`
- **`docker/worker/Dockerfile`** multi-stage `node:20-slim` (glibc, Pitfall 5 — binaire Prisma matche la libc du runner) : stage `pruner` (`turbo prune @qualiof/web --docker`), stage `installer` (`pnpm install --frozen-lockfile` + `prisma generate`), stage `runner` (`apt install poppler-utils` + `pnpm add -g pm2` + `CMD pm2-runtime ecosystem.config.cjs`). Pas de `next build` (tsx exécute les .ts).
- **`ecosystem.config.cjs`** (racine) : 4 apps pm2 (`closure`/`veille`/`reminders`/`ocr`) `interpreter: tsx`, `autorestart`, recalibrage cloud WORK-03 en env (`QUEUE_CONCURRENCY=3`/`QUEUE_POLL_INTERVAL_MS=3000`, `OCR_CONCURRENCY=2`/`OCR_POLL_INTERVAL_MS=5000`), surchargeable par les variables de service Railway. Fallback `interpreter` documenté en commentaire.
- **`railway.json`** : `builder: DOCKERFILE` → `docker/worker/Dockerfile`, `restartPolicyType: ON_FAILURE` max 10.
- **Preuves** : `ecosystem.config.cjs` charge sans erreur et liste 4 apps ; `railway.json` JSON valide ; tous les greps d'acceptance = attendu (turbo prune=1, poppler-utils=1, prisma generate=1, pm2-runtime=1, closure-worker-postgres=1, preinscription-ocr-worker=1, dockerfilePath=1).

### Task 3 — Runbook Railway (20-DEPLOY.md) + .env.example · `ea8ec1e`
- **`20-DEPLOY.md`** orienté non-technicien (dashboard, zéro CLI) : §Compte+région (Pro obligatoire pour egress SMTP :465, `europe-west4`, checklist anti-défaut-US), §3 services (worker privé + gotenberg-proxy public + weasyprint public + Gotenberg privé `railway.internal:3000`), §~15 variables worker (tableau nom/source/secret, 5 secrets chiffrés), §variables doc-engines, §preuves 20-05 (Mac éteint, OCR PDF scanné, egress :465, HTTPS Bearer, stabilité 24 h + budget ~20-25 €).
- **`.env.example`** : bloc workers cloud (`QUEUE_*`/`OCR_*` surchargeables), commentaires `GOTENBERG_URL`/`WEASYPRINT_URL` (URLs Railway internes/publiques), note SMTP OVH :465 egress Pro, `DOC_ENGINE_TOKEN` partagé.
- **Preuves** : greps d'acceptance verts (europe-west4≥1, DOC_ENGINE_TOKEN≥1, Pro≥1, 3 services couverts, ≥8 variables, 465/SMTP_SECURE≥1, 24h/budget≥1) ; `REDIS_URL`=0 et `OCR_CONCURRENCY|OCR_POLL_INTERVAL_MS`≥1 dans `.env.example`.

## Deviations from Plan

### Auto-fixed / auto-adapted

**1. [Rule 3 - Blocking] `closure/queue.ts` n'était PAS du code mort — migration en profondeur requise**
- **Trouvé pendant :** Task 1, étape 1 (grep pré-suppression).
- **Problème :** l'interface du plan affirmait `closure/queue.ts` mort (« NE PAS supprimer closure/worker.ts, seulement redis.ts/queue.ts »). Le grep a révélé que `queue.ts` (`enqueueClosureJob`/`getClosureQueue`) est **importé par 3 server actions PROD** (`closure-pack`, `dispatch-generate-doc`, `prepare-training`), par `closure/requeue.ts`, par `closure/worker.ts` (`CLOSURE_QUEUE_NAME`) et par 8 scripts. Le supprimer sèchement cassait le boot du worker et les server actions (Rule 3 blocking) et la cible « 0 Redis fantôme » (les `enqueueClosureJob` ouvraient une connexion ioredis au call).
- **Correctif :** au lieu de supprimer la fonction, `enqueueClosureJob` a été **redéfinie côté Postgres** (`queue-postgres.ts`, INSERT/reset QUEUED idempotent, 0 Redis) et tous les call-sites repointés. `worker.ts` a perdu son `Worker`/`getWorkerRedis`/`startClosureWorker` mais garde `processClosureJobPayload`. La table `ClosureJob` (déjà INSERTée par les server actions) reste la source de vérité que le worker Postgres consomme via SKIP LOCKED — la sémantique métier est **strictement préservée**.
- **Fichiers :** `queue-postgres.ts`, `worker.ts`, `requeue.ts`, `closure-pack.ts`, `dispatch-generate-doc.ts`, `prepare-training.ts`, 8 scripts.
- **Vérification :** tsc exit 0, 1166/1166 tests verts.
- **Commit :** `199e3a4`.

**2. [Rule 3 - Blocking] Tests couplés aux modules supprimés**
- **Trouvé pendant :** Task 1.
- **Problème :** `veille/__tests__/worker.cron.test.ts` testait `scheduleWeeklyVeille` (BullMQ, désormais supprimée — le cron veille est passé à croner en 20-01, testé dans `scripts/__tests__/cron-workers.test.ts`) ; `closure/__tests__/{single-participant,worker-idempotent-document,requeue}.test.ts` mockaient `../queue`/`../redis` (chemins supprimés).
- **Correctif :** `worker.cron.test.ts` **supprimé** (obsolète, non réécrit — la couverture croner existe déjà) ; les 3 mocks repointés sur `../queue-postgres` (et le mock `../redis` retiré de `worker-idempotent-document.test.ts` car `worker.ts` n'importe plus Redis).
- **Vérification :** suite verte.
- **Commit :** `199e3a4`.

**3. [Rule 2 - Missing Critical] REDIS_URL retiré du schema env + docker-compose (au-delà de .env.example/turbo.json listés)**
- **Trouvé pendant :** Task 1, étape 5.
- **Problème :** le plan listait le retrait de `REDIS_URL` dans `.env.example` et `turbo.json` mais pas dans `packages/shared/src/env.ts` (schema + runtimeEnv), ni le service `redis`/volume `redis_data` dans `docker-compose.yml`. Laisser la clé dans le schéma env maintient Redis « annoncé » (contre la cible « 0 Redis fantôme ») et le service Docker local est mort.
- **Correctif :** `REDIS_URL` retiré de `env.ts` (2 endroits), service `redis` + volume supprimés de `docker-compose.yml`.
- **Vérification :** shared tsc exit 0 ; `REDIS_URL`=0 dans tous les fichiers tracés.
- **Commit :** `199e3a4`.

**Total : 3 déviations auto-appliquées (2 Rule 3, 1 Rule 2). Impact : positif — la cible « 0 connexion Redis fantôme au boot » est atteinte de bout en bout (code + config + Docker + schema env), et la sémantique closure est préservée sans régression (1166/1166 tests).**

## Requirements — état honnête

- **WORK-01** (image Docker + déploiement Railway) : **partie CODE/CONFIG livrée** (Dockerfile + ecosystem + railway.json + purge BullMQ). Le **build Docker réel + déploiement Railway + `pdftoppm -v` dans le conteneur** = plan **20-05**. Non marqué complet ici (runtime non prouvé).
- **WORK-03** (recalibrage) : **recalibrage encodé** (concurrency/poll en env pm2, surchargeable Railway). La preuve « pack closure 100 % cloud, Mac éteint » = plan **20-05**. Non marqué complet ici.
- → `requirements mark-complete` **volontairement NON appelé** : les deux exigences exigent la preuve runtime de 20-05. Ce plan livre et valide la config/le code.

## Issues Encountered

None — les 3 tâches passent leurs vérifications ; aucun blocage non résolu.

## Next Phase Readiness

Prêt pour **20-05** (déploiement Railway réel + preuves) : image worker définie, ecosystem pm2 x4, railway.json, doc-engines Bearer (20-03), runbook complet. Le build Docker et les 5 preuves (Mac éteint / OCR poppler / SMTP :465 / HTTPS Bearer / stabilité 24 h + budget) restent à exécuter au dashboard Railway par Laurent, guidés par `20-DEPLOY.md`.

## Self-Check: PASSED

- Created files verified on disk: docker/worker/Dockerfile, ecosystem.config.cjs, railway.json, 20-DEPLOY.md, queue-postgres.ts
- Deleted files confirmed gone: closure/redis.ts, closure/queue.ts (+ veille/queue.ts, invoice-reminders/queue.ts, scripts/closure-worker.ts)
- Commits verified in git log: 199e3a4 (Task 1), 0630c29 (Task 2), ea8ec1e (Task 3)
