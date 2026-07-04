# Phase 16: Migration IA Ollama vers Claude API - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-03
**Phase:** 16-migration-ia-ollama-vers-claude-api
**Areas discussed:** Modèle & coût, Périmètre de migration, Filet de sécurité (fallback), Voie technique

---

## Modèle & coût Claude

| Option | Description | Selected |
|--------|-------------|----------|
| Haiku (fast) + Sonnet (quality) | Différencié : Haiku docs volume, Sonnet docs rédactionnels critiques. Reprend les tiers existants. Meilleur équilibre. | ✓ |
| Sonnet partout | Qualité homogène, coût modéré, un seul modèle. | |
| Opus sur docs critiques | Opus 4.8 déroulé/rapport, Sonnet le reste. Coût le plus élevé. | |

**User's choice:** Haiku (fast) + Sonnet (quality)
**Notes:** S'appuie sur la structure `LlmTier` déjà présente dans `llm-client.ts`. Opus écarté pour coût.

---

## Périmètre de migration

| Option | Description | Selected |
|--------|-------------|----------|
| Docs closure Qualiopi seuls | ~10 générateurs closure ; vision CNI/RIB et veille restent locaux (RGPD). | |
| Closure + veille Qualiopi | Ajoute classification veille (RSS public, pas de PII). Vision reste local. | |
| Tout y compris OCR vision | Ajoute aussi images CNI/RIB au cloud. ⚠ RGPD : PII exposée. | ✓ |

**User's choice:** Tout y compris OCR vision (interprété comme superset : closure + veille + vision)
**Notes:** Choix pris malgré l'avertissement RGPD explicite. Conséquence capturée en CONTEXT D-02b : action de conformité (DPA OpenRouter + Anthropic) requise hors code avant prod vision.

---

## Filet de sécurité (fallback)

| Option | Description | Selected |
|--------|-------------|----------|
| Retry API puis stub | 2-3 tentatives API puis stub neutre. Compatible cap cloud v6 (zéro dépendance Ollama). | ✓ |
| Retry API puis Ollama puis stub | Résilience max locale mais garde dépendance Ollama (incompatible cloud pur). | |
| 100% cloud, échec bloquant | Pas de repli ; échec = doc non généré. | |

**User's choice:** Retry API puis stub
**Notes:** Pas de fallback Ollama — cohérent avec l'objectif cap cloud.

---

## Voie technique (fiabilité JSON)

| Option | Description | Selected |
|--------|-------------|----------|
| SDK Anthropic natif | @anthropic-ai/sdk + sorties structurées natives. Fiabilité JSON max, pas de markup, nouvelle dépendance. | |
| Passerelle OpenRouter existante | Réutilise callLlm/OpenRouter déjà branché (response_format json_object). Livraison rapide, markup ~5%. | ✓ |

**User's choice:** Passerelle OpenRouter existante
**Notes:** Contredit la formulation littérale du roadmap (SDK `@anthropic-ai/sdk` + `messages.parse()`) — CONTEXT prime. Réduit fortement le périmètre car `llm-client.ts` existe déjà. Nécessite d'ajouter `'openrouter'` à l'enum `AI_PROVIDER` de `env.ts`.

## Claude's Discretion

- Stratégie de retry (backoff, nombre exact de tentatives).
- Logging coût/tokens dans `AIGenerationJob`.
- Conservation ou retrait de `ai-ollama.ts` post-migration.

## Deferred Ideas

- Base légale RGPD OCR vision cloud (DPA) — hors code, bloquant avant prod vision.
- SDK Anthropic natif + `messages.parse()` — réévaluable v2.
- Retrait complet Ollama du repo — post cap cloud.
- Ajustement worker timeout/concurrency cloud.
