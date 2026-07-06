# Phase 16: Migration IA Ollama vers Claude API - Context

**Gathered:** 2026-07-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Basculer la génération IA de QualiOF d'**Ollama local** vers **l'API Claude** (via la passerelle OpenRouter déjà branchée), pour tous les points d'appel LLM : docs Qualiopi du pack closure, OCR vision des pièces apprenants, et classification veille. Objectifs : **fiabilité** (fini les stubs/échecs sous charge, cf. leçon deadlocks/parallélisme), **qualité** (contenu varié — ex. écarts de positionnement réalistes), et **cap cloud** (milestone v6, plus de dépendance Ollama en production).

On clarifie *comment* migrer (modèle, périmètre, fallback, voie technique) — pas *si*. La logique métier des docs (prompts figés au produit, conventions Qualiopi, schémas Zod) reste inchangée : seul le backend d'inférence change.
</domain>

<decisions>
## Implementation Decisions

### Modèle & coût (D-01)
- **D-01a:** Migration **différenciée par tier** (structure `LlmTier` déjà présente dans `llm-client.ts`) :
  - **`fast` → Claude Haiku** : docs volume/structurés (QCM, satisfaction chaud/froid, positionnement, analyse besoin, grille observation).
  - **`quality` → Claude Sonnet** : docs rédactionnels critiques audit (déroulé pédagogique, rapport formateur).
- **D-01b:** Opus n'est PAS retenu (coût). Le mapping tier→modèle reste pilotable par env (`OPENROUTER_MODEL_FAST` / `OPENROUTER_MODEL_QUALITY`) pour ajuster sans redéploiement.
- **D-01c:** Les défauts OpenRouter actuels (`anthropic/claude-haiku-4.5`, `anthropic/claude-sonnet-4.6`) conviennent — vérifier/mettre à jour les identifiants de modèle vers les dernières versions au moment de l'implémentation.

### Périmètre de migration (D-02)
- **D-02a:** Migration **complète** de tous les points d'appel `callOllama` / `callOllamaVision` vers Claude :
  1. **Docs closure Qualiopi** — `closure/ollama-generators.ts` (~10 générateurs) — cœur de cible.
  2. **OCR vision pièces apprenants** — `preinscription-extractor.ts` (CNI/RIB/CFP) et `pdf-extract.ts` (`callOllamaVision`).
  3. **Veille Qualiopi** — `veille/classify.ts` (classification RSS).
- **D-02b:** ⚠ **RGPD — action de conformité requise** : l'OCR vision envoie des images CNI/RIB (PII apprenants) au cloud (OpenRouter → Anthropic comme sous-traitants). Décision prise en connaissance de cause par Laurent. **À faire hors code** : documenter la base légale / DPA (sous-traitants OpenRouter + Anthropic), et vérifier la cohérence avec la politique RGPD projet (PII actuellement isolée MinIO privé). Ne pas livrer la migration vision en prod sans ce point tranché.

### Fallback / résilience (D-03)
- **D-03a:** En cas d'échec ou timeout de l'API Claude pendant une génération : **retry API (2-3 tentatives)** puis **bascule sur le stub** (`stub-content.ts`, contenu neutre déjà en place).
- **D-03b:** **Pas de fallback Ollama** — compatible cap cloud v6 (aucune dépendance Ollama en production). L'inférence locale n'est plus une voie de secours.
- **D-03c:** Pour l'OCR vision : échec → comportement actuel (retour null → saisie manuelle admin), pas de stub généré.

### Voie technique (D-04)
- **D-04a:** **Réutiliser la passerelle OpenRouter existante** (`callLlm` dans `llm-client.ts`, API OpenAI-compatible `response_format: json_object`). **Pas de SDK `@anthropic-ai/sdk` natif** — malgré la formulation du roadmap, la passerelle est déjà branchée et supporte texte + vision (multimodal via `imageBuffer`).
- **D-04b:** Router les générateurs restants (qui appellent encore `callOllama` en direct avec `mistral-small:24b` hardcodé) à travers `callLlm` avec le bon `tier`. Le déroulé rédactionnel utilise déjà `callLlm` (tier quality) — servir de patron.
- **D-04c:** **Re-tuning des prompts** — les 5 system prompts de `qualiopi-prompts.ts` ont été écrits pour `mistral-small:24b`. Les adapter pour Claude (Claude respecte mieux les consignes JSON/format ; certains garde-fous anti-dérape mistral peuvent être allégés). Conserver `PROMPT_VERSION` et le versionner.

### Claude's Discretion
- Stratégie de retry (backoff, nombre exact de tentatives) — implémentation.
- Logging coût/tokens : `llm-client` capture déjà `usageTokensIn/Out` pour OpenRouter ; persister ou non dans `AIGenerationJob` (colonnes modèle/latence/status existent déjà) — au choix du planner.
- Faut-il conserver `ai-ollama.ts` (callOllama/callOllamaVision) après migration : le garder pour compat tests / usage dev local, ou le retirer. Discrétion Claude.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Client LLM unifié (point d'intégration central)
- `apps/web/src/lib/llm-client.ts` — client unifié `callLlm` + `resolveModel(tier)` ; supporte Ollama ET OpenRouter (texte + vision multimodal). **C'est la cible de tous les call sites.** Défauts OpenRouter : haiku-4.5 (fast) / sonnet-4.6 (quality).
- `apps/web/src/lib/ai-ollama.ts` — `callOllama` / `callOllamaVision` legacy à remplacer par `callLlm`.

### Points d'appel à migrer (les 4 call sites)
- `apps/web/src/lib/closure/ollama-generators.ts` — ~10 générateurs docs Qualiopi ; ligne ~639-651 montre le patron `callLlm` (tier quality) déjà en place pour le déroulé rédactionnel.
- `apps/web/src/lib/preinscription-extractor.ts` §L147 — OCR vision CNI/RIB (pilier #4, PII).
- `apps/web/src/lib/pdf-extract.ts` §L89 — `callOllamaVision` extraction PDF.
- `apps/web/src/lib/veille/classify.ts` §L61 — classification veille RSS.

### Prompts & fallback
- `apps/web/src/lib/closure/qualiopi-prompts.ts` — 5 system prompts (QCM, AnalyseBesoin, Grille, Compétences/Positionnement, Déroulé) + `PROMPT_VERSION` à re-tuner pour Claude.
- `apps/web/src/lib/closure/stub-content.ts` — contenu de fallback (utilisé quand génération échoue).

### Environnement & validation
- `packages/shared/src/env.ts` §L32-38 — ⚠ `AI_PROVIDER: z.enum(['ollama','anthropic','qualiopi-gen'])` **n'inclut PAS `'openrouter'`** et aucune clé `OPENROUTER_*` n'y est validée. `llm-client.ts` lit ces clés via `process.env` brut (hors validation t3-env). **Tâche concrète : ajouter `'openrouter'` à l'enum + valider `OPENROUTER_API_KEY` / `OPENROUTER_MODEL_*`**, sinon boot fail loud à `AI_PROVIDER=openrouter`.
- `.env.example` §L35-46 — documenter les clés OpenRouter + basculer/documenter `AI_PROVIDER`.

### Tests existants (à garder verts)
- `apps/web/src/lib/closure/__tests__/deroule-jour-partiel.test.ts` — mocke `@/lib/ai-ollama` ET `@/lib/llm-client` ; référence pour le pattern de mock après migration.
- `apps/web/src/lib/veille/__tests__/classify.test.ts` — mocke `callOllama` ; à adapter vers `callLlm`.

### Instructions projet
- `CLAUDE.md` (racine `files/`) — piliers co-essentiels (#1 pack closure, #4 pré-inscriptions IA), contraintes RGPD (PII MinIO), perf LLM (concurrency=3, timeout 600s → réviser pour cloud ~30s), env single source of truth.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`callLlm` / `llm-client.ts`** : l'abstraction cible existe déjà, gère texte + vision, capture les tokens/coût OpenRouter, et le fallback JSON (extraction `{...}` si le modèle wrappe). La migration = re-router les call sites vers elle, pas la construire.
- **`LlmTier` ('fast' | 'quality' | 'vision')** : le mapping tier→modèle par provider est déjà codé dans `resolveModel()`. D-01 se pose directement dessus.
- **Pattern déroulé (ollama-generators ~L639)** : déjà migré vers `callLlm` tier quality — patron à répliquer pour les autres générateurs.
- **`stub-content.ts`** : fallback neutre déjà branché (retour null générateur → stub).

### Established Patterns
- Générateurs : construire prompt user → appel LLM `format json` → valider Zod → null si échec → stub. **Ne pas casser cette chaîne** ; seul l'appel LLM change.
- Env validé via `@t3-oss/env-nextjs` (`env.ts`) — fail loud au boot. Toute nouvelle clé DOIT y être déclarée.
- `@anthropic-ai/sdk` **non installé** — cohérent avec D-04 (voie OpenRouter, pas de SDK natif).

### Integration Points
- `AI_PROVIDER` env pilote le provider globalement ; passer le défaut/staging à `openrouter`.
- `AIGenerationJob` (Prisma) persiste modèle/latence/status/erreur par génération — point d'ancrage pour logger coût/tokens si souhaité.
- Worker BullMQ closure (concurrency=3, timeout 600s) : le timeout doit être revu à la baisse pour le cloud (OpenRouter ~30-120s), et la concurrency peut monter sans compétition GPU locale.
</code_context>

<specifics>
## Specific Ideas

- Reprendre exactement la structure de tiers déjà codée (`fast`/`quality`) plutôt que d'inventer un nouveau mapping.
- Le déroulé pédagogique (`callLlm` tier quality) est le seul générateur déjà migré : le lire en premier comme référence vivante.
- Garder `PROMPT_VERSION` versionné pour tracer le re-tuning Claude vs mistral.
</specifics>

<deferred>
## Deferred Ideas

- **Base légale RGPD OCR vision cloud (DPA OpenRouter + Anthropic)** — action de conformité hors périmètre code, mais bloquante avant mise en prod de la migration vision (cf. D-02b). À traiter au niveau organisme, pas dans le plan technique.
- **Migration vers SDK Anthropic natif + sorties structurées `messages.parse()`** — écartée au profit d'OpenRouter (D-04). Réévaluable en v2 si le markup OpenRouter ou la fiabilité JSON `response_format` posent problème.
- **Retrait complet d'Ollama / `ai-ollama.ts` du repo** — possible une fois la migration prouvée et le cap cloud atteint ; pas dans cette phase.
- **Ajustement worker (timeout/concurrency cloud)** — mentionné en code_context ; le planner décide si c'est dans cette phase ou une phase perf dédiée.

</deferred>

---

*Phase: 16-migration-ia-ollama-vers-claude-api*
*Context gathered: 2026-07-03*
