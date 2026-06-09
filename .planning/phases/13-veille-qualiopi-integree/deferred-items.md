# Phase 13 — Deferred Items

Items discovered during Phase 13 execution that are **out of scope** and should be addressed in a separate plan/phase.

---

## Plan 13-03 (2026-05-25)

### 1. Build régression pré-existante : `SessionOnlyDocsBlockProps` (Phase 9.1)

**Statut :** WIP non-commité avant Plan 13-03, hors scope veille.

**Fichier :** `apps/web/src/components/sessions/qualiopi-matrix/session-only-docs-block.tsx`

**Symptôme :**
```
./src/app/app/sessions/[id]/page.tsx:573:8
Type error: ... missing the following properties from type 'SessionOnlyDocsBlockProps':
productId, grilleObsAssetCount
```

**Cause :** Le fichier `session-only-docs-block.tsx` a été modifié hors-GSD (commit antérieur à Plan 13-03 : "quick task 260525-jpq — bugs I + J"). La nouvelle signature de `SessionOnlyDocsBlockProps` exige 2 props supplémentaires que le caller `page.tsx` ne fournit pas.

**Vérifié :**
- Build PASSE avec mes changements Plan 13-03 + sans ce WIP local (test isolé).
- Build PASSE sans mes changements + sans ce WIP local.
- → Régression NON causée par Plan 13-03.

**Action :** Reprise hors GSD (quick task ou Phase 9.1 follow-up). Le caller `page.tsx` doit recevoir et passer `productId` + `grilleObsAssetCount` au composant.

**Impact Plan 13-03 :** Aucun. La route `/app/veille` build clean (vérifié `next build` après stash du WIP session).
