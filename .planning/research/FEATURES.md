# Feature Research — v6 Prod Cloud Migration (Supabase + Vercel)

**Domain:** Production cloud migration of a small internal multi-user web app (Next.js + Postgres + Redis + object storage + background workers) — 2-5 users, French Qualiopi CRM
**Researched:** 2026-07-04
**Confidence:** MEDIUM

> **Confidence note.** Live web/doc tools (WebSearch, WebFetch, Context7) were unavailable in this session, so platform-specific facts (Supabase PITR tier gating, Vercel preview-env limits, Upstash/Railway free-tier caps, current EU-region availability) rest on training data (cutoff Jan 2026) plus the verified project context in `PROJECT.md`/`CLAUDE.md`/`MILESTONES.md`. Items marked **[VERIFY]** should be confirmed against current official docs before commitment — they change often and affect cost/architecture. The *shape* of a small-app cloud migration is well-established and stable; the *pricing/tier details* are the volatile part.

---

## Framing: "Features" = Operational Capabilities

This milestone builds no business features. The v5 app is functionally complete. The "features" here are the operational capabilities a production cloud deployment needs so the Start Academy team can work without Laurent's Mac being on. Judged against the reality of a **2-5 user internal tool**, not a public SaaS.

**Grounding assets already in place (dependencies to lean on, not rebuild):**
- `staging-vercel` branch exists; E1-E4 done (env split, dump-hors-repo, Supabase data-only restore proven **5822=5822, 0 écart**, cloud-ready audit). Confirmed: no `vercel.json`, no `.github/workflows/` in tree yet.
- LLM already cloud (Phase 16, `AI_PROVIDER=openrouter`, `callLlm` gateway) → no GPU host needed.
- RBAC 6 rôles + Lucia sessions + `tenantId` scoping shipped → auth/isolation ready.
- Env discipline: single `.env` root, validated by `@t3-oss/env-nextjs`, `turbo.json globalEnv` (35+ vars), `.env.example` documented → secrets inventory already exists.
- Storage adapter is `@aws-sdk/client-s3` against MinIO → S3-compatible swap to Supabase Storage is a config/endpoint change, not a rewrite.
- Worker already a separate process (`scripts/closure-worker.ts`, BullMQ) → just needs a host.

---

## Feature Landscape

### Table Stakes (Production Cloud Migration Cannot Ship Without These)

Missing any of these = the migration is not "production." All are non-negotiable even for 2-5 users.

| Capability | Why Expected | Complexity | Notes / Dependency |
|---|---|---|---|
| **App on Vercel, Node runtime** | The whole point: app reachable without the Mac | MEDIUM | Dégel staging: flag `NEXT_PUBLIC_APP_ENV`, filigrane, garde PDF, `vercel.json`. Prisma+BullMQ ⇒ Node runtime (Edge explicitly out per PROJECT.md). Confirm `next build` on Vercel with monorepo/Turborepo root dir. |
| **Supabase Postgres EU region** | Data must run cloud; RGPD needs EU | MEDIUM | Region choice is **permanent** — pick `eu-central` / `eu-west` at project creation. Pooler `:6543` (PgBouncer, transaction mode) for app; direct `:5432` for `prisma migrate deploy`. Set `DATABASE_URL` (pooled) + `DIRECT_URL` (direct) in Prisma. **[VERIFY]** exact EU region + pooler port conventions. |
| **`prisma migrate deploy` on prod** | Schema must be applied non-interactively; 20 existing migrations | LOW | Memory lesson already logged: `migrate deploy` ≠ `generate`; interactive `migrate dev` breaks in sandbox. Run against `DIRECT_URL` (:5432), not pooler. Must run before cutover data load. |
| **Object storage: MinIO → Supabase Storage** | PII (RIB/CNI) + generated PDFs must live cloud | MEDIUM | S3-compatible: point `@aws-sdk/client-s3` endpoint + creds at Supabase Storage. Migrate existing objects (bucket copy). Keep bucket **private** + **signed URLs** (already the pattern for `Person.ribKey`). |
| **Object migration (data copy)** | Existing MinIO objects (docs, RIBs) can't be lost | MEDIUM | One-time copy MinIO→Supabase (`rclone`/`aws s3 sync` between S3 endpoints, or re-upload script reusing `lib/storage.ts`). Verify object count + a signed-URL fetch post-copy, same rigor as the 5822=5822 DB check. |
| **Upstash Redis (BullMQ backend)** | Workers need Redis; can't run local Redis in cloud | LOW | `ioredis` already used. Upstash is Redis-over-TLS; confirm BullMQ compat (needs `maxRetriesPerRequest: null` + TLS URL). EU region. **[VERIFY]** Upstash BullMQ compatibility notes + free/pay-as-you-go command caps. |
| **Worker host (3rd host)** | 3 BullMQ workers (closure/veille/factures) + Gotenberg + WeasyPrint + poppler can't run on Vercel | MEDIUM–HIGH | Railway or Fly.io. Long-running process, not serverless. Gotenberg (Chromium) + WeasyPrint (Python) + poppler-utils in the same container/host. This is the heaviest single item. |
| **Worker recalibration for cloud** | Local heritage concurrency=3/timeout 600s wrong for cloud latencies | MEDIUM | Claude latencies 6-12s/doc (SES-0093). Retune timeout 600s→~120s, concurrency. Watch stub rate AND OpenRouter cost. Explicit in PROJECT.md target features. |
| **Secrets across 3 platforms** | Vercel + Supabase + Upstash + worker host each need env; no secrets in git | MEDIUM | Inventory exists (`.env.example`, `turbo.json globalEnv`). Map each var → each platform's env store. **No secrets in Make-style plaintext vars** (global rule). Rotate the DB/Redis/storage creds that were ever local. |
| **Cutover / bascule plan** | Going live is a discrete, risky step | MEDIUM | Final dump (data-only restore already rehearsed), DNS, user invitations. Define a **downtime window** (acceptable to freeze the app for an internal team — no 24/7 SLA). Sequence: freeze → final dump → restore → object sync → smoke → DNS → invite. |
| **Rollback plan** | If cutover breaks, must revert fast | MEDIUM | Keep local Docker stack intact + final pre-cutover dump retained. Rollback = point users back to local (or previous state) until fixed. Because it's internal, rollback can be "stop, fix, retry tomorrow" — but the plan must be written, not improvised (memory: destructif = étape séparée). |
| **CI: lint + tsc + tests on PR (CI-01)** | Multi-user + cloud justifies a gate; decided 2026-07-04 | LOW | GitHub Actions: `pnpm install`, `turbo run lint`, `tsc --noEmit`, `vitest run`. Pin pnpm 10.33.2 / Node 20. First `.github/workflows/`. Cache pnpm store + turbo. |
| **E2E smoke safety net (TEST-01/02)** | Filet avant bascule prod; explicit v6 gap | MEDIUM | Playwright: one critical closure flow (TEST-01) + protected-routes smoke / auth redirect (TEST-02). No Playwright config in tree yet (Makefile mentions it). Enough to catch a broken deploy, not full coverage. |
| **RGPD DPA registry (RGPD-DPA)** | Legal obligation; engaged by GO 2026-07-04 | LOW | Documentation-only: register sub-processors (OpenRouter, Anthropic, Supabase, Vercel, Upstash, Railway/Fly) in registre des traitements, confirm each offers a DPA + EU/adequate transfer. One-time doc pass. Prioritaire. |
| **EU data residency (all tiers)** | PII of French learners; Qualiopi-adjacent | LOW–MEDIUM | Ensure Postgres + Storage + Redis + worker host regions are all EU. Vercel functions region → set EU (`fra1`/`cdg1`). Confirm OpenRouter/Anthropic routing acceptable (documented in DPA, not region-lockable). **[VERIFY]** each platform's EU region + Vercel function region config. |
| **Basic monitoring / health visibility** | Can't operate blind once Mac is off | LOW | Vercel logs + Supabase logs (built-in, free). Worker health = a heartbeat/ping or BullMQ job success log. Minimal is fine — see anti-features. |
| **Cost alerts (OpenRouter / Upstash / Supabase)** | Usage-billed services can surprise; budget 60-80€/mo | LOW | Set spend caps / alerts where available: OpenRouter has a credit balance model; Upstash pay-as-you-go; Supabase spend cap. This is the real "runaway cost" guard for a small app. **[VERIFY]** which platforms expose hard caps vs alerts. |

### Differentiators (Nice Operational Wins — Add Value, Not Required for Launch)

These make operations smoother but the migration succeeds without them. Align with "keep it small."

| Capability | Value Proposition | Complexity | Notes |
|---|---|---|---|
| **Vercel preview deployments per PR** | Each PR gets a live URL to eyeball before merge; pairs with CI gate | LOW | Nearly free on Vercel; the catch is a preview needs a **DB** — point previews at a shared staging Supabase (or a branch DB), never prod. **[VERIFY]** Supabase branching for ephemeral preview DBs vs a single shared staging project. For 2-5 users a **single persistent staging project** is simpler than per-branch DBs. |
| **Supabase PITR (Point-in-Time Recovery)** | Restore to any second, not just daily snapshot | LOW (toggle) | **[VERIFY]** PITR is a paid add-on above the base plan. For 2-5 users, **daily automated backups + a weekly `pg_dump` to owned storage** may be enough and cheaper. Decide by data-loss tolerance (a day of re-entry vs €/mo). |
| **`pg_dump` cron to owned storage** | Vendor-independent backup you control (not locked to Supabase) | LOW | Belt-and-suspenders: nightly `pg_dump` from worker host → Supabase Storage or off-site. Cheap insurance; you already dump routinely (memory habit). Recommended even if PITR is on. |
| **Staging environment kept alive post-migration** | Test migrations/features before prod; the branch already exists | MEDIUM | Second Supabase project + Vercel preview target. Ongoing ~small cost. Worth it: you'll keep shipping features to a live prod. E1-E4 already built the muscle. |
| **Deploy gate: CI green required to deploy** | Broken build can't reach prod | LOW | GitHub branch protection: require CI checks before merge to `main`; Vercel deploys `main`. Cheap, high safety ROI. |
| **Structured error tracking (Sentry free tier)** | Stack traces from prod without SSHing to logs | LOW | Optional. Vercel+Supabase logs cover the minimum; Sentry helps if runtime bugs appear post-cutover. Defer unless pain shows. |
| **Uptime ping (cron-job.org / BetterStack free)** | Know if app/worker is down before a user complains | LOW | A single external ping on the app URL + a worker heartbeat endpoint. Cheap peace of mind for an app running unattended. |

### Anti-Features (Over-Engineering to Explicitly Skip for a 2-5 User Internal Tool)

The core risk of a "production migration" is importing SaaS-scale practices into a tiny internal app. Reject these.

| Anti-Feature | Why It Gets Requested | Why Problematic Here | Do Instead |
|---|---|---|---|
| **Kubernetes / container orchestration** | "Production means k8s" | Massive ops overhead for 3 workers + 2 sidecars; nobody to run it | Single Railway/Fly service (or a couple), managed platform |
| **Multi-region / geo-replication** | "High availability" | 2-5 users in one office; one EU region is correct and required | Single EU region, accept region-level RTO |
| **Blue-green / zero-downtime cutover** | "No downtime" | Internal team tolerates a scheduled freeze; complexity not worth it | Scheduled maintenance window + rollback plan |
| **Autoscaling / load balancing workers** | "Scale for traffic" | Load is a handful of closure packs/day; concurrency tuning suffices | Fixed small concurrency, retune manually |
| **Enterprise SSO / SAML / SCIM** | "Enterprise auth" | Lucia + invitations + 6 roles already fits; SSO adds a vendor + cost | Keep Lucia; maybe add password reset later |
| **Full E2E coverage / high test %** | "Test everything before prod" | Brittle, slow, ROI-negative (already an Out-of-Scope decision) | One closure E2E + smoke routes (TEST-01/02) only |
| **Read replicas / connection-pool clusters** | "Scale the DB" | The pooler `:6543` alone covers serverless connection fan-out | Just use Supabase pooler + sane Prisma pool size |
| **Datadog / Grafana / full observability stack** | "Real monitoring" | Cost + setup dwarfs the app; platform logs already exist | Vercel + Supabase logs + one uptime ping |
| **IaC (Terraform/Pulumi) for 3 platforms** | "Reproducible infra" | You provision once; IaC is maintenance debt for a one-off | Document setup in a runbook `.md`; click-ops is fine once |
| **Separate DB per PR (branch DBs) as default** | "Isolated previews" | Overhead + cost for 2-5 users; migrations churn many DBs | One shared staging Supabase for all previews |
| **Multi-tenant productionization / SaaS hardening** | "It's multi-tenant already" | Single tenant in prod; out of scope per PROJECT.md | Keep `tenantId` scoping discipline; don't build tenant onboarding |
| **Custom secrets manager (Vault, etc.)** | "Secure secrets" | Three platforms' native env stores are sufficient | Use each platform's env vars; rotate the once-local creds |

---

## Feature Dependencies

```
[Supabase Postgres EU project created]
    └──requires──> [prisma migrate deploy on :5432 direct]
                       └──requires──> [final data dump + restore (rehearsed 5822=5822)]

[Supabase Storage bucket (private)]
    └──requires──> [MinIO→Supabase object migration]
                       └──enables──> [signed-URL PII access in prod]

[Upstash Redis EU] ──requires──> [Worker host (Railway/Fly) with Gotenberg+WeasyPrint+poppler]
                                       └──requires──> [Worker recalibration (timeout/concurrency)]

[Secrets mapped across 3 platforms] ──gates──> [App on Vercel] , [Worker host], [any deploy]

[CI-01 GitHub Actions green] ──gates──> [Deploy to prod (branch protection)]
[TEST-01/02 Playwright smoke] ──enhances──> [Cutover confidence] , [CI-01]

[Cutover / bascule] ──requires──> ALL of: DB restored, objects migrated, workers up,
                                   secrets set, app deployed, smoke green
    └──paired-with──> [Rollback plan] (local Docker + retained pre-cutover dump)

[RGPD-DPA registry] ──requires──> [final vendor list known] (⇒ do after host choices locked)
[EU region selection] ──blocks──> [Supabase project] , [Vercel functions] , [Upstash] , [worker host]
                                   (region is permanent — decide FIRST)
```

### Dependency Notes

- **Region selection blocks everything and is irreversible:** choose EU region *before* creating the Supabase project, Vercel function region, Upstash DB, and worker host. A wrong region = recreate + re-migrate. This is the true "phase 0."
- **Secrets gate every deploy target:** map the `.env.example` inventory to Vercel / Supabase / Upstash / worker host *before* first deploy, or deploys fail loud (env validated at import time via `@t3-oss/env-nextjs`).
- **`migrate deploy` before data load:** schema must exist before the restore, and must run on the **direct** port, not the pooler.
- **Object migration mirrors the DB restore rigor:** the 5822=5822 discipline applies to objects too — count + spot-fetch a signed URL after copy.
- **DPA registry comes late:** it can only be completed once the final vendor set (Railway *or* Fly) is chosen, so it trails host selection even though it's "just documentation."
- **Rollback is inseparable from cutover:** never plan the bascule without the written revert path in the same breath (memory: destructif = étape séparée; pg_dump + invariants).

---

## MVP Definition

### Launch With (v6 cutover — the actual "go live")

Ruthless minimum to have the team working on cloud without the Mac.

- [ ] **EU region locked** across all platforms — irreversible, decide first
- [ ] **App on Vercel** (staging dégel: flag/filigrane/garde PDF/`vercel.json`), Node runtime, EU function region
- [ ] **Supabase Postgres EU** with pooler+direct wired into Prisma; `migrate deploy` applied
- [ ] **Supabase Storage** private bucket + **MinIO objects migrated** + signed URLs working
- [ ] **Upstash Redis EU** + **worker host (Railway/Fly)** running 3 workers + Gotenberg + WeasyPrint + poppler
- [ ] **Worker recalibrated** (timeout ~120s, concurrency) — verify one real closure pack end-to-end in cloud
- [ ] **Secrets set on all 4 platforms**, once-local creds rotated
- [ ] **CI-01** green (lint+tsc+vitest on PR) + branch protection gate
- [ ] **TEST-01/02** smoke (closure flow + protected routes) passing
- [ ] **Cutover runbook + rollback plan** written; downtime window agreed
- [ ] **RGPD-DPA registry** entries for all sub-processors
- [ ] **Cost alerts** on OpenRouter + Upstash + Supabase; **daily backups** confirmed on

### Add After Validation (v6.x — first weeks running cloud)

- [ ] **Persistent staging environment** kept alive (2nd Supabase + Vercel preview target) — trigger: first post-cutover feature to ship
- [ ] **Vercel preview deployments** wired to shared staging DB — trigger: staging alive
- [ ] **`pg_dump` cron to owned storage** — trigger: confirm vendor-lock discomfort / audit ask
- [ ] **Uptime ping** on app + worker heartbeat — trigger: first "was it down?" moment

### Future Consideration (defer indefinitely unless pain appears)

- [ ] **Supabase PITR** — defer: daily backups likely enough for 2-5 users; enable only if data-loss tolerance tightens
- [ ] **Sentry error tracking** — defer: platform logs cover minimum; add if runtime bugs recur
- [ ] **DOC-01/02 RGPD export/erasure endpoints** — v6 backlog, not migration-blocking

---

## Feature Prioritization Matrix

| Capability | User/Ops Value | Implementation Cost | Priority |
|---|---|---|---|
| EU region locked everywhere | HIGH | LOW | P1 |
| App on Vercel (staging dégel) | HIGH | MEDIUM | P1 |
| Supabase Postgres EU + migrate deploy | HIGH | MEDIUM | P1 |
| Supabase Storage + object migration | HIGH | MEDIUM | P1 |
| Upstash Redis + worker host + sidecars | HIGH | HIGH | P1 |
| Worker recalibration (timeout/concurrency) | HIGH | MEDIUM | P1 |
| Secrets across 3 platforms | HIGH | MEDIUM | P1 |
| Cutover + rollback plan | HIGH | MEDIUM | P1 |
| CI-01 (lint+tsc+tests on PR) | MEDIUM | LOW | P1 |
| TEST-01/02 smoke E2E | MEDIUM | MEDIUM | P1 |
| RGPD-DPA registry | HIGH (legal) | LOW | P1 |
| EU region config on Vercel functions | MEDIUM | LOW | P1 |
| Cost alerts (OpenRouter/Upstash/Supabase) | MEDIUM | LOW | P1 |
| Daily backups confirmed on | MEDIUM | LOW | P1 |
| Persistent staging env | MEDIUM | MEDIUM | P2 |
| Vercel preview deployments | MEDIUM | LOW | P2 |
| pg_dump cron (owned backup) | MEDIUM | LOW | P2 |
| Deploy gate (branch protection) | MEDIUM | LOW | P2 |
| Uptime ping / worker heartbeat | LOW–MEDIUM | LOW | P2 |
| Supabase PITR | LOW | LOW | P3 |
| Sentry error tracking | LOW | LOW | P3 |

**Priority key:** P1 = must have for cutover · P2 = add in first weeks · P3 = defer.

---

## Competitor Feature Analysis

Not a product-competition question — this is "how do comparable small-app cloud migrations get structured." Reference patterns:

| Concern | Typical SaaS-scale approach | Typical solo/small-team approach | Our approach (2-5 users) |
|---|---|---|---|
| Environments | prod + staging + dev, per-branch DBs | prod + one staging | **prod + one persistent staging** (branch already built) |
| Backups | PITR + cross-region + offsite | daily snapshots | **daily snapshots + optional weekly pg_dump**, PITR deferred |
| Workers | k8s + autoscale | single managed service | **one Railway/Fly service**, fixed small concurrency |
| CI/CD | full pipeline + canary | lint+test+deploy on merge | **GH Actions lint+tsc+vitest + branch protection** |
| Monitoring | Datadog/Grafana/APM | platform logs + Sentry | **platform logs + cost alerts**, Sentry/ping deferred |
| Cutover | blue-green zero-downtime | maintenance window | **scheduled freeze + rehearsed restore + rollback** |
| Secrets | Vault/secrets manager | platform env vars | **platform env vars across 3 hosts** |

The consistent lesson: for an internal 2-5 user tool, the small-team column is correct; reaching into the SaaS-scale column is the primary failure mode (wasted time, ongoing cost, ops burden).

---

## Sources

- `PROJECT.md` (Current Milestone v6 section, Constraints, Out of Scope) — HIGH confidence, authoritative project context
- `MILESTONES.md`, `CLAUDE.md` (stack, architecture, storage adapter, worker process) — HIGH confidence
- Repo inspection: `staging-vercel` branch present; no `vercel.json` / `.github/workflows/` yet — HIGH confidence (direct git check)
- Auto-memory: restore proven 5822=5822; `migrate deploy` ≠ `generate`; destructif=étape séparée; worker no-React-imports; xlsx buffer read — HIGH confidence (project-lived lessons)
- Platform mechanics (Supabase pooler ports, EU regions, PITR tiering; Vercel preview/Node runtime/function regions; Upstash BullMQ/TLS; Railway/Fly worker hosting) — MEDIUM confidence, **training data (Jan 2026 cutoff), not verified live this session** — see **[VERIFY]** flags

---
*Feature research for: production cloud migration of a small internal multi-user app (QualiOF v6, Supabase + Vercel + Upstash + Railway/Fly)*
*Researched: 2026-07-04*
