# Deferred items — quick 260620-d42

## Pré-existant, hors scope Plan 01

- **`apps/web/src/lib/closure/__tests__/shared-template.test.ts` — Test 6 (loadLogoColorDataUrl cascade)** : échec pré-existant sur la baseline `cloud-migration`. L'assertion attend un MIME `data:image/jpg;base64,` mais la cascade renvoie `data:image/jpeg;base64,`. Dernière modif du test : commit `5f2f75f` (Phase 7-03), bien avant ce plan. Aucun fichier `closure/` n'est touché par le Plan 01 (260620-d42). À corriger dans un chantier closure dédié (probablement aligner l'assertion sur `image/jpeg`, MIME canonique).
