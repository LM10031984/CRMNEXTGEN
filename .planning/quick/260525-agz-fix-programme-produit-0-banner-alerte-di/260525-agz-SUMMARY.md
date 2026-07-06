---
phase: 260525-agz
plan: 01
subsystem: produits
tags: [next-app-router, prisma, qualiopi, smartof, cache-invalidation, ux-guard]

requires:
  - phase: SmartOF import (session 2026-05-23)
    provides: 25 produits importés sans prix (API SmartOF n'expose pas priceHT)
provides:
  - Guard serveur sur generateProgrammeForProduct (refuse priceHT<=0)
  - Guard serveur sur generateConventionForParticipant (refuse priceHT<=0 produit ET inscription)
  - Invalidation cache PDF programme par product.updatedAt > document.createdAt
  - Banner d'alerte rouge "Prix HT manquant" sur la fiche produit avec CTA modale d'édition
  - Badge "Prix manquant" sur les cards de la liste produits
affects: [conventions, programmes, OPCO, AGEFICE, validation Qualiopi]

tech-stack:
  added: []
  patterns:
    - "Guard server-action en early-return { ok: false, error } avant any side effect"
    - "Cache PDF invalidation par comparaison updatedAt vs createdAt (pas de versioning explicite)"
    - "Banner client réutilise le composant d'édition existant (EditProductButton) au lieu de dupliquer la modale"

key-files:
  created:
    - apps/web/src/components/produits/price-missing-banner.tsx
  modified:
    - apps/web/src/server/actions/programme-generator.ts
    - apps/web/src/server/actions/convention-generator.ts
    - apps/web/src/app/app/produits/[id]/page.tsx
    - apps/web/src/app/app/produits/page.tsx
  deleted:
    - apps/web/scripts/diag-prog-price.ts (script jetable, non versionné)

key-decisions:
  - "Cache PDF invalidé par comparaison updatedAt/createdAt — pas de versioning explicite (simple, suffisant pour le cas du prix renseigné après coup)"
  - "Banner réutilise EditProductButton tel quel (label 'Éditer le produit') plutôt que d'ajouter une prop buttonLabel : pas de sur-engineering pour un cas marginal"
  - "Badge variant=danger réutilisé (déjà défini dans ui/badge.tsx) plutôt qu'un className custom"

patterns-established:
  - "Pattern guard priceHT : tous les générateurs Qualiopi (programme + convention) refusent les produits/inscriptions sans prix avec un message FR explicite"
  - "Pattern cache PDF Document : invalidation par timestamp comparaison parent.updatedAt > document.createdAt"

requirements-completed:
  - QUICK-260525-agz

duration: ~3 min (tasks 1+2 auto, hors validation E2E)
completed: 2026-05-25
---

# Quick task 260525-agz : Fix programme/convention à 0€ + banner alerte Summary

**Guard serveur sur priceHT=0 dans les générateurs programme/convention + invalidation cache PDF + banner d'alerte rouge sur fiche produit + badge "Prix manquant" sur la liste, pour rendre visibles et éditables les ~25 produits SmartOF importés sans prix.**

## Performance

- **Duration:** ~3 min (tasks 1+2 auto, hors checkpoint humain Task 3)
- **Started:** 2026-05-25T05:36:26Z
- **Completed (Tasks 1+2):** 2026-05-25T05:39:10Z
- **Tasks:** 2/3 complétées en auto (Task 3 = checkpoint:human-verify, en attente Laurent)
- **Files modified:** 4 (3 modified + 1 created + 1 deleted)

## Accomplishments

- **Bug juridique bloqué** : aucune génération de programme ou convention Qualiopi à 0€ HT n'est désormais possible (toast erreur FR explicite à la place du PDF invalide)
- **Bug cache PDF résolu** : après mise à jour du prix produit, la prochaine génération (non-forcée) régénère bien un nouveau PDF (plus de PDF stale à 0€ servi en boucle depuis le cache)
- **Visibilité opérateur** : badge "Prix manquant" sur la liste produits + banner d'alerte rouge sur la fiche produit (avec CTA direct vers la modale d'édition) → les 25 produits SmartOF sans prix ne sont plus invisibles
- **Hygiène repo** : suppression du script de diagnostic jetable `apps/web/scripts/diag-prog-price.ts`

## Task Commits

1. **Task 1 : Guard priceHT=0 + invalidation cache + suppression script** — `04d321d` (fix)
2. **Task 2 : Banner fiche produit + badge liste produits** — `ebf93e9` (feat)
3. **Task 3 : Validation E2E par Laurent** — **EN ATTENTE** (checkpoint:human-verify)

## Files Created/Modified

- `apps/web/src/components/produits/price-missing-banner.tsx` (**créé**, ~42 lignes) — Banner client réutilisant EditProductButton, affiché conditionnellement
- `apps/web/src/server/actions/programme-generator.ts` (modifié) — Guard `priceHT <= 0` ligne 184, sélection `createdAt` + invalidation cache lignes 197-211
- `apps/web/src/server/actions/convention-generator.ts` (modifié) — Double guard `priceHT <= 0` produit (l.57) et inscription (l.64)
- `apps/web/src/app/app/produits/[id]/page.tsx` (modifié) — Import du banner, extraction de `editCurrent` en const locale, banner conditionnel inséré entre Breadcrumb et toolbar
- `apps/web/src/app/app/produits/page.tsx` (modifié) — Ternaire affichant Badge `variant=danger` "Prix manquant" quand priceHT=0
- `apps/web/scripts/diag-prog-price.ts` (**supprimé**, non versionné) — Script de diagnostic jetable retiré du disque

## Decisions Made

- **Cache PDF invalidation par timestamp** (pas de versioning explicite) : `product.updatedAt > existing.createdAt` → on régénère. Simple, suffisant pour le cas d'usage (prix renseigné après import), et n'introduit pas de nouvelle colonne BDD.
- **Banner réutilise EditProductButton** tel quel (label "Éditer le produit") plutôt que d'ajouter une prop `buttonLabel="Définir le prix"` : pas de sur-engineering. Le contexte du banner est déjà explicite (titre "Prix HT manquant" + phrase d'explication).
- **Refactor mineur en passant** : `current={{...}}` passé à 2 endroits (banner + EditProductButton du header) → extrait dans une const locale `editCurrent` pour éviter la duplication littérale.
- **Badge `variant=danger`** : la variante existait déjà dans `ui/badge.tsx` (`bg-red-50 text-red-700 border-red-200`) → réutilisée plutôt qu'un className custom comme suggéré en fallback dans le plan.

## Deviations from Plan

None - plan exécuté tel qu'écrit (les 2 micro-ajustements documentés ci-dessus sont des choix conformes aux notes "si Badge variant existe, l'utiliser" et "extraire éventuellement le current dans une const" du plan lui-même).

## Issues Encountered

- `git rm apps/web/scripts/diag-prog-price.ts` a échoué car le fichier n'était jamais entré dans l'index git (untracked). Résolu par suppression filesystem simple (`rm`), confirmée par `test ! -f`. Aucun impact.

## Validation Task 3 — À faire par Laurent

**Le plan stipule explicitement que Task 3 est un `checkpoint:human-verify` blocking. Les commits Tasks 1+2 sont en place, mais aucune validation E2E browser n'a été effectuée par l'exécutant.**

### Étapes à exécuter

1. Démarrer la stack : `pnpm dev:full`
2. Ouvrir http://localhost:3000/app/produits → vérifier que les ~25 produits sans prix affichent un badge rouge "Prix manquant"
3. Cliquer sur un de ces produits → la fiche doit afficher un banner rouge en tête, AVANT le toolbar (Retour au catalogue / Supprimer)
4. Sur l'onglet **Programme** de la fiche, tenter de générer le PDF programme → toast erreur FR "Prix HT manquant…" (le PDF NE doit PAS être produit)
5. Cliquer "Éditer le produit" depuis le banner → la modale s'ouvre, renseigner le prix (ex : 1500€), sauvegarder
6. Le banner disparaît, le badge "1500 € HT" apparaît dans le PageHeader
7. Retenter la génération programme → un NOUVEAU PDF est produit (createdAt récent dans la liste Documents, pas l'ancien cached à 0€)
8. Sur une fiche session avec un participant inscrit sur un produit encore à 0€, tenter "Générer la convention" → toast erreur FR. Après update du prix, retenter → convention générée avec le bon montant.
9. Vérifier que le fichier `apps/web/scripts/diag-prog-price.ts` n'existe plus : `ls apps/web/scripts/diag-prog-price.ts` doit retourner "No such file".

### Resume signal attendu

Répondre **"approved"** (ou décrire les écarts observés, capture si possible) pour clore définitivement la quick task.

## Action utilisateur résiduelle hors scope code

**Les 25 produits SmartOF avec `priceHT=0` doivent être corrigés manuellement** (un par un via le banner+modale, ou en bulk via SQL/Prisma Studio si Laurent préfère). Le code ne fait que rendre le problème visible et bloque les générations à 0€ — il ne devine pas le bon prix.

Si Laurent demande un bulk-update :
- Option A (rapide) : `UPDATE training_product SET price_ht = 1500 WHERE price_ht = 0;` direct sur Postgres local (mais perd la granularité par produit)
- Option B (propre) : nouveau plan quick avec un écran d'édition rapide multi-lignes sur `/app/produits` (input prix inline pour chaque card sans prix) — à cadrer si demandé

## TODO résiduel éventuel

- Si Laurent demande après validation E2E un **label custom "Définir le prix"** sur le bouton du banner : étendre `EditProductButton` avec une prop optionnelle `buttonLabel` (1 ligne dans `EditProductButton` + 1 ligne dans le banner). Pas fait pour ne pas sur-engineer.
- Si Laurent veut un **bulk-edit prix depuis la liste produits** : nouveau plan quick à cadrer.
- **BUG-13 inchangé** : le footer PDF utilise toujours les valeurs de `loadOfConfig` au moment du render, donc le prix s'affichera correctement sur les nouveaux PDFs régénérés (rien à corriger ici).

## Next Phase Readiness

- 2/3 tasks committed atomiquement, typecheck OK sur `apps/web` (zero erreur)
- Le checkpoint Task 3 (validation E2E) reste à exécuter par Laurent avant de considérer la quick task close
- Aucun nouveau test custom ajouté (correctifs ciblés sans logique métier non triviale ; à voir si Laurent veut un test unit sur le guard `priceHT <= 0` après validation)

## Self-Check: PASSED

- `apps/web/src/components/produits/price-missing-banner.tsx` FOUND
- `apps/web/src/server/actions/programme-generator.ts` modifié (guard `priceHT <= 0` + `product.updatedAt <= existing.createdAt`)
- `apps/web/src/server/actions/convention-generator.ts` modifié (2 guards)
- `apps/web/src/app/app/produits/[id]/page.tsx` modifié (import + render conditionnel)
- `apps/web/src/app/app/produits/page.tsx` modifié (badge "Prix manquant")
- `apps/web/scripts/diag-prog-price.ts` REMOVED
- Commit `04d321d` FOUND (Task 1)
- Commit `ebf93e9` FOUND (Task 2)
- `pnpm -F @qualiof/web exec tsc --noEmit` exit code 0

---
*Quick task: 260525-agz-fix-programme-produit-0-banner-alerte-di*
*Completed (Tasks 1+2): 2026-05-25*
*Task 3 checkpoint: en attente validation Laurent*
