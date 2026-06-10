---
plan: 01-02
phase: 01-smoke-verification-bugs-critiques
status: code_done_pending_curl_verification
requirements: [BUG-03]
date: 2026-05-12
---

# Plan 01-02 Summary — BUG-03 redirects 308 + convention CLAUDE.md

## What was built

| Task | Status | Output |
|------|--------|--------|
| 2.1 — Lecture next.config.mjs | ✅ DONE | Fichier ESM 23 lignes, pas de `async redirects()` existant |
| 2.2 — Ajout async redirects() | ✅ DONE | 4 entrées ajoutées dans `apps/web/next.config.mjs` |
| 2.3 — Verification curl runtime | ⏳ PENDING | À faire par Laurent quand dev server tourne (cf. checklist) |
| 2.4 — Documenter convention CLAUDE.md | ✅ DONE | Section "Routes (convention naming)" ajoutée |

## Key files modified

- `apps/web/next.config.mjs` — Ajout de `async redirects()` retournant 4 redirects :
  - `/app/pre-inscriptions` → `/app/preinscriptions` (permanent: true)
  - `/app/pre-inscriptions/:path*` → `/app/preinscriptions/:path*` (permanent: true)
  - `/app/modeles` → `/app/templates` (permanent: true)
  - `/app/modeles/:path*` → `/app/templates/:path*` (permanent: true)
- `CLAUDE.md` — Section "Routes (convention naming)" ajoutée dans le bloc Project, documente les exceptions historiques (`/preinscriptions` no-hyphen, `/templates` EN) et oblige les redirects 308 pour les variantes naturelles.

## Acceptance grep checks (toutes ✅)

```
grep -c "source: '/app/pre-inscriptions'" apps/web/next.config.mjs → 1
grep -c "destination: '/app/preinscriptions'" apps/web/next.config.mjs → 1
grep -c "source: '/app/modeles'" apps/web/next.config.mjs → 1
grep -c "destination: '/app/templates'" apps/web/next.config.mjs → 1
grep -c "permanent: true" apps/web/next.config.mjs → 4
grep -c "Routes (convention naming)" CLAUDE.md → 1
grep -c "BUG-03" CLAUDE.md → 1
```

## Runtime curl à vérifier (Task 2.3)

Avec dev server tournant (`pnpm --filter @qualiof/web dev`) :

```bash
curl -sI http://localhost:3000/app/pre-inscriptions | grep -E "^(HTTP|Location|location)"
# attendu : HTTP/1.1 308 + Location: /app/preinscriptions

curl -sI http://localhost:3000/app/modeles | grep -E "^(HTTP|Location|location)"
# attendu : HTTP/1.1 308 + Location: /app/templates

curl -sI http://localhost:3000/app/pre-inscriptions/foo | grep -E "^(HTTP|Location|location)"
# attendu : HTTP/1.1 308 + Location: /app/preinscriptions/foo

curl -sI http://localhost:3000/app/modeles/bar | grep -E "^(HTTP|Location|location)"
# attendu : HTTP/1.1 308 + Location: /app/templates/bar
```

## Pour Plan 01-04 (wave 2 — update REQUIREMENTS.md)

Annotation BUG-03 proposée :
```
- [x] **BUG-03** : Redirects 308 ajoutés dans `apps/web/next.config.mjs` pour /app/pre-inscriptions → /app/preinscriptions et /app/modeles → /app/templates (incl. variantes :path*). **DONE 2026-05-12** — 4 entrées déclarées, preuve curl à attacher après dev start. Convention naming documentée dans CLAUDE.md.
```
