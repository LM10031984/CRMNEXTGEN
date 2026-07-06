/**
 * Phase 13 Plan 13-05 — Classifier RSS → thème Qualiopi.
 * Phase 16 Plan 16-02 — Migration Ollama→Claude API : route via `callLlm`
 * (tier 'fast' = Claude Haiku en OpenRouter, Ollama en local selon AI_PROVIDER).
 *
 * Le backend est choisi par `AI_PROVIDER` dans `llm-client.ts` — ce call site
 * ne connaît plus de modèle codé en dur. Le tracing AIGenerationJob lit
 * provider/model DYNAMIQUEMENT sur le résultat (r.provider / r.model). Si on
 * re-tune le prompt : bump PROMPT_VERSION_VEILLE (ici on ne re-tune PAS, seul
 * le backend change).
 *
 * Guard-rails (RESEARCH §6.4) :
 *  - Zod validation stricte (theme enum + confidence 0-100 + exploitation 10-500).
 *  - JSON malformé / Zod fail → return null + AIGenerationJob status='error'.
 *  - theme=OTHER → return ClassifyOutput + AIGenerationJob status='skipped_other'
 *    (la décision skip est prise dans persist.ts).
 *  - Exception (timeout, HTTP error) → return null + AIGenerationJob status='error'.
 *
 * Worker safety : 0 import React / server-action / rbac. `callLlm` est un fetch
 * pur → importable depuis scripts/veille-worker.ts (tsx) sans crash "react cache".
 */

import { createHash } from 'node:crypto';
import { prisma } from '@qualiof/db';
import { callLlm } from '@/lib/llm-client';
import {
  PROMPT_VERSION_VEILLE,
  SYSTEM_PROMPT_VEILLE_CLASSIFY,
  buildVeilleClassifyUserPrompt,
  VeilleClassifyOutputSchema,
} from './prompts';

export interface ClassifyInput {
  title: string;
  snippet: string;
  source: string;
}

export interface ClassifyOutput {
  theme: 'INDIC_23' | 'INDIC_24' | 'INDIC_25' | 'INDIC_26' | 'OTHER';
  confidence: number;
  exploitation_draft: string;
}

/**
 * Classifie un item RSS via Ollama mistral-small:24b.
 * Trace le résultat dans `AIGenerationJob` pour audit (provider/model/promptVersion/status/latency).
 *
 * @returns `ClassifyOutput` si JSON valide ET Zod-compliant (incluant theme=OTHER),
 *          `null` si JSON malformé OU exception (timeout, HTTP error).
 */
export async function classifyItem(
  input: ClassifyInput,
  tenantId: string,
): Promise<ClassifyOutput | null> {
  const start = Date.now();
  // inputHash sert d'idempotence côté AIGenerationJob (clé pour ré-explorer un audit).
  const inputHash = createHash('sha256')
    .update(`${input.title}::${input.snippet}::${input.source}`)
    .digest('hex')
    .slice(0, 32);

  try {
    const r = await callLlm({
      tier: 'fast',
      systemPrompt: SYSTEM_PROMPT_VEILLE_CLASSIFY,
      prompt: buildVeilleClassifyUserPrompt(input),
      jsonOutput: true,
      temperature: 0.1,
      timeoutMs: 60_000,
    });
    const parsed = VeilleClassifyOutputSchema.safeParse(r.parsedJson);
    if (!parsed.success) {
      await prisma.aIGenerationJob.create({
        data: {
          tenantId,
          provider: r.provider,
          model: r.model,
          promptVersion: PROMPT_VERSION_VEILLE,
          inputHash,
          status: 'error',
          latencyMs: Date.now() - start,
          errorMsg:
            'JSON parse / Zod fail: ' +
            JSON.stringify(parsed.error.flatten()).slice(0, 400),
          refTable: 'RegulatoryWatch',
        },
      });
      return null;
    }

    await prisma.aIGenerationJob.create({
      data: {
        tenantId,
        provider: r.provider,
        model: r.model,
        promptVersion: PROMPT_VERSION_VEILLE,
        inputHash,
        status: parsed.data.theme === 'OTHER' ? 'skipped_other' : 'ok',
        latencyMs: Date.now() - start,
        refTable: 'RegulatoryWatch',
      },
    });
    return parsed.data;
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    // Le throw précède la réponse → `r` n'existe pas ici. On trace un provider
    // de repli (dérivé de AI_PROVIDER) et model='unknown' (aucun modèle résolu).
    const fallbackProvider =
      (process.env.AI_PROVIDER ?? 'ollama') === 'openrouter' ? 'openrouter' : 'ollama';
    await prisma.aIGenerationJob.create({
      data: {
        tenantId,
        provider: fallbackProvider,
        model: 'unknown',
        promptVersion: PROMPT_VERSION_VEILLE,
        inputHash,
        status: 'error',
        latencyMs: Date.now() - start,
        errorMsg: msg.slice(0, 500),
        refTable: 'RegulatoryWatch',
      },
    });
    return null;
  }
}
