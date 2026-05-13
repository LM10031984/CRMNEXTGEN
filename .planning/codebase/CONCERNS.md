# Concerns

**Analysis Date:** 2026-05-12

Sourced from the user's UX/QA audit dated 2026-05-12 + direct codebase verification.

## ⚠️ Audit findings — verified against code

### 1. "FileText is not defined" on session detail — **NOT REPRODUCED IN CODE**

**Audit claim:** runtime error at `src/app/app/sessions/[id]/page.tsx:574`.

**Verification:**
- `apps/web/src/app/app/sessions/[id]/page.tsx:4` — `FileText` **is** imported:
  ```ts
  import { ArrowLeft, Calendar, Clock, Euro, Users, Briefcase, ClipboardCheck, Check, Minus, Package, ChevronRight, FileText } from 'lucide-react';
  ```
- Usage is at **line 656**, not 574 (`<FileText className="h-4 w-4" /> Documents partagés`).
- File is 703 lines.

**Likely explanation:**
- The audit was run against a stale build / Next.js cache, OR
- The audit ran before today's "Refonte UX 12/05/2026" commits that added/moved imports (memory log shows the session hub CTA was reworked today)
- Worth `rm -rf apps/web/.next` + `pnpm dev` to confirm the bug is actually gone before declaring victory

**Status:** Likely false positive. Re-test before scheduling a fix task.

---

### 2. Routes `/pre-inscriptions` and `/modeles` → 404 — **NOT REPRODUCED IN MENU**

**Audit claim:** Menu links to `/app/pre-inscriptions` and `/app/modeles` which 404.

**Verification (`apps/web/src/components/layout/sidebar.tsx`):**
- Line 55: `{ label: 'Pré-inscriptions', href: '/app/preinscriptions', ... }` ✅ matches `app/app/preinscriptions/`
- Line 75: `{ label: 'Modèles de documents', href: '/app/templates', ... }` ✅ matches `app/app/templates/`

The sidebar uses **the correct routes**. The audit likely tested by typing URLs manually (`/app/pre-inscriptions` with a hyphen, `/app/modeles` in French) — those would 404 but the menu doesn't link to them.

**Real concern (UX, not bug):** Route naming is inconsistent and confusing:
- French routes hyphenated: `/app/dossiers-opco`, `/app/budget-agefice`
- French routes non-hyphenated: `/app/preinscriptions`
- English-named routes: `/app/templates` (whereas menu label is "Modèles de documents")

**Recommendation:** Harmonize naming convention. If preserving URLs for SEO/external bookmarks, add 301 redirects in `next.config.mjs` for the "natural" variants (`/app/pre-inscriptions` → `/app/preinscriptions`, `/app/modeles` → `/app/templates`).

**Status:** Menu is correct. Add redirects for natural variants is a nice-to-have.

---

### 3. Header sticky breaks on scroll — **PLAUSIBLE, needs runtime verification**

**Audit claim:** Top bar "se décolle au milieu de l'écran au lieu d'être correctement sticky en haut".

**Code analysis:**
- `apps/web/src/components/layout/top-bar.tsx:7` — `<header className="h-14 border-b border-border bg-white flex items-center px-8 sticky top-0 z-10 gap-3">` ✅ has `sticky top-0 z-10`
- Parent chain:
  - `apps/web/src/app/app/layout.tsx`: `<div className="min-h-screen bg-background"><Sidebar /><MainContent><TopBar /><main /></MainContent>...`
  - `apps/web/src/components/layout/main-content.tsx`: returns `<div className="flex flex-col min-h-screen transition-[margin-left] duration-200 ml-64 | ml-[64px]"><children /></div>`

**Diagnosis:**
- The `transition-[margin-left]` on `MainContent` does **not** create a transform context that would break `position: sticky`.
- However, **the outer `min-h-screen` wrapper** and **the `flex flex-col min-h-screen` MainContent** both set their own height context. When the document scrolls, the sticky element's containing block must scroll past it. If MainContent's height equals the viewport (min-h-screen) instead of growing with its content, `sticky` falls back to relative positioning.
- ⚠️ `min-h-screen` on a flex column container with `flex-1` main child is a classic sticky killer: depending on browser, the sticky element may end up positioned relative to MainContent's actual scrollable parent, which is the outer `<div className="min-h-screen bg-background">`. If THAT div doesn't grow (because Sidebar is `fixed` and MainContent's `min-h-screen` only matches viewport), sticky won't engage properly.

**Recommendation:**
- Inspect runtime in DevTools; check Computed style on `<header>` and look at the offsetParent chain
- Likely fix: drop `min-h-screen` from `MainContent` and rely on natural content height; OR set `<TopBar>` to `fixed top-0 left-64 right-0` and add equivalent `pt-14` on `<main>` (no longer depends on sticky context)

**Status:** Real bug worth investigating. Requires browser DevTools.

---

### 4. No responsive (mobile/tablet sidebar covers content) — **CONFIRMED ROOT CAUSE**

**Audit claim:** At 768px and 390px viewports, sidebar is full-width and hides content; no hamburger; no breakpoints.

**Root cause identified (`apps/web/tailwind.config.ts`):**

```ts
screens: { '2xl': '1400px' },
```

This is **outside** `theme.extend`, which means it **REPLACES** Tailwind's default breakpoints (`sm`, `md`, `lg`, `xl`, `2xl`). The only breakpoint that exists in this project is `2xl: 1400px`. All `sm:*`, `md:*`, `lg:*`, `xl:*` utilities are inactive.

`Sidebar` uses fixed width `w-64` (256px) with no breakpoint variants, and `MainContent` shifts content with `ml-64` always. On a 390px screen, the sidebar covers 65% of the viewport and the content area is 134px wide (off-screen partially).

**Fix:**
```ts
// tailwind.config.ts
theme: {
  // (remove the top-level `screens` override)
  extend: {
    screens: { '2xl': '1400px' }, // overrides ONLY 2xl
    // ...rest
  },
}
```

Then add responsive variants in Sidebar (`hidden md:block` for desktop sidebar, `block md:hidden` for hamburger drawer) and in `MainContent` (`ml-0 md:ml-64`).

**Status:** Real bug, root cause clear, fix straightforward.

---

### 5. Layout truncated at 1456px viewport — **CONFIRMED**

**Audit claim:** Dashboard blocks (KPI, pipeline, financeurs) cut on right without horizontal scroll.

**Code analysis (`apps/web/src/app/app/layout.tsx:17`):**
```tsx
<main className="flex-1 p-8 max-w-screen-2xl w-full mx-auto">
```

With Tailwind's `screens: { '2xl': '1400px' }`, `max-w-screen-2xl` resolves to **1400px**. Sidebar is 256px (`ml-64`). Total natural width: 1400 + 256 = **1656px** to fit comfortably.

At a viewport of 1456px:
- Available content width = 1456 - 256 = 1200px
- `max-w-screen-2xl` (1400px) means content can grow up to 1400px, but `w-full` caps at parent (1200px), so technically no overflow from `<main>` itself
- The issue is **grid layouts inside the dashboard** using fixed minimum cell widths (`minmax(N, 1fr)`) where N is too big OR using fixed widths instead of fluid. With no `md:` / `lg:` breakpoints active (see point 4), grids can't reflow.

**Fix:** Same as point 4 (restore default breakpoints) + audit dashboard grid templates.

**Status:** Same root cause as #4.

---

### 6. Logout button too exposed in TopBar — **CONFIRMED**

**Code analysis (`apps/web/src/components/layout/top-bar.tsx:21-29`):**

```tsx
<form action={logoutAction}>
  <button type="submit" className="text-xs text-muted-foreground hover:text-foreground ...">
    Déconnexion
  </button>
</form>
```

Direct button, no confirmation. Audit-recommended: move into a Radix Dropdown on the avatar.

**Status:** Real UX issue, low effort fix.

---

### 7. Notifications bell badge "53" without preview panel

**Code analysis (`apps/web/src/components/layout/notifications-bell.tsx`):**

Need to read this file to confirm whether the dropdown is wired. From the audit: "On ne sait pas ce qu'il y a derrière."

**Status:** Real UX gap, likely wire a Radix Popover with the latest notifications list (already have `Notification` model in Prisma and `api/notifications` route).

---

## Modules in placeholder / stub state (per audit)

| Module | Path | State |
|--------|------|-------|
| Factures | `app/app/factures/` | Listed in audit as "Module non livré" |
| Inscriptions | `app/app/inscriptions/` | Listed as "Module non livré" |
| Modèles de documents | `app/app/templates/` | Listed as "Module non livré" |
| Paramètres | `app/app/parametres/` | "Disponible palier 2.2" markers — fields are read-only |
| Audit Qualiopi blanc | — | Aspirational, not implemented |

Each needs codebase verification before classifying as backlog work (some may be partial; commits show `feat(web): generation convention par inscrit` and `feat(web): hub documents par inscrit + factures` — so Factures has *some* implementation).

## TODOs / known debt from memory & commits

- **Lead distribution to commerciaux** — TODO from memory (`project_lead_distribution.md`), file `server/actions/auto-assign-leads.ts` exists but distribution rules not yet specified
- **PDF footer config** — memory: Gotenberg native footer was illegible at small sizes; current solution is `position: fixed bottom: 0` HTML in body at 11pt. Don't regress this. (`lib/of-pdf-footer.ts`, `lib/of-paged-footer.ts`)
- **Multi-user roles** — `UserRole` enum has 6 roles (`ADMIN`, `MANAGER`, `FORMATEUR`, `COMMERCIAL`, `COMPTABLE`, `LECTEUR`) but per audit, user management is in "palier 2.2 placeholder" state in Settings
- **Ollama stub fallback** — `lib/closure/stub-content.ts` exists; memory: `fix(closure): timeout 600s + concurrency 3 — taux stub 21% -> 0%`. If timeouts or concurrency rise again, stubs reappear in generated docs.

## Security & data handling

- **Argon2 + Lucia** for auth — good
- **Tenant scoping** is enforced in actions via `user.tenantId` — pattern is consistent; **risk:** any future server action that forgets the `tenantId` filter leaks cross-tenant. No automated test covers this.
- **PDF uploads (CNI/RIB/CFP)** stored in MinIO with `Person.ribKey`. Audit doesn't flag, but **PII**: confirm MinIO bucket has private ACL + signed URL access. Code path: `apps/web/src/lib/storage.ts`.
- **`.env`** at repo root — must NOT be committed. Confirm `.gitignore`.
- **No CSP, no HSTS, no `next-secure-headers`** detected in `next.config.mjs` — production hardening pending.

## Performance

- **Ollama on Mac** with concurrency 3 + 600s timeout — works locally on M-series. Won't scale beyond one OF per Mac.
- **Closure pack** end-to-end: 12 min for 5 people on SES-0010. Acceptable for batch, opaque for the user — `closure-batch-progress.tsx` polls API to show progress.
- **Prisma N+1:** No `findMany().include` audit done; dashboard aggregation (`lib/dashboard-stats.ts`) is one risk area. Confirm with `PRISMA_LOG=query`.
- **No edge runtime usage** — everything is Node runtime, which is fine for Prisma/BullMQ access.

## Fragile areas

1. **`apps/web/tailwind.config.ts:screens` override** — root cause of multiple UI bugs (#4, #5). Single most impactful fix.
2. **Lucia session cookie expiration** vs Server Action `revalidatePath` — race conditions when sessions expire mid-form not tested.
3. **BullMQ + ioredis** — requires `maxRetriesPerRequest: null` for workers (already set in `lib/closure/redis.ts`), but Redis connection loss isn't surfaced to the UI.
4. **PDF generation** — Gotenberg + WeasyPrint dual path; if either service is down, fall back is silent (stub content). Worth a health check.
5. **next.config experimental flags** — `typedRoutes: true` + `serverActions.bodySizeLimit: '40mb'`. Both are Next.js experimental as of 14.2. Pinning to a maintained Next 15 is a future migration risk.

## Tech debt summary

| Area | Severity | Impact | Fix effort |
|------|----------|--------|-----------|
| Tailwind `screens` override | 🔴 High | No responsive at all | Low |
| Header sticky | 🟠 Medium | Visible scroll glitch | Low-Med |
| Route naming inconsistency | 🟡 Low | Confusion, 404s on hand-typed URLs | Low (redirects) |
| Logout in topbar without confirm | 🟡 Low | Accidental clicks | Low |
| Notifications bell no panel | 🟠 Medium | Feature gap | Med |
| No automated tests | 🟠 Medium | Regressions undetected | High |
| Multi-user / RBAC UI gap | 🟠 Medium | Audit-flagged | Med-High |
| Settings read-only | 🟡 Low | Audit-flagged | Med |
| Factures / Inscriptions / Modèles stubs | 🟠 Medium | Audit-flagged | High |
| No CI | 🟡 Low | Manual gate today | Med |

---

*Concerns analysis: 2026-05-12*
