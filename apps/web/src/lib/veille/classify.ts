/**
 * Classification d'une entrée de veille réglementaire (P0.1).
 *
 * Entrée  : un texte court (titre + résumé d'article, communication OPCO,
 *           extrait de décret).
 * Sortie  : `{ topic, urgency, summary }` validé par Zod, ou erreur typée.
 *
 * Passe par `callLlm({ profile: 'classify' })` — le modèle est résolu par
 * `ai-config.ts` (env var `OPENROUTER_MODEL_CLASSIFY`, défaut packagé). Le
 * littéral de modèle n'apparaît PAS dans ce fichier — c'est l'objectif P0.1.
 */

import { z } from 'zod';
import { callLlm } from '../ai-llm';
import { PROMPT_VERSION, SYSTEM_PROMPT_CLASSIFY } from './prompts';

const VeilleTopicEnum = z.enum([
  'qualiopi',
  'opco',
  'mcf',
  'rgpd',
  'metier',
  'autre',
]);
const VeilleUrgencyEnum = z.enum(['haute', 'moyenne', 'basse']);

export const VeilleClassificationSchema = z.object({
  topic: VeilleTopicEnum,
  urgency: VeilleUrgencyEnum,
  summary: z.string().trim().min(1).max(280),
});

export type VeilleClassification = z.infer<typeof VeilleClassificationSchema>;

export interface VeilleClassifyResult {
  classification: VeilleClassification;
  /** Provider + modèle effectivement utilisés (tracking AIGenerationJob). */
  provider: string;
  model: string;
  promptVersion: string;
  latencyMs: number;
}

export class VeilleClassifyError extends Error {
  // Préfixe `reason` plutôt que `cause` pour ne pas collisionner avec
  // `Error.cause` (ES2022) — sinon TS4115 sur la parameter property.
  constructor(
    message: string,
    public readonly reason: 'llm_failed' | 'schema_invalid',
    public readonly raw?: string,
  ) {
    super(message);
    this.name = 'VeilleClassifyError';
  }
}

export interface ClassifyOptions {
  text: string;
  /** Timeout en ms ; défaut hérité de `callLlm` (60 s). */
  timeoutMs?: number;
}

export async function classifyVeilleEntry(
  opts: ClassifyOptions,
): Promise<VeilleClassifyResult> {
  const text = opts.text.trim();
  if (!text) {
    throw new VeilleClassifyError(
      'Texte de classification vide.',
      'schema_invalid',
    );
  }

  const result = await callLlm({
    profile: 'classify',
    systemPrompt: SYSTEM_PROMPT_CLASSIFY,
    prompt: text,
    jsonOutput: true,
    temperature: 0,
    timeoutMs: opts.timeoutMs,
  }).catch((err) => {
    throw new VeilleClassifyError(
      `Échec appel LLM : ${(err as Error).message}`,
      'llm_failed',
    );
  });

  const parsed = VeilleClassificationSchema.safeParse(result.parsedJson);
  if (!parsed.success) {
    throw new VeilleClassifyError(
      `Réponse LLM hors schéma : ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join(' / ')}`,
      'schema_invalid',
      result.raw,
    );
  }

  return {
    classification: parsed.data,
    provider: result.provider,
    model: result.model,
    promptVersion: PROMPT_VERSION,
    latencyMs: result.durationMs,
  };
}
