# Technology Stack

**Analysis Date:** 2026-05-12

## Languages

**Primary:**
- TypeScript 5.7.2 - Web app (`apps/web/`), DB layer (`packages/db/`), shared utilities (`packages/shared/`)

**Secondary:**
- Python 3.12 - WeasyPrint micro-service for PDF rendering (`docker/weasyprint/server.py`)
- SQL (PostgreSQL dialect) - Prisma migrations under `packages/db/prisma/migrations/` (20 migrations)

## Runtime

**Environment:**
- Node.js >=20 (declared in `package.json` engines, `.nvmrc` pins to `20`)
- Module type: ESM (`"type": "module"` in workspace packages)
- TypeScript target: ES2022, module: ESNext, moduleResolution: Bundler (`tsconfig.base.json`)

**Package Manager:**
- pnpm 10.33.2 (declared in `package.json` packageManager field)
- Lockfile: `pnpm-lock.yaml` present (~290k lines)
- Workspaces: `apps/*` and `packages/*` (`pnpm-workspace.yaml`)

**Build orchestrator:**
- Turborepo 2.3.0 (`turbo.json` defines tasks: build, dev, lint, test, db:generate)

## Frameworks

**Core:**
- Next.js 14.2.21 - App Router, React Server Components, Server Actions (`apps/web/next.config.mjs`)
  - `experimental.typedRoutes: true`
  - `experimental.serverActions.bodySizeLimit: '40mb'` (for CNI/RIB/CFP uploads up to 3 files × 10 Mo)
  - `transpilePackages: ['@qualiof/db', '@qualiof/shared']`
- React 18.3.1 + react-dom 18.3.1
- Tailwind CSS 3.4.17 with `tailwindcss-animate` plugin (`apps/web/tailwind.config.ts`)
  - Custom Start Academy palette (primary `#00527A`)
  - Inter font via `font-family`
- PostCSS 8.4.49 + Autoprefixer 10.4.20 (`apps/web/postcss.config.js`)

**ORM / Database:**
- Prisma 5.22.0 (CLI + `@prisma/client`)
- Schema: `packages/db/prisma/schema.prisma` (1263 lines, ~40 models, 30+ enums)
- Singleton client: `packages/db/src/index.ts` (re-exports `@prisma/client` types)
- Prisma generator option `previewFeatures = ["postgresqlExtensions"]`
- Postgres extensions enabled: `pgcrypto`, `uuid_ossp`, `pg_trgm`, `unaccent`

**Job Queue:**
- BullMQ 5.76.4 (`apps/web/src/lib/closure/queue.ts`)
  - Queue name: `closure-generation`
  - Defaults: 3 attempts, exponential backoff 5s, removeOnComplete 500, removeOnFail 100
- ioredis 5.10.1 - Redis client adapter (`apps/web/src/lib/closure/redis.ts`)
  - Two singletons: `getQueueRedis()`, `getWorkerRedis()` (BullMQ requires `maxRetriesPerRequest: null`)

**LLM / AI:**
- Ollama (HTTP client) - native install on M-series Mac, no SDK
  - Adapter: `apps/web/src/lib/ai-ollama.ts` (`callOllama`, `callOllamaVision`)
  - Default endpoint: `http://localhost:11434`
  - Models in use:
    - `mistral-small:24b` (FAST / closure docs - QCM, GRILLE_OBS, ANALYSE_BESOIN)
    - `qwen3:30b-a3b` (REASONING / extraction structurée)
    - `nomic-embed-text:latest` (embeddings, declared but not actively wired)
    - `qwen2.5vl:7b` (VISION / OCR CNI/RIB)
  - Timeout default 600 000 ms (10 min) for generation
  - Concurrency cap on closure worker = 3 (Apple Silicon GPU saturation)
- Anthropic Claude (fallback declared, not wired) - env `ANTHROPIC_MODEL=claude-sonnet-4-7`

**Auth:**
- Lucia 3.2.2 + `@lucia-auth/adapter-prisma` 4.0.1 (`apps/web/src/lib/auth.ts`)
- Argon2 0.41.1 - password hashing (`apps/web/src/app/login/actions.ts`, `packages/db/prisma/seed.ts`)
- oslo 1.2.1 (cryptographic helpers, transitive Lucia)

**Validation / Forms:**
- Zod 3.23.8 - schemas everywhere (`packages/shared/src/env.ts`, server actions, forms)
- react-hook-form 7.54.2 + `@hookform/resolvers` 3.9.1
- `@t3-oss/env-nextjs` 0.11.1 - typed env validation (`packages/shared/src/env.ts`)

**UI Primitives:**
- Radix UI: `react-avatar`, `react-dialog`, `react-dropdown-menu`, `react-label`, `react-slot`
- `class-variance-authority` 0.7.1, `clsx` 2.1.1, `tailwind-merge` 2.5.5
- `cmdk` 1.1.1 - command palette (Cmd+K)
- `lucide-react` 0.471.0 - icon set
- `sonner` 2.0.7 - toast notifications (mounted in `apps/web/src/app/layout.tsx`)

**PDF generation / parsing:**
- `pdf-lib` 1.17.1 - fill AGEFICE form fields (`apps/web/src/lib/agefice-form-fill.ts`, 92 form fields)
- `pdf-parse` 2.4.5 + `unpdf` 1.6.2 - text extraction from PDF (`apps/web/src/lib/pdf-extract.ts`, unpdf preferred for ESM/RSC compat)
- Gotenberg 8 (Chromium) and WeasyPrint 60.2 - HTML→PDF rendering (HTTP services, see INTEGRATIONS.md)
- `marked` 18.0.2 - Markdown→HTML for programme/convention templates

**Email:**
- `nodemailer` 8.0.7 - SMTP transport (`apps/web/src/lib/mailer.ts`)
- Dry-run mode auto when `SMTP_HOST` empty (logs only, doesn't send)

**Storage:**
- `@aws-sdk/client-s3` 3.1038.0 - MinIO/S3-compatible (`apps/web/src/lib/storage.ts`)
- `archiver` 7.0.1 - ZIP packaging for "Pack fin de formation" download (`apps/web/src/server/actions/closure-pack.ts`)
- `xlsx` 0.20.3 (sheetjs CDN tarball) - Excel imports (`packages/db/scripts/import-smartof.ts`) and exports (`/api/qualiopi-bilan/export/route.ts`)

**Testing:**
- Vitest 2.1.8 (`apps/web` and `packages/shared`)
  - Sample tests under `packages/shared/src/helpers/__tests__/` (siret, normalize)
- No Jest, no Playwright config detected (Makefile mentions Playwright but no `playwright.config.*` in tree)

**Build/Dev:**
- Turbo 2.3.0 - monorepo orchestration
- tsx 4.21.0 - TypeScript script runner (worker, seed, imports)
- dotenv 16.4.7 + dotenv-cli 7.4.4 - load `.env` from monorepo root
- concurrently 9.2.1 - run `next dev` + worker in parallel (`pnpm dev:full`)

## Key Dependencies

**Critical:**
- `next@14.2.21` - app framework (App Router)
- `@prisma/client@5.22.0` - data access layer
- `bullmq@5.76.4` - async job queue (closure pack generation)
- `ioredis@5.10.1` - Redis driver
- `lucia@3.2.2` - authentication
- `@aws-sdk/client-s3@3.1038.0` - object storage adapter
- `pdf-lib@1.17.1` - PDF AGEFICE form filling

**Infrastructure:**
- `@radix-ui/*` - accessible UI primitives
- `tailwindcss@3.4.17` - styling
- `zod@3.23.8` - validation
- `nodemailer@8.0.7` - email transport

## Configuration

**TypeScript:**
- Root: `tsconfig.base.json` (`strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`, `verbatimModuleSyntax: false`, `incremental: true`)
- App: `apps/web/tsconfig.json` (extends base, JSX preserve, path alias `@/* → ./src/*`)
- Packages: `packages/db/tsconfig.json`, `packages/shared/tsconfig.json` (both extend base)

**Linting / Formatting:**
- ESLint 9.17.0 + `eslint-config-next` 14.2.21 - no custom `.eslintrc*` file at root (uses Next.js defaults)
- Prettier 3.4.2 (`.prettierrc`: semi true, singleQuote, trailingComma all, printWidth 100, tabWidth 2, arrowParens always)

**Environment:**
- `.env` lives at monorepo root, loaded by:
  - `apps/web/next.config.mjs` (via `dotenv` + `loadEnv`)
  - All script invocations via `dotenv-cli -e ../../.env`
- Validated by `packages/shared/src/env.ts` using `@t3-oss/env-nextjs`
- Example: `.env.example` (128 lines, documents all keys)
- Turbo `globalEnv` declares 35+ variables in `turbo.json`

**Build:**
- `pnpm build` → `turbo run build`
- Per-app: `next build` (apps/web), `tsc --noEmit` (packages for type-check only)
- Outputs: `.next/**` (Next), `dist/**` (others)

## Platform Requirements

**Development:**
- macOS Apple Silicon recommended (Ollama native via `brew install ollama` for Metal GPU access)
- Docker Compose for Postgres 16, Redis 7, MinIO, Gotenberg, WeasyPrint (`docker-compose.yml`)
- Make targets: `make up`, `make down`, `make pull-models`, `make db-migrate`, etc. (`Makefile`)
- Native Ollama with at least these models pulled: `mistral-small:24b`, `qwen3:30b-a3b`, `qwen2.5vl:7b`

**Production:**
- Not specified in repo (no Dockerfile for Next, no `vercel.json`, no GitHub Actions workflows in tree)
- `production` mode toggled via `NODE_ENV=production`; Lucia secure cookies switch on
- BullMQ worker runs as separate process (script: `apps/web/scripts/closure-worker.ts`, intended for systemd/pm2/docker per its header comment)

## Repository Layout (high level)

```
/
├── apps/web/             # Next.js app (App Router)
├── packages/db/          # Prisma schema + client + seed/imports
├── packages/shared/      # Env validation, helpers, Zod schemas, constants
├── docker/weasyprint/    # Python WeasyPrint micro-service
├── docker-compose.yml    # Postgres + Redis + MinIO + Gotenberg + WeasyPrint (+ Ollama optional)
├── Makefile              # Dev convenience commands
├── package.json          # Workspace root
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
└── .env.example
```

---

*Stack analysis: 2026-05-12*
