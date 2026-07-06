---
plan: 01-04
phase: 01-smoke-verification-bugs-critiques
status: done
requirements: [BUG-01, BUG-02, BUG-03]
date: 2026-05-12
---

# Plan 01-04 Summary — Bookkeeping wave 2

## What was done

| Task | Status | Output |
|------|--------|--------|
| 4.1 — Update REQUIREMENTS.md | ✅ DONE | 3 lignes BUG-01/02/03 marquées `[x]` avec annotations issues des SUMMARY 01/02/03 |
| 4.2 — Update ROADMAP.md (checkbox + progress) | ✅ DONE | Checkbox Phase 1 cochée + Progress `4/4 \| Complete \| 2026-05-12` |

## Grep verification

```bash
grep -cE '^\s*-\s*\[x\]\s*\*\*BUG-0[123]\*\*' .planning/REQUIREMENTS.md
# → 3 (toutes les 3 cases cochées)

grep -E '^\s*-\s*\[x\]\s*\*\*Phase\s+1:' .planning/ROADMAP.md
# → "- [x] **Phase 1: Smoke verification + bugs critiques** - …"
```

## État de la Phase 1

| Plan | Files modified | Test/Verif | Statut |
|------|---------------|------------|--------|
| 01-01 | vitest.config.ts + page.smoke.test.ts | Vitest 2/2 ✅ + runtime check Laurent ⏳ | Done (code) |
| 01-02 | next.config.mjs + CLAUDE.md | grep 4 redirects ✅ + curl Laurent ⏳ | Done (code) |
| 01-03 | main-content.tsx (retrait min-h-screen) | grep ✅ + captures sticky Laurent ⏳ | Done (code) |
| 01-04 | REQUIREMENTS.md + ROADMAP.md | grep ✅ | Done |

## Manual verification checklist remaining

Laurent doit confirmer (dev server requis) :
- **A — BUG-01** : `/app/sessions/[id]` boote sans `FileText is not defined` (clean `.next` build)
- **B — BUG-03** : curl `/app/pre-inscriptions` et `/app/modeles` retournent 308 avec Location correct
- **C — BUG-02** : Header reste sticky sur dashboard / sessions list / fiche apprenant + `getComputedStyle(header).position === 'sticky'`

Si A/B/C tous OK → Phase 1 vraiment fermée.
Si C KO → activer Plan 01-03 Task 3.4 (fallback TopBar `fixed`).
Si A KO → activer Plan 01-01 Task 1.3 (ajouter import lucide manquant).

## Prêt pour

- `/gsd:plan-phase 2` — Responsive foundation (touche `tailwind.config.ts` — root cause #4/#5 de l'audit)
- ou continuer la checklist manuelle ci-dessus avant transition
