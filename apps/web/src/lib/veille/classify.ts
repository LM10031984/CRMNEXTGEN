/**
 * Phase 13 Plan 13-05 — Classifier RSS → thème Qualiopi.
 *
 * Phase 13 refactor (2026-06-10) : `callOllama` → `callLlm({ profile: 'classify' })`.
 * Le modèle effectif vient de `ai-config.ts` (env OPENROUTER_MODEL_CLASSIFY
 * ou défaut `mistralai/mistral-small-2402`). Plus de littéral de modèle ici.
 *
 * Guard-rails (RESEARCH §6.4) :
 *  - Zod validation stricte (theme enum + confidence 0-100 + exploitation 10-500).
 *  - JSON malformé / Zod fail → return null + AIGenerationJob status='error'.
 *  - theme=OTHER → return ClassifyOutput + AIGenerationJob status='skipped_other'
 *    (la décision skip est prise dans persist.ts).
 *  - Exception (timeout, HTTP error) → return null + AIGenerationJob status='error'.
 *
 * Worker safety : 0 import React / server-action / rbac. Importable depuis
 * scripts/veille-worker.ts (tsx) sans crash "react cache".
 */

import { createHash } from 'node:crypto';
import { prisma } from '@qualiof/db';
import { callLlm } from '@/lib/ai-llm';
import { getLlmModel, getLlmProvider } from '@/lib/ai-config';
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
 * Classifie un item RSS via le LLM configuré (profil `classify`).
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

  // Provider/model résolus à l'avance pour pouvoir tracer même en cas d'exception
  // avant que callLlm n'ait eu le temps de retourner ces valeurs.
  const provider = getLlmProvider();
  const model = getLlmModel('classify');

  try {
    const r = await callLlm({
      profile: 'classify',
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
    await prisma.aIGenerationJob.create({
      data: {
        tenantId,
        provider,
        model,
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
