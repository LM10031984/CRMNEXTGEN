# Directory Structure

**Analysis Date:** 2026-05-12

## Monorepo Top-Level

```
files/
├── apps/
│   └── web/                      # Next.js 14 App Router app (sole app today)
├── packages/
│   ├── db/                       # Prisma schema + client singleton
│   └── shared/                   # Env validation, Zod schemas, helpers, constants
├── docker/
│   └── weasyprint/               # Python micro-service for PDF (WeasyPrint 60.2)
├── docs/                         # Project docs (markdown)
├── docker-compose.yml            # Postgres, Redis, MinIO, Gotenberg, WeasyPrint
├── Makefile                      # Dev convenience commands
├── MVP-SPEC.md                   # Functional spec (source of truth)
├── VISION.md                     # Product vision
├── README.md
├── package.json                  # Workspace root (pnpm + turbo)
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
└── .env.example                  # 128 lines, documents all env keys
```

## `apps/web/` — Next.js App

```
apps/web/
├── next.config.mjs               # typedRoutes, serverActions bodySizeLimit 40MB
├── tailwind.config.ts            # ⚠️ screens OVERRIDES default breakpoints!
├── postcss.config.js
├── tsconfig.json                 # Path alias: @/* → ./src/*
├── package.json
├── public/
│   └── (logos, fonts, etc.)
├── scripts/
│   └── closure-worker.ts         # BullMQ worker entrypoint
└── src/
    ├── app/                      # Next.js App Router root
    ├── assets/                   # Static assets imported in JSX
    ├── components/               # React components (server + client)
    ├── lib/                      # Domain & infra helpers
    └── server/                   # Server-side code outside Next conventions
```

## `apps/web/src/app/` — Routes

```
src/app/
├── layout.tsx                    # Root layout (HTML, fonts, Toaster mount)
├── globals.css
├── page.tsx                      # Public landing (redirects to /app or /login)
├── error.tsx                     # Global error boundary
├── login/
│   ├── page.tsx
│   └── actions.ts                # Lucia + Argon2 sign-in server action
├── p/
│   └── [token]/                  # Public preinscription form (no auth)
├── api/
│   ├── auth/
│   ├── batches/                  # ClosureBatch progress polling
│   ├── notifications/            # Bell notifications endpoint
│   ├── public/                   # Public webhook receivers
│   ├── qualiopi-bilan/export/    # Excel export route
│   └── ...
└── app/                          # 🔒 PROTECTED ZONE (requires session)
    ├── layout.tsx                # Auth gate, Sidebar + TopBar + CommandPalette
    ├── page.tsx                  # Dashboard
    ├── error.tsx
    │
    ├── apprenants/               # Learners
    │   ├── page.tsx              # List
    │   └── [id]/                 # Profile (tabs: info, activité, documents)
    │
    ├── sessions/                 # Training sessions
    │   ├── page.tsx              # List
    │   ├── nouvelle/             # Create wizard
    │   ├── rattrapage/           # Backfill flow
    │   └── [id]/
    │       └── page.tsx          # ⚠️ 703 lines — session detail (audit target)
    │
    ├── preinscriptions/          # ⚠️ NB: no hyphen (audit assumed /pre-inscriptions)
    ├── dossiers-opco/            # OPCO V2 workflow
    ├── factures/                 # Invoices (status: stub per audit)
    ├── budget-agefice/           # AGEFICE budget consumption view
    ├── leads/                    # Sales leads
    ├── organisations/            # Legal entities (Org + LegalLinks)
    ├── formateurs/               # Trainers
    ├── produits/                 # Training products + modules
    ├── templates/                # ⚠️ NB: English name (audit assumed /modeles)
    ├── financeurs/               # Funders (OPCO, AGEFICE, private)
    ├── inscriptions/             # Enrollments view (status: stub per audit)
    ├── qualiopi-bilan/           # Qualiopi annual bilan export
    └── parametres/               # Settings (read-only per audit, palier 2.2 placeholder)
```

## `apps/web/src/components/` — UI Components

```
components/
├── ui/                           # Primitives (button, input, dialog, …) — Radix-based
├── layout/
│   ├── sidebar.tsx               # ⚠️ 3 sections: Essentiel, Suivi, Configuration
│   ├── top-bar.tsx               # ⚠️ uses sticky top-0 (audit reports issue)
│   ├── main-content.tsx          # Wraps children, syncs sidebar collapsed via localStorage
│   ├── active-batches-badge.tsx
│   ├── cmdk-trigger.tsx          # Command palette opener
│   └── notifications-bell.tsx    # ⚠️ Badge "53" without panel per audit
├── command-palette/              # Cmd+K palette (cmdk)
│   └── command-palette.tsx
├── apprenants/                   # Learner-specific UI
├── sessions/                     # 17 files for session CRUD + actions
│   ├── add-participant-dialog.tsx
│   ├── closure-batch-progress.tsx
│   ├── generate-agefice-button.tsx
│   ├── generate-closure-pack-button.tsx
│   ├── prepare-training-button.tsx
│   ├── session-actions-menu.tsx
│   └── ...
├── preinscriptions/              # Public + back-office UI
├── dossiers-opco/                # OPCO dashboard widgets
├── leads/                        # Lead pipeline UI
├── produits/                     # Product editor
├── invoices/                     # Invoice UI
├── forms/                        # Cross-cutting form bits (file upload, address picker)
├── pickers/                      # Reusable pickers (person, org, session)
├── wizards/                      # Multi-step wizards (apprenant creation, session creation)
└── editors/                      # Rich editors (modules markdown, programme)
```

## `apps/web/src/lib/` — Domain & Infra

```
lib/
├── ai-ollama.ts                  # Ollama HTTP client (callOllama, callOllamaVision)
├── auth.ts                       # Lucia singleton + validateRequest()
├── storage.ts                    # S3/MinIO adapter
├── mailer.ts                     # Nodemailer wrapper, dry-run if no SMTP_HOST
├── utils.ts                      # cn(), date helpers
├── business-days.ts              # FR working-days calculation (jours ouvrés)
├── learner-completeness.ts       # "88% complète" computation per Person
├── of-config.ts                  # OF tenant config (logo, mentions légales)
├── of-pdf-footer.ts              # PDF footer template (in-body, position:fixed)
├── of-paged-footer.ts            # Multi-page footer variant
├── pdf-render.ts                 # Gotenberg/WeasyPrint dispatcher
├── pdf-extract.ts                # OCR text extraction (unpdf preferred)
├── agefice-form-fill.ts          # pdf-lib field filling (92 fields)
├── agefice-template.ts           # Fiche AGEFICE HTML template
├── budget-agefice-constants.ts   # 3000€/an, year cutoff rules
├── convention-template.ts        # Convention de formation HTML
├── invoice-template.ts           # Facture HTML
├── programme-template.ts         # Programme commercial HTML
├── pedagogy-templates.ts         # Pedagogy doc shared bits
├── legal-forms.ts                # Forme juridique normalizations
├── preinscription-extractor.ts   # Vision OCR (qwen2.5vl:7b)
├── preinscription-reminder-template.ts
├── qualiopi-bilan-stats.ts       # Qualiopi annual stats aggregation
├── dashboard-stats.ts            # KPI tile computations
├── cmdk-recents.ts               # Command palette recents persistence
└── closure/                      # Closure pack subsystem (palier 2.2)
    ├── queue.ts                  # BullMQ queue setup
    ├── redis.ts                  # ioredis singletons (queue + worker)
    ├── worker.ts                 # Job processor
    ├── renderer.ts               # Doc → PDF orchestration
    ├── build-context.ts          # Gathers data per session for prompts
    ├── ollama-generators.ts      # LLM calls per doc type
    ├── parse-programme-to-deroule.ts
    ├── qualiopi-prompts.ts       # 5 system prompts (memory: extracted from Qualiopi Gen)
    ├── shared-template.ts        # HTML head/footer shared by all closure docs
    ├── stub-content.ts           # Fallback content when LLM fails
    ├── types.ts                  # Job payload typings
    ├── analyse-besoin-template.ts
    ├── attestation-template.ts
    ├── certificat-template.ts
    ├── checklist-formation-template.ts
    ├── deroule-template.ts
    ├── emargement-template.ts
    ├── grille-obs-session-template.ts
    ├── grille-observation-template.ts
    ├── positionnement-template.ts
    ├── qcm-template.ts
    ├── satisfaction-chaud-template.ts
    └── satisfaction-froid-template.ts
```

## `apps/web/src/server/` — Server Actions

```
server/
└── actions/                      # 32 files
    ├── agefice-generator.ts
    ├── ai-fill-product.ts
    ├── auto-assign-leads.ts
    ├── budget-agefice.ts
    ├── closure-pack.ts           # Enqueue closure batch
    ├── convention-generator.ts
    ├── crud-edits.ts             # Generic field edits
    ├── deroule-product-generator.ts
    ├── dossier-reminder.ts
    ├── dossiers-opco-bulk.ts
    ├── dossiers-opco.ts
    ├── extract-apprenant-docs.ts # Vision OCR CNI/RIB/CFP
    ├── generate-checklist-formation.ts
    ├── generate-grille-obs-session.ts
    ├── invoices.ts
    ├── legal-links.ts
    ├── notifications.ts
    ├── opco-submission.ts
    ├── persons.ts
    ├── preinscription-convert.ts
    ├── preinscription-public.ts
    ├── preinscription-reminders.ts
    ├── preinscriptions.ts
    ├── prepare-training.ts
    ├── programme-generator.ts
    ├── regenerate-grille.ts
    ├── search-universal.ts       # Global search (Cmd+K backend)
    ├── session-gaps.ts           # Detect missing days in sessions
    ├── sessions-create.ts
    └── sessions.ts
```

## `packages/db/` — Database

```
packages/db/
├── prisma/
│   ├── schema.prisma             # 1263 lines, 40 models, 30+ enums
│   ├── seed.ts                   # Demo data
│   └── migrations/               # 20 migrations
├── scripts/
│   ├── import-smartof.ts         # Migration from legacy SmartOF (xlsx exports)
│   └── cleanup-organizations.ts  # EI duplicate cleanup
├── src/
│   └── index.ts                  # Prisma client singleton + re-exports
├── tsconfig.json
└── package.json
```

## `packages/shared/`

```
packages/shared/
├── src/
│   ├── index.ts                  # Barrel re-exports
│   ├── env.ts                    # @t3-oss/env-nextjs validation
│   ├── constants/                # Static constants (forms juridiques, codes APE, …)
│   ├── schemas/                  # Zod schemas
│   │   ├── address.ts
│   │   ├── auth.ts
│   │   ├── organization.ts
│   │   ├── person.ts
│   │   └── index.ts
│   └── helpers/
│       ├── __tests__/            # ⚠️ The only tests in the repo
│       │   ├── siret.test.ts
│       │   └── normalize.test.ts
│       ├── siret.ts              # SIRET validation (Luhn)
│       └── normalize.ts          # String normalization (accents, casse)
├── tsconfig.json
└── package.json
```

## Naming Conventions

| Layer | Convention | Example |
|-------|-----------|---------|
| Routes (URL) | kebab-case, **French** | `/app/dossiers-opco`, `/app/budget-agefice` |
| Routes (URL) | Inconsistency | `/app/preinscriptions` (no hyphen) but `/app/dossiers-opco` (hyphen) ⚠️ |
| Routes (URL) | Mixed FR/EN | `/app/templates` (EN), `/app/financeurs` (FR), `/app/parametres` (FR) ⚠️ |
| Files (TSX) | kebab-case | `generate-closure-pack-button.tsx` |
| Files (TS lib) | kebab-case | `pdf-extract.ts`, `agefice-form-fill.ts` |
| React components | PascalCase | `function Sidebar()`, `function TopBar()` |
| Server actions | camelCase exported funcs | `export async function createSession(...)` |
| Prisma models | PascalCase singular | `Person`, `TrainingSession`, `LegalLink` |
| Prisma enums | UPPER_SNAKE_CASE | `UserRole.ADMIN`, `OpcoSubmissionStatus.SUBMITTED` |
| Prisma fields | camelCase | `firstName`, `tenantId`, `financingRequestDate` |
| Domain language | French, business-faithful | `apprenant`, `session`, `dossier`, `émargement`, `closure`, `attestation` |

## Conventions worth flagging

- **`@/` alias** = `apps/web/src/*` only inside `apps/web`. Not available in `packages/*`.
- **Imports from packages** = `@qualiof/db`, `@qualiof/shared` (via `transpilePackages` in `next.config.mjs`).
- **Closure docs** are 1-doc-per-file in `lib/closure/`, all following the `shared-template.ts` shell.
- **Server Actions vs API routes**: 90% of mutations are server actions. `/api/*` reserved for file uploads, exports, public webhooks, polling endpoints.

---

*Structure analysis: 2026-05-12*
