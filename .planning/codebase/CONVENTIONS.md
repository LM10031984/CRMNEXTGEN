# Code Conventions

**Analysis Date:** 2026-05-12

## Language & Style

**TypeScript everywhere.** Strict mode is non-negotiable:

- `tsconfig.base.json` — `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`, `incremental: true`
- `verbatimModuleSyntax: false` (lets Prisma types be re-exported cleanly)
- Target ES2022, module ESNext, moduleResolution Bundler

**Linting:** ESLint 9 + `eslint-config-next` 14.2.21. No custom `.eslintrc*` — relies on Next.js defaults. Linted via `pnpm lint` (turbo task).

**Formatting:** Prettier 3.4.2. `.prettierrc`:
```json
{ "semi": true, "singleQuote": true, "trailingComma": "all", "printWidth": 100, "tabWidth": 2, "arrowParens": "always" }
```

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

A typical feature combines 4 layers:

```
prisma/schema.prisma                                  # Domain model
packages/shared/src/schemas/<entity>.ts               # Zod schemas
apps/web/src/server/actions/<feature>.ts              # Server actions
apps/web/src/app/app/<feature>/page.tsx               # Route(s)
apps/web/src/components/<feature>/<file>.tsx          # UI components
apps/web/src/lib/<feature>-template.ts                # If PDF/HTML needed
```

## Server Action Pattern

Every mutation follows this shape (observed in `server/actions/*`):

```ts
'use server';

import { z } from 'zod';
import { db } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

const InputSchema = z.object({
  // ...
});

export async function doSomething(input: z.input<typeof InputSchema>) {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'unauthenticated' as const };
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid' as const, details: parsed.error.flatten() };

  // ... db mutation here, scoped to user.tenantId
  await db.<model>.<op>({ where: { tenantId: user.tenantId, ... } });

  revalidatePath('/app/<feature>');
  return { ok: true as const, ... };
}
```

**Always returns a discriminated union** `{ ok: true, ... } | { ok: false, error: ... }` — no thrown errors at the action boundary, so forms can render messages cleanly.

## Forms

`react-hook-form` + `@hookform/resolvers/zod` is the standard pairing. Form components live in `apps/web/src/components/<feature>/` or `components/forms/`.

Pattern:
```tsx
const form = useForm({ resolver: zodResolver(Schema), defaultValues });
async function onSubmit(values) {
  const res = await serverAction(values);
  if (!res.ok) { toast.error(...); return; }
  toast.success(...);
}
```

## UI Primitives

`apps/web/src/components/ui/` follows the **shadcn/ui-style** convention (Radix + CVA + Tailwind):

- Each primitive is a small file (`button.tsx`, `input.tsx`, `dialog.tsx`, …)
- Variants via `class-variance-authority` (`cva()`)
- Composition via `@radix-ui/react-slot` for `asChild` support

## Toasts / Notifications

`sonner` (v2.0.7) — `<Toaster />` mounted in `apps/web/src/app/layout.tsx`. Calls:
```ts
import { toast } from 'sonner';
toast.success('Session créée');
toast.error('Échec : …');
```

Memory note: toasts audited in palier 3 (QW4) for consistency.

## Internationalization

**French UI hardcoded** — no i18n library wired. Labels live inline in JSX (e.g. `'Pré-inscriptions'`, `'Tableau de bord'`). Domain terms (apprenant, session, dossier) are deliberately French.

## Error Handling

- **Server actions:** return `{ ok: false, error }` (see pattern above)
- **React rendering errors:** `apps/web/src/app/error.tsx` + `app/app/error.tsx` per-segment boundaries
- **Server-side thrown errors** in async paths (worker, generators): wrapped, logged with `console.error`, persisted on the related row (`ClosureJob.errorMessage`, `OpcoSubmission.lastError`, etc.)
- **Zod failures:** surfaced via `parsed.error.flatten()` returned to UI

## Logging

No structured logger. `console.log` / `console.error` everywhere. Worker process logs are captured by whatever process supervisor runs it.

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

Sparse but useful. French comments in business logic when domain rules are non-obvious. Example from `lib/closure/qualiopi-prompts.ts` and `lib/budget-agefice-constants.ts` — comments document the **why** (regulation, OPCO rules) not the what.

## Patterns to keep

- ✅ Server Actions over `/api` for mutations
- ✅ Zod schemas in `packages/shared/src/schemas/` reused server + client
- ✅ Discriminated `{ ok, ... }` returns from actions
- ✅ Prisma queries always scoped to `user.tenantId`
- ✅ One template file per closure doc (1:1 mapping)

## Patterns to fix (audit-flagged)

- ❌ Tailwind `screens: { '2xl': '1400px' }` overrides defaults — kills responsive utilities. **Move to `theme.extend.screens` or restore defaults.**
- ❌ Route naming mixes hyphen/no-hyphen and French/English — pick one and harmonize.
- ❌ No `aria-*` audit; badge "53" notifications has no panel.

---

*Conventions analysis: 2026-05-12*
