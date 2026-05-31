/**
 * Adapter IA — appelle les modèles Mistral via OpenRouter (centralisation
 * facturation côté Start Academy). API OpenAI-compatible :
 *
 *   POST https://openrouter.ai/api/v1/chat/completions
 *   Headers: Authorization: Bearer <OPENROUTER_API_KEY>
 *
 * Texte  : mistralai/mistral-large-2411 (override via OPENROUTER_MODEL_TEXT)
 * Vision : mistralai/pixtral-12b        (override via OPENROUTER_MODEL_VISION)
 *
 * Les exports publics (`callMistral`, `callMistralVision`, `MistralResult`,
 * `MistralCallOptions`, `MistralVisionOptions`) gardent la MÊME signature
 * que l'ancien adapter SDK Mistral, donc le reste du code (pdf-extract,
 * extracteurs pré-inscription, etc.) ne change pas.
 *
 * Mode JSON : si `jsonOutput=true` on demande `response_format` à OpenRouter
 * et on injecte "(Réponds uniquement en JSON valide.)" dans le system prompt
 * en sécurité — certains providers (dont Mistral) exigent que "json" figure
 * dans les messages pour activer le mode strict.
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const DEFAULT_TEXT_MODEL =
  process.env.OPENROUTER_MODEL_TEXT ?? 'mistralai/mistral-large-2411';
const DEFAULT_VISION_MODEL =
  process.env.OPENROUTER_MODEL_VISION ?? 'mistralai/pixtral-12b';

export interface MistralCallOptions {
  model?: string;
  systemPrompt?: string;
  prompt: string;
  jsonOutput?: boolean;
  temperature?: number;
  maxTokens?: number;
  /** Timeout en ms ; default 60_000 (1 min). OpenRouter répond en 2-15s typiquement. */
  timeoutMs?: number;
}

export interface MistralResult {
  raw: string;
  parsedJson: unknown | null;
  model: string;
  durationMs: number;
}

// ============================================================================
// Helpers privés
// ============================================================================

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

function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error(
      'OPENROUTER_API_KEY manquante. Configurer la variable dans .env (https://openrouter.ai/keys).',
    );
  }
  return key;
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getApiKey()}`,
    'Content-Type': 'application/json',
    // Headers conseillés par OpenRouter pour l'attribution / analytics
    'X-Title': process.env.NEXT_PUBLIC_APP_NAME ?? 'QualiOF',
  };
  const referer = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL;
  if (referer) headers['HTTP-Referer'] = referer;
  return headers;
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

// ============================================================================
// API publique — signature identique à l'ancien adapter SDK Mistral
// ============================================================================

export async function callMistral(opts: MistralCallOptions): Promise<MistralResult> {
  const model = opts.model ?? DEFAULT_TEXT_MODEL;
  const start = Date.now();
  const timeoutMs = opts.timeoutMs ?? 60_000;

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
    model,
    durationMs: Date.now() - start,
  };
}

export interface MistralVisionOptions {
  model?: string;
  imageBuffer: Buffer;
  /** MIME type de l'image (image/jpeg, image/png, image/webp). Default: image/jpeg. */
  mimeType?: string;
  prompt: string;
  systemPrompt?: string;
  jsonOutput?: boolean;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

/**
 * Appelle Pixtral via OpenRouter avec une image en input. L'image est encodée
 * en base64 et passée via le format OpenAI multi-part :
 *   { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,...' } }
 *
 * Cas d'usage : OCR de photos de CNI/RIB envoyées par les apprenants à la
 * place du PDF natif.
 */
export async function callMistralVision(
  opts: MistralVisionOptions,
): Promise<MistralResult> {
  const model = opts.model ?? DEFAULT_VISION_MODEL;
  const start = Date.now();
  const timeoutMs = opts.timeoutMs ?? 60_000;
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

  return { raw, parsedJson, model, durationMs: Date.now() - start };
}
