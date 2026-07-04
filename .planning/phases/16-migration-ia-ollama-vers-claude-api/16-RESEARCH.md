# Phase 16: Migration IA Ollama vers Claude API - Research

**Researched:** 2026-07-03
**Domain:** LLM inference migration (local Ollama → Claude via OpenRouter gateway), Next.js 14 / TypeScript monorepo
**Confidence:** HIGH (code fully grounded; external facts verified against OpenRouter + Anthropic docs)

## Summary

La cible technique existe déjà : `llm-client.ts` (`callLlm` + `resolveModel(tier)`) wrappe Ollama ET OpenRouter (texte + vision), capture les tokens/coût, et tente une extraction JSON de secours. La migration ne construit rien — elle **re-route** les 4 call sites qui appellent encore `callOllama`/`callOllamaVision` en direct vers `callLlm`, ajoute `'openrouter'` à l'enum `AI_PROVIDER` de `env.ts`, valide les clés `OPENROUTER_*`, re-tune les prompts pour Claude, et adapte 2 fichiers de tests.

Points vérifiés côté externe : les deux slugs codés en défaut — `anthropic/claude-haiku-4.5` et `anthropic/claude-sonnet-4.6` — sont **valides et actuels** sur OpenRouter (pages live). Haiku 4.5 = $1/$5 par Mtok (in/out), 200K ctx ; Sonnet 4.6 = $3/$15 par Mtok, 1M ctx, vision. Nuance JSON critique : Claude **Haiku 4.5 / Sonnet 4.5+ supportent nativement les structured outputs**, exposés par OpenRouter — mais le mode robuste documenté par OpenRouter est `response_format: { type: 'json_schema', strict: true }`, PAS `json_object` (le code utilise `json_object`). C'est le principal risque de fiabilité et le point d'attention le plus important pour le planner.

**Primary recommendation:** Re-router les 4 call sites vers `callLlm` en réutilisant strictement le patron déroulé/tryOnce déjà en place ; garder `json_object` (ça marche sur Claude 4.5) MAIS conserver la garde `tryParseJson` (extraction `{...}` de secours) et ajouter le retry+stub. Vérifier `require_parameters: true` côté OpenRouter pour échouer bruyamment si un modèle ne supporte pas le format, plutôt qu'une dégradation silencieuse. Baisser le timeout à ~60-120s (cloud) et augmenter la concurrency worker (plus de compétition GPU locale).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01a Migration différenciée par tier** (structure `LlmTier` déjà présente) :
  - `fast` → **Claude Haiku** : QCM, satisfaction chaud/froid, positionnement, analyse besoin, grille observation.
  - `quality` → **Claude Sonnet** : déroulé pédagogique, rapport formateur.
- **D-01b Opus NON retenu** (coût). Mapping tier→modèle pilotable par env (`OPENROUTER_MODEL_FAST` / `OPENROUTER_MODEL_QUALITY`).
- **D-01c** Les défauts OpenRouter actuels (`anthropic/claude-haiku-4.5`, `anthropic/claude-sonnet-4.6`) conviennent — vérifier/mettre à jour au moment de l'implémentation.
- **D-02a Migration complète** des 4 call sites : (1) closure `ollama-generators.ts` (~10 générateurs), (2) OCR vision `preinscription-extractor.ts` + `pdf-extract.ts`, (3) veille `veille/classify.ts`.
- **D-02b RGPD** — action de conformité HORS CODE (DPA OpenRouter + Anthropic) bloquante avant prod vision. Ne PAS livrer la migration vision en prod sans ce point tranché.
- **D-03a Fallback** : retry API (2-3 tentatives) puis stub (`stub-content.ts`). **D-03b : PAS de fallback Ollama** (cap cloud v6). **D-03c** : OCR vision échec → null → saisie manuelle (pas de stub).
- **D-04a Réutiliser la passerelle OpenRouter existante** (`callLlm`, `response_format: json_object`). **PAS de SDK `@anthropic-ai/sdk` natif.**
- **D-04b** Router les générateurs restants via `callLlm` avec le bon `tier`. Le déroulé sert de patron.
- **D-04c Re-tuning des 5 system prompts** de `qualiopi-prompts.ts` (écrits pour mistral). Conserver + versionner `PROMPT_VERSION`.

### Claude's Discretion
- Stratégie de retry (backoff, nombre exact de tentatives).
- Logging coût/tokens : persister `usageTokensIn/Out` dans `AIGenerationJob` ou non.
- Conserver `ai-ollama.ts` après migration (compat tests / dev local) ou le retirer.

### Deferred Ideas (OUT OF SCOPE)
- Base légale RGPD OCR vision cloud (DPA) — hors code, mais bloquant prod vision.
- Migration SDK Anthropic natif + `messages.parse()` — écartée (D-04). Réévaluable v2.
- Retrait complet d'Ollama / `ai-ollama.ts` du repo.
- Ajustement worker (timeout/concurrency cloud) — le planner décide si dans cette phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

Aucun ID de requirement n'a été mappé en amont. Requirements planning-relevant dérivés des décisions CONTEXT (à formaliser par le planner) :

| ID (proposé) | Description | Research Support |
|----|-------------|------------------|
| IA-01 | Ajouter `'openrouter'` à l'enum `AI_PROVIDER` + valider `OPENROUTER_*` dans `env.ts` (fail loud au boot) | §env.ts gap — 8 clés énumérées |
| IA-02 | Re-router les ~8 générateurs closure encore sur `callOllama` vers `callLlm` (tier correct par D-01) | Le déroulé (`generateDerouleContent`) + rapport formateur montrent déjà le patron `cloud ? callLlm : callOllama` |
| IA-03 | Migrer OCR vision (`pdf-extract.ts` `callOllamaVision` + `preinscription-extractor.ts` `callOllama`) vers `callLlm({ imageBuffer })` | Vision multimodal déjà codé dans `callLlm` ; format image_url data-URL vérifié compatible Claude |
| IA-04 | Migrer `veille/classify.ts` (`callOllama` → `callLlm` tier fast) | Call site isolé, worker-safe, déjà testé |
| IA-05 | Retry (2-3) + fallback stub (docs) / null (vision) — sans fallback Ollama | Runner `runOllamaJson` a déjà `MAX_ATTEMPTS` + backoff + `failJob` → stub |
| IA-06 | Re-tuner les 5 system prompts mistral→Claude, bump `PROMPT_VERSION` | §Prompt re-tuning |
| IA-07 | Adapter les tests qui mockent `callOllama` → mocker `callLlm` (mutation-safe) | classify.test.ts + deroule-jour-partiel.test.ts |
| IA-08 | Réviser timeout worker (600s→~60-120s) + concurrency | §Retry/timeout |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

Directives actionnables extraites de `files/CLAUDE.md` — le planner DOIT vérifier la conformité :

- **4 piliers co-essentiels** : la migration touche le pilier #1 (pack closure) ET le pilier #4 (pré-inscriptions IA / OCR vision). Régression sur l'un = perte de valeur. Traiter la vision avec le même soin que les docs closure.
- **Env single source of truth** : `.env` racine, validé par `packages/shared/src/env.ts` via `@t3-oss/env-nextjs`, **fail loud au boot**. Toute nouvelle clé DOIT y être déclarée + documentée dans `.env.example`. → C'est exactement la tâche IA-01 (le code lit `OPENROUTER_*` via `process.env` brut, hors validation — non conforme).
- **RGPD / PII** : `Person.ribKey` → MinIO privé, signed URLs, `SensitiveData` séparée. L'OCR vision envoie CNI/RIB (PII) au cloud → rupture de l'isolement MinIO actuel. D-02b RGPD bloquant prod (hors code).
- **Perf LLM** : concurrency=3 worker closure, timeout 600s. « Ne pas augmenter sans observer impact stub rate » — mais ce garde-fou vise Ollama local (compétition GPU) ; en cloud le raisonnement s'inverse (voir §Retry/timeout).
- **Convention prompt figé au produit** : la logique métier des docs (prompts figés dans `TrainingProduct.derouleJson`, schémas Zod, chaîne prompt→LLM→Zod→null→stub) reste **inchangée**. Seul le backend d'inférence change. Ne pas casser cette chaîne.
- **Multi-tenant** : `AIGenerationJob` porte déjà `tenantId` ; conserver le scope.
- **GSD workflow** : passer par `/gsd:execute-phase` ; pas d'édit direct hors GSD.
- **Worker sans imports React/auth** (leçon `feedback_worker_no_react_imports`) : `veille/classify.ts` et les générateurs sont importés par des workers tsx → aucun import server-action/rbac/`react cache`. `callLlm` est déjà worker-safe (fetch pur). À préserver.

## Standard Stack

Aucune nouvelle dépendance npm n'est requise. La migration est du re-câblage + config env. `@anthropic-ai/sdk` n'est **pas** installé et ne doit **pas** l'être (D-04a).

### Core (déjà présent)
| Élément | Version / état | Purpose | Pourquoi |
|---------|------|---------|--------------|
| `llm-client.ts` `callLlm` | présent, branché | Client unifié Ollama+OpenRouter, texte+vision, tokens | Cible de tous les call sites — ne pas reconstruire |
| OpenRouter (OpenAI-compat `/chat/completions`) | live | Gateway cloud vers Claude | D-04 (voie technique verrouillée) |
| `@t3-oss/env-nextjs` 0.11.1 | présent | Validation env fail-loud | Où déclarer `OPENROUTER_*` (IA-01) |
| Zod 3.23.8 | présent | Schémas de sortie LLM | Chaîne de validation inchangée |
| Vitest 2.1.8 | présent | Tests unitaires | Migration des mocks (IA-07) |

### Modèles Claude cibles (vérifiés OpenRouter, 2026-07-03)
| Tier | Slug OpenRouter | Prix in/out (par Mtok) | Contexte | Vision | Structured outputs natifs |
|------|-----------------|------------------------|----------|--------|---------------------------|
| `fast` | `anthropic/claude-haiku-4.5` | **$1 / $5** | 200K | oui | oui (Haiku 4.5) |
| `quality` | `anthropic/claude-sonnet-4.6` | **$3 / $15** | 1M | oui | oui (Sonnet 4.5+) |
| `vision` (défaut code) | `anthropic/claude-haiku-4.5` | $1 / $5 | 200K | oui | oui |

Les deux slugs codés en défaut résolvent vers des pages OpenRouter live et valides. **Note pricing cache** : OpenRouter signale que le coût réel peut chuter 60-80% via prompt caching sur contexte répété (les system prompts figés sont d'excellents candidats).

**Sizing coût (ordre de grandeur, HIGH-level).** Un pack closure ≈ 10 docs/session. Générateurs `fast` (QCM, satisfaction, positionnement, analyse, grille) : prompts ~1-3K tokens in, ~1-2K out → << 1 centime/doc en Haiku. Générateurs `quality` (déroulé multi-jours, rapport) : plus volumineux (`maxTokens: 8192`), Sonnet → quelques centimes/doc. Un pack complet reste de l'ordre de **quelques centimes à ~0,10-0,30 €**. La veille (Haiku, snippets courts) et l'OCR vision (1 image + ~1,5K out) sont négligeables unitairement. → Coût dérisoire vs valeur ; le vrai gain est la fiabilité (fini les stubs sous charge GPU).

### Alternatives Considered
| Au lieu de | Pourrait utiliser | Tradeoff |
|------------|-----------|----------|
| `response_format: json_object` (codé) | `response_format: json_schema` strict | `json_schema` est le mode **robuste documenté par OpenRouter** (garantit le schéma). Mais implique de porter les schémas Zod → JSON Schema. Recommandation : garder `json_object` + garde `tryParseJson` + retry (moins invasif), documenter `json_schema` comme upgrade v2 si le taux de JSON invalide reste non nul. |
| SDK Anthropic natif | — | Écarté (D-04). |

**Installation :** aucune (`npm install` non requis).

**Version verification (fait) :** slugs OpenRouter confirmés live le 2026-07-03 via pages `openrouter.ai/anthropic/claude-haiku-4.5` et `…/claude-sonnet-4.6`.

## Architecture Patterns

### Pattern 1 : Router via `callLlm` en gardant la chaîne prompt→LLM→Zod→null→stub
**What:** Chaque générateur construit un prompt user, appelle le LLM en `jsonOutput`, valide par Zod, retourne `null` si échec (→ le worker sert le stub).
**When:** Tous les générateurs closure + veille.
**Le patron vivant existe déjà** (`tryOnce`, `ollama-generators.ts` L626-682) :
```typescript
// Source: apps/web/src/lib/closure/ollama-generators.ts L641-660 (déjà en prod)
const cloud = (process.env.AI_PROVIDER ?? 'ollama') === 'openrouter';
const result = cloud
  ? await callLlm({ tier, systemPrompt, prompt: userPrompt, jsonOutput: true,
                    temperature: 0.3, maxTokens: 8192, timeoutMs: 240_000 })
  : await callOllama({ model: modelUsed, systemPrompt, prompt: userPrompt,
                       jsonOutput: true, temperature: 0.3, maxTokens: 8192, timeoutMs: 600_000 });
```
**Statut actuel :** `tryOnce` route DÉJÀ TOUS les générateurs closure via ce switch `cloud ? callLlm : callOllama` — QCM, analyse, grille, positionnement, satisfaction, déroulé, rapport, programme passent tous par `runOllamaJson → tryOnce`. Donc pour le closure, **le routage vers `callLlm` est déjà fait** dès que `AI_PROVIDER=openrouter`. Le travail restant sur closure = (a) vérifier que chaque générateur passe le bon `tier` (déroulé/rapport/programme = `quality`, le reste = `fast`), (b) re-tuner les prompts, (c) confirmer le fallback stub. Le vrai re-câblage `callOllama`→`callLlm` concerne **la vision (2 fichiers) et la veille (1 fichier)** qui appellent `callOllama`/`callOllamaVision` en direct sans le switch.

### Pattern 2 : Vision via `callLlm({ imageBuffer })`
**What:** `callLlm` détecte `imageBuffer` → force `tier='vision'` → construit un content multimodal `[{type:text},{type:image_url, image_url:{url:'data:<mime>;base64,...'}}]`.
**Vérifié compatible Claude :** le format OpenAI `image_url` data-URL est le format attendu par OpenRouter pour Claude vision. `detectImageMime` couvre JPEG/PNG/GIF/WebP = exactement l'ensemble supporté par Claude. Les PNG rastérisés à 144 DPI par `pdftoppm` (`pdf-extract.ts`) sont largement sous la limite Claude (8000×8000 px, requête 32MB ; optimal ≤1568 px / 1,15 Mpx — au-delà l'image est down-scalée automatiquement, sans erreur).
**Migration `pdf-extract.ts` :** remplacer `callOllamaVision({ imageBuffer, prompt, ... })` par `callLlm({ imageBuffer, prompt, ... })`. Signatures quasi-identiques (`callLlm` accepte `imageBuffer`).
**Migration `preinscription-extractor.ts` :** `extractOne` appelle `callOllama` sur du **texte déjà OCR-isé** (pas d'image) — c'est un appel texte `fast`, pas vision. Remplacer par `callLlm({ tier:'fast', systemPrompt, prompt, jsonOutput:true, temperature:0 })`. Attention : il passe `model: process.env.OLLAMA_MODEL_FAST` en dur → retirer cet override (laisser `resolveModel` choisir selon provider). Mettre à jour aussi le champ `aiModel` persisté (codé en dur `'qwen3:30b-a3b'` L222 — le remplacer par le modèle réellement utilisé ou `r.model`).

### Anti-Patterns to Avoid
- **Hardcoder un modèle Ollama au call site** : `preinscription-extractor.ts` passe `model: process.env.OLLAMA_MODEL_FAST` et persiste `aiModel:'qwen3:30b-a3b'` — incohérent en cloud. Laisser `callLlm`/`resolveModel` gouverner le modèle par tier.
- **Supposer que `json_object` garantit un JSON parfait** : garder `tryParseJson` (extraction `{...}`) + retry. Claude respecte mieux le format que mistral mais peut wrapper (le commentaire dans `tryParseJson` le note déjà).
- **Casser la worker-safety** : ne pas importer de server-action/React dans les call sites (veille + générateurs sont chargés par des workers tsx).
- **Laisser le fallback Ollama actif** : D-03b interdit tout fallback local en prod. Le switch `cloud ? callLlm : callOllama` reste OK (piloté par env) mais la branche prod = openrouter, sans bascule automatique vers Ollama en cas d'échec cloud.

## Don't Hand-Roll

| Problème | Ne pas construire | Utiliser | Pourquoi |
|---------|-------------|-------------|-----|
| Appel Claude cloud | Un nouveau client Anthropic/SDK | `callLlm` (existant) | Déjà branché, gère texte+vision+tokens+fallback JSON |
| Sélection de modèle | Un mapping ad hoc au call site | `resolveModel(tier)` | Centralise le tier→modèle par provider (D-01) |
| Retry + logging génération | Une boucle custom par générateur | `runOllamaJson` (`MAX_ATTEMPTS` + backoff + `failJob` + `AIGenerationJob`) | Runner partagé déjà en place, idempotent, tracé |
| Extraction JSON de secours | Un parseur maison | `tryParseJson` dans `llm-client.ts` | Gère déjà le wrapping ```json ``` |
| Rastérisation PDF pour OCR | pdfjs/canvas Node | `pdftoppm` CLI (déjà en place) | Évite le binaire `canvas.node` non-bundlable par webpack |

**Key insight :** ~90% de l'infrastructure de migration existe déjà. La phase est un **re-routage discipliné** + config env + re-tuning prompts + tests, pas une construction.

## env.ts gap (tâche concrète IA-01)

`llm-client.ts` lit ces clés via `process.env` brut, **hors** validation t3-env. `env.ts` (§L32) déclare `AI_PROVIDER: z.enum(['ollama','anthropic','qualiopi-gen'])` — **`'openrouter'` absent** → si on met `AI_PROVIDER=openrouter`, la validation `env.ts` échoue au boot (`Invalid enum value`).

**Toutes les clés `OPENROUTER_*` lues par `llm-client.ts`** (à ajouter/valider) :
| Clé | Défaut codé | Requis ? | Schéma proposé |
|-----|-------------|----------|----------------|
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | non | `z.string().url().default(...)` |
| `OPENROUTER_API_KEY` | `''` | **oui si provider=openrouter** | `z.string().optional()` (llm-client throw déjà si vide) |
| `OPENROUTER_MODEL_FAST` | `anthropic/claude-haiku-4.5` | non | `z.string().default(...)` |
| `OPENROUTER_MODEL_QUALITY` | `anthropic/claude-sonnet-4.6` | non | `z.string().default(...)` |
| `OPENROUTER_MODEL_VISION` | `anthropic/claude-haiku-4.5` | non | `z.string().default(...)` |
| `OPENROUTER_APP_NAME` | `QualiOF` | non | `z.string().default('QualiOF')` |
| `OPENROUTER_SITE_URL` | `http://localhost:3010` | non | `z.string().url().default(...)` |
| `AI_PROVIDER` | `ollama` | — | **ajouter `'openrouter'`** à l'enum |

Actions : (1) enum `AI_PROVIDER` → `['ollama','openrouter','anthropic','qualiopi-gen']` ; (2) déclarer les 7 clés `OPENROUTER_*` dans `server` + `runtimeEnv` ; (3) documenter dans `.env.example` (§L35-46, à côté des clés Ollama/Anthropic existantes) ; (4) `turbo.json` `globalEnv` — ajouter les `OPENROUTER_*` (35+ vars déjà listées, cf STACK.md) sinon cache invalidation ratée. **Cohérence :** idéalement `llm-client.ts` lit `sharedEnv.OPENROUTER_*` plutôt que `process.env` brut (single source of truth CLAUDE.md) — discrétion planner, mais recommandé.

## Prompt re-tuning mistral→Claude (D-04c)

Les 5 prompts de `qualiopi-prompts.ts` (+ le prompt veille dans `veille/prompts.ts` + le prompt OCR dans `preinscription-extractor.ts`) ont été écrits pour `mistral-small:24b`. Guidance concrète :

- **Claude respecte mieux les consignes de format** → les injonctions répétées « Réponds UNIQUEMENT en JSON, sans markdown ni explication » sont utiles mais Claude est plus fiable ; conserver l'instruction JSON (elle ne nuit pas) mais on peut alléger les répétitions défensives.
- **Garde-fous métier à CONSERVER intégralement** : ce ne sont PAS des garde-fous « anti-dérape mistral », ce sont des **règles Qualiopi non-négociables** (voix 1re/3e personne, ancrage individuel anti-jumelage, ancrage strict au thème, distribution A/B des niveaux, verbes de Bloom, cohérence horaire du déroulé). Ne rien retirer de la sémantique métier — c'est la valeur d'audit.
- **Garde-fous à potentiellement alléger** (spécifiques mistral) : les rappels ultra-redondants de « ne pas wrapper en markdown », les MAJUSCULES d'insistance en excès. Claude suit une instruction claire une fois. Mais **le risque de régression est réel** → traiter le re-tuning comme un changement observable (bump `PROMPT_VERSION`, ex. `claude-v10-2026-07`), et comparer sur un pack témoin (cf. Validation Architecture).
- **JSON-only** : avec Claude 4.5 + `response_format`, on peut aussi passer à `json_schema strict` (upgrade v2) pour supprimer les instructions de format du prompt. Hors périmètre par défaut (garde `json_object`).
- **Convention `PROMPT_VERSION`** : versionner sépare mistral vs Claude dans `AIGenerationJob.promptVersion` — indispensable pour tracer une régression a posteriori (leçon audit : « re-génération a posteriori » possible seulement si la version prompt est tracée).
- **Attention prompt figé au produit** : le déroulé/programme sont **figés dans `TrainingProduct.derouleJson`** (memory `project_figeage_programme_deroule`). Re-tuner le prompt ne re-génère PAS automatiquement les produits déjà figés — tout produit généré avant le re-tune garde son contenu mistral. Le planner doit décider si un re-run des produits est dans le périmètre (probablement non — déféré, cf. « re-run requis » pour changements de prompt).

## Common Pitfalls

### Pitfall 1 : `response_format: json_object` peut échouer sur un modèle non-supporté
**What goes wrong:** OpenRouter documente que si un modèle ne supporte pas le `response_format` demandé, la requête **échoue avec une erreur** (pas d'ignore silencieux). Claude Haiku 4.5 / Sonnet 4.5+ le supportent, donc OK avec les slugs cibles — mais un downgrade de modèle (ou un `OPENROUTER_MODEL_*` mal renseigné) pourrait casser.
**How to avoid:** garder `tryParseJson` de secours ; envisager `require_parameters: true` (provider prefs) pour échouer bruyamment plutôt qu'obtenir un modèle qui ignore le format ; tester chaque slug une fois avant de figer.
**Warning signs:** `OpenRouter HTTP 4xx — response_format not supported`.

### Pitfall 2 : Slugs de modèle qui deviennent stales
**What goes wrong:** Anthropic fait évoluer les versions (4.5→4.6→…). Un slug retiré → HTTP 404/400.
**How to avoid:** slugs pilotés par env (déjà le cas) ; vérifiés live le 2026-07-03 (valides) ; re-vérifier au moment de l'implémentation (D-01c).

### Pitfall 3 : Timeout hérité de 600s (Ollama) laissé tel quel
**What goes wrong:** `callLlm` défaut 120s, mais `tryOnce` passe `timeoutMs: 240_000` et le worker tourne sur 600s. En cloud, 600s masque des blocages ; un job pendu 10 min bloque un slot de concurrency.
**How to avoid:** baisser à 60-120s pour le cloud (voir §Retry/timeout).

### Pitfall 4 : Tests qui mockent `callOllama` restent verts à tort après migration
**What goes wrong:** `classify.test.ts` mocke `@/lib/ai-ollama` et asserte `model:'mistral-small:24b'`. Après migration vers `callLlm`, le code n'appelle plus `callOllama` → le mock n'est jamais touché, mais le test peut rester vert si les assertions ne couvrent pas le nouveau chemin.
**How to avoid:** migrer le mock vers `@/lib/llm-client` (`callLlm`), asserter `provider:'openrouter'`/`tier:'fast'`, et appliquer le protocole de mutation (casser → rouge → restaurer).

### Pitfall 5 : PII vision au cloud sans DPA
**What goes wrong:** livrer la migration vision en prod envoie des CNI/RIB à OpenRouter+Anthropic sans base légale documentée (rupture RGPD, pilier isolement MinIO).
**How to avoid:** D-02b — action de conformité hors code BLOQUANTE avant prod vision. Le planner peut livrer le code vision mais gater sa mise en prod derrière le feu vert RGPD (ex. garder `AI_PROVIDER=ollama` pour la vision, ou flag séparé, jusqu'au DPA).

## Code Examples

### Migration veille/classify.ts (call site isolé, patron simple)
```typescript
// AVANT (apps/web/src/lib/veille/classify.ts L61)
const r = await callOllama({
  model: OLLAMA_MODEL_VEILLE, systemPrompt: SYSTEM_PROMPT_VEILLE_CLASSIFY,
  prompt: buildVeilleClassifyUserPrompt(input), jsonOutput: true,
  temperature: 0.1, timeoutMs: 60_000,
});
// APRÈS — via callLlm tier fast (Haiku en cloud, Ollama si AI_PROVIDER=ollama)
const r = await callLlm({
  tier: 'fast', systemPrompt: SYSTEM_PROMPT_VEILLE_CLASSIFY,
  prompt: buildVeilleClassifyUserPrompt(input), jsonOutput: true,
  temperature: 0.1, timeoutMs: 60_000,
});
// + persister provider/model dynamiques : provider: r.provider, model: r.model
//   (au lieu de provider:'ollama', model:'mistral-small:24b' codés en dur)
```

### Migration vision (pdf-extract.ts)
```typescript
// AVANT (L89) : callOllamaVision({ imageBuffer: buffer, prompt: VISION_OCR_PROMPT, temperature:0, maxTokens:1500 })
// APRÈS : callLlm force tier='vision' dès qu'imageBuffer est présent
const r = await callLlm({
  imageBuffer: buffer, prompt: VISION_OCR_PROMPT, temperature: 0, maxTokens: 1500,
});
const text = r.raw.trim();
// Message d'erreur à re-tuner : ne plus référencer "ollama pull qwen2.5vl" en cloud.
```

## State of the Art

| Old Approach | Current Approach | When | Impact |
|--------------|------------------|------|--------|
| JSON via prompt-only + `format:json` (Ollama) | Structured outputs natifs GA sur Claude Haiku 4.5 / Sonnet 4.5+ ; OpenRouter expose `json_object` ET `json_schema strict` | 2025-2026 | Option d'upgrade `json_schema` pour fiabilité maximale (v2). `json_object` suffit pour la phase. |
| Vision Ollama (llama3.2-vision / qwen2.5vl local) | Claude vision via OpenRouter (image_url data-URL) | — | Qualité OCR ↑, plus de crash modèle local (cf. `feedback_qwen25vl_crash`), mais PII au cloud (RGPD). |

**Deprecated/outdated:** `ANTHROPIC_MODEL='claude-sonnet-4-7'` dans `env.ts`/`.env.example` — vestige de l'ancienne voie SDK natif (jamais branchée, `@anthropic-ai/sdk` non installé). N'a rien à voir avec OpenRouter ; ne pas confondre avec `OPENROUTER_MODEL_QUALITY`. Le planner peut le laisser (provider `anthropic` distinct) ou le nettoyer.

## Open Questions

1. **`json_object` vs `json_schema strict`**
   - Ce qu'on sait : Claude 4.5 supporte les deux via OpenRouter ; `json_schema` est le mode « robuste » documenté.
   - Ce qui est flou : le taux réel de JSON invalide de `json_object` sur nos prompts Qualiopi (long, structurés) avec Claude.
   - Reco : garder `json_object` + `tryParseJson` + retry pour la phase ; mesurer le stub rate ; upgrade `json_schema` en v2 si non-nul.

2. **Périmètre worker (timeout/concurrency)**
   - Ce qu'on sait : 600s + concurrency=3 sont dimensionnés pour Ollama/GPU local.
   - Ce qui est flou : la valeur cible exacte en cloud dépend de la latence Claude observée (Sonnet déroulé long).
   - Reco : timeout 60-120s, concurrency montée prudemment (5-8) ; à traiter dans cette phase OU phase perf dédiée (déféré, discrétion planner).

3. **Re-run des produits figés après re-tune prompt**
   - Ce qu'on sait : déroulé/programme figés dans `TrainingProduct.derouleJson` ; un re-tune ne re-génère pas.
   - Reco : hors périmètre migration ; documenter la dette (produits mistral vs Claude coexistent, traçés par `PROMPT_VERSION`).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Compte OpenRouter + `OPENROUTER_API_KEY` | tous les call sites en cloud | ✗ (à provisionner par Laurent) | — | AI_PROVIDER=ollama (dev local) |
| `pdftoppm` (poppler) | OCR PDF scanné (`pdf-extract.ts`) | inchangé (déjà requis) | brew | message d'erreur explicite |
| Accès réseau openrouter.ai | inférence cloud | oui (dev) | — | — |
| Ollama local | fallback dev / tests | oui | natif | — |

**Missing dependencies with no fallback (prod):** `OPENROUTER_API_KEY` — sans elle, `callOpenRouter` throw immédiatement (message déjà explicite dans le code). À renseigner avant tout test cloud réel.
**Missing dependencies with fallback:** aucune bloquante en dev (garder `AI_PROVIDER=ollama`).

## Validation Architecture

> `nyquist_validation: true` dans `.planning/config.json` → section incluse.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.8 (`apps/web`, `packages/shared`) |
| Config file | `apps/web/vitest.config.*` (présent ; pas de Jest/Playwright) |
| Quick run command | `pnpm --filter @qualiof/web test <fichier>` |
| Full suite command | `pnpm test` (turbo) |

### Phase Requirements → Test Map
| Req | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|-------------|
| IA-01 | `AI_PROVIDER=openrouter` boot OK ; `OPENROUTER_*` validées ; provider inconnu → fail loud | unit | `pnpm --filter @qualiof/shared test env` | ❌ Wave 0 (créer `env.test.ts`) |
| IA-02 | Générateurs routent vers `callLlm` avec le bon `tier` quand `AI_PROVIDER=openrouter` | unit (mock `callLlm`) | `pnpm --filter @qualiof/web test ollama-generators` | ⚠️ partiel (deroule-jour-partiel teste des fns pures) — étendre |
| IA-03 | Vision : `callLlm({imageBuffer})` appelé (pas `callOllamaVision`) ; mime détecté | unit (mock `callLlm`) | `pnpm --filter @qualiof/web test pdf-extract` | ❌ Wave 0 |
| IA-04 | `classifyItem` route vers `callLlm` tier fast ; provider/model tracés dynamiquement ; 4 scénarios (ok/malformé/OTHER/throw) | unit | `pnpm --filter @qualiof/web test veille/classify` | ✅ existe — **migrer le mock** `ai-ollama`→`llm-client` |
| IA-05 | Retry (2-3) puis stub sur échec docs ; null sur échec vision | unit (mock `callLlm` rejette N fois) | `pnpm --filter @qualiof/web test ollama-generators` | ❌ Wave 0 (test retry→stub) |
| IA-06 | `PROMPT_VERSION` bumpé ; prompts Claude produisent JSON Zod-valide sur pack témoin | manual-only (qualité) | pack témoin 1 session + revue Laurent (cf. leçon « vu à l'œil ») | manuel |
| IA-07 | Mocks migrés ; **mutation-safe** (casser routage → rouge) | unit | suites ci-dessus | — |
| IA-08 | Timeout cloud ≤120s ; concurrency révisée | smoke | run worker cloud sur 1 session | manuel |

### Sampling Rate
- **Per task commit:** `pnpm --filter @qualiof/web test <fichier touché>` (< 30s, tout mocké, aucun appel LLM réel).
- **Per wave merge:** `pnpm test` (suite complète — 700+ tests actuels doivent rester verts, cf. STATE).
- **Phase gate:** suite complète verte + **1 pack témoin réel** généré en `AI_PROVIDER=openrouter` (SES témoin, 5 personnes, ~12 min référence) validé à l'œil par Laurent (JSON valide, contenu Qualiopi conforme, 0 stub) AVANT `/gsd:verify-work`.

### Mutation-safe pattern (obligatoire, feedback_test_de_puissance_mutation)
Après migration, chaque test de routage doit prouver qu'il garde quelque chose :
- Mock `vi.mock('@/lib/llm-client', () => ({ callLlm: vi.fn() }))`.
- Asserter `callLlm` appelé avec `expect.objectContaining({ tier: 'quality' })` pour déroulé/rapport, `tier:'fast'` pour le reste.
- **Mutation témoin :** inverser le tier (quality↔fast) ou re-router vers `callOllama` → le test DOIT virer rouge → restaurer. Documenter la mutation dans le test (jamais commitée). Prouve un vrai garde, pas un mock complaisant.

### Wave 0 Gaps
- [ ] `packages/shared/src/__tests__/env.test.ts` — couvre IA-01 (enum openrouter accepté, clés validées, provider invalide rejeté).
- [ ] `apps/web/src/lib/closure/__tests__/generators-routing.test.ts` — couvre IA-02/IA-05 (routage tier + retry→stub, mock `callLlm`).
- [ ] `apps/web/src/lib/__tests__/pdf-extract.test.ts` — couvre IA-03 (vision → callLlm, mime).
- [ ] Migration `veille/__tests__/classify.test.ts` — mock `ai-ollama`→`llm-client` (IA-04, fichier existe).

*(Pas d'installation de framework — Vitest déjà présent.)*

## Sources

### Primary (HIGH confidence)
- Code repo (lu intégralement) : `llm-client.ts`, `ai-ollama.ts`, `closure/ollama-generators.ts`, `closure/qualiopi-prompts.ts`, `preinscription-extractor.ts`, `pdf-extract.ts`, `veille/classify.ts`, `packages/shared/src/env.ts`, 2 fichiers de tests, `.env.example`, `CLAUDE.md`, `16-CONTEXT.md`.
- [openrouter.ai/anthropic/claude-haiku-4.5](https://openrouter.ai/anthropic/claude-haiku-4.5) — slug valide, $1/$5 Mtok, 200K ctx, vision, structured outputs.
- [openrouter.ai/anthropic/claude-sonnet-4.6](https://openrouter.ai/anthropic/claude-sonnet-4.6) — slug valide, $3/$15 Mtok, 1M ctx, vision.
- [OpenRouter Structured Outputs docs](https://openrouter.ai/docs/guides/features/structured-outputs) — json_schema strict, `require_parameters`, erreur si non-supporté, Response Healing plugin.
- [Claude Vision docs](https://platform.claude.com/docs/en/build-with-claude/vision) — JPEG/PNG/GIF/WebP, 8000×8000 px, requête 32MB, optimal ≤1568px, down-scale auto.

### Secondary (MEDIUM confidence)
- [Anthropic structured outputs GA blog](https://claude.com/blog/structured-outputs-on-the-claude-developer-platform) — GA sur Sonnet 4.5 / Opus 4.5 / Haiku 4.5 (via WebSearch, cohérent avec OpenRouter docs).

## Metadata

**Confidence breakdown:**
- Standard stack (existant + slugs) : HIGH — code lu, slugs vérifiés live.
- Architecture (routage/patron) : HIGH — patron déjà en prod dans le repo.
- Pitfalls (JSON/timeout/PII) : HIGH-MEDIUM — comportement OpenRouter documenté ; taux réel de JSON invalide à mesurer.

**Research date:** 2026-07-03
**Valid until:** ~2026-08-03 (30j pour le repo ; 7-14j pour les slugs/pricing Claude — écosystème rapide, re-vérifier à l'implémentation).
