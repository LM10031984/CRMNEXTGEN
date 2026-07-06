---
phase: quick-260706-bya
plan: 01
subsystem: closure
tags: [qualiopi, positionnement, zod, prompt, llm, openrouter, vitest]

# Dependency graph
requires:
  - phase: 16-migration-ia-claude
    provides: "AI_PROVIDER=openrouter + PROMPT_VERSION tracé dans AIGenerationJob.promptVersion (Haiku/Sonnet)"
provides:
  - "SYSTEM_PROMPT_POSITIONNEMENT v11 : progression avant/après variée, ancrée profil (anti-jumelage), plus de plancher '70% en niveau 4'"
  - "PositionnementSchema durci (exporté) : superRefine après>avant, avant≤3, anti-tampon léger"
  - "user prompt positionnement enrichi (statut pro + ancienneté injectés, consigne de progression variée)"
  - "suite Vitest hermétique du garde-fou (5 tests)"
affects: [regen-SES-0094, closure-pack, positionnement, satisfaction-uniforme]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Garde métier LÉGER via Zod superRefine (bloque le seul motif plat, laisse passer toute vraie variation) — évite le sur-blocage → stub"
    - "Variabilité pilotée par le PROMPT + verrouillée par le SCHÉMA (déterministe, aucun Math.random/Date.now dans les générateurs)"

key-files:
  created:
    - apps/web/src/lib/closure/__tests__/positionnement-progression.test.ts
  modified:
    - apps/web/src/lib/closure/qualiopi-prompts.ts
    - apps/web/src/lib/closure/ollama-generators.ts

key-decisions:
  - "Garde anti-tampon LÉGÈRE : rejet uniquement du motif totalement plat (avants ET deltas identiques), pas de contrainte de distribution — pour ne pas faire retomber le LLM sur le stub"
  - "tier positionnement conservé 'fast' (Haiku) : le défaut venait du prompt '70% en 4', pas du modèle. Escalade 'quality'/Sonnet = plan B documenté si le témoin post-régen montre encore de l'uniformité"

patterns-established:
  - "Cohérence prompt↔schéma : les règles de progression du SYSTEM_PROMPT reflètent exactement les checks du superRefine"

requirements-completed: [QUICK-260706-bya]

# Metrics
duration: 4min
completed: 2026-07-06
---

# Phase quick-260706-bya Plan 01: Fix positionnement partie 3 (progression) Summary

**Le questionnaire de positionnement produit désormais une progression avant/après variée et crédible (fin du motif tampon 1→4 uniforme), ancrée sur le profil du stagiaire, avec progression stricte après>avant verrouillée par le schéma Zod = preuve Qualiopi ind.2.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-07-06T06:42:32Z
- **Completed:** 2026-07-06T06:46:13Z
- **Tasks:** 2/2
- **Files modified:** 3 (2 modifiés, 1 créé)

## Accomplishments
- Réécriture des règles de `SYSTEM_PROMPT_POSITIONNEMENT` : suppression des deux règles fautives (« AVANT majoritairement 1-2 uniforme » et « au moins 70% en niveau 4 »), remplacées par progression stricte + variée + ancrée profil (anti-jumelage). `PROMPT_VERSION` bumpé `claude-v10-2026-07` → `claude-v11-2026-07`.
- Durcissement de `PositionnementSchema` (désormais exporté) via `superRefine` déterministe : `après > avant` par compétence, `avant ≤ 3`, rejet du seul motif tampon plat (avants + deltas tous identiques).
- Enrichissement du user prompt de `generatePositionnementContent` : injection du statut professionnel et de l'ancienneté (base de différenciation inter-stagiaires), consigne de progression variée ancrée profil.
- 5 tests Vitest hermétiques (aucun LLM, aucune DB) prouvant le garde-fou ; test de puissance (mutation `apres<=avant` → `apres<avant`) validé et restauré.

## Task Commits

1. **Task 1: Prompt v11 + PROMPT_VERSION** - `faaf0cb` (feat)
2. **Task 2 (RED): tests garde progression** - `4784321` (test)
3. **Task 2 (GREEN): superRefine + user prompt enrichi** - `631fb8c` (feat)

_TDD : RED (`4784321`) → GREEN (`631fb8c`). Pas de REFACTOR nécessaire._

## Files Created/Modified
- `apps/web/src/lib/closure/qualiopi-prompts.ts` — `PROMPT_VERSION=claude-v11-2026-07`, header v11 daté, règles positionnement réécrites (progression variée + anti-tampon), schéma JSON du prompt aligné (`avant:1|2|3`, `apres:2|3|4`).
- `apps/web/src/lib/closure/ollama-generators.ts` — `PositionnementSchema` exporté + `superRefine` (après>avant, avant≤3, anti-tampon léger) ; `stagiaireBlock` enrichi (statut/ancienneté) ; consigne finale du user prompt réécrite.
- `apps/web/src/lib/closure/__tests__/positionnement-progression.test.ts` — 5 tests hermétiques du garde-fou.

## Verification
- `grep -q "claude-v11-2026-07"` ✅ ; `! grep -q "70% en niveau 4"` ✅ ; `grep -q "apres > avant"` ✅
- `pnpm exec vitest run positionnement-progression.test.ts` → 5/5 ✅
- Suite closure complète : 16 fichiers, 76/76 ✅ (aucune régression sur l'import modifié de `ollama-generators`)
- `pnpm exec tsc --noEmit` (web) → exit 0 ✅
- Test de puissance : mutation `apres<=avant` → `apres<avant` → Test 2 ROUGE (stagnation 2→2 non rejetée) → restauré → 5/5. Mutation NON commitée. ✅

## Deviations from Plan
None - plan exécuté exactement comme écrit (Tasks 1 et 2, TDD RED→GREEN, test de puissance).

## Known Stubs
Aucun stub introduit. Le stub de fallback existant (`stubPositionnementContent`) respecte déjà la progression (cf. `positionnement-stub.test.ts`) ; le garde Zod léger ne provoque pas de bascule systématique sur le stub (toute vraie variation passe).

## Étape POST-PLAN gatée (NON exécutée par ce plan)
Régénération du pack témoin SES-0094 (`SES=SES-0094 tsx apps/web/scripts/_gen-session-pack.ts`, AI_PROVIDER=openrouter, en direct depuis le Mac) — gérée par l'orchestrateur/Laurent. Contrôles de variabilité attendus dans les 3 rawJson POSITIONNEMENT (Pierre/Charlotte/Yannick) : 0 stub, promptVersion=claude-v11-2026-07, progression stricte partout, motifs distincts, ≥3 deltas différents, plus de « tout 1→4 ». Plan B si uniformité persistante : bumper le tier 'fast'→'quality' (Sonnet) dans `generatePositionnementContent`.

## Self-Check: PASSED
- 3/3 fichiers présents (qualiopi-prompts.ts, ollama-generators.ts, positionnement-progression.test.ts)
- 3/3 commits présents (faaf0cb, 4784321, 631fb8c)
