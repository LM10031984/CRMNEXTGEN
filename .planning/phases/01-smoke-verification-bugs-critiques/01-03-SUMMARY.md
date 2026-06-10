---
plan: 01-03
phase: 01-smoke-verification-bugs-critiques
status: code_done_pending_manual_captures
requirements: [BUG-02]
date: 2026-05-12
---

# Plan 01-03 Summary — BUG-02 header sticky (Fix #1)

## What was built

| Task | Status | Output |
|------|--------|--------|
| 3.1 — Captures before scroll | ⏳ PENDING | À faire par Laurent (cf. checklist) |
| 3.2 — Retrait min-h-screen MainContent (Fix #1) | ✅ DONE | `apps/web/src/components/layout/main-content.tsx` modifié |
| 3.3 — Captures after + verify sticky | ⏳ PENDING | À faire par Laurent (cf. checklist) |
| 3.4 — Fallback fixed (Fix #2) | ⏳ CONDITIONAL | À déclencher seulement si Fix #1 insuffisant |

## Key files modified

- `apps/web/src/components/layout/main-content.tsx` — Retiré `min-h-screen` de la className du `<div>` enveloppant les children. Commentaire ajouté pour documenter la raison (BUG-02 audit 2026-05-12) et indiquer que le wrapper parent `app/app/layout.tsx` applique déjà `min-h-screen`.

## Acceptance grep checks (toutes ✅)

```
grep -q "flex flex-col min-h-screen" main-content.tsx → ABSENT (négatif OK)
grep -c "flex flex-col transition-\[margin-left\]" main-content.tsx → 1
```

## Diagnostic appliqué

**Cause racine identifiée (RESEARCH.md) :** `min-h-screen` sur `MainContent` créait un contexte de positionnement où `<header sticky>` se résolvait à `static`/`relative`. Le wrapper parent `app/app/layout.tsx` a déjà `min-h-screen` sur le div outer — le doublement était redondant ET dommageable pour sticky.

**Fix #1 appliqué (recommandé par RESEARCH.md).** Si Task 3.3 montre que le sticky ne marche TOUJOURS PAS après le fix → bascule sur Fix #2 (TopBar `fixed top-0 left-64 right-0 z-30` + `pt-14` sur `<main>`).

## Vérification visuelle à faire (Task 3.1 + 3.3)

Avec dev server tournant :

1. Pages clés : `/app`, `/app/sessions`, `/app/apprenants/<un id>`
2. Pour chacune :
   - Avant le fix il fallait reproduire le bug (captures before — éventuellement skip si le bug ne se reproduit déjà plus après refresh).
   - Après le fix : naviguer dessus, scroller >500px, vérifier que le header reste visible.
   - Console DevTools : `getComputedStyle(document.querySelector('header')).position` doit retourner `"sticky"`.
3. Capture (Cmd+Shift+4 sur Mac) at scroll = 0 + scroll = 500.

## Pour Plan 01-04 (wave 2 — update REQUIREMENTS.md)

Annotation BUG-02 proposée (cas Fix #1 — attendu) :
```
- [x] **BUG-02** : Header sticky qui se décolle au scroll. **FIXED 2026-05-12** — Fix #1 appliqué : retrait `min-h-screen` de `MainContent` (redondant avec wrapper outer `<div min-h-screen>` dans `app/app/layout.tsx`). Sticky `position: 'sticky'` confirmé en runtime sur dashboard, sessions list, fiche apprenant. Captures avant/après attachées.
```
