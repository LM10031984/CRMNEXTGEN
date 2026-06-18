---
phase: quick-260618-skk
plan: 01
subsystem: closure/deroule
tags: [qualiopi, deroule, rapport-formateur, anti-copier-coller, test-de-puissance]
requires:
  - quick-260618-rkj (figeage produit corps/programme)
provides:
  - "Rapport formateur du déroulé spécifique par session (notes + narratifs)"
  - "SessionRapportCtx + buildSessionRapportCtx (contexte session pour le LLM)"
  - "Test de puissance déterministe sessions différentes → rapport différent"
affects:
  - apps/web/src/lib/closure/ollama-generators.ts
  - apps/web/src/lib/closure/deroule-template.ts
  - apps/web/src/lib/closure/generate-deroule-session.ts
tech-stack:
  added: []
  patterns:
    - "Seed de hash métier = identifiant de SESSION (sessionCode), pas le titre PRODUIT"
    - "Contexte session optionnel rétro-compat (5e param défaut null) sur un générateur LLM"
    - "Test de puissance via mutation prouvée (seed sessionCode→sessionTitle → ROUGE)"
key-files:
  created:
    - apps/web/src/lib/closure/__tests__/rapport-formateur-session-specifique.test.ts
  modified:
    - apps/web/src/lib/closure/ollama-generators.ts
    - apps/web/src/lib/closure/deroule-template.ts
    - apps/web/src/lib/closure/generate-deroule-session.ts
decisions:
  - "Résultats agrégés (qcmScoreMoyen/satisfaction/positionnement) laissés optionnels et non câblés (agrégation lecture hors scope) — le prompt les omet proprement"
  - "Branche legacy (sans frozenBody) inchangée : generateRapportFormateur sans sessionCtx, rétro-compat assurée par le défaut null"
metrics:
  duration: ~12 min
  tasks: 3
  files: 4
  commits: 3
  tests_added: 4
  completed: 2026-06-18
---

# Quick 260618-skk : Rapport formateur du déroulé spécifique par session — Summary

Rapport formateur du déroulé désormais SPÉCIFIQUE par session (notes du tableau seedées sur `sessionCode` + narratifs LLM ancrés sur les faits réels de la session), sans toucher au figeage produit du corps/programme (quick 260618-rkj).

## Contexte

Sur PROD-0062 (4 sessions identiques mot pour mot), deux causes rendaient le rapport formateur identique entre sessions d'un même produit :
1. **CAUSE 1** — le tableau « satisfaction formateur » (7 critères, notes 1-5) était seedé sur `ctx.sessionTitle` (= titre PRODUIT, identique toutes sessions) → `noteBySeed()` produisait les MÊMES notes partout.
2. **CAUSE 2** — les narratifs (adaptations/remarques/bilan) étaient générés par `generateRapportFormateur` qui ne recevait QUE titre + durée + programme (tous identiques entre sessions, programme figé) → narratifs génériques quasi identiques.

Enjeu Qualiopi : un auditeur ne doit pas trouver deux déroulés de sessions différentes au rapport formateur identique.

## Ce qui a été fait

### Task 1 — Seed = sessionCode + contexte session sur generateRapportFormateur (commit `ad9c35f`)
- `deroule-template.ts` : `renderDerouleHtml` passe désormais `seed: ctx.sessionCode` (au lieu de `ctx.sessionTitle`). `renderProductDerouleHtml` (variante PRODUIT) garde `seed: data.produitTitre` — inchangé (pas de notion de session au niveau produit).
- `ollama-generators.ts` : nouvelle interface exportée `SessionRapportCtx` (nbApprenants, enseignes[], dateDebut/Fin, lieu + résultats agrégés optionnels). `generateRapportFormateur` reçoit un 5e paramètre `sessionCtx: SessionRapportCtx | null = null` (rétro-compatible). Helper pur `buildFaitsSession` construit un bloc « FAITS CONCRETS DE CETTE SESSION » filtré sur les valeurs non nulles + directive d'ancrage session. La garde anti hors-programme et `SYSTEM_PROMPT_RAPPORT_FORMATEUR` restent intacts.

### Task 2 — persistDerouleSession charge tous les participants + enseignes (commit `b5c25f5`)
- Query élargie : tous les participants éligibles (`PRE_ENROLLED|CONFIRMED|ATTENDED`) + leurs `legalLinks` (mêmes rôles que `build-context.ts` : `EI_SELF|AGENT_COMMERCIAL|DIRIGEANT|SALARIE`). `firstParticipant` toujours utilisé pour le `ClosureContext` de rendu.
- Helper pur exporté `buildSessionRapportCtx(participants, ctx)` : effectif réel + enseignes dédupliquées (ordre stable) + dates/lieu RÉUTILISÉS du `ctx` déjà résolu (pas de requête supplémentaire).
- Branche `frozenBody` : `generateRapportFormateur(formation, 'PedagogicalAsset', null, tenantId, sessionCtx)`. Fallback corps figé si rapport null — pas de stub.

### Task 3 — Test de puissance déterministe (commit `7123be1`)
`rapport-formateur-session-specifique.test.ts`, 4 tests, zéro appel LLM réel :
- **Test 1 (CAUSE 1)** : 2 sessions (`SES-A`/`SES-B`, même titre, même corps) → séquences de 7 notes DIFFÉRENTES.
- **Test 2 (CAUSE 2)** : `buildSessionRapportCtx` + `generateRapportFormateur` mocké (reflète le sessionCtx reçu) → narratifs différents quand effectif/enseignes/dates/lieu diffèrent ; identiques quand `sessionCtx=null`.
- **Test 3 (invariant figeage)** : corps `jours[]` IDENTIQUE entre les 2 sessions (non-régression rkj).
- **Test 4 (fallback)** : rapport null → pools utilisés (anti-stub préservé).

## Test de puissance — mutation prouvée

Mutation appliquée une fois : dans `renderDerouleHtml`, `seed: ctx.sessionCode` → `seed: ctx.sessionTitle`.
→ Test 1 vire **ROUGE** (`1 failed | 3 passed` : les 2 sessions partagent le même seed = titre produit → `notesA === notesB`).
Restauration `seed: ctx.sessionCode` → **18/18 verts**. Le test garde donc bien l'invariant (pas un mock complaisant).

## Vérification

- `pnpm exec tsc --noEmit` (apps/web) : **0 erreur**.
- `pnpm exec vitest run rapport-formateur-session-specifique freeze-product-assets rapport-formateur-narratif gen-session-pack-pure` : **18/18 verts** (4 nouveaux + 14 non-régression).
- `freeze-product-assets.test.ts` (4) + `rapport-formateur-narratif.test.ts` (3) toujours verts → figeage produit (rkj) préservé, aucune modification de `freeze-product-assets.ts`, corps non régénéré par session.
- Aucune génération de masse, aucun appel Ollama/Claude réel.

## Deviations from Plan

None - plan executed exactly as written (3 tasks, 0 déviation Rule 1/2/3/4). Les champs résultats agrégés (qcmScoreMoyen/satisfactionMoyenne/positionnementProgressed) ont été laissés optionnels et non câblés conformément au plan (agrégation lecture explicitement hors scope).

## Known Stubs

Aucun stub bloquant. Les 3 champs résultats agrégés de `SessionRapportCtx` sont volontairement optionnels (`undefined`) — le prompt les omet proprement. Câblage de l'agrégation lecture (score QCM moyen, satisfaction, positionnement) renvoyé à un futur quick si Laurent veut enrichir davantage les narratifs ; non requis pour résoudre les deux causes du copier-coller.

## Self-Check: PASSED

- FOUND: apps/web/src/lib/closure/ollama-generators.ts
- FOUND: apps/web/src/lib/closure/deroule-template.ts
- FOUND: apps/web/src/lib/closure/generate-deroule-session.ts
- FOUND: apps/web/src/lib/closure/__tests__/rapport-formateur-session-specifique.test.ts
- FOUND commit: ad9c35f, b5c25f5, 7123be1
