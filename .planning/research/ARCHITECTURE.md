# Architecture Research

**Domain:** Cloud migration topology for an existing pnpm+Turborepo Next.js 14 modular monolith (QualiOF v6 Prod Cloud — Supabase + Vercel + worker host)
**Researched:** 2026-07-04
**Confidence:** HIGH (grounded in actual code; every integration point cites a file path)

> Scope: this document answers **only** how the cloud target maps onto the existing codebase. It does not re-survey the domain — the stack is frozen (Next.js 14 App Router + Prisma + BullMQ + Claude/OpenRouter). New vs modified components are called out explicitly for the roadmapper.

---

## Standard Architecture

### System Overview — Target Cloud Topology

```
┌──────────────────────────────────────────────────────────────────────┐
│  VERCEL (Node runtime, EU region)                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  apps/web — Next.js 14 App Router                              │  │
│  │   • RSC pages + layouts (Lucia session cookie auth)           │  │
│  │   • ~9 Server Actions that render PDF SYNCHRONOUSLY  ← ⚠ KEY   │  │
│  │   • API routes (/api/quotes/[id]/pdf, /api/documents/[id])    │  │
│  │   • enqueue BullMQ jobs (does NOT process them)               │  │
│  └───────┬───────────────┬───────────────┬──────────┬────────────┘  │
└──────────┼───────────────┼───────────────┼──────────┼────────────────┘
           │ pooled :6543   │ TLS rediss:// │ HTTPS     │ HTTPS (S3 SDK/
           │ (Prisma)       │ (enqueue only)│ (public,  │  supabase-js)
           ▼                ▼               │  authed)  ▼
┌────────────────┐  ┌───────────────┐       │   ┌──────────────────────┐
│ SUPABASE (EU)  │  │ UPSTASH Redis │       │   │ SUPABASE STORAGE     │
│  Postgres 16   │  │  (TLS)        │       │   │  (S3-compat, private │
│  • :6543 pooled│  └───────┬───────┘       │   │   buckets, signedURL)│
│  • :5432 direct│          │ BullMQ        │   └──────────────────────┘
│    (migrations)│          │ pub/sub       │
│  Storage ──────┼──────────┼───────────────┼───────────────────────────┘
└────────────────┘          │               │
                            ▼               ▼
┌──────────────────────────────────────────────────────────────────────┐
│  WORKER HOST (Railway OR Fly.io, EU region) — 3rd host                 │
│  ┌──────────────────┐  ┌──────────────────────────────────────────┐  │
│  │ Worker service   │  │ Gotenberg (Chromium)   :3000 internal     │  │
│  │ (1 image, 3 BullMQ│─▶│ WeasyPrint (Python)    :5001 internal     │  │
│  │  workers: closure,│  │ poppler-utils (pdftoppm binary)          │  │
│  │  veille, reminders)│  └──────────────────────────────────────────┘  │
│  │  • processes jobs │        ▲ private DNS, NOT publicly exposed      │
│  │  • connects pooled│        │                                        │
│  │    :6543 + TLS    │  Gotenberg/WeasyPrint ALSO need a PUBLIC authed │
│  │    Redis          │  ingress for Vercel server-action calls ← ⚠     │
│  └──────────────────┘                                                  │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | New / Modified | Grounding |
|-----------|----------------|----------------|-----------|
| Vercel `apps/web` | RSC render, auth, enqueue jobs, **synchronous PDF render in server actions** | Modified (env only) | `apps/web/scripts` not deployed here |
| Supabase Postgres | Primary DB, pooled (:6543 app) + direct (:5432 migrations) | Modified (URLs) | `schema.prisma:16,22` already has `directUrl` |
| Supabase Storage | Object store, replaces MinIO; signed URLs native | Already coded | `storage.ts:48-176` `PROVIDER==='supabase'` path exists |
| Upstash Redis | BullMQ transport (enqueue from Vercel, consume from worker) | Modified (TLS URL) | `closure/redis.ts:12` reads `REDIS_URL` |
| Worker service | Host for 3 BullMQ workers (tsx processes today) | New host, code unchanged | 3 entry scripts confirmed below |
| Gotenberg | HTML→PDF (Chromium) — called by BOTH Vercel & worker | New host | `pdf-render.ts:13,44` `GOTENBERG_URL` |
| WeasyPrint | HTML→PDF (CSS Paged Media, closure docs) | New host | `pdf-render.ts:14,63` `WEASYPRINT_URL` |
| poppler-utils | `pdftoppm` binary for OCR rasterisation | New host **or** relocate call | `pdf-extract.ts:35` spawns binary |

---

## The Load-Bearing Finding: Where Gotenberg/WeasyPrint Are Called From

**Verified in code — this drives the whole topology.** PDF rendering is NOT worker-only. It runs synchronously inside Vercel-hosted server actions and one API route:

Server actions (all `'use server'`, run on Vercel request thread — confirmed each file's line 1):
- `server/actions/agefice-attendance-generator.ts`
- `server/actions/deroule-product-generator.ts`
- `server/actions/programme-generator.ts`
- `server/actions/invoices.ts`
- `server/actions/convocation-generator.ts`
- `server/actions/legal-docs-generator.ts`
- `server/actions/veille-export.ts`
- `server/actions/generate-grille-obs-session.ts`
- `server/actions/regenerate-grille.ts`

API route: `app/api/quotes/[id]/pdf/route.ts`

Worker side (via `lib/closure/renderer.ts` and `lib/closure/*-core.ts`): the closure pack path also calls the same `pdf-render.ts`.

**Implication:** Gotenberg + WeasyPrint each need **two ingress paths**:
1. **Private internal DNS** for the worker service (closure pack, high volume) — no public exposure.
2. **Public HTTPS ingress, authenticated** for Vercel server actions (Vercel cannot reach a private Railway/Fly network without a public endpoint).

This is the single biggest design decision and MUST be flagged for the roadmapper. Two viable resolutions:

- **Option A (lower risk, recommended for cutover):** Expose Gotenberg/WeasyPrint on a **public HTTPS URL protected by a bearer token** (a `DOC_ENGINE_TOKEN` already exists in `env.ts:38` but is currently unused by `pdf-render.ts` — wiring it in is a small, well-scoped modification). Vercel and the worker both call the public URL. Simplest; one URL; slight latency + egress cost.
- **Option B (defer, optimization):** Move the ~9 synchronous PDF server actions to a **thin BullMQ job + poll/await pattern** so ALL Gotenberg/WeasyPrint traffic stays inside the private worker network. Larger refactor (changes UX of those actions from sync→async). Not required for cutover; note as a scaling follow-up.

**Recommendation: Option A for v6 cutover.** It preserves current synchronous UX (user clicks "générer" → gets PDF back in the same request) with only an env + token change. The `DOC_ENGINE_TOKEN` slot already exists, signalling this was anticipated.

### Second binary blocker: `pdftoppm` on Vercel

`lib/pdf-extract.ts:35` spawns the `pdftoppm` binary (poppler-utils). It is imported by **server actions that run on Vercel**: `server/actions/preinscription-public.ts` and `server/actions/extract-apprenant-docs.ts`. Vercel's serverless Node runtime has **no poppler binary**, so the rasterisation fallback path will throw `ENOENT` (the code already detects this at `pdf-extract.ts:146`).

**Implication for roadmap:** OCR of scanned PDFs (no text layer) breaks on Vercel. Two options:
- **A:** Accept degraded behaviour — text-layer PDFs still work (unpdf/pdf-parse are pure JS); only image-only scans fail. Ship with a clear user message. Lowest effort.
- **B:** Route the rasterisation step to the worker host (which has poppler) via a small internal endpoint or a BullMQ job. Correct but adds a hop.

Flag this as a **phase-scoped decision** — it touches Core Value pillar #4 (Pré-inscriptions IA OCR). Do not silently assume Vercel can rasterise.

---

## Env Var Changes Per Component

This is the concrete "what changes where" the roadmapper needs.

### Vercel (`apps/web` project env)

| Var | Local value | Cloud value | Notes |
|-----|-------------|-------------|-------|
| `DATABASE_URL` | `postgresql://…:5432/…` | Supabase **pooled** `…pooler…:6543/…?pgbouncer=true` | transaction mode, no prepared stmts |
| `DIRECT_URL` | = `DATABASE_URL` (no-op) | Supabase **direct** `…:5432/…` | migrations only; **NOT declared in `env.ts` yet** ← gap |
| `STORAGE_PROVIDER` | `minio` (default) | `supabase` | switches `storage.ts:23`; **not in `env.ts`** ← gap |
| `SUPABASE_URL` | — | `https://<ref>.supabase.co` | read raw at `storage.ts:49`; **not in `env.ts`** ← gap |
| `SUPABASE_SERVICE_ROLE_KEY` | — | service_role JWT | `storage.ts:50`; **not in `env.ts`** ← gap; secret |
| `REDIS_URL` | `redis://localhost:6379` | `rediss://…@…upstash.io:6379` (TLS) | ioredis parses `rediss://` for TLS automatically |
| `GOTENBERG_URL` | `http://localhost:3001` | public authed URL (Option A) | `pdf-render.ts:13` |
| `WEASYPRINT_URL` | `http://localhost:5001` | public authed URL (Option A) | `pdf-render.ts:14`; **not in `env.ts`** (env.ts declares stale `DOC_ENGINE_URL:5000` instead) ← gap |
| `DOC_ENGINE_TOKEN` | unset | bearer token | declared `env.ts:38` but **not consumed** by `pdf-render.ts` — wire it |
| `NEXT_PUBLIC_APP_URL` / `APP_ENV` | localhost:3000 | prod domain / `NEXT_PUBLIC_APP_ENV` | staging flag already scoped (PROJECT.md) |
| `OPENROUTER_*` | already cloud | unchanged | Phase 16 already migrated |
| S3_* (MinIO) | set | ignored when `STORAGE_PROVIDER=supabase` | keep for local dev parity |

### Worker host (Railway/Fly env)

Same DB/Redis/OpenRouter/Storage vars as Vercel, PLUS:

| Var | Value | Notes |
|-----|-------|-------|
| `GOTENBERG_URL` | **internal** DNS (e.g. `http://gotenberg.railway.internal:3000` or `http://gotenberg.internal:3000` on Fly) | private, no public hop |
| `WEASYPRINT_URL` | **internal** DNS (`…:5001`) | private |
| `DATABASE_URL` | pooled :6543 | same pooler; worker is long-lived so direct :5432 also viable, but pooled is safe |

> **Key insight:** the worker uses INTERNAL doc-engine URLs, Vercel uses PUBLIC ones — same code (`pdf-render.ts`), different env value per host. No code fork needed.

### Required `env.ts` changes (`packages/shared/src/env.ts`)

The following are **read via raw `process.env` today, bypassing t3-env validation** — a real gap that should be closed as part of v6 (boots-fail-loud is the project convention, CLAUDE.md "single source of truth"):

```ts
// ADD to server schema:
DIRECT_URL: z.string().url().optional(),          // used by prisma migrate
STORAGE_PROVIDER: z.enum(['minio','supabase']).default('minio'),
SUPABASE_URL: z.string().url().optional(),
SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
WEASYPRINT_URL: z.string().url().default('http://localhost:5001'),
// (and mirror each in runtimeEnv{})
```

Add a **superRefine**: when `STORAGE_PROVIDER === 'supabase'`, require `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (mirrors the runtime throw at `storage.ts:56-60`, but fail-fast at boot). Also declare the new keys in `turbo.json` `globalEnv` (grep confirmed none of `SUPABASE|UPSTASH|STORAGE_PROVIDER|DIRECT_URL` are present) so cache invalidation is correct.

> Note the stale alias: `env.ts:37` declares `DOC_ENGINE_URL` (:5000) but no code reads it — the actual WeasyPrint client reads `WEASYPRINT_URL` (:5001, matches `docker-compose.yml`). Recommend replacing `DOC_ENGINE_URL` with `WEASYPRINT_URL` to remove drift.

---

## Recommended Worker Packaging

### Decision: ONE Docker image, 3 processes (not 3 services)

The 3 workers are confirmed as separate tsx entry scripts sharing the same monorepo code:
- `apps/web/scripts/closure-worker.ts` (concurrency=3, BullMQ, Redis-degraded-mode)
- `apps/web/scripts/veille-worker.ts` (weekly cron, Redis-degraded-mode)
- `apps/web/scripts/invoice-reminder-worker.ts` (daily cron, Redis-degraded-mode)

They share `lib/closure/*`, `lib/veille/*`, `lib/invoice-reminders/*`, Prisma client, `storage.ts`, `pdf-render.ts`. **One image** is right because:
- They share nearly all code (rebuilding 3 images triples CI time for zero isolation benefit).
- Low volume (single OF) — no need to scale closure independently of reminders.
- Cron workers (veille/reminders) are idle most of the time; running them in-process wastes nothing.

**Process manifest inside the image:** run all 3 under a lightweight supervisor so one crash doesn't drop the others.

| Option | Verdict | Rationale |
|--------|---------|-----------|
| **`pm2` (or `pm2-runtime`)** | Recommended | Restart-on-crash per process, log prefixing, `pm2.config.cjs` lists 3 apps; `pm2-runtime` is PID-1-friendly for containers. Matches worker header comments ("systemd / pm2 / docker"). |
| Node cluster / custom | Avoid | Reinvents supervision |
| 3 separate services | Avoid for v6 | 3× cost + 3× CI, no isolation win at this scale |
| Railway "cron" primitives for veille/reminders | Consider later | Could offload the 2 cron workers to platform cron and keep only closure as a long-lived worker — defer, not needed for cutover |

> On Railway/Fly, `tsx watch` (the dev command) must become a non-watch run. Either `tsx scripts/closure-worker.ts` under pm2, or pre-compile. Keep `tsx` at runtime (no build step) for v6 simplicity — the workers are not latency-sensitive to cold TS transpile.

### Slim image via monorepo pruning

The repo is a pnpm workspace (`apps/*`, `packages/*`) with a ~290k-line lockfile. Do **not** copy the whole monorepo into the worker image. Two proven approaches:

| Approach | How | Trade-off |
|----------|-----|-----------|
| **`turbo prune --scope=@qualiof/web` (recommended)** | Generates `out/` with a partial lockfile + only `apps/web` + its internal deps (`@qualiof/db`, `@qualiof/shared`). Docker builds from `out/`. | Best layer caching; standard Turborepo pattern; the workers live in `apps/web/scripts` so `--scope=@qualiof/web` captures them. |
| `pnpm deploy --filter @qualiof/web` | Produces a flattened deployable dir | Simpler but weaker Docker layer caching than turbo prune's two-stage lockfile copy |

**Dockerfile shape (worker):** multi-stage — (1) `turbo prune` stage, (2) `pnpm install --frozen-lockfile` on pruned lockfile, (3) `prisma generate`, (4) copy source, (5) runtime stage on `node:20-slim` + `apt-get install poppler-utils` (for `pdftoppm` if OCR relocates here) with pm2. Gotenberg + WeasyPrint are **separate images** (official `gotenberg/gotenberg:8` and the existing `docker/weasyprint` build), not baked into the worker image.

---

## Private Networking: Railway vs Fly

Both give the worker↔Gotenberg/WeasyPrint private path; they differ in DNS + public-ingress ergonomics.

| Concern | Railway | Fly.io |
|---------|---------|--------|
| Private DNS | `<service>.railway.internal` (per-project private network, IPv6) | `<app>.internal` / `<app>.flycast` (6PN WireGuard mesh) |
| Set internal URL | `GOTENBERG_URL=http://gotenberg.railway.internal:3000` | `GOTENBERG_URL=http://gotenberg.internal:3000` |
| Public ingress for Vercel (Option A) | Per-service public domain toggle | `fly.toml` `[http_service]` / dedicated public app |
| Multi-process image | Fine (pm2 in one service) | Fine; Fly also has native multi-process `[processes]` in `fly.toml` as an alternative to pm2 |
| EU region | `europe-west4` etc. | `cdg`/`ams` (Paris/Amsterdam) — good for Supabase EU latency |
| Gotenberg/WeasyPrint as sibling services | 3 services in one project, private mesh | 3 Fly apps in one org, 6PN mesh |

**Recommendation:** either works; pick on operator familiarity. **Fly** has a slight edge for this shape (native `[processes]` multi-process, Paris region minimises Supabase-EU RTT, mature private mesh). **Railway** has simpler UX and easier per-service public-domain toggle for the Vercel-facing Gotenberg endpoint. Decision is reversible — the only code coupling is the `*_URL` env values.

**Networking rule (both):** Gotenberg/WeasyPrint bind on the private network for the worker; the public authed URL (Option A) is a separate ingress protected by `DOC_ENGINE_TOKEN`. Do NOT leave Gotenberg publicly reachable without auth — an open Chromium HTML-render endpoint is an SSRF/abuse risk.

---

## Data Flow — What Runs Where

### Closure pack (async, worker-hosted rendering — private path)
```
User clicks "Pack fin de formation" on Vercel
  → server action enqueues BullMQ job (Upstash, TLS)      [Vercel]
  → closure-worker consumes job                            [Worker host]
  → LLM via OpenRouter + render via Gotenberg/WeasyPrint   [Worker → INTERNAL doc URL]
  → upload PDF to Supabase Storage                         [Worker → Storage HTTPS]
  → job status persisted (ClosureJob) in Supabase Postgres [Worker → :6543]
User polls / gets notified                                 [Vercel reads :6543]
```

### Synchronous PDF server actions (public authed path) — the flagged case
```
User clicks "générer programme / convocation / facture / grille…"
  → server action builds HTML                              [Vercel]
  → fetch(GOTENBERG_URL public authed)  ← ⚠ Vercel→public  [Vercel → PUBLIC doc URL + token]
  → returns Buffer, streams PDF or uploads to Storage      [Vercel]
```

### Migrations (build/deploy time)
```
prisma migrate deploy  → uses DIRECT_URL (:5432 session mode)   [CI or one-off]
runtime queries        → DATABASE_URL (:6543 pooled)            [Vercel + Worker]
```
(This split already exists in `schema.prisma:16,22` — only the env values change.)

---

## Suggested Build Order (dependency-aware)

Ordered so each step de-risks the next; staging already exists and is frozen.

1. **Close the `env.ts` gap (enabling, do first).** Add `DIRECT_URL`, `STORAGE_PROVIDER`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WEASYPRINT_URL` to t3-env + `turbo.json` globalEnv + superRefine. Wire `DOC_ENGINE_TOKEN` into `pdf-render.ts`. *Rationale:* everything downstream sets these vars; without validation, misconfig fails silently in prod. Low risk, pure code.
2. **Storage cutover (Supabase Storage).** Flip `STORAGE_PROVIDER=supabase` in staging, migrate MinIO objects → Supabase buckets, verify signed-URL path (`storage.ts:createSignedDownloadUrl` — Supabase branch already implemented; MinIO branch throws by design). *Depends on:* step 1. *Rationale:* decouples object store before the app moves.
3. **DB URLs (pooled + direct).** Point staging at Supabase pooled/direct; run `prisma migrate deploy` via `DIRECT_URL`; verify pooler transaction-mode compatibility (no prepared-stmt errors). Restore already proven (PROJECT.md: 5822=5822). *Depends on:* nothing new, but sequence before worker host so the worker connects to the final DB.
4. **Worker host stand-up (Railway/Fly) + doc engines.** Build the pruned worker image (turbo prune + pm2, 3 workers), deploy Gotenberg + WeasyPrint as private siblings, wire INTERNAL `*_URL`. Point workers at Upstash (TLS) + Supabase pooled. Smoke closure pack end-to-end. *Depends on:* 2, 3. *Rationale:* the async pipeline is the highest-value, highest-risk path — validate it on staging infra before Vercel.
5. **Doc-engine public authed ingress (Option A) + Vercel wiring.** Expose Gotenberg/WeasyPrint public URL + token; deploy `apps/web` to Vercel with public `*_URL`; smoke the ~9 synchronous PDF server actions AND the pdftoppm/OCR decision (accept-degraded or relocate). *Depends on:* 4. *Rationale:* Vercel needs the doc engines reachable before its server actions work.
6. **CI for two targets.** GitHub Actions: (a) lint+tsc+tests gate (CI-01 from backlog); (b) worker Docker build+push on `apps/web`/`packages/*` changes; Vercel auto-builds the web target on push (no Docker). Wire `prisma migrate deploy` (DIRECT_URL) as a deploy step. *Depends on:* 4, 5 (know the build shapes first).
7. **Prod cutover.** Final dump/restore, DNS, `NEXT_PUBLIC_APP_ENV=production`, user invitations, worker recalibration (timeout 600s→~120s, concurrency — PROJECT.md), cost/latency monitoring.

> Dependency rationale summary: **env validation → storage → DB → worker+doc-engines (private) → Vercel+doc-engines (public) → CI → cutover.** Storage and DB are independent of each other but both precede the worker host (which needs the final DB + Storage). The two doc-engine ingress paths (private for step 4, public for step 5) are split across two phases intentionally.

---

## Monorepo CI — Two Build Targets

| Target | Builder | Trigger | Notes |
|--------|---------|---------|-------|
| `apps/web` (Vercel) | Vercel auto-build (`next build`) | push to prod branch | Set **Root Directory** = repo root, build command `turbo run build --filter=@qualiof/web`, install `pnpm i`. Vercel detects monorepo; no Dockerfile needed. Env vars set in Vercel dashboard. |
| Worker image | GitHub Actions → Docker build → registry → Railway/Fly deploy | push touching `apps/web`, `packages/db`, `packages/shared` | `turbo prune --scope=@qualiof/web` → Docker multi-stage → push. Use `turbo`'s affected-detection to skip when only unrelated files changed. |
| Migrations | GitHub Actions step (`prisma migrate deploy`, `DIRECT_URL`) | on deploy | Must run once per deploy, before app+worker pick up new schema. |
| Quality gate | GitHub Actions: `pnpm lint && pnpm -r tsc --noEmit && pnpm -r test` | on PR | CI-01 backlog item; blocks merge before cutover. |

**Vercel gotcha:** the worker `scripts/*` live inside `apps/web` but must NOT be bundled into the Next.js build — they're only referenced by the worker image. `next build` ignores `scripts/` by default (not under `src/app`), so no action needed, but do not accidentally import worker-only modules from RSC.

---

## Anti-Patterns (v6-specific)

### Anti-Pattern 1: Exposing Gotenberg publicly without auth
**What people do:** Give Gotenberg a public URL so Vercel can reach it, no token.
**Why it's wrong:** Open Chromium HTML-render endpoint = SSRF + resource-abuse vector; anyone can render arbitrary pages.
**Do this instead:** Public ingress behind `DOC_ENGINE_TOKEN` bearer (slot already exists in `env.ts:38`), wired into `pdf-render.ts` fetch headers. Or Option B (keep private, make server actions async).

### Anti-Pattern 2: Using the pooled URL for migrations
**What people do:** One `DATABASE_URL` (pooler :6543) for everything.
**Why it's wrong:** Supabase transaction-mode pooler rejects prepared statements → `prisma migrate` fails (documented in `schema.prisma:17-21`).
**Do this instead:** `DIRECT_URL` (:5432 session mode) for migrations, pooled for runtime. Already coded — just set both env values.

### Anti-Pattern 3: Assuming Vercel can run binaries (pdftoppm)
**What people do:** Ship OCR-of-scanned-PDF expecting it to work on Vercel.
**Why it's wrong:** No poppler-utils in Vercel serverless runtime → `ENOENT` (detected at `pdf-extract.ts:146`).
**Do this instead:** Decide explicitly — accept text-layer-only OCR on Vercel, or relocate rasterisation to the worker host.

### Anti-Pattern 4: Three worker images
**What people do:** One Docker image per worker for "isolation."
**Why it's wrong:** 3× CI + 3× hosting cost, shared code rebuilt thrice, no isolation benefit at single-OF scale.
**Do this instead:** One pruned image, 3 processes under pm2-runtime.

### Anti-Pattern 5: Raw `process.env` for new cloud keys
**What people do:** Read `SUPABASE_URL`/`STORAGE_PROVIDER` via `process.env` (as `storage.ts` does today).
**Why it's wrong:** Bypasses the boots-fail-loud t3-env convention (CLAUDE.md); misconfig surfaces at runtime in prod, not at boot.
**Do this instead:** Declare in `env.ts` + `turbo.json` globalEnv with a superRefine.

---

## Integration Points

### External Services

| Service | Integration Pattern | Gotchas |
|---------|---------------------|---------|
| Supabase Postgres | Prisma pooled :6543 (runtime) + direct :5432 (migrate) | `?pgbouncer=true`; already scaffolded in `schema.prisma` |
| Supabase Storage | `@supabase/supabase-js` service-role; `storage.ts` provider switch | signed-URL branch done; MinIO branch throws by design; migrate objects |
| Upstash Redis | ioredis `rediss://` (TLS auto) | `maxRetriesPerRequest:null` already set (`redis.ts`); confirm BullMQ works with Upstash eviction/limits |
| Gotenberg | HTTP multipart (`pdf-render.ts:44`) | dual ingress (private+public authed); `--api-timeout` currently 60s (docker) — raise for large packs |
| WeasyPrint | HTTP POST (`pdf-render.ts:63`) | own image (`docker/weasyprint`); env key drift `DOC_ENGINE_URL`→`WEASYPRINT_URL` |
| OpenRouter (Claude) | already cloud (Phase 16) | no change; `OPENROUTER_*` vars stable |
| poppler-utils | `execFile('pdftoppm')` (`pdf-extract.ts:35`) | binary — worker host only, not Vercel |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Vercel ↔ Worker | BullMQ jobs via Upstash (enqueue vs consume) | Vercel never processes jobs; only enqueues |
| Vercel ↔ Gotenberg/WeasyPrint | HTTPS public authed (sync server actions) | the flagged dual-ingress case |
| Worker ↔ Gotenberg/WeasyPrint | HTTP private DNS | closure pack, no public hop |
| Worker/Vercel ↔ Supabase Storage | S3 SDK / supabase-js | unified via `storage.ts` provider switch |
| `apps/web/scripts` ↔ monorepo | shared TS via turbo prune scope | workers depend on `@qualiof/db`, `@qualiof/shared` |

---

## Sources

- Codebase (HIGH — direct reads): `apps/web/src/lib/storage.ts`, `lib/pdf-render.ts`, `lib/pdf-extract.ts`, `lib/closure/redis.ts`, `packages/shared/src/env.ts`, `packages/db/prisma/schema.prisma`, `apps/web/scripts/{closure-worker,veille-worker,invoice-reminder-worker}.ts`, `apps/web/package.json`, `docker-compose.yml`, `.env.example`, grep of render/pdftoppm call sites.
- `.planning/PROJECT.md` — milestone v6 scope, restore proof, worker recalibration targets.
- Turborepo `turbo prune` and pnpm `deploy` (MEDIUM — established monorepo patterns; verify exact flags against current Turborepo docs at build time).
- Supabase pooler transaction-mode / prepared-statement constraint (MEDIUM — corroborated by the in-repo `schema.prisma:17-21` comment; confirm current pooler port conventions in Supabase docs).
- Railway `*.railway.internal` / Fly `*.internal` 6PN private networking (MEDIUM — training data; verify current internal-DNS syntax in provider docs before wiring).

---
*Architecture research for: QualiOF v6 cloud migration (Supabase + Vercel + Railway/Fly worker host)*
*Researched: 2026-07-04*
