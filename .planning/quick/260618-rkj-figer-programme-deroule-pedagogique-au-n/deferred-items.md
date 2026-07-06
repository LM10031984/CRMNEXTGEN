# Deferred items — quick 260618-rkj

Découvertes hors-scope de cette tâche (NON corrigées ici).

## Pré-existant (hors closure)

- `apps/web/src/server/actions/sessions.ts:804` — `error TS2353: 'legalName' does not exist in type LocationCreateInput`.
  - Apparaît UNIQUEMENT quand l'arbre de travail partagé porte des modifications non commitées sur sessions.ts/crud-edits.ts (chantier session-location-picker en cours, non lié à ce quick).
  - Au HEAD propre `cloud-migration` (5bac1d2), le worktree compile à 0 erreur. Erreur donc imputable à du WIP non commité côté checkout partagé, pas à ce quick.
  - Action : à traiter dans le chantier session-location-picker, pas ici.
