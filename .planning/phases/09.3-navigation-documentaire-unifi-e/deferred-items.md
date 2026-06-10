# Deferred items — Phase 09.3

> Découvertes hors-scope pendant l'exécution. NON corrigées (scope boundary :
> ne fixer que les problèmes DIRECTEMENT causés par la tâche courante).

## Plan 09.3-01

### tsc — 6 erreurs pré-existantes dans `redirect-308.test.ts`

- **Fichier** : `apps/web/src/server/actions/__tests__/redirect-308.test.ts`
- **Erreurs** : TS2722 + TS18048 lignes 16/27/38 (`nextConfig.redirects` possibly undefined).
- **Origine** : commit `fd51315` (Phase 12, Wave 0) — antérieures à cette tâche, aucun lien
  avec `lib/docs/`.
- **Vérifié** : `tsc --noEmit` ne remonte AUCUNE erreur sur `resolve-docs.ts` ni
  `get-docs-for.ts`. Les nouveaux fichiers de ce plan sont type-clean.
- **Action** : laissé tel quel (hors scope NAV-01). À traiter dans un passage de
  nettoyage tsc dédié si souhaité.

## Plan 09.3-02

### tsc — mêmes 6 erreurs pré-existantes `redirect-308.test.ts` (toujours non corrigées)

- Confirmé re-vérifié : `tsc --noEmit` @qualiof/web ne remonte 0 erreur HORS
  `redirect-308.test.ts` ; @qualiof/db tsc clean. Les fichiers de ce plan
  (seed.ts, doc-scope.ts, seed-catalog.test.ts) sont type-clean.
- Hors scope NAV-04/NAV-05 (origine `next.config.mjs` WIP non committé).
