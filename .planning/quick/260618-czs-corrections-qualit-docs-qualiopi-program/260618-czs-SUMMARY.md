---
phase: quick-260618-czs
plan: 01
subsystem: closure/docs-qualiopi
tags: [qualiopi, programme, satisfaction, signature, llm, deterministic]
requires:
  - apps/web/src/lib/formation-horaires.ts (PAUSE_DEJEUNER)
  - apps/web/src/lib/closure/shared-template.ts (loadTrainerSignatureDataUrl, ClosureContext.sessionTrainers)
provides:
  - buildHoraireScaffold / enforceProgrammeFidelity (programme-normalize.ts)
  - generateNormalizedProgramme (ollama-generators.ts, tier quality)
  - SYSTEM_PROMPT_NORMALIZE_PROGRAMME (qualiopi-prompts.ts)
  - règle de voix 1re personne + ancrage thème (satisfaction chaud/froid)
  - colonne signature formateur anti-doublon (attestation + certificat)
affects:
  - Programme.pdf, Convention de formation.pdf (source unique normalisée)
  - Satisfaction à chaud/froid.pdf, Attestation, Certificat
tech-stack:
  added: []
  patterns:
    - "grille horaire FIGÉE hardcodée (pas de smart calc sur valeur métier)"
    - "heuristique fidélité tokens >=4 lettres + stop-words FR (test de puissance)"
    - "anti-doublon signature : compare trainerSig à la dataURL du représentant légal"
key-files:
  created:
    - apps/web/src/lib/programme-normalize.ts
    - apps/web/src/lib/__tests__/programme-normalize.test.ts
  modified:
    - apps/web/src/lib/closure/qualiopi-prompts.ts
    - apps/web/src/lib/closure/ollama-generators.ts
    - apps/web/scripts/_gen-temoin-cloud.ts
    - apps/web/src/lib/closure/attestation-template.ts
    - apps/web/src/lib/closure/certificat-template.ts
decisions:
  - "PROMPT_VERSION bumpé une seule fois (qualiopi-gen-v8-2026-06-18) couvrant satisfaction + NORMALIZE_PROGRAMME"
  - "multi-jours différé : scaffold rend 1 jour + flag multiDayDeferred (nbJours calculé mais non rendu)"
  - "satisfaction reste tier 'fast' (non forcé en quality)"
metrics:
  duration: ~25min
  completed: 2026-06-18
  tasks: 3
  files: 7
  commits: 3
---

# Quick 260618-czs : Corrections qualité docs Qualiopi (programme, satisfaction, signature) Summary

Programme normalisé déterministe (grille 9h00–13h00 / 14h00–18h00 = 8h pile, verbes évaluables, fidélité contrôlée) alimentant Programme.pdf ET Convention.pdf via une source unique ; satisfactions froid/chaud forcées en 1re personne ancrées au thème ; signature du formateur réel ajoutée sur attestation + certificat sans jamais dupliquer l'image du représentant légal.

## Tasks

### Task 1 — Normalisation déterministe du programme + générateur LLM (cas 1 jour) — `8fd30bc`
- Nouveau `programme-normalize.ts` :
  - `buildHoraireScaffold(durationHours)` FIGÉ/DÉTERMINISTE : matin `9h00–13h00` (4h) + déjeuner 13h00–14h00 (réutilise `PAUSE_DEJEUNER`) + après-midi `14h00–18h00` (4h) = 8h pile. Pauses café internes ~10h45 / ~15h45 (15 min) DANS les blocs. `nbJours = ceil(N/8)` calculé mais une seule journée rendue + `multiDayDeferred` pour N>8. Aucun random, aucun smart calc.
  - `enforceProgrammeFidelity(normalizedMd, sourceModuleTitles)` : heuristique figée (tokens ≥4 lettres après retrait stop-words FR, normalisation casse/accents). Section orpheline = aucun token commun avec la source → `{ ok:false, extraneous:[...] }`. NON bloquant.
  - `VERBES_EVALUABLES` (liste blanche réutilisée par le prompt), `renderHoraireScaffoldMd` (grille injectée dans le prompt user).
- `SYSTEM_PROMPT_NORMALIZE_PROGRAMME` ajouté (horaires imposés à recopier, décliner sans enrichir, verbes d'action).
- `generateNormalizedProgramme(programMd, objectives, durationHours, titre, tenantId?)` tier `quality`, post-traitement fidélité en `warn`, fallback null.
- 13 tests verts, **test de puissance vérifié** : forcer `ok:true` dans la heuristique → 2 tests RED (restauré).

### Task 2 — Satisfaction 1re personne + ancrage thème + source programme unique témoin — `5f1535a`
- `SYSTEM_PROMPT_SATISFACTION_CHAUD` et `_FROID` : RÈGLE DE VOIX ABSOLUE (1re personne du stagiaire, jamais 3e personne ni prénom) + ancrage strict au thème (« n'introduis aucun autre domaine »). Ratings ≥90% conservés.
- User-prompts des 2 generators renforcés (1re personne + thème), tier `fast` inchangé.
- `PROMPT_VERSION` → `qualiopi-gen-v8-2026-06-18` (bump unique).
- `_gen-temoin-cloud.ts` : `generateNormalizedProgramme` appelé **une fois** avant le rendu, `normalizedProgrammeMd` (fallback brut) alimente `produitProgrammeMd` de Programme.pdf ET de Convention.pdf (5 occurrences). Déroulé inchangé (consomme toujours `p.programMd`).

### Task 3 — Signature formateur réel sur attestation + certificat (anti-doublon) — `ee60058`
- Import `loadTrainerSignatureDataUrl` dans les 2 templates.
- `trainer = ctx.sessionTrainers[0]`, `trainerSig`, `trainerSigIsDuplicate = trainerSig !== '' && trainerSig === <signature représentant légal>` (pédago pour l'attestation, dirigeant pour le certificat — même variable que le bloc existant).
- 2e colonne `.col` formateur ajoutée dans `.signature-block` (bloc dirigeant/pédago conservé) :
  - pas de formateur → colonne masquée ;
  - `trainerSig === ''` (non reconnu) → « Le formateur — {nom} » sans image ;
  - doublon (Laurent = représentant légal) → nom + mention sans réafficher l'image ;
  - image distincte (ex Jean-Guy) → vraie 2e signature.

## Deviations from Plan

None — plan exécuté tel qu'écrit. Le bump unique de `PROMPT_VERSION` et l'ajout de `SYSTEM_PROMPT_NORMALIZE_PROGRAMME` ont été coordonnés sur le commit Task 2 (un seul bump), conformément à l'instruction de coordination du plan.

## Deferred Issues

- **Pré-existant hors scope** : tsc error `apps/web/src/server/actions/sessions.ts:804` (`legalName` sur Location create). Non causé par cette tâche, lié à la WIP session-location de Laurent. Laissé intact (cf. `deferred-items.md`).
- **6 erreurs `redirect-308.test.ts`** : pré-existantes, documentées STATE.md, ignorées comme demandé.
- **Multi-jours** : explicitement différé (Laurent 2026-06-18). Structure prête (`buildHoraireScaffold` calcule `nbJours`, expose `multiDayDeferred`).

## Verification

- `pnpm --filter @qualiof/web test src/lib/__tests__/programme-normalize.test.ts` → 13/13 verts (grille déterministe + test de puissance fidélité).
- Test de puissance prouvé : casser `enforceProgrammeFidelity` (forcer `ok:true`) → 2 tests RED, restauré vert.
- `tsc --noEmit` : aucune NOUVELLE erreur dans les fichiers touchés (seule erreur résiduelle = `sessions.ts:804` pré-existante hors scope + 6 redirect-308 documentées).
- Grep Task 2 : `PREMIÈRE PERSONNE` ×4, `aucun autre domaine` ×2, `normalizedProgrammeMd` ×5 dans le script.
- Grep Task 3 : `loadTrainerSignatureDataUrl` + `trainerSigIsDuplicate` présents dans attestation ET certificat.
- **Re-render témoin manuel restant (Laurent)** : `SES=SES-0087 tsx scripts/_gen-temoin-cloud.ts` (provider openrouter) pour valider visuellement Programme/Convention (grille + verbes + fidélité), satisfactions (1re personne + thème) et attestation/certificat (pas de double signature Laurent).

## Known Stubs

Aucun stub introduit. `generateNormalizedProgramme` retourne null en cas d'échec LLM → fallback documenté sur `programMd` brut (comportement témoin voulu, pas un stub silencieux).

## Self-Check: PASSED

- FOUND: apps/web/src/lib/programme-normalize.ts
- FOUND: apps/web/src/lib/__tests__/programme-normalize.test.ts
- FOUND commits: 8fd30bc, 5f1535a, ee60058
