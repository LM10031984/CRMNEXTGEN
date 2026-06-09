/**
 * Adapter IA unifié (P0.1). Un seul chemin d'inférence pour TOUT le code
 * applicatif. Remplace l'ancien `ai-mistral.ts`.
 *
 * Le modèle effectif est résolu par `ai-config.ts` à partir du profil
 * (`text` / `vision` / `classify` / `closure`). AUCUN call site n'embarque
 * de littéral de modèle.
 *
 * Mode JSON : si `jsonOutput=true` on demande `response_format` à OpenRouter
 * et on injecte « (Réponds uniquement en JSON valide.) » dans le system
 * prompt — certains providers (dont Mistral) exigent que « json » figure
 * dans les messages pour activer le mode strict.
 */

import {
  DEFAULT_TIMEOUT_MS,
  OPENROUTER_URL,
  buildHeaders,
  getLlmModel,
  getLlmProvider,
  type LlmProfile,
} from './ai-config';

export interface LlmCallOptions {
  /** Profil sémantique — résout le modèle via la config. Défaut: 'text'. */
  profile?: LlmProfile;
  systemPrompt?: string;
  prompt: string;
  jsonOutput?: boolean;
  temperature?: number;
  maxTokens?: number;
  /** Timeout en ms ; défaut 60_000 (1 min). Filet anti-worker-pendu. */
  timeoutMs?: number;
}

export interface LlmResult {
  raw: string;
  parsedJson: unknown | null;
  /** Provider effectivement utilisé (pour tracking AIGenerationJob). */
  provider: string;
  /** Modèle effectivement utilisé (pour tracking AIGenerationJob). */
  model: string;
  durationMs: number;
}

type Role = 'system' | 'user' | 'assistant';
type TextPart = { type: 'text'; text: string };
type ImagePart = { type: 'image_url'; image_url: { url: string } };
type ContentPart = TextPart | ImagePart;
type Message =
  | { role: Role; content: string }
  | { role: Role; content: ContentPart[] };

interface OpenRouterChatResponse {
  choices?: Array<{
    message?: {
      content?: string | ContentPart[] | null;
    };
  }>;
  error?: { message?: string; code?: number };
}

function extractTextFromMessage(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((chunk: unknown) => {
        if (typeof chunk === 'string') return chunk;
        if (
          chunk &&
          typeof chunk === 'object' &&
          'type' in chunk &&
          (chunk as { type: string }).type === 'text'
        ) {
          return (chunk as { text?: string }).text ?? '';
        }
        return '';
      })
      .join('');
  }
  return '';
}

function tryParseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function callOpenRouter(opts: {
  model: string;
  messages: Message[];
  temperature: number;
  maxTokens: number;
  jsonOutput: boolean;
  timeoutMs: number;
}): Promise<string> {
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    temperature: opts.temperature,
    max_tokens: opts.maxTokens,
  };
  if (opts.jsonOutput) {
    body.response_format = { type: 'json_object' };
  }

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs),
  });

  if (!res.ok) {
    let detail = '';
    try {
      const errJson = (await res.json()) as OpenRouterChatResponse;
      detail = errJson.error?.message ?? '';
    } catch {
      try {
        detail = await res.text();
      } catch {
        // ignore
      }
    }
    throw new Error(
      `OpenRouter HTTP ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`,
    );
  }

  const json = (await res.json()) as OpenRouterChatResponse;
  return extractTextFromMessage(json.choices?.[0]?.message?.content);
}

export async function callLlm(opts: LlmCallOptions): Promise<LlmResult> {
  const profile: LlmProfile = opts.profile ?? 'text';
  const model = getLlmModel(profile);
  const provider = getLlmProvider();
  const start = Date.now();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const systemContent = opts.jsonOutput
    ? `${opts.systemPrompt ?? ''}\n\n(Réponds uniquement en JSON valide.)`.trim()
    : opts.systemPrompt;

  const messages: Message[] = [];
  if (systemContent) messages.push({ role: 'system', content: systemContent });
  messages.push({ role: 'user', content: opts.prompt });

  const raw = await callOpenRouter({
    model,
    messages,
    temperature: opts.temperature ?? 0.1,
    maxTokens: opts.maxTokens ?? 2048,
    jsonOutput: !!opts.jsonOutput,
    timeoutMs,
  });

  const parsedJson = opts.jsonOutput ? tryParseJson(raw) : null;

  return {
    raw,
    parsedJson,
    provider,
    model,
    durationMs: Date.now() - start,
  };
}

export interface LlmVisionOptions {
  imageBuffer: Buffer;
  /** MIME type de l'image (image/jpeg, image/png, image/webp). Défaut : image/jpeg. */
  mimeType?: string;
  prompt: string;
  systemPrompt?: string;
  jsonOutput?: boolean;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

/**
 * Appelle un modèle vision (Pixtral via OpenRouter) avec une image en input.
 * L'image est encodée en base64 et passée via le format OpenAI multi-part.
 *
 * Cas d'usage : OCR de photos de CNI / RIB envoyées par les apprenants à
 * la place du PDF natif.
 */
export async function callLlmVision(opts: LlmVisionOptions): Promise<LlmResult> {
  const model = getLlmModel('vision');
  const provider = getLlmProvider();
  const start = Date.now();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const mimeType = opts.mimeType ?? 'image/jpeg';

  const systemContent = opts.jsonOutput
    ? `${opts.systemPrompt ?? ''}\n\n(Réponds uniquement en JSON valide.)`.trim()
    : opts.systemPrompt;

  const dataUri = `data:${mimeType};base64,${opts.imageBuffer.toString('base64')}`;
  const userContent: ContentPart[] = [
    { type: 'text', text: opts.prompt },
    { type: 'image_url', image_url: { url: dataUri } },
  ];

  const messages: Message[] = [];
  if (systemContent) messages.push({ role: 'system', content: systemContent });
  messages.push({ role: 'user', content: userContent });

  const raw = await callOpenRouter({
    model,
    messages,
    temperature: opts.temperature ?? 0.1,
    maxTokens: opts.maxTokens ?? 2048,
    jsonOutput: !!opts.jsonOutput,
    timeoutMs,
  });

  const parsedJson = opts.jsonOutput ? tryParseJson(raw) : null;

  return { raw, parsedJson, provider, model, durationMs: Date.now() - start };
}
