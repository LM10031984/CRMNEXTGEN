# Phase 21 — Items différés (hors scope, découverts en exécution)

## 2026-07-06 — `pnpm test` racine (turbo run test) casse sur cycle workspace PRÉ-EXISTANT

- **Découvert pendant :** 21-01 verification globale (« Suite complète `pnpm test` verte »).
- **Symptôme :** `turbo run test` (turbo résolu **2.9.6**, `package.json` déclare `^2.3.0`) échoue AVANT d'exécuter le moindre test : `Cyclic dependency detected: @qualiof/db#build, @qualiof/shared#build`.
- **Cause :** cycle de dépendances workspace **pré-existant** — `packages/shared/package.json` dépend de `@qualiof/db: workspace:*` (depuis commit `de6a6d1`) ET `packages/db/package.json` dépend de `@qualiof/shared: workspace:*`. Vérifié présent au commit pré-plan `7f68135` : **non causé par 21-01**.
- **Contournement (pattern projet, utilisé par tous les plans précédents) :** lancer les suites par package — `pnpm --filter @qualiof/web exec dotenv -e ../../.env -- vitest run` (1176/1176 verts) + `pnpm --filter @qualiof/shared exec vitest run` (113/113 verts).
- **À faire (candidat 21-02 CI ou quick) :** casser le cycle (ex. retirer `@qualiof/db` des deps de `@qualiof/shared` si l'import est marginal, ou exclure `test` du graphe `dependsOn: ["^build"]`) pour que la CI puisse utiliser `turbo run test`.
