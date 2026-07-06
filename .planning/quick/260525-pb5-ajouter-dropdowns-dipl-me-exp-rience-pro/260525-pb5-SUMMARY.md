---
phase: quick-260525-pb5
plan: 01
subsystem: agefice
tags: [agefice, forms, person, dropdowns, qualiopi]
requires: []
provides:
  - lib/agefice-options.ts (source unique 6 diplômes + 4 tranches expérience AGEFICE)
  - createPerson(): champs diplomas + professionalExperience
  - create-person-button: 2 dropdowns AGEFICE
  - edit-person-button: 2 dropdowns AGEFICE avec fallback "Valeur actuelle" (legacy)
  - inferExperience(): check exact canonique avant heuristique
affects:
  - lib/agefice-form-fill.ts
  - server/actions/agefice-generator.ts
  - server/actions/crud-edits.ts
  - components/forms/create-person-button.tsx
  - components/forms/edit-person-button.tsx
tech-stack:
  added: []
  patterns:
    - "Source unique de vérité partagée (lib/X-options.ts) consommée par lib + server actions + composants UI"
    - "Dropdown legacy-aware : option 'Valeur actuelle : X' en tête si la donnée existante n'appartient pas aux options canoniques"
    - "Selective staging via git add -p pour isoler des hunks au sein d'un fichier contenant des WIP pré-existants"
key-files:
  created:
    - apps/web/src/lib/agefice-options.ts
  modified:
    - apps/web/src/lib/agefice-form-fill.ts
    - apps/web/src/server/actions/agefice-generator.ts
    - apps/web/src/server/actions/crud-edits.ts
    - apps/web/src/components/forms/create-person-button.tsx
    - apps/web/src/components/forms/edit-person-button.tsx
decisions:
  - "Pas de migration Prisma : les colonnes Person.diplomas et Person.professionalExperience existent déjà"
  - "Pas de migration de données : 291 fiches legacy texte libre conservées telles quelles, Laurent migre au fil de l'eau via le dropdown 'Valeur actuelle'"
  - "educationLevel reste en texte libre — non critique AGEFICE, hors scope audit"
  - "Heuristique resolveDiplome + heuristique mots-clés inferExperience conservées comme fallback rétro-compat"
metrics:
  duration: "~5 min"
  tasks_completed: 3
  files_created: 1
  files_modified: 5
  tests_passing: "675/675"
  completed_date: "2026-05-25"
requirements:
  - PB5-01
  - PB5-02
  - PB5-03
  - PB5-04
---

# Quick Task 260525-pb5 : Dropdowns Diplôme + Expérience pro AGEFICE Summary

**Alignement des formulaires apprenant (création + édition) sur les valeurs exactes AGEFICE via une source unique `agefice-options.ts` (6 diplômes + 4 tranches expérience), refactor lib + generator pour consommer la constante, rétro-compat préservée pour les 291 fiches texte libre legacy.**

## Objectif livré

Éliminer les 2 derniers champs "absents UI" sur 60 du formulaire AGEFICE PDF (audit AGEFICE 2026-05-25) :
- **Dernier diplôme** : text libre → dropdown 6 options canoniques alignées PDF
- **Expérience pro** : text libre → dropdown 4 tranches canoniques alignées PDF

Avant : risque que l'IA "invente" la tranche via heuristique mots-clés côté générateur PDF.
Après : choix discret côté UI → mapping direct sans heuristique côté générateur (heuristique conservée en fallback pour les 291 fiches legacy).

## Tasks exécutées

### Task 1 — `refactor(quick-260525-pb5-01)` (commit `93e2fc6`)

Centralisation des constantes AGEFICE :

- `apps/web/src/lib/agefice-options.ts` (nouveau) : 6 `DIPLOME_OPTIONS`, 4 `EXPERIENCE_OPTIONS`, types `DiplomeOption` / `ExperienceValue`, helper `isCanonicalExperience()`.
- `agefice-form-fill.ts` : tableau local `DIPLOME_OPTIONS` (lignes 160-167) supprimé, remplacé par `import { DIPLOME_OPTIONS } from './agefice-options'`. `resolveDiplome` conservé intact (heuristique fallback).
- `agefice-generator.ts` : `inferExperience(raw)` fait désormais un check exact via `isCanonicalExperience(raw)` avant l'heuristique mots-clés.

### Task 2 — `feat(quick-260525-pb5-01)` (commit `9189489`)

Extension serveur + formulaire de création :

- `crud-edits.ts` `createPerson` : signature étendue avec 2 champs optionnels `diplomas` + `professionalExperience`, persistés dans `tx.person.create({ data: ... })`.
- `create-person-button.tsx` :
  - Import `DIPLOME_OPTIONS, EXPERIENCE_OPTIONS` depuis `@/lib/agefice-options`
  - 2 nouveaux `useState` après `socialSecurityNb`
  - `reset()` réinitialise les 2 nouveaux états
  - 2 dropdowns côte à côte dans une grille `grid-cols-1 sm:grid-cols-2` insérée juste après le bloc "Statut professionnel"
  - Payload `createPerson({...})` étendu

### Task 3 — `feat(quick-260525-pb5-01)` (commit `46cf38e`)

Formulaire d'édition avec rétro-compat legacy :

- Import `DIPLOME_OPTIONS, EXPERIENCE_OPTIONS` depuis `@/lib/agefice-options`
- 2 builders `DIPLOMA_OPTIONS_FOR_EDIT` / `EXPERIENCE_OPTIONS_FOR_EDIT` construits avant le `return` : si la valeur courante de la fiche ne matche pas les options canoniques, on insère une option `"Valeur actuelle : X"` en tête.
- 2 anciens text inputs (`professionalExperience` ligne 60, `diplomas` ligne 62) remplacés par `type: 'select'` avec les options dynamiques.
- `educationLevel` conservé en text libre.

## Vérifications

- `pnpm --filter @qualiof/web exec tsc --noEmit` : **0 erreur** (3 runs successifs après chaque task)
- `grep -rln "'Fin de scolarité obligatoire'" apps/web/src` → **1 fichier seulement** : `lib/agefice-options.ts` ✅ source unique
- `grep -rln "from.*agefice-options" apps/web/src` → **4 consommateurs** : form-fill, generator, create-form, edit-form ✅
- `pnpm --filter @qualiof/web test --run` → **675/675 tests passing**, zéro régression
- Pas de migration Prisma nécessaire (colonnes existaient déjà dans `schema.prisma` lignes 145-146)

## Pattern à retenir

**Source unique de vérité pour les contraintes externes (PDF, API, format imposé)** :
quand une valeur métier doit matcher mot pour mot une référence externe (ici le PDF AGEFICE),
centraliser dans `lib/X-options.ts` consommé à la fois par les composants UI (dropdowns), les libs métier (mapping), et les server actions (validation). Aujourd'hui appliqué à AGEFICE — pattern réutilisable pour OPCO, CGV, etc.

**Dropdown legacy-aware pour migration sans perte** :
quand on remplace un text libre par un dropdown sur des données existantes hétérogènes, ne PAS migrer en bulk → ajouter une option `"Valeur actuelle : X"` en tête du dropdown si la valeur ne matche pas. L'utilisateur migre au fil de l'eau lors des éditions ponctuelles, sans risque ni script de migration.

## Validation E2E manuelle (à effectuer par Laurent)

- [ ] Créer un nouvel apprenant test avec :
  - Diplôme = `Bac+2 : BTS-DUT-DEUG`
  - Expérience = `1 à 3 ans` (value `1_3_ANS`)
- [ ] L'inscrire à une session AGEFICE existante
- [ ] Générer le PDF AGEFICE depuis la fiche session
- [ ] Vérifier dans le PDF : dropdown "Sélectionner le dernier diplôme obtenu" = `Bac+2 : BTS-DUT-DEUG` ET case `1 à 3 ans` cochée
- [ ] Ouvrir une fiche legacy (ex : `professionalExperience = "Entre 4 et 10 ans"`) en édition → vérifier qu'apparaît `"Valeur actuelle : Entre 4 et 10 ans"` en tête du dropdown

## Deviations from Plan

None — plan exécuté exactement comme écrit. Seule contrainte d'exécution : utilisation de `git add -p` pour isoler mes 2 hunks dans `crud-edits.ts` au sein d'un fichier contenant des WIP pré-existants non-PB5 (BUG-P0-02 `validateAiDraftProduct`). Le commit Task 2 ne contient que les changements PB5.

## Self-Check: PASSED

- [x] `apps/web/src/lib/agefice-options.ts` FOUND
- [x] Commit `93e2fc6` FOUND (refactor centralisation)
- [x] Commit `9189489` FOUND (création apprenant)
- [x] Commit `46cf38e` FOUND (édition apprenant)
- [x] tsc clean
- [x] 675/675 tests pass
- [x] grep source unique : 1 fichier
- [x] grep imports : 4 consommateurs
