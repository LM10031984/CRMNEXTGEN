---
phase: quick-260525-f3a
plan: 01
subsystem: api
tags: [server-actions, prisma, agefice, convention, pack-fin-formation, qualiopi]

# Dependency graph
requires:
  - phase: phase-11-factures
    provides: "ClosureJob workflow, generators de docs Qualiopi par participant"
provides:
  - "Convention generator : guard unifié bidirectionnel participant.priceHT ↔ product.priceHT"
  - "AGEFICE generator : guard explicite early-return cohérent avec convention-generator"
  - "Variable effectivePrice partagée par les deux generators (pattern réutilisable)"
  - "Message d'erreur unifié mentionnant les 2 endroits (inscription + fiche produit)"
affects: [pack-fin-formation, closure-pack, agefice, smartof-import]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pattern effectivePrice : fallback bidirectionnel participant.priceHT > 0 ? participant.priceHT : product.priceHT"
    - "Message d'erreur métier : mentionner TOUS les endroits où l'utilisateur peut résoudre le problème"

key-files:
  created: []
  modified:
    - apps/web/src/server/actions/convention-generator.ts
    - apps/web/src/server/actions/agefice-generator.ts

key-decisions:
  - "Choix du fallback : participant.priceHT prioritaire (cas SmartOF importé où product.priceHT=0 mais inscriptions tarifées correctement à 3024€)"
  - "Guard unifié plutôt que 2 guards séparés : une seule erreur possible = UX plus claire"
  - "Message d'erreur mentionne les 2 endroits (inscription via 'fiche session bouton Éditer', produit via /app/produits)"

patterns-established:
  - "effectivePrice pattern : à réutiliser sur tout futur generator qui consomme priceHT (factures, attestations payées, etc.)"

requirements-completed:
  - FIX-CONV-01
  - FIX-AGEFICE-01

# Metrics
duration: ~3min (1min 19s code + edits)
completed: 2026-05-25
---

# Quick Task 260525-f3a : Fix faux positif Prix HT — Convention + AGEFICE

**Guard unifié `effectivePrice` (participant.priceHT || product.priceHT) sur convention-generator + agefice-generator — débloque le 'Pack fin de formation' sur SES-0043 (9 participants à 3024€, PROD-0042 importé SmartOF avec priceHT=0).**

## Performance

- **Duration:** ~3 min (1m 19s d'édition + tsc + commits)
- **Started:** 2026-05-25T09:02:14Z
- **Completed:** 2026-05-25T09:05:30Z (approx)
- **Tasks:** 2/2 auto exécutées (T3 = checkpoint:human-verify, en attente test Laurent)
- **Files modified:** 2

## Accomplishments

- Faux positif "Prix HT manquant sur le produit de formation" éliminé : le PDF Convention utilisait déjà `participant.priceHT`, le guard sur `product.priceHT` était purement défensif et bloquait à tort
- Variable `effectivePrice` calculée une seule fois et réutilisée dans le payload (pas de double Number() coût)
- AGEFICE generator harmonisé : ajout d'un guard early-return explicite (avant : fallback `||` silencieux dans le payload, sans détection du cas "les deux à 0")
- Message d'erreur unifié et actionnable : "ni sur l'inscription (fiche session, bouton Éditer) ni sur le produit (/app/produits)"

## Task Commits

1. **Task 1: Fix convention-generator — guard unifié + effectivePrice** — `186c9ec` (fix)
2. **Task 2: Fix agefice-generator — guard cohérent + effectivePrice** — `e62a4c8` (fix)
3. **Task 3: Test E2E SES-0043** — checkpoint:human-verify (en attente Laurent — voir section "Tests à effectuer par Laurent" ci-dessous)

## Files Created/Modified

- `apps/web/src/server/actions/convention-generator.ts` — Remplacement des 2 guards séparés (lignes 57-70 avant) par 1 seul bloc `effectivePrice` ; payload `produitPriceHTPerStagiaire` utilise `effectivePrice` au lieu de `Number(participant.priceHT)`
- `apps/web/src/server/actions/agefice-generator.ts` — Ajout d'un bloc `effectivePrice` + guard early-return avec `warnings` après `const product = session.product;` ; payload `formation.prixHT` utilise `effectivePrice` au lieu de `Number(participant.priceHT) || Number(product.priceHT)`

## Decisions Made

- **Pas de migration / pas de seed** : changement purement local aux deux generators, aucune incidence sur la BDD ou les Documents déjà générés
- **Pas de tests unitaires ajoutés** : la verification est manuelle (Task 3), et l'écosystème Vitest du projet ne couvre pas encore ces generators (à faire dans une phase dédiée si nécessaire)
- **Variable `effectivePrice` exposée localement** : pas de helper partagé extrait dans `lib/` car le code est trivial (3 lignes) et la duplication entre les 2 generators est explicite/intentionnelle

## Deviations from Plan

None — plan executed exactly as written.

`tsc --noEmit` passe sans erreur sur les 2 fichiers (vérifié 2 fois). Aucun ajustement nécessaire.

## Issues Encountered

None.

## Tests à effectuer par Laurent (Task 3 — checkpoint:human-verify)

Le plan stoppe ici intentionnellement. **Laurent doit valider manuellement les 5 checks suivants** avant que la quick task soit close :

### 1. Build & dev

```bash
cd "/Users/laurentmarx/Documents/CRM Next gen/files"
pnpm dev:full
```

### 2. Test Convention isolée — Catherine ALENDA (SES-0043)

- Naviguer vers la fiche session SES-0043
- Sur la ligne de Catherine ALENDA → cliquer **"Générer convention"**
- **Attendu :** PDF généré sans erreur, prix HT par stagiaire affiché = **3 024,00 €**

### 3. Test Pack fin de formation — SES-0043 (9 participants)

- Sur la fiche SES-0043 → bouton **"Pack fin de formation"**
- **Attendu :** les 9 participants lancent leur génération **sans** message "Prix HT manquant sur le produit de formation"
- Vérifier les jobs `ClosureJob` en BDD : aucun n'a `errorMessage` contenant "Prix HT"
- Attendre la fin du batch (~12 min)

### 4. Test AGEFICE

- Sur la fiche d'un apprenant AGEFICE de SES-0043 (Catherine ALENDA si elle a un AgeficeProfile)
- Cliquer **"Générer formulaire AGEFICE"**
- **Attendu :** PDF AGEFICE généré, champ prix HT = **3 024**

### 5. Test de non-régression — cas "les deux à 0"

- Trouver un participant avec `priceHT=0` **ET** produit avec `priceHT=0`
- Lancer **"Générer convention"**
- **Attendu :** erreur explicite mentionnant **inscription** + **fiche produit** (et **PAS** seulement "produit")

### Signal de reprise

Tape **"approved"** si les 5 checks passent, sinon décris le comportement observé pour qu'on diagnostique.

## Next Phase Readiness

- Quick task indépendante : pas de dépendance avec les phases planifiées
- Le pattern `effectivePrice` peut être réutilisé sur tout futur generator consommant `priceHT` (factures, attestations payées, exports xlsx, etc.)
- Si Task 3 passe : quick task close, retour au backlog (Phase 10 + Phase 12 restants sur v5)
- Si Task 3 échoue : créer un follow-up (debug ciblé sur le scénario qui casse)

---

## Self-Check: PASSED

**Vérification des claims :**

- `apps/web/src/server/actions/convention-generator.ts` : FOUND, contient `effectivePrice` (3 occurrences) et `produitPriceHTPerStagiaire: effectivePrice`
- `apps/web/src/server/actions/agefice-generator.ts` : FOUND, contient `effectivePrice` (lignes 175-176) et `prixHT: effectivePrice` (ligne 271)
- Commit `186c9ec` (Task 1) : FOUND dans `git log`
- Commit `e62a4c8` (Task 2) : FOUND dans `git log`
- `tsc --noEmit` sur apps/web : passe sans erreur sur les 2 fichiers (grep silencieux)

---
*Quick task : 260525-f3a-fix-convention-pack-fin-formation-auto-f*
*Completed (auto tasks) : 2026-05-25*
