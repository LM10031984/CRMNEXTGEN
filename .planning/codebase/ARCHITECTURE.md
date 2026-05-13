# Architecture

**Analysis Date:** 2026-05-12

## Overall Pattern

**Monorepo Turborepo + Next.js App Router (full-stack RSC)** with a single web app, two internal packages, and a separate background worker process for AI-heavy work.

- **Type:** Vertical-slice modular monolith (no microservices for business logic). Long-running AI tasks are isolated in a dedicated BullMQ worker process to avoid blocking the Next.js request loop.
- **Tenancy:** Multi-tenant via `Tenant` table + `tenantId` foreign key on all business tables (`packages/db/prisma/schema.prisma`). Single-tenant deployment per OF in practice today.
- **Auth model:** Server-rendered. Lucia session cookie → `validateRequest()` in every protected layout. RBAC by role (`ADMIN`, `MANAGER`, `FORMATEUR`, `COMMERCIAL`, `COMPTABLE`, `LECTEUR`).

## Layers

```
┌─────────────────────────────────────────────────────────┐
│  apps/web/src/app/  ← Next.js App Router (RSC)          │
│    - app/login/                                         │
│    - app/app/        (protected zone, requires session) │
│    - app/api/        (server-side endpoints)            │
│    - app/p/[token]/  (public preinscription form)       │
├─────────────────────────────────────────────────────────┤
│  apps/web/src/components/  ← Client/server components   │
│    - layout/  forms/  wizards/  pickers/  ui/           │
├─────────────────────────────────────────────────────────┤
│  apps/web/src/server/actions/  ← Server Actions         │
│    (Form mutations, CRUD, generators — 32 files)        │
├─────────────────────────────────────────────────────────┤
│  apps/web/src/lib/  ← Domain & infra helpers            │
│    - ai-ollama.ts          (LLM HTTP client)            │
│    - auth.ts                (Lucia adapter)             │
│    - storage.ts             (S3/MinIO adapter)          │
│    - mailer.ts              (Nodemailer)                │
│    - pdf-render.ts          (Gotenberg/WeasyPrint)      │
│    - closure/               (worker queue + 18 docs)    │
├─────────────────────────────────────────────────────────┤
│  packages/shared/  ← Cross-cutting (env, schemas, helpers) │
│  packages/db/      ← Prisma client singleton + schema   │
└─────────────────────────────────────────────────────────┘
                            │
            ┌───────────────┼────────────────┐
            ▼               ▼                ▼
   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
   │  Postgres    │  │  Redis +     │  │  Ollama      │
   │  16 + Prisma │  │  BullMQ      │  │  (local Mac) │
   └──────────────┘  └──────────────┘  └──────────────┘
            │               │                │
            ▼               ▼                ▼
        MinIO (S3)     closure-worker    Gotenberg
        archives       (sep. process)    WeasyPrint
```

## Data Flow

### Read path (typical page render)
1. User hits `/app/sessions` → Next.js server component
2. `validateRequest()` (Lucia) reads cookie, fetches user + tenant
3. Server component queries Prisma directly: `db.trainingSession.findMany({ where: { tenantId } })`
4. Returns JSX with data inlined. No `/api` round-trip.

### Write path (typical mutation)
1. User submits a form → server action in `apps/web/src/server/actions/<domain>.ts`
2. Action validates with Zod (`packages/shared/src/schemas/`)
3. Action mutates via Prisma, calls `revalidatePath()`/`revalidateTag()`
4. Some actions enqueue BullMQ jobs (e.g. `closure-pack.ts` → `closure-generation` queue)

### Async/AI path (closure pack, programme generation, etc.)
1. Server action enqueues a `ClosureBatch` + N `ClosureJob` rows in DB **+** publishes to BullMQ
2. Standalone worker (`apps/web/scripts/closure-worker.ts`, run by `pnpm dev:full` or systemd)
3. Worker pulls job, calls Ollama via `lib/ai-ollama.ts` (mistral-small:24b / qwen3:30b-a3b / qwen2.5vl:7b)
4. Generated markdown rendered to PDF via Gotenberg or WeasyPrint
5. PDF uploaded to MinIO, `Document` row created, `ClosureJob.status = SUCCEEDED`
6. UI polls `closure-batch-progress.tsx` for batch status

### Public path (preinscription form)
1. Lead clicks tokenized link → `/p/[token]` (no auth)
2. Public form (`app/p/[token]/`) collects info + CNI/RIB/CFP uploads
3. Server action `preinscription-public.ts` writes `PreEnrollment` + queues vision OCR job
4. Back-office sees the row in `/app/preinscriptions`, can convert it to `Person` + `SessionParticipant`

## Domain Entities (40 Prisma models)

**Identity / multi-casquette core:**
- `Person` — physical person (apprenant, formateur, contact, prospect, payeur — single source of truth)
- `Organization` — legal entity (EI of apprenant, enseigne employer, financeur, OF tenant)
- `LegalLink` — links a `Person` to an `Organization` with a role (e.g. EI owner, employee, contact). Resolves the multi-casquette pattern.
- `BillingProfile`, `Contact`, `SensitiveData`, `ExternalIdentity`

**Training catalog:**
- `TrainingProduct` (programme commercial) → `TrainingModule` (sous-thèmes)
- `Location` (lieux de formation)

**Sessions & delivery:**
- `TrainingSession` (instance d'un produit, dates, formateur, état)
- `SessionSlot` (créneaux jour par jour)
- `SessionTrainer`, `TrainerAvailability`
- `SessionParticipant` (lien Person↔Session avec stage)
- `Attendance` (émargement par demi-journée)

**Commercial:**
- `Lead`, `LeadAction`
- `PreEnrollment` (pré-inscriptions IA, public form)

**Financial:**
- `Invoice`, `InvoicePayment`
- `AgeficeProfile` (budget par apprenant par année — règle: financingRequestDate, pas startDate)
- `AgeficePointAccueil`
- `OpcoCatalog`, `OpcoSubmission` (workflow OPCO V2 — dossierType, mode groupé)

**Qualiopi conformity:**
- `QualiopiDocCatalog` (32 indicateurs Qualiopi)
- `DocumentTemplate`, `Document` (10 docs Qualiopi générés)
- `PedagogicalAsset`

**AI/async:**
- `ClosureBatch`, `ClosureJob` (closure pack 1-clic — palier 2.2)
- `AIGenerationJob` (generic AI jobs)

**Infra:**
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

For new contributors:
1. Read `MVP-SPEC.md` and `VISION.md` (root)
2. Read `packages/db/prisma/schema.prisma` — domain model
3. Read `apps/web/src/app/app/layout.tsx` — auth + shell
4. Read `apps/web/src/lib/closure/worker.ts` — async pattern
5. Read one server action end-to-end (e.g. `server/actions/sessions-create.ts`)
6. Read one feature page end-to-end (e.g. `app/app/sessions/[id]/page.tsx`)

---

*Architecture analysis: 2026-05-12*
