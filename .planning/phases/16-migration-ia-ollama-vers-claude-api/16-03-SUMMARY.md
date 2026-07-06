---
phase: 16-migration-ia-ollama-vers-claude-api
plan: 03
subsystem: ai
tags: [ollama, openrouter, claude, vision, ocr, llm-client, preinscription, pii, tdd]

# Dependency graph
requires:
  - phase: 16-01
    provides: "env boot-safe OpenRouter (AI_PROVIDER=openrouter accepté, 7 clés OPENROUTER_* + OLLAMA_MODEL_VISION déclarées)"
provides:
  - "pdf-extract.ts extractTextFromImage → callLlm({ imageBuffer }) (tier vision auto)"
  - "preinscription-extractor.ts extractOne → callLlm({ tier: 'fast' }), aiModel dynamique via resolveModel('fast')"
  - "2 call sites vision/OCR du pilier #4 (pré-inscriptions IA, PII CNI/RIB/CFP) migrés hors Ollama direct"
  - "2 tests hermétiques (mock @/lib/llm-client) : pdf-extract Wave 0 + preinscription-extractor mock-migration PII"
affects: [16-04, 16-05, 16-06, preinscriptions, closure-generators, rgpd-vision-checkpoint]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Call site vision OCR : callLlm({ imageBuffer }) (imageBuffer force tier='vision' côté client unifié)"
    - "Call site extraction texte : callLlm({ tier: 'fast' }) — le tier gouverne le modèle, jamais de modèle codé en dur"
    - "Tracing aiModel dynamique : resolveModel('fast') reflète le modèle réel selon AI_PROVIDER"
    - "Test hermétique : mock @/lib/llm-client + @/lib/pdf-extract directement (vitest ne charge pas .env)"

key-files:
  created:
    - apps/web/src/lib/__tests__/pdf-extract.test.ts
    - apps/web/src/lib/__tests__/preinscription-extractor.test.ts
  modified:
    - apps/web/src/lib/pdf-extract.ts
    - apps/web/src/lib/preinscription-extractor.ts

key-decisions:
  - "D-04 respecté : callLlm (gateway OpenRouter), aucun @anthropic-ai/sdk ajouté"
  - "D-03c respecté : échec vision/extraction → null/text vide (saisie manuelle admin), PAS de stub généré"
  - "Modèle jamais codé en dur au call site : le tier (fast/vision) + resolveModel gouvernent (single source of truth)"

patterns-established:
  - "Migration call site Ollama→callLlm : imageBuffer pour vision, tier:'fast' pour texte, message d'erreur cloud-compatible"
  - "aiModel persisté = resolveModel(tier) dynamique, plus de nom de modèle Ollama figé en base"

requirements-completed: [REQ-16-02]

# Metrics
duration: 4min
completed: 2026-07-03
---

# Phase 16 Plan 03: Migration vision/OCR pilier #4 vers callLlm Summary

**Les 2 call sites vision/OCR du pilier #4 (pré-inscriptions IA, PII CNI/RIB/CFP) basculent de `callOllamaVision`/`callOllama` direct vers `callLlm` — `imageBuffer` force le tier vision, `tier:'fast'` gouverne l'extraction texte, `aiModel` persisté devient dynamique (`resolveModel('fast')`), échec → null (saisie manuelle admin, pas de stub).**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-07-03T13:57:48Z
- **Completed:** 2026-07-03T14:01:59Z
- **Tasks:** 2 (TDD)
- **Files modified:** 2 source + 2 test créés

## Accomplishments
- `pdf-extract.ts` : `extractTextFromImage` route `callOllamaVision` → `callLlm({ imageBuffer })` (imageBuffer force le tier vision — Claude Haiku vision cloud / llama3.2-vision local selon AI_PROVIDER). Message d'erreur nettoyé (plus de `ollama pull qwen2.5vl`, message cloud-compatible OPENROUTER_API_KEY/réseau).
- `preinscription-extractor.ts` : `extractOne` route `callOllama` → `callLlm({ tier: 'fast' })`, suppression du `model: process.env.OLLAMA_MODEL_FAST` (le tier gouverne). Le champ persisté `aiModel: 'qwen3:30b-a3b'` (figé, faux : la vraie extraction utilisait déjà mistral-small) devient `resolveModel('fast')` dynamique.
- 2 tests hermétiques verts (6/6) prouvant le câblage : mock `@/lib/llm-client` direct, assertions mutation-safe (`imageBuffer` pour la vision, `tier:'fast'` + `jsonOutput` pour l'extraction PII), échec → null/vide (PAS de stub).
- Comportement d'échec conservé (D-03c) : vision KO → `{ text:'', pages:0 }` ; extraction KO → `null`.

## Task Commits

Chaque tâche committée atomiquement (TDD RED → GREEN, pas de refactor nécessaire) :

1. **Task 1 RED: test extractTextFromImage via callLlm vision** - `6cf93d0` (test)
2. **Task 1 GREEN: migrate pdf-extract vision OCR to callLlm({imageBuffer})** - `a55b1f2` (feat)
3. **Task 2 RED: test preinscription-extractor via callLlm tier fast** - `0156ee0` (test)
4. **Task 2 GREEN: migrate preinscription-extractor OCR text to callLlm tier fast** - `1e8609b` (feat)

**Plan metadata:** (final docs commit ci-dessous)

## Files Created/Modified
- `apps/web/src/lib/pdf-extract.ts` - `extractTextFromImage` migré vers `callLlm({ imageBuffer })`, header + commentaires + message d'erreur nettoyés des refs Ollama vision codées.
- `apps/web/src/lib/preinscription-extractor.ts` - `extractOne` migré vers `callLlm({ tier: 'fast' })`, `aiModel` dynamique `resolveModel('fast')`, header comment mis à jour.
- `apps/web/src/lib/__tests__/pdf-extract.test.ts` - 3 tests (imageBuffer câblé / raw vide → warning / throw → text:'',pages:0), mock `@/lib/llm-client`.
- `apps/web/src/lib/__tests__/preinscription-extractor.test.ts` - 3 tests (tier:'fast'+jsonOutput mutation-safe / mock unique = pas d'Ollama / parsedJson null → null), mock `@/lib/llm-client` + `@/lib/pdf-extract`.

## Decisions Made
- **callLlm, pas @anthropic-ai/sdk** (D-04 LOCKED) : les 2 call sites routent le gateway OpenRouter unifié ; aucune dépendance ajoutée.
- **Échec → null, jamais de stub** (D-03c) : vision KO → `{ text:'', pages:0 }` (l'appelant `extractDocsFromBuffers`/`extractPreEnrollmentDocuments` skip proprement) ; extraction KO → `null` → l'admin saisit à la main. C'est le comportement PII correct (pas d'invention sur des données d'identité/bancaires).
- **aiModel dynamique** : `resolveModel('fast')` remplace le nom de modèle figé, cohérent avec le tracing dynamique établi au Plan 16-02.

## Deviations from Plan

None - plan executed exactly as written.

Les 2 tâches ont suivi le plan à la lettre (imports, appels, message d'erreur, tests). Aucun bug, dépendance manquante ou fonctionnalité critique manquante rencontrés (Rules 1-3 non déclenchées). Aucune décision architecturale (Rule 4) requise.

## Issues Encountered
- **RED prouvé par le hang réseau** : au Task 2 RED, les Tests 1 & 2 ont *timeout* (5s) au lieu d'échouer sur assertion, parce que la source appelait encore le vrai `callOllama` (fetch localhost:11434 pendu). C'est la preuve attendue que le mock `@/lib/llm-client` n'était PAS consommé tant que la source importait `@/lib/ai-ollama` → GREEN après migration (2ms, hermétique).
- **Filtre `pnpm test -- <name>` non narrowant** : `pnpm --filter @qualiof/web test -- pdf-extract` lance toute la suite (le `--` ne passe pas le filtre de fichier à vitest ici). Contourné avec `pnpm --filter @qualiof/web exec vitest run <path>` pour isoler. Sans impact sur le code livré.

## Known Stubs
Aucun. Les retours `null`/`{ text:'', pages:0 }` en cas d'échec ne sont PAS des stubs : ce sont le contrat D-03c (saisie manuelle admin sur les PII), voulu et testé.

## Out-of-scope / Deferred
- Échec unique PRÉ-EXISTANT `apps/web/src/lib/closure/__tests__/shared-template.test.ts:175` (MIME `image/jpeg` vs `image/jpg`) — non causé par ce plan, non touché (comme documenté 15-01→16-02).

## User Setup Required
None - no external service configuration required at this step.

⚠ **RGPD (D-02b)** : le CODE vision est livré mais la mise en PROD de la vision cloud (`AI_PROVIDER=openrouter` pour l'OCR PII) reste GATÉE hors code par le checkpoint:decision DPA du Plan 16-06 (wave 4). Ne pas router les PII vers OpenRouter en prod sans cette validation.

## Next Phase Readiness
- REQ-16-02 satisfait : les 2 call sites vision/OCR migrés, modèle dynamique, échec → null (pas de stub), tests verts.
- Patron de migration call site (imageBuffer / tier:'fast' / message cloud / aiModel dynamique) prouvé pour les Waves 3+ (closure generators, pack témoin).
- Débloque Plan 16-04 (wave 3).

## Self-Check: PASSED

- Fichiers créés/modifiés vérifiés présents : `pdf-extract.ts`, `preinscription-extractor.ts`, `__tests__/pdf-extract.test.ts`, `__tests__/preinscription-extractor.test.ts`, `16-03-SUMMARY.md`.
- Commits vérifiés présents : `6cf93d0` (test), `a55b1f2` (feat), `0156ee0` (test), `1e8609b` (feat).
- Tests : 6/6 verts (hermétiques). tsc `--noEmit` exit 0. Acceptance grep OK (callLlm≥1, callOllama/callOllamaVision/qwen3:30b-a3b/OLLAMA_MODEL_FAST=0, resolveModel≥1, `ollama pull`=∅).

---
*Phase: 16-migration-ia-ollama-vers-claude-api*
*Completed: 2026-07-03*
