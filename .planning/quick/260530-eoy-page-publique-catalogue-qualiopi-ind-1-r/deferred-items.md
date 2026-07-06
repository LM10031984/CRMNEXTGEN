# Deferred items — quick 260530-eoy

Issues discovered during `tsc --noEmit` but out of scope (pre-existing, not caused by this quick fix).

## Pre-existing tsc errors (apps/web)

- `src/server/actions/__tests__/redirect-308.test.ts` — 3 errors `TS2722 / TS18048` autour de `nextConfig.redirects` possibly undefined (lignes 16, 27, 38).
  - **Cause** : narrowing manquant sur `nextConfig.redirects` (champ optionnel dans la typedef Next.js).
  - **Suggestion** : ajouter `if (!nextConfig.redirects) throw new Error(...)` ou `nextConfig.redirects?.()` avant invocation.
  - **Hors scope** : ce quick fix ne modifie pas les redirects ni le fichier de test.

Aucun de ces erreurs ne touche aux nouveaux fichiers `apps/web/src/lib/catalogue-constants.ts` ou `apps/web/src/app/catalogue/page.tsx`.
