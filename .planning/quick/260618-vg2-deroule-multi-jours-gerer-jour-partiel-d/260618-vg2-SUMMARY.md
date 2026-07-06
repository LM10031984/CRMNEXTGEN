---
phase: quick-260618-vg2
plan: 01
subsystem: closure / déroulé pédagogique
tags: [deroule, multi-jours, jour-partiel, zod, qualiopi, test-de-puissance]
requires:
  - generateDerouleContent (boucle multi-jours, quick 260618-jy1)
  - DerouleSequenceSchema + DerouleSchema (Kaïna 16/06)
  - buildHoraireScaffold (programme-normalize, travailTotalMin par jour)
  - freezeProductAssets (quick 260618-rkj)
provides:
  - buildDerouleJourSchema(heuresJour) — plancher de séquences adaptatif par jour
  - prompt jour court (buildDerouleJourPrompt + heuresJour)
  - try/catch par produit dans _gen-session-pack.ts (run multi-produits résilient)
affects:
  - apps/web/src/lib/closure/ollama-generators.ts
  - apps/web/scripts/_gen-session-pack.ts
tech-stack:
  added: []
  patterns:
    - "Variante locale d'un schéma Zod (min adaptatif) sans muter le schéma global réutilisé ailleurs"
    - "Test de puissance déterministe sur schéma Zod pur (sans LLM/réseau/Prisma)"
key-files:
  created:
    - apps/web/src/lib/closure/__tests__/deroule-jour-partiel.test.ts
  modified:
    - apps/web/src/lib/closure/ollama-generators.ts
    - apps/web/scripts/_gen-session-pack.ts
decisions:
  - "minSeq = max(2, min(5, round(heuresJour)) : jour plein 8h → 5 inchangé, jour court → 2, jour 5h → 5 plafonné (palier simple)"
  - "buildDerouleJourSchema garde la forme { jours: [...] } IDENTIQUE à DerouleSchema → câblage drop-in dans runOllamaJson, DerouleSchema global et cas nbJours===1 strictement intacts"
  - "try/catch enveloppe le corps de boucle à partir de freezeProductAssets (les continue introuvable/sans-produit/dry-run restent hors du try)"
metrics:
  duration: ~5 min
  tasks: 3
  files: 3
  completed: 2026-06-18
---

# Quick 260618-vg2 : Déroulé multi-jours — gérer le jour partiel Summary

Débloque la génération du déroulé pour les produits dont `durationHours` n'est pas multiple de 8 (dernier jour PARTIEL) via un plancher de séquences PROPORTIONNÉ à la durée du jour (`buildDerouleJourSchema(heuresJour)`), sans toucher le `DerouleSchema` global ni le cas `nbJours===1`, plus un test de puissance déterministe et une isolation par produit du script de génération de masse.

## Contexte

`generateDerouleContent` (boucle multi-jours, quick 260618-jy1) validait CHAQUE jour avec `DerouleSchema` qui impose `sequences.min(5)`. Un jour de 1h (ex. PROD-0670 = 105h → 14 jours, jour 14 = 1h) ne peut pas produire ≥5 séquences → échec des 2 tentatives → déroulé GLOBAL null → `freezeProductAssets` throw "Corps déroulé null" → produit jamais généré (reproduit 2× de façon déterministe). Le plancher est désormais adaptatif : jour plein → 5 (inchangé), jour court → 2.

## Ce qui a été fait

### Task 1 — Test de puissance déterministe (RED) → commit 6088779
- `apps/web/src/lib/closure/__tests__/deroule-jour-partiel.test.ts` : 6 cas purs (sans LLM/réseau/Prisma), mocks minimaux `@qualiof/db` / `@/lib/ai-ollama` / `@/lib/llm-client` pour charger le module.
- Fixtures `makeSeq()` (champs ≥ planchers `DerouleSequenceSchema`) + `makeDerouleContent(n)` (jour enveloppé `{ jours: [...] }`).
- Cas : jour 1h/2h passe à 2 séq · jour 8h rejette 4 / accepte 5 · plancher ≥2 (1 séq rejetée) · assemblage 105h → 14 jours via `assembleDeroule`.
- RED confirmé : `buildDerouleJourSchema is not a function`.

### Task 2 — Min adaptatif + prompt jour court (GREEN) → commit 4650772
- `buildDerouleJourSchema(heuresJour)` exporté, JUSTE après `DerouleSchema` : variante LOCALE `{ jours: [{ theme, sequences.min(minSeq) }] }`, `minSeq = max(2, min(5, round(heuresJour))`. Réutilise `DerouleSequenceSchema` tel quel (aucun plancher de cellule touché). `DerouleSchema` global INCHANGÉ.
- Boucle multi-jours câblée : `heuresJour = scaffold.jours[k-1]!.travailTotalMin / 60`, schéma adaptatif passé à `runOllamaJson` POUR CE JOUR. L'abandon global sur jour null (`console.error` + `return null`) reste strictement inchangé (pas de troncature silencieuse).
- `buildDerouleJourPrompt` reçoit `heuresJour` et, quand `< 8`, insère "ce jour ne fait que Xh — produis un nombre de séquences PROPORTIONNÉ (pas de remplissage artificiel)". Conservé : accueil Jour 1, "dernier bloc = Évaluation/clôture" au dernier jour.
- 6/6 verts. **Mutation prouvée** : `minSeq = 5` rigide → Test 1 + Test 2 ROUGES (vérifié, puis restauré). Non-régression : freeze-product-assets, single-participant, programme-normalize, gen-session-pack-pure, rapport-formateur-session-specifique, parse-programme-to-deroule = verts.

### Task 3 — try/catch par produit + tsc (GREEN) → commit bae9666
- `_gen-session-pack.ts` : corps de boucle enveloppé dans `try { … } catch (e) { log('✗', …); continue; }` à partir de `freezeProductAssets` jusqu'à la fin de l'itération. Un throw (figeage / cœur / Drive) logge ✗ et passe à la session suivante au lieu d'avorter tout le run multi-produits.
- Les `continue` introuvable / sans-produit / dry-run restent HORS du try (inchangés).
- `pnpm tsc --noEmit` (apps/web) : vert.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixtures de test parsées contre la mauvaise forme**
- **Found during:** Task 2 (GREEN initialement à 3/6).
- **Issue:** Le plan décrivait les fixtures comme un "jour" nu `{ theme, sequences[] }` parsé directement par `buildDerouleJourSchema`. Mais le plan exige aussi (point 1) que le schéma garde la forme `{ jours: [...] }` IDENTIQUE à `DerouleSchema` (contrat `runOllamaJson`, le LLM renvoie `{ jours: [...] }`). Parser un jour nu contre un schéma `{ jours: [...] }` → `jours` undefined → Test 1/2/4 échouaient (faux négatifs), Test 3/5 passaient par accident (tout objet sans `jours` est rejeté).
- **Fix:** Fixtures enveloppées via `makeDerouleContent(n) = { jours: [makeJour(n)] }`. Le schéma garde bien la forme globale (drop-in du câblage), et le test valide la vraie forme produite par le LLM.
- **Files modified:** `apps/web/src/lib/closure/__tests__/deroule-jour-partiel.test.ts`
- **Commit:** 4650772

**2. [Rule 1 - Doc] Note de mutation corrigée (Test 1/2, pas Test 6)**
- **Found during:** Task 2 (test de puissance).
- **Issue:** Le plan annonçait que la mutation `min(5)` rigide rendrait "Test 1/2/6" rouges. Vérifié : Test 6 cible `assembleDeroule` (flatMap pur), indépendant du schéma → reste vert sous mutation. Seuls Test 1 + Test 2 (cas adaptatifs) virent rouge.
- **Fix:** Commentaire d'en-tête du test corrigé pour refléter la mutation réelle (Test 1/2 rouges). L'invariant de puissance est correctement gardé.
- **Files modified:** `apps/web/src/lib/closure/__tests__/deroule-jour-partiel.test.ts`
- **Commit:** 4650772

### Tradeoff de lisibilité (noté, non bloquant)

- Task 3 : le corps de boucle enveloppé par le `try` n'a PAS été ré-indenté (≈135 lignes) pour respecter la garde explicite du plan ("ne pas forcer si indentation massive cassant la lisibilité"). Le `try {`/`} catch` est commenté ; `tsc` et la suite restent verts. Indentation cosmétique différée si souhaité.

## Verification

- `pnpm vitest run deroule-jour-partiel.test.ts` : 6/6 verts.
- Non-régression (freeze-product-assets, single-participant, programme-normalize, gen-session-pack-pure, rapport-formateur-session-specifique, parse-programme-to-deroule) : 47/47 verts (chunking jy1 + figeage rkj + rapport skk non régressés).
- `pnpm tsc --noEmit` (apps/web) : vert (exit 0).
- Mutation `minSeq = 5` rigide → Test 1 + Test 2 ROUGES (puis restauré) : test de puissance non complaisant.
- Aucun appel LLM réel, aucune génération de masse lancée.

## Known Stubs

Aucun. `buildDerouleJourSchema` est branché en production (boucle multi-jours), pas de placeholder.

## Self-Check: PASSED

- Fichiers : deroule-jour-partiel.test.ts, ollama-generators.ts, _gen-session-pack.ts, 260618-vg2-SUMMARY.md — tous présents.
- Commits : 6088779 (RED), 4650772 (GREEN), bae9666 (try/catch) — tous présents.
- Export `buildDerouleJourSchema` présent dans ollama-generators.ts.
