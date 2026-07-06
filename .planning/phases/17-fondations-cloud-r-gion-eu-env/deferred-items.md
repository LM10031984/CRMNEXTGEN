# Deferred Items — Phase 17

Out-of-scope discoveries logged during execution (NOT fixed here).

## Pre-existing test failure (hors scope 17-02)

- **`apps/web/src/lib/closure/__tests__/shared-template.test.ts:175`** — `loadLogoColorDataUrl` retourne MIME `data:image/jpeg;base64,` alors que le test attend `data:image/jpg;base64,`. PRÉ-EXISTANT (documenté 15-01 → 16-06, baseline v5). Non causé par le plan 17-02 (aucun fichier closure/template touché). Correctif suggéré : aligner l'assertion sur `image/jpeg` OU normaliser le MIME dans `loadAssetDataUrl`. Suite web = 1141/1142 (seul cet échec), inchangée par 17-02.
