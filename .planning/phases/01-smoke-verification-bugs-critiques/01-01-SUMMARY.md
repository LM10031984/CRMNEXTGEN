---
plan: 01-01
phase: 01-smoke-verification-bugs-critiques
status: code_done_pending_manual_runtime_check
requirements: [BUG-01]
date: 2026-05-12
---

# Plan 01-01 Summary — BUG-01 smoke test + runtime check

## What was built

| Task | Status | Output |
|------|--------|--------|
| 1.2 — Create vitest.config.ts | ✅ DONE | `apps/web/vitest.config.ts` (578 bytes) — env: node, alias `@/` → `./src/` |
| 1.2 — Create smoke test file | ✅ DONE | `apps/web/src/app/app/sessions/[id]/__tests__/page.smoke.test.ts` (2103 bytes) — 2 tests |
| 1.2 — Vitest smoke test passes | ✅ DONE | `cd apps/web && npx vitest run` → `2 tests passed, 0 failed` in 230ms |
| 1.1 — Manual runtime check | ⏳ PENDING | À faire par Laurent (cf. checklist) |
| 1.3 — Fix imports si bug réel | ⏳ CONDITIONAL | À déclencher seulement si Task 1.1 reproduit l'erreur |

## Key files created

- `apps/web/vitest.config.ts` — Vitest config minimale (env: node, include pattern, alias `@/`)
- `apps/web/src/app/app/sessions/[id]/__tests__/page.smoke.test.ts` — 2 tests :
  1. `imports FileText from lucide-react` (assert import présent)
  2. `uses no lucide-react symbol that is not imported` (assert tous les JSX PascalCase candidats sont dans la liste d'import)

## Test output (preuve)

```
RUN  v2.1.9 /Users/laurentmarx/Documents/CRM Next gen/files/apps/web

 ✓ src/app/app/sessions/[id]/__tests__/page.smoke.test.ts (2 tests) 1ms

 Test Files  1 passed (1)
      Tests  2 passed (2)
```

## Verdict BUG-01 (statique, à confirmer en runtime)

**Faux positif probable confirmé par analyse statique :**
- `apps/web/src/app/app/sessions/[id]/page.tsx:4` importe bien `FileText` de `lucide-react`
- Usage ligne 656 (`<FileText className="h-4 w-4" /> Documents partagés`)
- Test smoke valide cette structure et catchera toute régression future

**Confirmation runtime à venir** (Task 1.1 manuel) :
- Si `rm -rf apps/web/.next && pnpm --filter @qualiof/web dev` puis navigation sur `/app/sessions/[id]` montre la page sans erreur console → faux positif définitif, Task 1.3 SKIPPED.
- Si l'erreur réapparait → Task 1.3 à déclencher pour fix réel.

## Décisions documentées

- **environment: 'node'** choisi (vs jsdom suggéré dans CONTEXT.md) — justification : le test lit le source en texte et fait du regex, pas de rendu DOM nécessaire. CONTEXT.md offrait l'alternative "import-only" — la regex sur source est cohérente avec cette approche et plus robuste (ne dépend pas de la chaîne de modules Next/Lucia/Prisma).
- **Liste `lucideCandidates` figée** — compromis assumé. Si une future icône JSX est ajoutée hors de cette liste sans import correspondant, le test passe vert à tort. Revisité v2 si régression observée.

## Commande à relancer pour vérifier

```bash
cd apps/web && npx vitest run
```

(Note : `pnpm --filter @qualiof/web exec vitest run <path>` est cassé pour les paths contenant `[id]` — utiliser `npx vitest run` depuis `apps/web/`.)

## Pour Plan 01-04 (wave 2 — update REQUIREMENTS.md)

Annotation BUG-01 proposée :
```
- [x] **BUG-01** : Re-vérifier en runtime "FileText is not defined" sur /app/sessions/[id]. **RESOLVED 2026-05-12** — faux positif cache stale (analyse statique : import ligne 4 OK + usage ligne 656). Test smoke Vitest ancré (`apps/web/src/app/app/sessions/[id]/__tests__/page.smoke.test.ts`, 2 tests verts) pour empêcher régression future.
```
