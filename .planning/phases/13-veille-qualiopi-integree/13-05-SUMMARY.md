---
phase: 13-veille-qualiopi-integree
plan: 05
subsystem: worker
tags: [bullmq, ollama, rss, cron, audit-log, worker-safety, multi-tenant]

# Dependency graph
requires:
  - phase: 13-01
    provides: logRegulatoryWatchEvent helper + convention regulatoryWatch.* (8 verbes documentés)
  - phase: 11-factures
    provides: invoice-reminders/queue.ts + worker.ts + scripts/invoice-reminder-worker.ts clone-target BullMQ cron
  - phase: 2.2-closure
    provides: closure/redis.ts (getQueueRedis/getWorkerRedis singleton), ai-ollama.ts callOllama
provides:
  - "Worker BullMQ veille — cron hebdo lundi 8h Europe/Paris (jobId fixe weekly-veille-cron, idempotent)"
  - "ingestRssOnceForTenant(tenantId) — fn pure pour worker process (worker safety pattern, 0 import React/auth)"
  - "12 sources RSS seed (3 par thème INDIC_23/24/25/26)"
  - "Ollama classifier mistral-small:24b figé + Zod schema strict + 4 guard-rails AIGenerationJob"
  - "persistAutoSuggestion — dedup (tenantId, url, theme) D-11 + INSERT status='DRAFT' suggestedBy='AUTO' D-08 + AuditLog regulatoryWatch.auto_inserted actorUserId=null"
  - "3 scripts pnpm entrypoint : worker:veille (cron), test:veille (dry-run), probe:veille (HEAD 12 URLs)"
  - "AuditLog convention regulatoryWatch.* COMPLETE — 8e et dernier verbe `auto_inserted` instancié"
affects:
  - 13-06 (smoke réel : dry-run + probe-sources + cron live à vérifier)

# Tech tracking
tech-stack:
  added:
    - rss-parser ^3.13.0 (npm RSS/Atom/RDF parser, MIT)
  patterns:
    - "Worker safety pattern instancié (mémoire feedback_worker_no_react_imports.md) : lib/veille/core.ts + dépendances 0 imports interdits → consommable depuis tsx sans crash react cache"
    - "BullMQ cron hebdo (extension du pattern Phase 11 daily) : repeat pattern '0 8 * * 1' tz Europe/Paris jobId 'weekly-veille-cron'"
    - "AIGenerationJob multi-status : ok / error / skipped_other (D-06 modèle figé mistral-small:24b)"
    - "vi.hoisted() pour mocks Vitest référencés dans factories vi.mock (hoisting ordering issue)"

key-files:
  created:
    - apps/web/src/lib/veille/sources.ts (12 RSS seed, 43 LOC)
    - apps/web/src/lib/veille/prompts.ts (PROMPT_VERSION + SYSTEM_PROMPT + buildUserPrompt + Zod, 60 LOC)
    - apps/web/src/lib/veille/fetch-rss.ts (rss-parser wrapper fault-tolerant, 45 LOC)
    - apps/web/src/lib/veille/classify.ts (Ollama mistral-small:24b + Zod + AIGenerationJob, 119 LOC)
    - apps/web/src/lib/veille/persist.ts (dedup D-11 + INSERT DRAFT/AUTO D-08 + AuditLog auto_inserted, 100 LOC)
    - apps/web/src/lib/veille/core.ts (ingestRssOnceForTenant — fn pure pour worker, 103 LOC)
    - apps/web/src/lib/veille/queue.ts (BullMQ Queue + scheduleWeeklyVeille cron, 58 LOC)
    - apps/web/src/lib/veille/worker.ts (startVeilleWorker + processVeilleJob multi-tenant, 74 LOC)
    - apps/web/scripts/veille-worker.ts (entrypoint process + mode dégradé Redis, 46 LOC)
    - apps/web/scripts/test-veille-worker.ts (dry-run ingestRssOnceForTenant, 41 LOC)
    - apps/web/scripts/probe-veille-sources.ts (HEAD probe 12 URLs, 62 LOC)
    - apps/web/src/lib/veille/__tests__/fetch-rss.test.ts (3 tests)
    - apps/web/src/lib/veille/__tests__/classify.test.ts (4 tests)
    - apps/web/src/lib/veille/__tests__/dedup-by-url.test.ts (3 tests)
    - apps/web/src/lib/veille/__tests__/persist.audit.test.ts (3 tests)
    - apps/web/src/lib/veille/__tests__/worker.cron.test.ts (3 tests)
  modified:
    - apps/web/package.json (3 nouveaux scripts pnpm : worker:veille, test:veille, probe:veille + rss-parser ^3.13.0)
    - pnpm-lock.yaml (rss-parser resolution)

key-decisions:
  - "Modèle Ollama hardcodé `mistral-small:24b` (D-06 figé), pas de switch dynamique vers qwen3:30b-a3b."
  - "Multi-tenant : worker itère sur prisma.tenant.findMany() — prêt pour multi-OF même si Start Academy est mono-tenant en V1."
  - "Cap 5 items/source pour ne pas saturer Ollama (12 sources × 5 = 60 calls max ~10 min)."
  - "Cron pattern `'0 8 * * 1'` (lundi 8h) tz Europe/Paris jobId fixe `'weekly-veille-cron'` (idempotence native BullMQ)."
  - "Worker concurrency=1 — ingestion séquentielle pour éviter saturation GPU local Ollama."
  - "Pas d'intégration au `dev:full` par défaut (Ollama mistral-small:24b consomme du GPU). User lance `pnpm worker:veille` séparément."
  - "Schéma AIGenerationJob requiert `inputHash` + `refTable` NOT NULL — inputHash calculé sha256(title::snippet::source).slice(0,32), refTable='RegulatoryWatch'."
  - "Le helper logRegulatoryWatchEvent du Plan 01 est utilisé tel quel (worker safe par construction)."

patterns-established:
  - "Worker safety pattern instancié (1ère vraie application pratique de feedback_worker_no_react_imports.md depuis sa découverte)."
  - "Convention AuditLog regulatoryWatch.* COMPLÈTE — 8/8 verbes instanciés à travers Phase 13 (created/updated/exploitation_updated/approved/rejected/archived/auto_inserted/exported)."

requirements-completed: [VEILLE-04]

# Metrics
duration: 7.5min
completed: 2026-05-25
---

# Phase 13 Plan 13-05 — Worker BullMQ cron hebdo RSS+Ollama Summary

**Worker BullMQ veille livré (VEILLE-04) : cron hebdo lundi 8h Europe/Paris, agrégation RSS 12 sources × 5 items × N tenants, classification Ollama mistral-small:24b, INSERT DRAFT/AUTO traçabilité humaine via inbox (Plan 03) — 16 tests Wave 0 verts, worker safety pattern instancié, AuditLog convention `regulatoryWatch.*` COMPLÈTE (8/8 verbes).**

## Performance

- **Duration:** 7.5 min (atomique)
- **Started:** 2026-05-25T12:27:12Z
- **Completed:** 2026-05-25T12:34:45Z
- **Tasks:** 3 (Task 0 Wave 0 + Task 1 modules core + Task 2 worker BullMQ)
- **Files created:** 16 (8 modules `lib/veille/*` + 3 scripts + 5 tests)
- **Files modified:** 2 (apps/web/package.json + pnpm-lock.yaml)
- **Tests:** 675/675 verts (86 test files), zéro régression apps/web

## Accomplishments

### 8 modules `lib/veille/*` (worker safe)

1. **sources.ts** (43 LOC) — 12 sources RSS seed (3 par thème INDIC_23/24/25/26). D-05 verbatim de RESEARCH §4.1.
2. **prompts.ts** (60 LOC) — `PROMPT_VERSION_VEILLE='veille-classify-v1-2026-05-25'`, `SYSTEM_PROMPT_VEILLE_CLASSIFY`, `buildVeilleClassifyUserPrompt`, `VeilleClassifyOutputSchema` Zod (theme enum + confidence 0-100 + exploitation 10-500 chars).
3. **fetch-rss.ts** (45 LOC) — Wrapper `rss-parser` fault-tolerant (timeout 15s, 404/network/XML invalid → `[]` + console.warn, jamais throw). Filtre items sans title ou sans link.
4. **classify.ts** (119 LOC) — `classifyItem(input, tenantId)` → Ollama `mistral-small:24b` (D-06 figé) + Zod validation + 4 guard-rails AIGenerationJob (ok / error / skipped_other). `inputHash` sha256(title::snippet::source) pour traçabilité audit.
5. **persist.ts** (100 LOC) — `persistAutoSuggestion` : skip OTHER → skip confidence < 50 → dédup `(tenantId, url, theme)` D-11 → INSERT `status='DRAFT' suggestedBy='AUTO'` D-08 → AuditLog `regulatoryWatch.auto_inserted` `actorUserId=null` (system worker).
6. **core.ts** (103 LOC) — `ingestRssOnceForTenant(tenantId)` itère sources actives × max 5 items, retourne `IngestResult { fetched, classified, skipped, inserted, errors }`. Erreur isolée par item ne casse pas l'ingestion globale.
7. **queue.ts** (58 LOC) — `getVeilleQueue()` singleton + `scheduleWeeklyVeille()` `repeat: { pattern: '0 8 * * 1', tz: 'Europe/Paris' }` `jobId: 'weekly-veille-cron'`.
8. **worker.ts** (74 LOC) — `startVeilleWorker()` + `processVeilleJob` multi-tenant (`prisma.tenant.findMany` puis itère). Concurrency=1 (ingestion séquentielle pour ne pas saturer Ollama).

### 3 scripts entrypoint

- **`scripts/veille-worker.ts`** (46 LOC) — Boot worker + scheduleWeeklyVeille + signaux SIGINT/SIGTERM + mode dégradé Redis (setInterval keepalive si Redis indispo).
- **`scripts/test-veille-worker.ts`** (41 LOC) — Dry-run `ingestRssOnceForTenant` pour le 1er tenant (sans BullMQ donc sans Redis).
- **`scripts/probe-veille-sources.ts`** (62 LOC) — HEAD probe des 12 URLs avec content-type check (xml/rss/atom). Exit 1 si < 10/12 OK.

### Commandes pnpm ajoutées

```bash
pnpm --filter @qualiof/web worker:veille    # cron daemon
pnpm --filter @qualiof/web test:veille      # dry-run
pnpm --filter @qualiof/web probe:veille     # health-check 12 URLs
```

### Worker safety vérifié

```bash
grep -rE "(server/actions|/rbac|validateRequest|requireRole|from ['\"]react|from ['\"]next/cache)" \
  apps/web/src/lib/veille/ apps/web/scripts/veille-worker.ts apps/web/scripts/test-veille-worker.ts \
  --include='*.ts' | grep -v '__tests__' | grep -v '^[^:]*:\s*\*'
# returns 0 matches → worker process safe (pas de crash 'react cache' au boot tsx)
```

### Tests Wave 0 (16 it blocks GREEN)

- `fetch-rss.test.ts` : 3 tests (feed valide / 404 / items invalides filtrés)
- `classify.test.ts` : 4 tests (Ollama JSON valide / malformé / OTHER / timeout)
- `dedup-by-url.test.ts` : 3 tests (dedup D-11 (url, theme), INSERT same URL différent theme, INSERT URL différente)
- `persist.audit.test.ts` : 3 tests (DRAFT/AUTO D-08, AuditLog auto_inserted actorUserId=null, OTHER skip)
- `worker.cron.test.ts` : 3 tests (pattern '0 8 * * 1', tz Europe/Paris, jobId 'weekly-veille-cron')

## Task Commits

1. **Task 0 (Wave 0): rss-parser install + 5 tests RED** — `9057678` (test) — 7 fichiers, 546 insertions
2. **Task 1: lib/veille core modules (sources, prompts, fetch-rss, classify, persist)** — `78f5fe5` (feat) — 5 modules + 4 tests vi.hoisted fix
3. **Task 2: BullMQ cron veille worker + 3 entrypoint scripts** — `c8679ac` (feat) — 3 modules + 3 scripts + package.json scripts

## Files Created/Modified

### Created (16 files)
- `apps/web/src/lib/veille/sources.ts`
- `apps/web/src/lib/veille/prompts.ts`
- `apps/web/src/lib/veille/fetch-rss.ts`
- `apps/web/src/lib/veille/classify.ts`
- `apps/web/src/lib/veille/persist.ts`
- `apps/web/src/lib/veille/core.ts`
- `apps/web/src/lib/veille/queue.ts`
- `apps/web/src/lib/veille/worker.ts`
- `apps/web/scripts/veille-worker.ts`
- `apps/web/scripts/test-veille-worker.ts`
- `apps/web/scripts/probe-veille-sources.ts`
- `apps/web/src/lib/veille/__tests__/fetch-rss.test.ts`
- `apps/web/src/lib/veille/__tests__/classify.test.ts`
- `apps/web/src/lib/veille/__tests__/dedup-by-url.test.ts`
- `apps/web/src/lib/veille/__tests__/persist.audit.test.ts`
- `apps/web/src/lib/veille/__tests__/worker.cron.test.ts`

### Modified (2 files)
- `apps/web/package.json` — `+rss-parser ^3.13.0` + 3 scripts pnpm (worker:veille, test:veille, probe:veille)
- `pnpm-lock.yaml` — rss-parser resolution

## Decisions Made

- **D-06 figé `mistral-small:24b`** dans `classify.ts` : `const OLLAMA_MODEL_VEILLE = 'mistral-small:24b' as const`. Si on évolue vers qwen3:30b-a3b plus tard, bumper `PROMPT_VERSION_VEILLE` + tracer dans AIGenerationJob.
- **Cap 5 items/source** dans `core.ts` : 12 sources × 5 items × ~5-10s/item Ollama = ~5-10 min de cron hebdo. Acceptable. Si on monte à 10 items/source → 20 min.
- **Worker concurrency=1** : ingestion séquentielle pour ne pas saturer le GPU local. À monter à 3 si on bascule sur Claude API plus tard (parallélisme cloud).
- **Multi-tenant via `prisma.tenant.findMany`** : prêt pour multi-OF même si Start Academy est mono-tenant en V1. Pas de tenant hardcodé.
- **Schéma AIGenerationJob respecté** : `inputHash` (sha256 32-char), `refTable='RegulatoryWatch'`, `errorMsg` (pas `errorMessage`), `status` String libre. Pas de migration nécessaire (l'enum status n'existe pas, c'est déjà un String).
- **Mode dégradé Redis dans `scripts/veille-worker.ts`** : `setInterval(() => {}, 60_000)` keepalive si Redis indispo — pattern Phase 11 invoice-reminder-worker.ts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Vitest `vi.mock` hoisting issue (4 tests files)**
- **Found during:** Premier run des tests Task 1 après création des modules
- **Issue:** `vi.mock('module', () => ({ method: localConst }))` levait `ReferenceError: Cannot access 'localConst' before initialization` car les factories `vi.mock` sont hoistées au sommet du module mais les `const` ne le sont pas.
- **Fix:** Migration vers `vi.hoisted(() => ({ ... }))` qui co-hoiste les mocks avec les factories. Pattern appliqué dans 4 fichiers tests : fetch-rss / classify / dedup-by-url / persist.audit.
- **Files modified:** 4 fichiers tests (édition inline)
- **Verification:** 13 tests Task 1 verts.
- **Committed in:** `78f5fe5` (les corrections sont dans le même commit que les modules core).

**2. [Rule 2 - Critical] AIGenerationJob model requires NOT NULL fields `inputHash` and `refTable`**
- **Found during:** Lecture du schema.prisma pour valider la signature de `prisma.aIGenerationJob.create`
- **Issue:** Le plan suggérait un payload minimal `{ tenantId, provider, model, promptVersion, status, latencyMs, errorMessage }` mais le model exige `inputHash` (NOT NULL) et `refTable` (NOT NULL). Champ d'erreur est `errorMsg` (pas `errorMessage`).
- **Fix:** Ajout de `inputHash = sha256(title::snippet::source).slice(0,32)` calculé en début de `classifyItem`. `refTable: 'RegulatoryWatch'` hardcodé (le worker ne génère que pour cette entité). `errorMessage` → `errorMsg`.
- **Files modified:** `apps/web/src/lib/veille/classify.ts`
- **Verification:** `pnpm tsc --noEmit -p apps/web/tsconfig.json` clean.
- **Committed in:** `78f5fe5` (inclus dans le commit Task 1).

**Total deviations:** 2 auto-fixed (1 test infrastructure, 1 type/schema compliance). Aucun scope creep.

## Issues Encountered

- **Probe HEAD non exécuté en local** : le script `probe:veille` est créé mais non lancé (smoke manuel Plan 06). Risque connu : certaines URLs sources peuvent être obsolètes (ex. Innovation Pédagogique `spip.php?page=backend` à valider). Acceptable car le worker tolère les feeds morts (fetch-rss retourne `[]` + log).
- **Dry-run worker non exécuté** : le script `test:veille` est créé mais non lancé (requiert Ollama allumé + tenant en BDD). À faire en Plan 06.

## Testing & Verification

- **Wave 0 tests:** 16/16 GREEN (3 fetch + 4 classify + 3 dedup + 3 persist + 3 worker.cron)
- **Full apps/web suite:** 86 test files, **675/675 passed** (zéro régression depuis Plan 04)
- **TypeScript:** `pnpm tsc --noEmit -p apps/web/tsconfig.json` clean
- **Worker safety grep:** `grep -rE "(server/actions|/rbac|validateRequest|requireRole|from ['\"]react|from ['\"]next/cache)" apps/web/src/lib/veille/ apps/web/scripts/veille-worker.ts apps/web/scripts/test-veille-worker.ts --include='*.ts'` retourne 0 (hors JSDoc comments) → worker process safe.

### Acceptance criteria grep

```
$ grep -c "'0 8 \* \* 1'" apps/web/src/lib/veille/queue.ts            # 2 (code + log)
$ grep -c "tz: 'Europe/Paris'" apps/web/src/lib/veille/queue.ts       # 1
$ grep -c "jobId: 'weekly-veille-cron'" apps/web/src/lib/veille/queue.ts # 1
$ grep -c "mistral-small:24b" apps/web/src/lib/veille/classify.ts     # 3 (const + 3 usages)
$ grep -c "ingestRssOnceForTenant" apps/web/src/lib/veille/worker.ts  # 2 (import + call)
$ grep -c "setInterval" apps/web/scripts/veille-worker.ts             # 2
$ grep -c "regulatoryWatch.auto_inserted" apps/web/src/lib/veille/persist.ts # 2 (JSDoc + code)
$ grep -c "actorUserId: null" apps/web/src/lib/veille/persist.ts      # 1
$ grep -c "suggestedBy: 'AUTO'" apps/web/src/lib/veille/persist.ts    # 1
$ grep -c "status: 'DRAFT'" apps/web/src/lib/veille/persist.ts        # 1
$ grep -c "\"rss-parser\":" apps/web/package.json                     # 1
$ grep -c "theme: 'INDIC_" apps/web/src/lib/veille/sources.ts         # 12+ (12 entries)
```

Tous critères ≥ attendus. ✓

## Smoke manuels à exécuter en Plan 06

```bash
# 1. Health-check 12 sources RSS (HEAD probe)
pnpm --filter @qualiof/web probe:veille
# Attendu : ≥ 10/12 OK. Si < 10 : revoir/désactiver les URLs dans sources.ts.

# 2. Dry-run worker (1 cycle complet sans BullMQ)
pnpm --filter @qualiof/web test:veille
# Attendu : IngestResult { fetched > 0, classified > 0, inserted > 0, errors < 6 }
# Crée ≥ 1 row RegulatoryWatch status='DRAFT' suggestedBy='AUTO' + 1 AuditLog regulatoryWatch.auto_inserted
# Durée : ~5-10 min (Ollama mistral-small:24b local).

# 3. Vérification BDD post-dry-run
# Dans Prisma Studio ou psql :
SELECT count(*) FROM "RegulatoryWatch" WHERE status='DRAFT' AND "suggestedBy"='AUTO';
# Attendu : ≥ 1

# 4. Worker live (cron hebdo)
pnpm --filter @qualiof/web worker:veille
# Garde le process ouvert. Le job se déclenchera lundi 8h00 Europe/Paris.
# Pour tester immédiatement : ajouter un job manuel via la console BullMQ Board ou un script ad-hoc :
# await queue.add('weekly-veille', { triggered_by: 'manual' });
```

## AuditLog convention `regulatoryWatch.*` — STATUS COMPLET

Phase 13 a instancié les 8 verbes documentés en JSDoc dans `apps/web/src/lib/regulatoryWatch-audit.ts` :

| Verbe | Plan | Instancié dans |
|-------|------|----------------|
| `regulatoryWatch.created` | 13-01 | `scripts/import-veille-from-xlsx.ts` (import xlsx) + `server/actions/veille.ts` (création UI Plan 02) |
| `regulatoryWatch.updated` | 13-02 | `server/actions/veille.ts` (édition champs hors exploitation) |
| `regulatoryWatch.exploitation_updated` | 13-02 | `server/actions/veille.ts` (inline edit exploitation) |
| `regulatoryWatch.approved` | 13-02 | `server/actions/veille.ts` (inbox approve DRAFT→ACTIVE) |
| `regulatoryWatch.rejected` | 13-02 | `server/actions/veille.ts` (inbox reject DRAFT→ARCHIVED) |
| `regulatoryWatch.archived` | 13-02 | `server/actions/veille.ts` (archivage manuel) |
| `regulatoryWatch.exported` | 13-04 | `server/actions/veille.ts` (export PDF audit, targetWatchId='BULK') |
| **`regulatoryWatch.auto_inserted`** | **13-05** | **`apps/web/src/lib/veille/persist.ts` (worker BullMQ, actorUserId=null)** |

**Convention COMPLÈTE** — Plan 13-05 est le dernier verbe à instancier pour cette convention. Tout futur ajout (V2) devra documenter en JSDoc + ajouter au tableau.

## Risques connus

- **Sources RSS bougent** : audit régulier via `pnpm probe:veille` recommandé (manuel ou cron monthly futur). Si > 50% des sources tombent, le worker continue à fonctionner sans crasher (fault-tolerant) mais l'inbox se vide.
- **Latence Ollama mistral-small:24b** : ~5-10s par item × 60 calls max (12 sources × 5) = ~5-10 min par cycle. Acceptable pour un cron hebdo. Si la latence dérive (modèle plus lent au cold start ou GPU saturé par autre tâche), monitorer `AIGenerationJob.latencyMs`.
- **Classification précision V1** : pas de bench formel (RESEARCH §15 confidence MEDIUM). Les guardrails (Zod + OTHER + confidence < 50 skip + dedup) limitent les faux positifs. Les false positives s'arrêtent à l'inbox (D-08 NO auto-accept) — l'humain valide.
- **Pas d'intégration dans `dev:full`** : décision pragmatique (Ollama consomme GPU local Mac). Si l'utilisateur veut tester en intégré : ajouter à `dev:full:reminders` ou créer `dev:full:veille`.

## Self-Check: PASSED

All 16 created files exist on disk. All 3 commits exist in git log.

**Files verified:**
- ✓ apps/web/src/lib/veille/sources.ts
- ✓ apps/web/src/lib/veille/prompts.ts
- ✓ apps/web/src/lib/veille/fetch-rss.ts
- ✓ apps/web/src/lib/veille/classify.ts
- ✓ apps/web/src/lib/veille/persist.ts
- ✓ apps/web/src/lib/veille/core.ts
- ✓ apps/web/src/lib/veille/queue.ts
- ✓ apps/web/src/lib/veille/worker.ts
- ✓ apps/web/scripts/veille-worker.ts
- ✓ apps/web/scripts/test-veille-worker.ts
- ✓ apps/web/scripts/probe-veille-sources.ts
- ✓ apps/web/src/lib/veille/__tests__/fetch-rss.test.ts
- ✓ apps/web/src/lib/veille/__tests__/classify.test.ts
- ✓ apps/web/src/lib/veille/__tests__/dedup-by-url.test.ts
- ✓ apps/web/src/lib/veille/__tests__/persist.audit.test.ts
- ✓ apps/web/src/lib/veille/__tests__/worker.cron.test.ts

**Commits verified:**
- ✓ `9057678` (test : Wave 0 RED tests + rss-parser install)
- ✓ `78f5fe5` (feat : lib/veille core modules)
- ✓ `c8679ac` (feat : BullMQ cron worker + 3 entrypoint scripts)

## Next Phase Readiness

- ✅ Worker safety pattern instancié et vérifié (`feedback_worker_no_react_imports.md` honoré).
- ✅ AuditLog convention `regulatoryWatch.*` COMPLÈTE (8/8 verbes).
- ✅ 16 tests Wave 0 verts, zéro régression apps/web.
- ✅ Cron pattern `'0 8 * * 1'` + tz Europe/Paris + jobId fixe — idempotent par BullMQ.
- 🟡 **Smoke manuel à exécuter en Plan 06** : `probe:veille` + `test:veille` + 1 cycle live worker.
- 🟡 **Prod considerations** : worker:veille doit tourner en pm2/systemd (pas dans dev:full par défaut).

---
*Phase: 13-veille-qualiopi-integree*
*Plan: 05*
*Completed: 2026-05-25*
