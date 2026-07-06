# Stack Research

**Domain:** Cloud migration of an existing Next.js 14 / Prisma / BullMQ CRM (QualiOF) — local Docker → Vercel + Supabase EU + Upstash Redis + 3rd host (Railway/Fly) for workers + PDF services
**Researched:** 2026-07-04
**Confidence:** MEDIUM-HIGH (Vercel duration limits verified against official docs 2026-06-19; Supabase/Upstash/Prisma specifics from training data + code inspection — flagged where unverified. WebSearch/WebFetch to Supabase/Upstash/Prisma hosts were DENIED in this environment, so several cloud facts need a doc re-check at plan time.)

> **Framing.** This is NOT a greenfield stack choice. Prisma / BullMQ / Lucia / @aws-sdk/client-s3 / nodemailer / Gotenberg / WeasyPrint are **frozen** (Key Decisions, PROJECT.md). This research answers only: *what must be ADDED or RE-CONFIGURED to run this exact stack on Vercel + Supabase + Upstash + Railway/Fly.* The codebase is already partially cloud-prepared (see "Already Done in Code" below) — the delta is smaller than a typical migration.

---

## Already Done in Code (do NOT re-do)

Inspection of the `cloud-migration` branch shows meaningful groundwork already merged. **Confirm these before planning, don't rebuild them:**

| Concern | State in code | Evidence |
|---------|--------------|----------|
| Prisma `directUrl` for migrations | ✅ declared `directUrl = env("DIRECT_URL")` with the transaction-pooler comment | `packages/db/prisma/schema.prisma:14-24` |
| Postgres extensions | ✅ declared `[pgcrypto, uuid_ossp(map:"uuid-ossp"), pg_trgm, unaccent]` + `previewFeatures=["postgresqlExtensions"]` | `schema.prisma:9-24` |
| Storage provider switch | ✅ `STORAGE_PROVIDER` = `minio`/`supabase`, Supabase path uses `@supabase/supabase-js` (not raw S3), native `createSignedUrl` | `apps/web/src/lib/storage.ts:1-178` |
| BullMQ Redis options | ✅ `maxRetriesPerRequest: null` + `enableReadyCheck: false` on BOTH queue and worker connections | `apps/web/src/lib/closure/redis.ts:17-33` |
| Lucia secure cookies | ✅ `secure: NODE_ENV==='production'` | `apps/web/src/lib/auth.ts:18-24` |
| Mailer dry-run fallback | ✅ log-only when `SMTP_HOST` empty | `apps/web/src/lib/mailer.ts:52-55` |
| WeasyPrint container | ✅ Dockerfile (python:3.12-slim + Pango/cairo + gunicorn, port 5001, --timeout 120) | `docker/weasyprint/Dockerfile` |

**The single most important gap:** `storage.ts` reads `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STORAGE_PROVIDER` via **raw `process.env`**, and Prisma reads `DIRECT_URL` — but **none of these are in `packages/shared/src/env.ts`** (the declared single source of truth). This defeats the t3-env "fail loud at boot" guarantee. **First code task of v6 = add these to `env.ts`.**

---

## Recommended Stack (additions / re-config only)

### Core Technologies (new hosted services)

| Technology | Version / Plan | Purpose | Why Recommended |
|------------|----------------|---------|-----------------|
| **Supabase** (Postgres 16 + Storage) | Pro plan, EU region (`eu-west-*` / `eu-central-*`) | Replaces Docker Postgres + MinIO | Managed PG16 (matches local), S3-compatible Storage, EU data residency (RGPD). Supavisor pooler solves Vercel's connection-per-invocation problem. Postgres 16 = same major as local → zero schema surprise. |
| **Supavisor** (Supabase's pooler) | Transaction mode `:6543` (app) + direct `:5432` (migrations) | Connection pooling for serverless | Vercel functions open a connection per cold invocation; PG maxes out fast without pooling. Transaction mode for the app, direct/session for `prisma migrate deploy`. |
| **Upstash Redis** | Pay-as-you-go, EU region | Replaces Docker Redis 7 for BullMQ | Serverless Redis, per-command billing, TLS by default, EU region for RGPD. BullMQ needs a **persistent TCP Redis** (not the REST/HTTP API) — use the `rediss://` connection string with ioredis. |
| **Railway** (recommended) *or* Fly.io | — | 3rd host: 3 BullMQ workers + Gotenberg + WeasyPrint | Workers are **long-running Node processes** — cannot run on Vercel (serverless, 800s cap, no persistent listener). Gotenberg/WeasyPrint are long-lived HTTP microservices. Railway = simplest Dockerfile/Nixpacks deploy, private networking between services, predictable pricing. Fly.io if you want EU-region control + scale-to-zero. |
| **Vercel** | Pro plan | Hosts the Next.js 14.2 app (App Router, RSC, Server Actions) | Already the target. Pro needed for 800s functions + team seats. **Edge runtime explicitly out of scope** (Prisma/BullMQ need Node runtime — PROJECT.md). |

### Supporting Libraries (new npm deps)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@supabase/supabase-js` | ^2.x (latest 2.x) | Supabase Storage client (already imported in `storage.ts`) | **Confirm it's in `package.json`** — `storage.ts` imports it but it may be a phantom import if not installed. Used only for the `supabase` storage provider path. |
| *(none else strictly required)* | — | — | @aws-sdk/client-s3 3.x, bullmq 5, ioredis 5, nodemailer 8, lucia 3, prisma 5.22 all stay as-is |

> **Deliberately NO new ORM, NO new queue lib, NO new auth lib, NO Supabase Storage rewrite.** The `@supabase/supabase-js` path already exists. You *could* alternatively keep `@aws-sdk/client-s3` pointed at Supabase's S3-compatible endpoint (see "Stack Patterns by Variant") — but since `storage.ts` already implements the `supabase-js` path with native signed URLs, prefer it.

### Development / Ops Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Vercel CLI (`vercel`) | Deploy, env pull/push, local `vercel dev` | `vercel login` requires Laurent's interactive session (memory: staging blocked on this). |
| Railway CLI *or* `flyctl` | Deploy workers + PDF services | Railway: `railway up` from a Dockerfile. Fly: `fly deploy` per app. |
| Supabase CLI (`supabase`) | Manage buckets, S3 keys, DB link | `supabase link` + Storage bucket creation. `ensureBucket()` also does it at runtime. |
| GitHub Actions | CI-01 (lint + tsc + tests) gate before prod | New in v6 (Active backlog). Runs `turbo run lint`, `tsc --noEmit`, `vitest`. Needs `SKIP_ENV_VALIDATION=true` or dummy env to boot the t3-env import. |
| `vercel.json` | Per-function `maxDuration`, region pin (`fra1`/`cdg1`) | New file. Pin region to EU (`cdg1` Paris / `fra1` Frankfurt) to co-locate with Supabase EU → lower DB latency. |

---

## Connection-String & Env Shapes (the load-bearing detail)

### `DATABASE_URL` (app, Vercel + workers) — Supavisor transaction pooler
```
postgresql://postgres.<project-ref>:<pwd>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
```
- `pgbouncer=true` → Prisma disables prepared statements (transaction pooler can't hold them across statements).
- `connection_limit=1` per serverless instance is the Vercel-recommended pattern (each function instance owns 1 pooled conn; Supavisor multiplexes). For the **long-running workers** on Railway/Fly you can raise this (e.g. `connection_limit=5`) since those are stable processes — but simplest is to keep 1 and let Supavisor pool.
- ⚠️ **VERIFY at plan time:** exact pooler hostname format (`aws-0-<region>.pooler.supabase.com`) and whether Supabase still uses this Supavisor DNS shape in mid-2026 — could not fetch supabase.com/docs (host denied). Copy the exact string from the Supabase dashboard "Connection string → Transaction" tab.

### `DIRECT_URL` (migrations only) — direct / session mode `:5432`
```
postgresql://postgres.<project-ref>:<pwd>@aws-0-<region>.pooler.supabase.com:5432/postgres
```
- Used by `prisma migrate deploy` (needs prepared statements + a stable session). Already wired via `directUrl` in schema.
- Run migrations from CI or a one-off Railway job, **not** from a Vercel build (Vercel build has no reliable direct-DB egress guarantees and you don't want migrations racing on every deploy).

### Storage (Supabase) — two options, pick the supabase-js one
```
STORAGE_PROVIDER=supabase
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-jwt>   # server-only secret, NEVER NEXT_PUBLIC
```
If you ever switch the code back to the `@aws-sdk/client-s3` path against Supabase's S3 API instead:
```
S3_ENDPOINT=https://<project-ref>.storage.supabase.co/storage/v1/s3
S3_REGION=<supabase-region>          # must match project region exactly
S3_FORCE_PATH_STYLE=true             # required for Supabase S3
S3_ACCESS_KEY=<generated S3 access key id>     # Storage → S3 Access Keys
S3_SECRET_KEY=<generated S3 secret>
```

### Redis (Upstash) — BullMQ over TLS
```
REDIS_URL=rediss://default:<password>@<endpoint>.upstash.io:6379
```
- `rediss://` (double-s) = TLS. ioredis auto-enables TLS from the scheme.
- `maxRetriesPerRequest: null` already set (required by BullMQ) — good.
- ⚠️ **Add `family: 0` or confirm IPv6/IPv4** and consider `connectTimeout` bump for cold Upstash edges. Current `redis.ts` builds ioredis from `REDIS_URL` string only — TLS works via `rediss://`, but if Upstash needs explicit `tls: {}` add it in `redis.ts` (see Pitfalls).

### New env vars to add to `packages/shared/src/env.ts`
| Var | Zod | Notes |
|-----|-----|-------|
| `DIRECT_URL` | `z.string().url()` | migrations pooler `:5432` |
| `STORAGE_PROVIDER` | `z.enum(['minio','supabase']).default('minio')` | currently raw `process.env` |
| `SUPABASE_URL` | `z.string().url().optional()` | required when provider=supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | `z.string().optional()` | server secret |
| `NEXT_PUBLIC_APP_ENV` | `z.enum(['dev','staging','production']).default('dev')` | staging flag (PROJECT.md target feature) — client var |
| *(optional)* `WORKER_CONCURRENCY` | `z.coerce.number().default(3)` | to recalibrate closure worker for cloud latency without redeploying code |

> Add both to `server`/`client` blocks **and** the `runtimeEnv` map (t3-env requires the explicit mapping — see existing entries lines 86-131).

---

## Installation

```bash
# Only new runtime dep (confirm not already present):
pnpm --filter @qualiof/web add @supabase/supabase-js

# CLIs (dev machine, not deps):
npm i -g vercel supabase @railway/cli   # or: brew install flyctl
```

No other package installs. **This is a config + infra milestone, not a dependency milestone.**

---

## Per-Service Config Cheat-Sheet

### Vercel (Next.js 14.2 app) — VERIFIED limits
- **Function duration (fluid compute, default on):** Hobby 300s max · **Pro 800s max, 1800s extended (beta, per-function)** · Enterprise same. Default 300s all plans. *(Verified: vercel.com/docs/functions/configuring-functions/duration, last_updated 2026-06-19.)*
  - Implication: the closure enqueue Server Action just needs to **enqueue** (fast) — actual generation runs on the worker (Railway/Fly), so Vercel duration is NOT a bottleneck for pack generation. Set `maxDuration` modestly (e.g. 60s) on any route that does synchronous PDF/LLM work; push the heavy path to the worker.
- **Server Actions body limit:** Next.js default **1 MB**; configurable via `serverActions.bodySizeLimit` in `next.config.mjs`. Bump if any action uploads files (CNI/RIB uploads go through `/api` routes today, so likely fine — but verify OCR upload paths).
- **Region:** pin `cdg1` (Paris) or `fra1` (Frankfurt) in `vercel.json` `regions` to sit next to Supabase EU. Cross-continent PG round-trips are the #1 latency killer.
- **`vercel.json`:** new file — `regions`, `functions.*.maxDuration`, plus the staging watermark/PDF-guard flag plumbing (`NEXT_PUBLIC_APP_ENV`).

### Supabase (Postgres + Storage) — VERIFY hostnames/ports at plan time
- Ports: **`:6543` transaction pooler** (app), **`:5432` direct/session** (migrations). Matches the comment already in `schema.prisma`.
- Extensions: pgcrypto / uuid-ossp / pg_trgm / unaccent are **all standard, pre-bundled** in Supabase Postgres and enabled via Prisma's `postgresqlExtensions` (migration issues `CREATE EXTENSION IF NOT EXISTS`). No action needed beyond running `migrate deploy`. *(HIGH confidence these 4 exist on Supabase; they're among the most common — but confirm `unaccent` isn't restricted in the dashboard's extension list.)*
- Storage: create buckets `qualiof-docs`, `qualiof-templates`, `preinscriptions` — **private** (already `public:false` in `ensureBucket`). `createSignedUrl` used for browser access (RGPD: `Person.ribKey` PII must stay behind signed URLs — Constraints).
- Data migration: existing MinIO objects → Supabase buckets (one-time copy script; the staging restore already proved DB restore 5822=5822).

### Upstash Redis (BullMQ) — polling cost is the watch-item
- BullMQ workers **poll/block on Redis continuously** (BRPOPLPUSH / blocking reads + repeatable-job schedulers). On Upstash's **per-command pricing**, an idle worker still generates a steady command stream. **This is the single cost risk of the migration.**
  - Mitigations: (a) Upstash **fixed-price plan** if command volume is high (predictable > pay-per-request for always-on workers); (b) fewer queues if possible (you have 3: closure/veille/invoice — veille is weekly-cron, invoice is daily-cron — those blocking waits cost even while idle); (c) consider running Redis **on Railway/Fly next to the workers** instead of Upstash if command billing surprises you — a small managed Redis container may be cheaper for always-on BullMQ than serverless per-command. **Flag for cost monitoring in the bascule phase.**
- ⚠️ **VERIFY at plan time:** current Upstash pricing model and whether they still recommend a persistent-connection (non-REST) endpoint for BullMQ. Could not fetch upstash.com/docs (host denied).

### Railway / Fly (workers + Gotenberg + WeasyPrint)
- **3 worker processes:** `closure-worker.ts`, `veille-worker.ts`, `invoice-reminder-worker.ts` (confirmed in `apps/web/scripts/`). Each is a `tsx` entrypoint, long-running. Deploy as separate Railway services (or one service running all 3 via a process manager — but separate = cleaner restart/log isolation).
- **Node 20 worker Dockerfile** must include **`poppler-utils`** — `pdf-extract.ts` shells out to `pdftoppm` for the vision-OCR rasterisation fallback (pré-inscription pipeline, Core Value #4). Missing it = OCR silently degrades.
  ```dockerfile
  FROM node:20-slim
  RUN apt-get update && apt-get install -y --no-install-recommends \
      poppler-utils ca-certificates \
      && rm -rf /var/lib/apt/lists/*
  # + corepack enable / pnpm install --prod / prisma generate
  # CMD runs tsx apps/web/scripts/<worker>.ts
  ```
- **Gotenberg:** official image `gotenberg/gotenberg:8` (already in docker-compose) — deploy as-is on Railway/Fly, private network URL → set `GOTENBERG_URL`. No footer via native Gotenberg (Constraints: illegible) — footer stays in HTML body.
- **WeasyPrint:** the existing custom `docker/weasyprint/Dockerfile` (python:3.12-slim + Pango/cairo + gunicorn, port 5001, weasyprint==60.2) deploys as-is → set `DOC_ENGINE_URL`.
- Wire `DATABASE_URL` (pooler), `REDIS_URL`, `SUPABASE_*`, `OPENROUTER_API_KEY`, `GOTENBERG_URL`, `DOC_ENGINE_URL`, `SMTP_*` into worker env.

### nodemailer — worker vs Vercel
- **Prefer sending email from the workers/Railway, not Vercel Server Actions.** SMTP holds a TCP connection; serverless functions are short-lived and some SMTP providers rate-limit/greylist bursty short connections. The email-heavy paths (pack-complete email, preinscription reminders, invoice reminders) already run **inside the workers** (invoice-reminder-worker, preinscription-reminders). Keep them there. Vercel can still send transactional one-offs (e.g. Lucia invitation email) — that's fine for low volume.
- OVH SMTP (`ssl0.ovh.net:465` per mailer comments): ensure Railway/Fly egress isn't blocking port 465. If blocked, use a transactional API (out of scope now; flag if OVH SMTP fails from the host).

### Lucia v3 cookies on Vercel
- `secure: NODE_ENV==='production'` already set → Vercel sets `NODE_ENV=production` automatically, so secure cookies "just work." No SameSite change needed (same-origin app). The public preinscription form `/p/[token]` is unauthenticated → no cookie concern.
- ⚠️ The `cookies().set()` inside `validateRequest` is wrapped in try/catch (can't set cookies from RSC render) — this is correct and unchanged by cloud. No action.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Railway (workers/PDF) | Fly.io | If you want explicit EU-region placement + scale-to-zero for the PDF services, or prefer `fly.toml`/Firecracker VMs. Fly's per-service regions can beat Railway for EU latency. |
| Upstash Redis | Redis container on Railway/Fly | If BullMQ per-command billing on Upstash exceeds ~a few € (3 always-on blocking workers). A tiny always-on managed Redis may be flat-cheaper. **Re-evaluate after 1 week of prod metrics.** |
| Supabase Storage via `@supabase/supabase-js` | Keep `@aws-sdk/client-s3` → Supabase S3 endpoint | If you want ONE storage code path (S3) for both local MinIO and cloud, skipping the provider branch. But you'd lose native `createSignedUrl` convenience; you'd use `getSignedUrl` from `@aws-sdk/s3-request-presigner`. Since the supabase-js path is already written, not worth it. |
| Supabase Pro | Supabase Free | Free tier pauses after inactivity + limited connections/storage — unacceptable for a team-used prod CRM. Budget target 60-80€/mo accommodates Pro. |
| Vercel Pro | Vercel Hobby | Hobby caps functions at 300s and forbids commercial/team use. Team of Start Academy users → Pro. |

---

## What NOT to Use / Do

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Running BullMQ workers on Vercel | Serverless = no persistent process; 800s hard cap; no blocking Redis listener | Dedicated Node processes on Railway/Fly |
| Vercel Edge runtime for app routes | Prisma + BullMQ enqueue need Node APIs; already ruled out | Node runtime (default) — PROJECT.md Out of Scope |
| Upstash **REST** (`@upstash/redis`) for BullMQ | BullMQ needs raw Redis protocol / blocking commands, not HTTP | ioredis over `rediss://` TCP endpoint |
| Direct pooler `:6543` for `prisma migrate` | Transaction pooler can't hold prepared statements/advisory locks migrations need | `DIRECT_URL` on `:5432` (already wired) |
| `connection_limit` high on serverless `DATABASE_URL` | Each Vercel instance × high limit → exhausts Supavisor/PG | `connection_limit=1` on the app URL; let Supavisor pool |
| `SUPABASE_SERVICE_ROLE_KEY` as `NEXT_PUBLIC_*` | Full-access key; leaking it = total data breach | Server-only env; never in client bundle |
| Raw `process.env` for new cloud vars | Bypasses t3-env boot validation (the project's SoT) | Add to `packages/shared/src/env.ts` server/client + runtimeEnv |
| Gotenberg native footer | Illegible at small size (documented anti-pattern) | Footer in HTML body `position:fixed bottom:0` 11pt (unchanged) |
| Migrating on every Vercel build | Race conditions, build-time DB egress unreliable | `prisma migrate deploy` from CI or a one-off Railway job |

---

## Stack Patterns by Variant

**If Upstash BullMQ command cost spikes:**
- Move Redis to a small Railway/Fly container next to the workers.
- Because 3 always-on blocking workers generate constant commands; flat-rate beats per-command for always-on consumers.

**If OVH SMTP (:465) is blocked from Railway/Fly egress:**
- Fall back to a transactional email API (SES/Resend/etc.) — but this is out of current scope; keep nodemailer, flag the blocker.

**If Supabase EU pooler latency to Vercel is high:**
- Pin Vercel region to `cdg1`/`fra1` and confirm Supabase project is `eu-*`. Co-location is the fix, not caching.

**If migrations must run automatically:**
- Add a GitHub Actions job (CI-01 milestone) that runs `prisma migrate deploy` with `DIRECT_URL` after tests pass, before the Vercel/Railway deploy — not inside the app build.

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Prisma 5.22 | Supabase PG16 + Supavisor | `pgbouncer=true` required on pooled URL; `directUrl` required for migrate. Both already declared. |
| bullmq 5.76 | ioredis 5.10 + Upstash (rediss://) | `maxRetriesPerRequest: null` mandatory (set). TLS via `rediss://` scheme. |
| @aws-sdk/client-s3 3.1038 | Supabase S3 endpoint | Only if using the S3 path — needs `forcePathStyle:true` + region==project region. supabase-js path preferred. |
| lucia 3.2 | Vercel Node runtime | Secure cookies via `NODE_ENV=production` (auto on Vercel). No change. |
| Next.js 14.2.21 | Vercel Pro | 800s functions, `maxDuration` export in App Router route files; server-action body limit default 1 MB. |
| WeasyPrint 60.2 (python 3.12) | Railway/Fly Docker | Existing Dockerfile works as-is; needs Pango/cairo libs (already in it). |
| node:20-slim worker image | poppler-utils | MUST apt-install `poppler-utils` for `pdftoppm` (OCR fallback). |

---

## Open Questions to Resolve at Plan Time (couldn't verify — hosts denied)

1. **Exact Supavisor hostname/port shape** in mid-2026 (dashboard is authoritative — copy the string). *(MEDIUM)*
2. **Upstash current pricing model** (per-command vs plan) + persistent-endpoint recommendation for BullMQ. *(LOW — drives the "Redis on Railway instead" decision)*
3. **`unaccent` availability** on Supabase's allowed-extensions list (pgcrypto/uuid-ossp/pg_trgm are certain; unaccent almost certainly fine). *(MEDIUM)*
4. Whether `@supabase/supabase-js` is actually in `package.json` or a phantom import in `storage.ts`. *(quick `grep`)*
5. OVH SMTP :465 egress from Railway/Fly. *(test in bascule phase)*
6. Existing MinIO → Supabase Storage object copy: bucket count/size to size the one-time migration.

---

## Sources

- vercel.com/docs/functions/configuring-functions/duration (last_updated 2026-06-19) — **VERIFIED**: Hobby 300s, Pro/Enterprise 800s max + 1800s extended beta, 300s default. `maxDuration` export pattern for App Router.
- Codebase inspection (HIGH confidence, ground truth): `schema.prisma` (directUrl+extensions), `lib/storage.ts` (Supabase provider), `lib/closure/redis.ts` + `queue.ts` (BullMQ opts), `lib/auth.ts` (Lucia cookies), `lib/mailer.ts` (nodemailer dry-run), `lib/pdf-extract.ts` (pdftoppm/poppler), `docker/weasyprint/Dockerfile`, `packages/shared/src/env.ts`, `apps/web/scripts/*worker*.ts` (3 workers).
- PROJECT.md v6 milestone section — target features, budget 60-80€/mo, constraints (worker recalibration 600s→~120s, RGPD signed URLs, region EU).
- Supabase / Upstash / Prisma-Supabase official docs — **NOT fetched** (WebFetch/WebSearch to those hosts DENIED in this run). Facts on pooler ports (:6543/:5432), `pgbouncer=true`, `connection_limit=1`, `rediss://` TLS, `forcePathStyle` are from training data + the code's own comments — treated as MEDIUM confidence, **re-verify the exact connection strings from the Supabase/Upstash dashboards at plan time.**

---
*Stack research for: cloud migration (Vercel + Supabase EU + Upstash + Railway/Fly) of existing Next.js/Prisma/BullMQ CRM*
*Researched: 2026-07-04*
