# External Integrations

**Analysis Date:** 2026-05-12

## APIs & External Services

**LLM (local-first):**
- Ollama HTTP API - generation + vision models running locally
  - SDK/Client: native `fetch` adapter at `apps/web/src/lib/ai-ollama.ts`
  - Endpoint: `OLLAMA_URL` (default `http://localhost:11434`)
  - Auth: none (local service)
  - Calls: `POST /api/generate` with `format: 'json'` for structured output
  - Models declared in env: `OLLAMA_MODEL_FAST=mistral-small:24b`, `OLLAMA_MODEL_REASONING=qwen3:30b-a3b`, `OLLAMA_MODEL_EMBED=nomic-embed-text:latest`, `OLLAMA_MODEL_VISION=qwen2.5vl:7b`
  - Use cases:
    - Closure pack content generation (QCM, GRILLE_OBS, ANALYSE_BESOIN, POSITIONNEMENT, SATISFACTION_CHAUD/FROID, DEROULE) - `apps/web/src/lib/closure/ollama-generators.ts`, prompts in `apps/web/src/lib/closure/qualiopi-prompts.ts` (PROMPT_VERSION `qualiopi-gen-v4-2026-05-07`)
    - Pre-enrollment document extraction (CNI, RIB, CFP) - `apps/web/src/lib/preinscription-extractor.ts` (prompt v1-2026-04)
    - PDF text extraction fallback OCR for image scans - `apps/web/src/lib/pdf-extract.ts`
  - Default timeout 600 000 ms (10 min); abort signal wired
  - Worker concurrency capped at 3 to avoid Apple Silicon GPU saturation

**LLM (cloud fallback - declared, not wired):**
- Anthropic Claude
  - Env vars: `ANTHROPIC_API_KEY` (empty in `.env.example`), `ANTHROPIC_MODEL=claude-sonnet-4-7`
  - No SDK installed (`@anthropic-ai/sdk` absent from `apps/web/package.json`)
  - Provider switch declared in `packages/shared/src/env.ts`: `AI_PROVIDER: 'ollama' | 'anthropic' | 'qualiopi-gen'`

**Pedagogical AI (Qualiopi Gen - declared, not actively called):**
- Supabase Edge Functions (project `vgyxuuryaslqevkpvkjk`)
  - Env vars: `QUALIOPI_GEN_URL`, `QUALIOPI_GEN_TOKEN`
  - Purpose declared: "service IA pédagogique externe (analyse besoin, QCM, grille obs, déroulé, compétences)"
  - Status: prompts now ported in-house (`apps/web/src/lib/closure/qualiopi-prompts.ts`); Edge Function not invoked from current code (no `fetch(QUALIOPI_GEN_URL...)` in `apps/web/src/`)

**HTML→PDF rendering (self-hosted):**
- Gotenberg 8 (Chromium) - general PDFs (programme, convention, invoice, AGEFICE recap)
  - Endpoint: `GOTENBERG_URL` (default `http://localhost:3001`)
  - Adapter: `renderHtmlToPdf()` in `apps/web/src/lib/pdf-render.ts`
  - Uses multipart/form-data POST to `/forms/chromium/convert/html`
  - Containerized via `docker-compose.yml` (image `gotenberg/gotenberg:8`)
- WeasyPrint 60.2 (CSS Paged Media) - Qualiopi closure docs needing repeated footers
  - Endpoint: `WEASYPRINT_URL` (default `http://localhost:5001`)
  - Adapter: `renderHtmlToPdfWeasy()` in `apps/web/src/lib/pdf-render.ts`
  - Custom Python micro-service: `docker/weasyprint/server.py` (Flask + Gunicorn, exposes `POST /pdf` and `GET /health`)
  - Built locally from `docker/weasyprint/Dockerfile`
  - Rationale: Chromium downscales footers unpredictably; WeasyPrint supports `@page { @bottom-center { content: element(footer) } }` running elements

**Doc Engine (declared, not implemented):**
- Env var `DOC_ENGINE_URL=http://localhost:5000` and `DOC_ENGINE_TOKEN` (optional)
- Referenced in `turbo.json` and `packages/shared/src/env.ts`
- No micro-service present in repo (was a planned palier 3 Python service, superseded by WeasyPrint)

## Data Storage

**Databases:**
- PostgreSQL 16 (Alpine container `postgres:16-alpine`)
  - Connection: `DATABASE_URL=postgresql://qualiof:qualiof_dev@localhost:5432/qualiof?schema=public`
  - Client: Prisma 5.22.0
  - Singleton at `packages/db/src/index.ts` (re-exports all `@prisma/client` types)
  - Schema: `packages/db/prisma/schema.prisma` (1263 lines)
  - Extensions enabled: `pgcrypto`, `uuid_ossp`, `pg_trgm` (fuzzy search), `unaccent`
  - 20 migrations under `packages/db/prisma/migrations/` (latest: `20260507162034_add_opco_submission`)
  - Domain models grouped:
    - **Tenant / Auth**: `Tenant`, `User`, `AuthSession`, `AuditLog`
    - **Person × Org pivot**: `Person`, `Organization`, `LegalLink` (resolves EI multi-casquettes), `Contact`, `SensitiveData`, `BillingProfile`
    - **Catalogue**: `TrainingProduct`, `TrainingModule`
    - **Sessions**: `TrainingSession`, `Location`, `SessionTrainer`, `SessionSlot`, `TrainerAvailability`
    - **Inscriptions**: `SessionParticipant` (rich; 14 Qualiopi booleans, OPCO timeline, `dossierType`), `Attendance`
    - **Pipeline commercial**: `Lead`, `LeadAction`
    - **Facturation**: `Invoice`, `InvoicePayment`
    - **Documents Qualiopi**: `QualiopiDocCatalog`, `DocumentTemplate`, `Document`
    - **Email**: `EmailTemplate`, `EmailMessage`
    - **OPCO référentiel**: `OpcoCatalog`, `OpcoSubmission` (+ enum `OpcoSubmissionStatus`)
    - **AGEFICE**: `AgeficeProfile` (54 PDF fields), `AgeficePointAccueil` (438 PA référentiel)
    - **Pré-inscription publique**: `PreEnrollment` (token URL, IA pipeline)
    - **Pédagogique IA**: `PedagogicalAsset`, `AIGenerationJob` (with `promptVersion` for audit Qualiopi)
    - **Tâches**: `Task`, `InternalComment`
    - **Pack fin de formation (BullMQ)**: `ClosureBatch`, `ClosureJob` (status transitions PENDING→RUNNING→COMPLETED|PARTIAL|FAILED)
    - **External sync mapping**: `ExternalIdentity` (sources `smartof | qualiopi-gen | airtable`)

**Object Storage (S3-compatible):**
- MinIO (container `minio/minio:latest`)
  - Endpoints: API `http://localhost:9000`, Console `http://localhost:9001`
  - Env vars: `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_FORCE_PATH_STYLE=true`
  - Credentials (dev): `qualiof / qualiof_dev_minio`
  - Buckets:
    - `qualiof-docs` (`S3_BUCKET_DOCS`) - generated PDFs (attestations, conventions, AGEFICE…)
    - `qualiof-templates` (`S3_BUCKET_TEMPLATES`) - DOCX/PDF templates
    - `preinscriptions` (hardcoded `PREENROLLMENT_BUCKET` in `apps/web/src/lib/storage.ts`) - CNI/RIB/CFP uploads
  - Adapter: `apps/web/src/lib/storage.ts` (`uploadFile`, `downloadFile`, `ensureBucket`)
  - Buckets auto-created on first write (`HeadBucketCommand` then `CreateBucketCommand` if 404)

**File Storage (filesystem-bundled):**
- `apps/web/src/assets/` - static binary assets versioned in repo:
  - `agefice-template.pdf` (92 form fields, AGEFICE 2023-2024 template)
  - `signature-laurent.png`, `tampon-signature-fusion.png` (PDG signature for AGEFICE & conventions)
  - `logo-start-academy.png`, `logo-qualiopi.png`, `logo-ministere-travail.png`, `logo-white.png`

**Job Queue / Cache:**
- Redis 7 (Alpine `redis:7-alpine`)
  - Connection: `REDIS_URL=redis://localhost:6379`
  - Client: ioredis 5.10.1
  - Used exclusively as BullMQ broker (no caching layer detected)
  - Two singleton connections in `apps/web/src/lib/closure/redis.ts`:
    - `getQueueRedis()` - producer side (server actions enqueue closure jobs)
    - `getWorkerRedis()` - consumer side (closure worker process)
  - Both use `maxRetriesPerRequest: null` (BullMQ requirement)
  - Single queue today: `closure-generation`

## Authentication & Identity

**Auth Provider:**
- Lucia v3 (custom, self-hosted)
  - Implementation: `apps/web/src/lib/auth.ts`
  - Adapter: `@lucia-auth/adapter-prisma` against `prisma.authSession` and `prisma.user`
  - Password hashing: argon2 0.41.1 (`apps/web/src/app/login/actions.ts`)
  - Session cookie: `expires: false`, `secure: NODE_ENV === 'production'`
  - User attributes exposed: `email`, `firstName`, `lastName`, `role`, `tenantId`
  - `validateRequest()` is React-`cache`d for the request lifecycle
  - Roles enum (`UserRole` in schema): `ADMIN | MANAGER | FORMATEUR | COMMERCIAL | COMPTABLE | LECTEUR`
- Env vars: `AUTH_SECRET` (>=32 chars, use `openssl rand -hex 32`), `SESSION_LIFETIME=2592000` (30 days)

**Multi-tenant scoping:**
- `tenantId` propagated through every query - server actions read it from the validated session
- `Tenant` model (`packages/db/prisma/schema.prisma`) with default seeded from env `TENANT_DEFAULT_NAME=Start Academy`, `TENANT_DEFAULT_NUM_DA`, `TENANT_DEFAULT_SIRET`

## Monitoring & Observability

**Error Tracking:**
- None wired (no Sentry, no PostHog, no Datadog SDK in dependencies)

**Logs:**
- `console.log/warn/error` only
- Prisma query logs gated on `NODE_ENV === 'development'` (`packages/db/src/index.ts`)
- BullMQ worker logs `completed | failed | error` events to console (`apps/web/src/lib/closure/worker.ts`)
- Mailer logs `[mailer:dry-run]` when no SMTP host configured
- `LOG_LEVEL` env declared (`fatal | error | warn | info | debug | trace`) but not consumed by a logger framework

**Audit:**
- `AuditLog` model (`packages/db/prisma/schema.prisma:980`) - per-tenant action trail (`entity`, `entityId`, `action`, `diff`, `ip`, `userAgent`)

## CI/CD & Deployment

**Hosting:**
- Not declared in repo - no `vercel.json`, no `Dockerfile` for the Next.js app, no `Procfile`
- Local dev only at this snapshot; production deployment plan not committed

**CI Pipeline:**
- None present (no `.github/workflows/`, no `.gitlab-ci.yml`, no `circle.yml`)

**Cron jobs:**
- Two App Router endpoints intended for external cron triggering:
  - `apps/web/src/app/api/cron/preinscription-reminders/route.ts` - relances pré-inscriptions (max 3, 6 days cooldown)
  - `apps/web/src/app/api/cron/opco-submission-reminders/route.ts` - relances dossiers OPCO
  - Both authenticate via `Authorization: Bearer ${CRON_SECRET}` header
  - Triggering options documented inline: cron-job.org, GitHub Actions, launchd

## Environment Configuration

**Required env vars (critical for boot):**
- `DATABASE_URL` (Postgres, mandatory)
- `AUTH_SECRET` (>=32 chars, mandatory)
- `REDIS_URL` (mandatory for BullMQ closure worker)
- `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` (MinIO)
- `OLLAMA_URL`, `OLLAMA_MODEL_FAST`, `OLLAMA_MODEL_REASONING` (closure pack & extraction)
- `GOTENBERG_URL`, `WEASYPRINT_URL` (PDF rendering)

**OF identity vars (used in PDFs):**
- `OF_NAME`, `OF_SIRET`, `OF_RNQ`, `OF_ADDRESS_*`, `OF_PHONE`, `OF_EMAIL`, `OF_TVA_INTRA`, `OF_IBAN`, `OF_BIC`
- `OF_RESP_*` (signataire conventions/AGEFICE), `OF_CONTACT_*` (interlocuteur jour-le-jour)
- Centralized read in `apps/web/src/lib/of-config.ts` (`getOfConfig()`)

**Optional / future:**
- `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (cloud LLM fallback - not wired)
- `RESEND_API_KEY` (alt mail provider - not wired, only nodemailer used today)
- `YOUSIGN_API_KEY`, `YOUSIGN_BASE_URL` (e-signature future palier - not wired)
- `QUALIOPI_GEN_URL`, `QUALIOPI_GEN_TOKEN` (Supabase Edge Functions - prompts now in-house)
- `CRON_SECRET` (required for `/api/cron/*` endpoints; 503 if missing)
- `CLOSURE_WORKER_CONCURRENCY` (default 3), `CLOSURE_OLLAMA_MODEL`, `CLOSURE_OLLAMA_MODEL_DEROULE`, `CLOSURE_QCM_QUESTIONS` (default 13)
- `MAIL_DRY_RUN`, `MAIL_FROM`, `MAIL_REPLY_TO`

**Secrets location:**
- `.env` at monorepo root (gitignored - `.gitignore:13`)
- Validated by `packages/shared/src/env.ts` (Zod via `@t3-oss/env-nextjs`)
- Loaded into Next via `apps/web/next.config.mjs` (`dotenv.config({ path: '../../.env' })`)
- Loaded into scripts/workers via `dotenv-cli -e ../../.env --`
- `airtable-snapshot/` directory and `*.xlsx` files gitignored (`.gitignore:35-38`) for RGPD

## Email (SMTP)

**Provider:**
- Custom SMTP via nodemailer 8.0.7
- Adapter: `apps/web/src/lib/mailer.ts` (`sendMail()`)
- Auto dry-run when `SMTP_HOST` empty (no real send, console log only)

**Env vars:**
- `SMTP_HOST`, `SMTP_PORT` (default 465), `SMTP_SECURE` (auto true if port=465), `SMTP_USER`, `SMTP_PASS`
- `MAIL_FROM` (fallback `${OF_NAME} <${OF_EMAIL}>` from `of-config.ts`)
- `MAIL_REPLY_TO` (optional)

**Use cases:**
- Pre-enrollment public link send + reminders (`apps/web/src/app/api/cron/preinscription-reminders/route.ts`)
- OPCO dossier submission to financeur with PDF attachments (`apps/web/src/server/actions/opco-submission.ts` - `sendOpcoSubmission`)
- OPCO submission reminders (cron route)
- Email templates HTML (no MJML library installed despite `EmailTemplate.bodyMjml` field - templates are plain HTML strings in `apps/web/src/lib/preinscription-reminder-template.ts` etc.)

**Tracking:**
- `EmailMessage` Prisma model logs `status: queued | sent | bounced` and `sentAt`
- `OpcoSubmission.threadId` stores nodemailer messageId for follow-up

## Webhooks & Callbacks

**Incoming:**
- None - no webhook endpoints under `apps/web/src/app/api/`
- The two `/api/cron/*` routes are pull-based (called by external cron with shared secret), not push webhooks

**Outgoing:**
- None - no third-party webhook calls (no Stripe, no Slack, no Discord, etc.)

## Third-party Data Sources (one-shot imports, not live integrations)

**Airtable (legacy migration):**
- Snapshots imported via `packages/db/scripts/import-airtable.ts` (apprenants, formateurs, sessions, structures, inscriptions, opco)
- Snapshot folder `packages/db/airtable-snapshot/` (gitignored - RGPD)
- Tracked via `ExternalIdentity` model (`source: "airtable"`)

**SmartOF (Excel exports):**
- Import scripts: `packages/db/scripts/import-smartof.ts`, `import-smartof-sessions.ts`
- Tracked via `ExternalIdentity.source = "smartof"`

**AGEFICE Points d'Accueil:**
- Référentiel des 438 PA importé via `packages/db/scripts/import-agefice-pa.ts`
- Source: `agefice.fr` (versioning `source = "agefice.fr-2025"` in `AgeficePointAccueil` model)

**Trésorerie AGEFICE:**
- `packages/db/scripts/import-treso-agefice.ts` - imports virements AGEFICE pour réconciliation paiements

## OPCO / AGEFICE Workflow (in-house, no external API)

The OPCO workflow is entirely email-driven and document-centric (no AGEFICE API):
- Reference data: `OpcoCatalog` model + `AgeficeProfile` (54 form fields) + `AgeficePointAccueil` (438 PA)
- AGEFICE PDF form fill: `apps/web/src/lib/agefice-form-fill.ts` uses `pdf-lib` to write into the official 92-field PDF (`apps/web/src/assets/agefice-template.pdf`) and stamp the PDG signature
- Submission flow: `apps/web/src/server/actions/opco-submission.ts`
  - `composeOpcoSubmission()` - builds DRAFT with PJ (CNI, RIB, CFP_ATTESTATION, AGEFICE_PA_FORM, CONVENTION, PROGRAMME)
  - `sendOpcoSubmission()` - SMTP send via nodemailer, status DRAFT→SENT
  - `markOpcoSubmissionStatus()` - manual status updates (APPROVED/REJECTED/REIMBURSED) syncing into `SessionParticipant.opcoApproved/opcoReimbursed`
- Reminders: `apps/web/src/app/api/cron/opco-submission-reminders/route.ts`

---

*Integration audit: 2026-05-12*
