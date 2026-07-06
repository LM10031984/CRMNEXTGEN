---
phase: quick-260525-pzl
plan: 01
subsystem: closure
tags: [qualiopi, ollama, prompts, parser, horaires, formation]

# Dependency graph
requires:
  - phase: quick-260525-pb5
    provides: nothing direct, mais meme zone fonctionnelle (creation produit IA)
provides:
  - Source unique `lib/formation-horaires.ts` pour la regle pause Start Academy (9h00 + 13h-14h + >=5h)
  - Prompts IA (programme + deroule) alignes sur 13h00-14h00 (1h pile)
  - Parser parse-programme-to-deroule retro-compat + nouvelle norme
affects: [creation-produit-ia, ai-fill-product, closure-deroule, qualiopi-prompts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Source unique pour regle metier transverse (helper + import) au lieu de duplication dans 4 fichiers"
    - "TDD RED/GREEN avec commits separes pour les helpers metier (formation-horaires + parser)"

key-files:
  created:
    - apps/web/src/lib/formation-horaires.ts
    - apps/web/src/lib/__tests__/formation-horaires.test.ts
    - apps/web/src/lib/closure/__tests__/parse-programme-to-deroule.test.ts
  modified:
    - apps/web/src/lib/closure/ollama-generators.ts
    - apps/web/src/lib/closure/qualiopi-prompts.ts
    - apps/web/src/server/actions/ai-fill-product.ts
    - apps/web/src/lib/closure/parse-programme-to-deroule.ts
    - apps/web/src/lib/closure/deroule-template.ts

key-decisions:
  - "Pause dejeuner Start Academy = 13h00-14h00 stricte (1h pile), au lieu des 4 variantes anterieures (12h00-13h30, 12h15-13h45, 12h30-13h30, 12h00-13h00)"
  - "Journee 8h = 9h00-13h00 + 14h00-18h00 (pas 9h-17h ni 9h30-17h30)"
  - "Pause obligatoire des heuresParJour >= 5 ; aucune si <= 4h"
  - "ai-fill-product.ts garde la regle en clair (string litterale) au lieu d'injecter dynamiquement le helper : lisibilite prompt engineering > DRY (le mistral-small lit la version finalisee)"
  - "Parser parse-programme-to-deroule : borne isDej elargie de [11h30..13h00] a [11h30..14h30] pour couvrir les deux normes (retro-compat + Laurent) sans casser l'existant"

patterns-established:
  - "Helper centralise + tests Vitest TDD pour toute regle metier referencee dans plusieurs prompts/calculs"
  - "Separateur horaire dans le codebase = en-dash U+2013 (–), pas hyphen ASCII"

requirements-completed: [HORAIRES-01, HORAIRES-02, HORAIRES-03]

# Metrics
duration: 7min
completed: 2026-05-25
---

# Quick Task 260525-pzl : Fix horaires formation pause midi (8h => 9h-18h)

**Harmonisation 4 fichiers prompts/calculs sur la regle pause dejeuner Start Academy 13h00-14h00 (1h), avec helper centralise `lib/formation-horaires.ts` + parser parse-programme-to-deroule retro-compat (anciennes plages 12h-13h ET nouvelle 13h-14h).**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-05-25T18:47:42Z
- **Completed:** 2026-05-25T18:54:00Z
- **Tasks:** 6 (executes en 8 commits dont 2 RED+GREEN TDD)
- **Files created:** 3 (helper + 2 fichiers de tests)
- **Files modified:** 5 (ollama-generators, qualiopi-prompts, ai-fill-product, parse-programme-to-deroule, deroule-template)

## Accomplishments

- **Bug Laurent fixe** : produit 8h via IA generera desormais 9h00-18h00 avec pause 13h00-14h00, plus jamais 9h30-17h30 sans pause.
- **Source unique** : `lib/formation-horaires.ts` expose `PAUSE_DEJEUNER`, `FORMATION_START`, `getDayStartEnd(heuresParJour)`, `formatHoraireLabel`.
- **Prompts IA harmonises** : prompt programme (`ai-fill-product.ts`) + prompt deroule (`qualiopi-prompts.ts`) + builder user prompt (`ollama-generators.ts`) -> tous sur 13h00-14h00.
- **Parser retro-compat garanti** : `parse-programme-to-deroule.ts` continue de parser les anciens programmes (12h-13h30, 12h30-13h30, 11h30-13h) ET les nouveaux (13h-14h, cas limite endMin=840).
- **17 nouveaux tests Vitest** (10 helper + 7 parser) avec couverture des 2 modes (multi-jours / mono-jour).

## Task Commits

1. **Task 1 RED:** `a78a90a` test - failing tests for formation-horaires helper
2. **Task 1 GREEN:** `c76f2b6` feat - add formation-horaires helper (source unique)
3. **Task 2:** `56e8758` fix - align ollama-generators deroule prompt
4. **Task 3:** `13f018a` fix - align system prompt deroule sur 13h-14h (1h)
5. **Task 4:** `df035af` fix - align prompt programme IA sur pause 13h-14h
6. **Task 5 RED:** `b2b17e8` test - parser retro-compat + nouvelle norme
7. **Task 5 GREEN:** `74b7624` fix - elargir detection gap dejeuner parser 11h30-14h30
8. **Task 6:** `3fc594c` fix - cleanup commentaire deroule-template 60 min

## Files Created/Modified

- `apps/web/src/lib/formation-horaires.ts` — Helper source unique (PAUSE_DEJEUNER + getDayStartEnd + formatHoraireLabel)
- `apps/web/src/lib/__tests__/formation-horaires.test.ts` — 10 tests Vitest (constantes + 6 cas heuresParJour + 2 formatHoraireLabel)
- `apps/web/src/lib/closure/__tests__/parse-programme-to-deroule.test.ts` — 7 tests Vitest (3 retro-compat + 2 nouvelle norme + 1 hors plage + 1 mono-jour)
- `apps/web/src/lib/closure/ollama-generators.ts` — Import helper + utilisation `getDayStartEnd` ligne 595 + `${PAUSE_DEJEUNER.start}–${PAUSE_DEJEUNER.end}` ligne 611
- `apps/web/src/lib/closure/qualiopi-prompts.ts` — Structure type journee 9h00-18h00 + pause 13h00-14h00 dans system prompt
- `apps/web/src/server/actions/ai-fill-product.ts` — Decoupage 8h reecrit (9h-10h30 / 10h45-13h / 14h-15h30 / 15h45-18h) + regle pause 13h-14h obligatoire des >=5h
- `apps/web/src/lib/closure/parse-programme-to-deroule.ts` — Borne `isDej` elargie de `<=780` a `<=870` + commentaires JSDoc alignes
- `apps/web/src/lib/closure/deroule-template.ts` — JSDoc "90 min" -> "60 min — regle Start Academy 13h-14h"

## Decisions Made

- **13h00-14h00 (1h pile) plutot que 12h-13h ou 12h30-13h30** : c'est la regle Laurent canonique du 25/05/2026 ; cette decision elimine la dispersion historique (4 plages differentes dans 4 fichiers).
- **`ai-fill-product.ts` ne consomme PAS le helper `formation-horaires`** : le prompt systeme est une string litterale envoyee a Ollama, l'injecter dynamiquement compliquerait la lisibilite prompt eng. sans benefice modele. La regle est ecrite en clair pour rester auditable.
- **Parser elargit la fenetre `isDej` au lieu de la deplacer** : `[690..870]` couvre les 2 normes ; ne casse aucun programme existant, supporte les nouveaux. Alternative refusee = remplacer `<=780` par `<=870` seulement (idem) ou ajouter une 2eme regle dediee (complexite inutile).

## Deviations from Plan

None - plan executed exactly as written.

Note : seul micro-ajustement Task 6 stub-content.ts -> verification a confirme que `lunchDur = 60` (ligne 233) et le commentaire ligne 227-230 (`déjeuner 60 min`) sont DEJA coherents. Conformement aux instructions du plan ("Si la constante `lunchDur = 60` est deja correcte, ne pas la modifier"), aucune modification appliquee.

## Issues Encountered

- **Vitest test typo dans le brouillon RED initial** : `'Pause dejeuner'.replace('e', 'é')` ne remplace que le 1er `e` (Pause déjeuner != Pausé dejeuner). Corrige avant le commit RED en utilisant directement le litteral `'Pause déjeuner'`. Sans impact sur les autres tests.
- **`gsd-tools.cjs commit` retourne `skipped_commit_docs_false`** car `commit_docs: false` dans config.json — utilise `git commit` direct pour tous les commits per-task. Fonctionne mais leve le sentiment qu'il y aurait une voie automatisee a configurer si Laurent veut harmoniser plus tard.

## Verification (validations menees)

| # | Check | Resultat |
|---|---|---|
| 1 | `pnpm vitest run src/lib/__tests__/formation-horaires.test.ts` | 10/10 verts |
| 2 | `pnpm vitest run src/lib/closure/__tests__/parse-programme-to-deroule.test.ts` | 7/7 verts |
| 3 | `pnpm tsc --noEmit -p .` | 0 erreur |
| 4 | `pnpm vitest run` (suite complete) | **88 files / 692 tests passed** (aucune regression) |
| 5 | `grep "12h00.*13h30\|12h15.*13h45\|12h30.*13h30" src` | vide hors `__tests__` (1 match dans le commentaire de doc retro-compat) |
| 6 | `grep "13h00.{1,5}14h00" src/lib/closure src/server/actions/ai-fill-product.ts` | 12 matches sur 5 fichiers (objectif >= 4 atteint) |

## Validation metier Laurent

> "Quand tu cree un produit test 8h via le bouton IA :
> 1. Ouvre le produit cree, regarde le champ `programMd` -> il doit contenir `### 13h00 – 14h00 | Pause dejeuner`
> 2. La derniere heure du programme doit etre `18h00` (et plus `17h30` ni `17h00`)
> 3. Genere le pack fin de formation pour une session du meme produit -> le deroule pedagogique doit aussi afficher 9h00-18h00 + pause dejeuner 13h00-14h00 (1h)
>
> Si le 1 est OK et le 3 est OK, le bug est ferme. Si l'IA continue de generer 12h-13h30, fais-moi un screenshot du `programMd` brut pour diagnostiquer."

## User Setup Required

None - aucun secret ni env var. La correction prend effet a la prochaine generation IA (pas de migration BDD).

## Next Phase Readiness

- Le bug Laurent "produit 8h IA = 9h30-17h30 sans pause midi" est resolu structurellement.
- Le helper `formation-horaires.ts` est disponible pour toute future feature qui veut formater des horaires de formation (ex: convention, attestation, calendrier session). Aucune nouvelle dependance.
- Aucun blocker pour la suite (Phase 10 commerce + Phase 12 monitoring restantes au milestone v5).
- Bug worker import auth React (MEMORY.md) : N/A ici, pas de worker concerne par ce fix.

---
*Phase: quick-260525-pzl*
*Completed: 2026-05-25*

## Self-Check: PASSED

**Files verified:**
- FOUND: apps/web/src/lib/formation-horaires.ts
- FOUND: apps/web/src/lib/__tests__/formation-horaires.test.ts
- FOUND: apps/web/src/lib/closure/__tests__/parse-programme-to-deroule.test.ts
- FOUND: apps/web/src/lib/closure/ollama-generators.ts (modifie)
- FOUND: apps/web/src/lib/closure/qualiopi-prompts.ts (modifie)
- FOUND: apps/web/src/server/actions/ai-fill-product.ts (modifie)
- FOUND: apps/web/src/lib/closure/parse-programme-to-deroule.ts (modifie)
- FOUND: apps/web/src/lib/closure/deroule-template.ts (modifie)

**Commits verified:**
- FOUND: a78a90a (Task 1 RED)
- FOUND: c76f2b6 (Task 1 GREEN)
- FOUND: 56e8758 (Task 2)
- FOUND: 13f018a (Task 3)
- FOUND: df035af (Task 4)
- FOUND: b2b17e8 (Task 5 RED)
- FOUND: 74b7624 (Task 5 GREEN)
- FOUND: 3fc594c (Task 6)
