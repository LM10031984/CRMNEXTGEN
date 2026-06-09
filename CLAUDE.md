<!-- GSD:project-start source:PROJECT.md -->
## Project

**QualiOF**

QualiOF est un CRM/back-office métier pour **Start Academy**, organisme de formation Qualiopi spécialisé dans la formation IA des agents commerciaux immobilier. Il couvre tout le cycle de vie d'une formation — du lead à la fin de prestation — en automatisant la production des documents Qualiopi, le suivi de trésorerie OPCO/AGEFICE, et la gestion des apprenants multi-casquette (EI + Enseigne). L'outil est interne, déployé local sur Mac M-series avec Ollama, et n'est pas vendu à d'autres OF.

**Core Value:** **Quatre piliers co-essentiels — tous doivent fonctionner** :

1. **Pack fin de formation 1-clic Qualiopi** — générer en ~12 min les 10 docs Qualiopi par stagiaire (attestation, certificat, grille obs, QCM, déroulé, etc.) sans ressaisie. C'est le différenciateur métier #1 face à Digiforma/Dendreo/Ypareo.
2. **Suivi trésorerie OPCO + AGEFICE** — visibilité CA prévu/signé/encaissé, DSO par dossier, budget AGEFICE par apprenant par année (règle `financingRequestDate`). Sans ce pilier, le commerce est aveugle.
3. **CRM 360° multi-casquette EI + Enseigne** — source unique `Person` + `Organization` reliés par `LegalLink`, qui résout proprement le cas dominant (agent commercial immobilier = EI propriétaire + salarié d'enseigne). Sans ce pilier, l'OF se noie en doublons.
4. **Pré-inscriptions IA self-service** — formulaire public tokenisé + OCR Ollama Vision (CNI/RIB/CFP) → auto-fill apprenant. Sans ce pilier, l'admin retape tout à la main.

Si l'un de ces quatre piliers casse, le reste de l'outil perd sa valeur.

### Constraints

- **Tech stack** : Next.js 14 App Router + Prisma + BullMQ + Ollama — figé. Pas de migration React Native ni Remix prévue.
- **Runtime** : Mac M-series local (Ollama natif Metal). Pas de production cloud court terme.
- **Performance LLM** : concurrency=3 sur worker closure, timeout 600s. Ne pas augmenter sans observer impact stub rate.
- **PDF rendering** : Gotenberg sans footer natif (illisible), footer en HTML dans body. Ne pas régresser ce pattern.
- **Multi-tenant** : Tenant table + tenantId FK partout. Toute nouvelle server action DOIT scope par tenantId.
- **RGPD** : `Person.ribKey` pointe vers MinIO (PII), bucket privé, signed URLs. Données sensibles séparées dans `SensitiveData`.
- **Budget** : pas de SaaS cloud, donc pas de coût d'infra externe. Coût = temps dev Laurent + LLM local.
- **Timeline** : pas de deadline produit externe ; cadence interne pilotée par retours formateurs/admin Start Academy.

### Routes (convention naming)

- French routes, kebab-case where multi-word : `/app/dossiers-opco`, `/app/budget-agefice`.
- Exceptions historiques préservées :
  - `/app/preinscriptions` (no hyphen — depuis palier 4)
  - `/app/templates` (English — depuis palier 3)
- **Toujours ajouter un redirect 308 dans `apps/web/next.config.mjs`** pour les variantes naturelles (avec et sans `:path*`) afin que les URLs tapées à la main par les utilisateurs n'aboutissent pas à un 404. Cf. audit 2026-05-12 BUG-03.
- Avant d'ajouter une nouvelle route : décider hyphen vs no-hyphen, FR vs EN, et documenter ici.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript 5.7.2 - Web app (`apps/web/`), DB layer (`packages/db/`), shared utilities (`packages/shared/`)
- Python 3.12 - WeasyPrint micro-service for PDF rendering (`docker/weasyprint/server.py`)
- SQL (PostgreSQL dialect) - Prisma migrations under `packages/db/prisma/migrations/` (20 migrations)
## Runtime
- Node.js >=20 (declared in `package.json` engines, `.nvmrc` pins to `20`)
- Module type: ESM (`"type": "module"` in workspace packages)
- TypeScript target: ES2022, module: ESNext, moduleResolution: Bundler (`tsconfig.base.json`)
- pnpm 10.33.2 (declared in `package.json` packageManager field)
- Lockfile: `pnpm-lock.yaml` present (~290k lines)
- Workspaces: `apps/*` and `packages/*` (`pnpm-workspace.yaml`)
- Turborepo 2.3.0 (`turbo.json` defines tasks: build, dev, lint, test, db:generate)
## Frameworks
- Next.js 14.2.21 - App Router, React Server Components, Server Actions (`apps/web/next.config.mjs`)
- React 18.3.1 + react-dom 18.3.1
- Tailwind CSS 3.4.17 with `tailwindcss-animate` plugin (`apps/web/tailwind.config.ts`)
- PostCSS 8.4.49 + Autoprefixer 10.4.20 (`apps/web/postcss.config.js`)
- Prisma 5.22.0 (CLI + `@prisma/client`)
- Schema: `packages/db/prisma/schema.prisma` (1263 lines, ~40 models, 30+ enums)
- Singleton client: `packages/db/src/index.ts` (re-exports `@prisma/client` types)
- Prisma generator option `previewFeatures = ["postgresqlExtensions"]`
- Postgres extensions enabled: `pgcrypto`, `uuid_ossp`, `pg_trgm`, `unaccent`
- BullMQ 5.76.4 (`apps/web/src/lib/closure/queue.ts`)
- ioredis 5.10.1 - Redis client adapter (`apps/web/src/lib/closure/redis.ts`)
- Ollama (HTTP client) - native install on M-series Mac, no SDK
- Anthropic Claude (fallback declared, not wired) - env `ANTHROPIC_MODEL=claude-sonnet-4-7`
- Lucia 3.2.2 + `@lucia-auth/adapter-prisma` 4.0.1 (`apps/web/src/lib/auth.ts`)
- Argon2 0.41.1 - password hashing (`apps/web/src/app/login/actions.ts`, `packages/db/prisma/seed.ts`)
- oslo 1.2.1 (cryptographic helpers, transitive Lucia)
- Zod 3.23.8 - schemas everywhere (`packages/shared/src/env.ts`, server actions, forms)
- react-hook-form 7.54.2 + `@hookform/resolvers` 3.9.1
- `@t3-oss/env-nextjs` 0.11.1 - typed env validation (`packages/shared/src/env.ts`)
- Radix UI: `react-avatar`, `react-dialog`, `react-dropdown-menu`, `react-label`, `react-slot`
- `class-variance-authority` 0.7.1, `clsx` 2.1.1, `tailwind-merge` 2.5.5
- `cmdk` 1.1.1 - command palette (Cmd+K)
- `lucide-react` 0.471.0 - icon set
- `sonner` 2.0.7 - toast notifications (mounted in `apps/web/src/app/layout.tsx`)
- `pdf-lib` 1.17.1 - fill AGEFICE form fields (`apps/web/src/lib/agefice-form-fill.ts`, 92 form fields)
- `pdf-parse` 2.4.5 + `unpdf` 1.6.2 - text extraction from PDF (`apps/web/src/lib/pdf-extract.ts`, unpdf preferred for ESM/RSC compat)
- Gotenberg 8 (Chromium) and WeasyPrint 60.2 - HTML→PDF rendering (HTTP services, see INTEGRATIONS.md)
- `marked` 18.0.2 - Markdown→HTML for programme/convention templates
- `nodemailer` 8.0.7 - SMTP transport (`apps/web/src/lib/mailer.ts`)
- Dry-run mode auto when `SMTP_HOST` empty (logs only, doesn't send)
- `@aws-sdk/client-s3` 3.1038.0 - MinIO/S3-compatible (`apps/web/src/lib/storage.ts`)
- `archiver` 7.0.1 - ZIP packaging for "Pack fin de formation" download (`apps/web/src/server/actions/closure-pack.ts`)
- `xlsx` 0.20.3 (sheetjs CDN tarball) - Excel imports (`packages/db/scripts/import-smartof.ts`) and exports (`/api/qualiopi-bilan/export/route.ts`)
- Vitest 2.1.8 (`apps/web` and `packages/shared`)
- No Jest, no Playwright config detected (Makefile mentions Playwright but no `playwright.config.*` in tree)
- Turbo 2.3.0 - monorepo orchestration
- tsx 4.21.0 - TypeScript script runner (worker, seed, imports)
- dotenv 16.4.7 + dotenv-cli 7.4.4 - load `.env` from monorepo root
- concurrently 9.2.1 - run `next dev` + worker in parallel (`pnpm dev:full`)
## Key Dependencies
- `next@14.2.21` - app framework (App Router)
- `@prisma/client@5.22.0` - data access layer
- `bullmq@5.76.4` - async job queue (closure pack generation)
- `ioredis@5.10.1` - Redis driver
- `lucia@3.2.2` - authentication
- `@aws-sdk/client-s3@3.1038.0` - object storage adapter
- `pdf-lib@1.17.1` - PDF AGEFICE form filling
- `@radix-ui/*` - accessible UI primitives
- `tailwindcss@3.4.17` - styling
- `zod@3.23.8` - validation
- `nodemailer@8.0.7` - email transport
## Configuration
- Root: `tsconfig.base.json` (`strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`, `verbatimModuleSyntax: false`, `incremental: true`)
- App: `apps/web/tsconfig.json` (extends base, JSX preserve, path alias `@/* → ./src/*`)
- Packages: `packages/db/tsconfig.json`, `packages/shared/tsconfig.json` (both extend base)
- ESLint 9.17.0 + `eslint-config-next` 14.2.21 - no custom `.eslintrc*` file at root (uses Next.js defaults)
- Prettier 3.4.2 (`.prettierrc`: semi true, singleQuote, trailingComma all, printWidth 100, tabWidth 2, arrowParens always)
- `.env` lives at monorepo root, loaded by:
- Validated by `packages/shared/src/env.ts` using `@t3-oss/env-nextjs`
- Example: `.env.example` (128 lines, documents all keys)
- Turbo `globalEnv` declares 35+ variables in `turbo.json`
- `pnpm build` → `turbo run build`
- Per-app: `next build` (apps/web), `tsc --noEmit` (packages for type-check only)
- Outputs: `.next/**` (Next), `dist/**` (others)
## Platform Requirements
- macOS Apple Silicon recommended (Ollama native via `brew install ollama` for Metal GPU access)
- Docker Compose for Postgres 16, Redis 7, MinIO, Gotenberg, WeasyPrint (`docker-compose.yml`)
- Make targets: `make up`, `make down`, `make pull-models`, `make db-migrate`, etc. (`Makefile`)
- Native Ollama with at least these models pulled: `mistral-small:24b`, `qwen3:30b-a3b`, `qwen2.5vl:7b`
- Not specified in repo (no Dockerfile for Next, no `vercel.json`, no GitHub Actions workflows in tree)
- `production` mode toggled via `NODE_ENV=production`; Lucia secure cookies switch on
- BullMQ worker runs as separate process (script: `apps/web/scripts/closure-worker.ts`, intended for systemd/pm2/docker per its header comment)
## Repository Layout (high level)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Language & Style
- `tsconfig.base.json` — `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`, `incremental: true`
- `verbatimModuleSyntax: false` (lets Prisma types be re-exported cleanly)
- Target ES2022, module ESNext, moduleResolution Bundler
## Naming
| Symbol | Convention | Example |
|--------|-----------|---------|
| Files (lib, components, actions) | `kebab-case.ts(x)` | `agefice-form-fill.ts`, `generate-closure-pack-button.tsx` |
| React components | `PascalCase` (function) | `function GeneratePack({ session }) { ... }` |
| Server actions (exported funcs) | `camelCase` verbs | `createSession`, `updatePerson`, `enqueueClosure` |
| Domain types | `PascalCase` | `type SessionDraft = { ... }` |
| Zod schemas | `PascalCaseSchema` | `PersonInputSchema`, `SiretSchema` |
| Prisma models / enums | PascalCase singular / UPPER_SNAKE | `Person`, `UserRole.ADMIN` |
| URL routes | `kebab-case` French (mostly) | `/app/dossiers-opco`, `/app/budget-agefice` |
| CSS classes (Tailwind) | utility-first, `cn()` for conditionals | `cn('px-4', open && 'bg-primary-50')` |
## File Layout per Feature
## Server Action Pattern
## Forms
## UI Primitives
- Each primitive is a small file (`button.tsx`, `input.tsx`, `dialog.tsx`, …)
- Variants via `class-variance-authority` (`cva()`)
- Composition via `@radix-ui/react-slot` for `asChild` support
## Toasts / Notifications
## Internationalization
## Error Handling
- **Server actions:** return `{ ok: false, error }` (see pattern above)
- **React rendering errors:** `apps/web/src/app/error.tsx` + `app/app/error.tsx` per-segment boundaries
- **Server-side thrown errors** in async paths (worker, generators): wrapped, logged with `console.error`, persisted on the related row (`ClosureJob.errorMessage`, `OpcoSubmission.lastError`, etc.)
- **Zod failures:** surfaced via `parsed.error.flatten()` returned to UI
## Logging
## Date / Time
- All DB timestamps stored as `DateTime` (UTC) — Prisma default
- UI display uses native `Intl.DateTimeFormat` with `fr-FR` locale (no `dayjs` / `date-fns` in deps — verified in `package.json`)
- Business-days computation: `apps/web/src/lib/business-days.ts` (FR jours ouvrés, used by wizard for end-date auto-calc — last commit: `feat(web): wizard session — date de fin auto-calculée jours ouvrés FR`)
## Money
- Stored as cents (Int) in Prisma where money fields exist (`Invoice.amountHt`, `Invoice.amountTtc`, …). Confirm per-model in `schema.prisma`.
- Display: native `Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })`
## Environment Variables
- **Single source of truth:** `.env` at monorepo root
- **Validation:** `packages/shared/src/env.ts` via `@t3-oss/env-nextjs`. Boots fail loud at import time if env is malformed.
- **Documentation:** `.env.example` (128 lines) lists every variable with comments
- **Turbo:** `turbo.json` `globalEnv` declares which envs invalidate caches
## Comments
## Patterns to keep
- ✅ Server Actions over `/api` for mutations
- ✅ Zod schemas in `packages/shared/src/schemas/` reused server + client
- ✅ Discriminated `{ ok, ... }` returns from actions
- ✅ Prisma queries always scoped to `user.tenantId`
- ✅ One template file per closure doc (1:1 mapping)
## Patterns to fix (audit-flagged)
- ⚠️ Tailwind `screens: { '2xl': '1400px' }` est dans `theme.container.screens` (scope limité au utility `container`). **Les breakpoints par défaut fonctionnent — vérifié Phase 2.** Le vrai chantier responsive est dans les composants (Sidebar, MainContent, grilles internes).
- ❌ Route naming mixes hyphen/no-hyphen and French/English — pick one and harmonize.
- ❌ No `aria-*` audit; badge "53" notifications has no panel.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Overall Pattern
- **Type:** Vertical-slice modular monolith (no microservices for business logic). Long-running AI tasks are isolated in a dedicated BullMQ worker process to avoid blocking the Next.js request loop.
- **Tenancy:** Multi-tenant via `Tenant` table + `tenantId` foreign key on all business tables (`packages/db/prisma/schema.prisma`). Single-tenant deployment per OF in practice today.
- **Auth model:** Server-rendered. Lucia session cookie → `validateRequest()` in every protected layout. RBAC by role (`ADMIN`, `MANAGER`, `FORMATEUR`, `COMMERCIAL`, `COMPTABLE`, `LECTEUR`).
## Layers
```
```
## Data Flow
### Read path (typical page render)
### Write path (typical mutation)
### Async/AI path (closure pack, programme generation, etc.)
### Public path (preinscription form)
## Domain Entities (40 Prisma models)
- `Person` — physical person (apprenant, formateur, contact, prospect, payeur — single source of truth)
- `Organization` — legal entity (EI of apprenant, enseigne employer, financeur, OF tenant)
- `LegalLink` — links a `Person` to an `Organization` with a role (e.g. EI owner, employee, contact). Resolves the multi-casquette pattern.
- `BillingProfile`, `Contact`, `SensitiveData`, `ExternalIdentity`
- `TrainingProduct` (programme commercial) → `TrainingModule` (sous-thèmes)
- `Location` (lieux de formation)
- `TrainingSession` (instance d'un produit, dates, formateur, état)
- `SessionSlot` (créneaux jour par jour)
- `SessionTrainer`, `TrainerAvailability`
- `SessionParticipant` (lien Person↔Session avec stage)
- `Attendance` (émargement par demi-journée)
- `Lead`, `LeadAction`
- `PreEnrollment` (pré-inscriptions IA, public form)
- `Invoice`, `InvoicePayment`
- `AgeficeProfile` (budget par apprenant par année — règle: financingRequestDate, pas startDate)
- `AgeficePointAccueil`
- `OpcoCatalog`, `OpcoSubmission` (workflow OPCO V2 — dossierType, mode groupé)
- `QualiopiDocCatalog` (32 indicateurs Qualiopi)
- `DocumentTemplate`, `Document` (10 docs Qualiopi générés)
- `PedagogicalAsset`
- `ClosureBatch`, `ClosureJob` (closure pack 1-clic — palier 2.2)
- `AIGenerationJob` (generic AI jobs)
- `Tenant`, `User`, `AuthSession`, `Task`, `AuditLog`, `InternalComment`, `Notification` (referenced via UI badge), `EmailTemplate`, `EmailMessage`
## Key Abstractions
### 1. Closure Pack (Palier 2.2 — Pack fin de formation 1-clic)
- `apps/web/src/lib/closure/` — 22 files
- Entry: `closure/queue.ts` (BullMQ queue), `closure/worker.ts` (job handler)
- 10 document templates: `attestation-template.ts`, `certificat-template.ts`, `grille-obs-session-template.ts`, `analyse-besoin-template.ts`, `qcm-template.ts`, `deroule-template.ts`, `emargement-template.ts`, `positionnement-template.ts`, `satisfaction-chaud-template.ts`, `satisfaction-froid-template.ts`, `checklist-formation-template.ts`, `grille-observation-template.ts`
- LLM prompts: `closure/qualiopi-prompts.ts` (5 system prompts: QCM, AnalyseBesoin, Grille, Compétences, Déroulé)
- LLM generation: `closure/ollama-generators.ts`
- Rendering: `closure/renderer.ts` → `lib/pdf-render.ts` → Gotenberg or WeasyPrint
- Validated E2E: SES-0010, 5 personnes, 12 minutes (memory)
### 2. AGEFICE Budget Tracking (Palier 4)
- `lib/budget-agefice-constants.ts` — 3000€/an cap, year-by-year window
- `lib/agefice-form-fill.ts` — 92 PDF form fields filled via pdf-lib
- `lib/agefice-template.ts` — HTML "fiche AGEFICE" template
- `server/actions/agefice-generator.ts` — orchestrates the dossier creation
- `server/actions/budget-agefice.ts` — budget consumption queries
- Business rule (memory): year counts by `financingRequestDate` (dossier dépôt date) not session start.
### 3. OPCO V2 (Palier 3 — 15/15 US livrées)
- `app/app/dossiers-opco/` — list + detail views
- `server/actions/dossiers-opco.ts`, `dossiers-opco-bulk.ts`, `opco-submission.ts`
- DSO KPI (Days Sales Outstanding) computed from transition dates memorized on `OpcoSubmission`
- US-006: mode groupé (multiple submissions in one dossier)
- US-008: dossierType discrimination
- US-015: AGEFICE budget restant view
### 4. Pré-inscriptions IA (Palier 4)
- `app/p/[token]/` — public form
- `lib/preinscription-extractor.ts` — vision OCR via qwen2.5vl:7b
- `lib/preinscription-reminder-template.ts` — email follow-ups
- `server/actions/preinscriptions.ts`, `preinscription-public.ts`, `preinscription-convert.ts`, `preinscription-reminders.ts`
### 5. PDF rendering pipeline
- `lib/pdf-render.ts` — main entry, decides between Gotenberg (Chromium, default) and WeasyPrint (Python micro-service)
- `lib/of-pdf-footer.ts`, `lib/of-paged-footer.ts` — footer in HTML body `position:fixed bottom:0` at 11pt (Gotenberg native footer was illegible — memory: anti-pattern)
- `lib/of-config.ts` — OF Tenant config injection in headers
### 6. Multi-tenant + multi-casquette resolution
- All business tables carry `tenantId` (FK to `Tenant`)
- `Person`↔`Organization` via `LegalLink` allows: same person as EI + employee + payeur (audit memory: "Agent commercial immobilier : majorité EI + Enseigne → 2 LegalLinks systématiques")
## Entry Points
| Entry | Path | Purpose |
|-------|------|---------|
| Next.js dev | `pnpm dev` → `turbo run dev --parallel` | Boots all apps |
| Web + worker | `pnpm dev:full` → `apps/web` `next dev` + `concurrently` worker | Local full stack |
| Worker (prod) | `apps/web/scripts/closure-worker.ts` (run via tsx) | Background AI process |
| Public form | `apps/web/src/app/p/[token]/page.tsx` | Tokenized public access |
| Auth | `apps/web/src/app/login/page.tsx` + `actions.ts` | Sign-in |
| Protected zone | `apps/web/src/app/app/layout.tsx` | Auth gate + sidebar/topbar shell |
| API | `apps/web/src/app/api/*/route.ts` | When RSC isn't enough (file uploads, exports, public webhooks) |
## Build Order (suggested)
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
