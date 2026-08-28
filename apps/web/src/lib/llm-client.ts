/**
 * Client LLM unifié — wrap Ollama (local) + OpenRouter (cloud).
 *
 * Switch par env var AI_PROVIDER :
 *   - "ollama"     → modèles locaux (mistral-small:24b, qwen3:30b-a3b, llama3.2-vision)
 *   - "openrouter" → gateway cloud unifié vers Claude/GPT/Mistral/Gemini
 *
 * Sélection du modèle par "tier" sémantique, pas par nom de modèle :
 *   - "fast"    → docs volume rapides (QCM, Analyse besoin, Positionnement, Satisfaction)
 *   - "quality" → docs critiques audit (Programme, Déroulé pédagogique)
 *   - "vision"  → OCR images (CNI, RIB, factures)
 *
 * Permet de basculer cloud/local sans toucher les call sites.
 * Migration v6 (branche cloud-migration, décision Laurent 2026-06-03).
 */

const PROVIDER = (process.env.AI_PROVIDER ?? 'ollama') as 'ollama' | 'openrouter';

// ─── Ollama (local) — défauts ──────────────────────────────────────
const OLLAMA_HOST = process.env.OLLAMA_URL ?? process.env.OLLAMA_HOST ?? 'http://localhost:11434';
const OLLAMA_MODEL_FAST = process.env.OLLAMA_MODEL_FAST ?? 'mistral-small:24b';
const OLLAMA_MODEL_QUALITY = process.env.OLLAMA_MODEL_REASONING ?? 'qwen3:30b-a3b';
const OLLAMA_MODEL_VISION = process.env.OLLAMA_MODEL_VISION ?? 'llama3.2-vision:11b';

// ─── OpenRouter (cloud) — défauts ──────────────────────────────────
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? '';
const OPENROUTER_MODEL_FAST = process.env.OPENROUTER_MODEL_FAST ?? 'anthropic/claude-haiku-4.5';
const OPENROUTER_MODEL_QUALITY = process.env.OPENROUTER_MODEL_QUALITY ?? 'anthropic/claude-sonnet-4.6';
const OPENROUTER_MODEL_VISION = process.env.OPENROUTER_MODEL_VISION ?? 'anthropic/claude-haiku-4.5';
const OPENROUTER_APP_NAME = process.env.OPENROUTER_APP_NAME ?? 'QualiOF';
const OPENROUTER_SITE_URL = process.env.OPENROUTER_SITE_URL ?? 'http://localhost:3010';

export type LlmTier = 'fast' | 'quality' | 'vision';

export interface LlmCallOptions {
  /** Tier sémantique — sélectionne le modèle selon AI_PROVIDER (défaut : 'fast'). */
  tier?: LlmTier;
  /** Override explicite du modèle (debug, A/B testing). */
  model?: string;
  systemPrompt?: string;
  prompt: string;
  jsonOutput?: boolean;
  temperature?: number;
  maxTokens?: number;
  /** Default 600s (Ollama lent sur Apple Silicon, OpenRouter ~30s suffisent). */
  timeoutMs?: number;
  /** Pour OCR vision (CNI/RIB/factures). Force tier='vision' implicitement. */
  imageBuffer?: Buffer;
}

export interface LlmResult {
  raw: string;
  parsedJson: unknown | null;
  model: string;
  provider: 'ollama' | 'openrouter';
  durationMs: number;
  /** Présent uniquement pour OpenRouter (Ollama local = pas de billing). */
  usageTokensIn?: number;
  usageTokensOut?: number;
  /**
   * Pourquoi le modèle s'est arrêté. `'length'` = réponse COUPÉE par
   * `maxTokens` : le JSON est alors tronqué et impossible à parser. Sans cette
   * information, l'appelant conclut à tort à un modèle capricieux et envoie
   * l'utilisateur « ajuster les paramètres » là où il fallait de la place
   * (constat du 28/08 sur la génération de programme).
   */
  finishReason?: string;
}

export function resolveModel(tier: LlmTier): string {
  if (PROVIDER === 'openrouter') {
    if (tier === 'fast') return OPENROUTER_MODEL_FAST;
    if (tier === 'quality') return OPENROUTER_MODEL_QUALITY;
    return OPENROUTER_MODEL_VISION;
  }
  if (tier === 'fast') return OLLAMA_MODEL_FAST;
  if (tier === 'quality') return OLLAMA_MODEL_QUALITY;
  return OLLAMA_MODEL_VISION;
}

export async function callLlm(opts: LlmCallOptions): Promise<LlmResult> {
  const tier = opts.imageBuffer ? 'vision' : (opts.tier ?? 'fast');
  const model = opts.model ?? resolveModel(tier);
  const start = Date.now();

  if (PROVIDER === 'openrouter') {
    return callOpenRouter({ ...opts, model, start });
  }
  return callOllama({ ...opts, model, start });
}

// ───────────────────────────────────────────────────────────────────
//  OpenRouter (OpenAI Chat Completions compatible API)
// ───────────────────────────────────────────────────────────────────

interface OpenRouterCallParams extends LlmCallOptions {
  model: string;
  start: number;
}

async function callOpenRouter(opts: OpenRouterCallParams): Promise<LlmResult> {
  if (!OPENROUTER_API_KEY) {
    throw new Error(
      'OPENROUTER_API_KEY manquante — renseigne .env.local ou bascule AI_PROVIDER="ollama" pour fallback local',
    );
  }

  const messages: Array<{ role: string; content: unknown }> = [];
  if (opts.systemPrompt) {
    messages.push({ role: 'system', content: opts.systemPrompt });
  }

  if (opts.imageBuffer) {
    // Vision : content multimodal (texte + image base64 inline).
    const mime = detectImageMime(opts.imageBuffer);
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: opts.prompt },
        {
          type: 'image_url',
          image_url: { url: `data:${mime};base64,${opts.imageBuffer.toString('base64')}` },
        },
      ],
    });
  } else {
    messages.push({ role: 'user', content: opts.prompt });
  }

  const body: Record<string, unknown> = {
    model: opts.model,
    messages,
    temperature: opts.temperature ?? 0.1,
    max_tokens: opts.maxTokens ?? 2048,
  };
  if (opts.jsonOutput) {
    body.response_format = { type: 'json_object' };
  }

  const timeoutMs = opts.timeoutMs ?? 120_000;
  const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      // Headers OpenRouter pour tracking et leaderboard
      'HTTP-Referer': OPENROUTER_SITE_URL,
      'X-Title': OPENROUTER_APP_NAME,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenRouter HTTP ${res.status} — ${txt.slice(0, 500)}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    error?: { message?: string };
  };

  if (json.error) {
    throw new Error(`OpenRouter error : ${json.error.message ?? JSON.stringify(json.error)}`);
  }

  const raw = json.choices?.[0]?.message?.content ?? '';
  const parsedJson = opts.jsonOutput ? tryParseJson(raw) : null;

  return {
    raw,
    parsedJson,
    model: opts.model,
    provider: 'openrouter',
    durationMs: Date.now() - opts.start,
    usageTokensIn: json.usage?.prompt_tokens,
    usageTokensOut: json.usage?.completion_tokens,
    finishReason: json.choices?.[0]?.finish_reason,
  };
}

// ───────────────────────────────────────────────────────────────────
//  Ollama (local, fallback)
// ───────────────────────────────────────────────────────────────────

interface OllamaCallParams extends LlmCallOptions {
  model: string;
  start: number;
}

async function callOllama(opts: OllamaCallParams): Promise<LlmResult> {
  const body: Record<string, unknown> = {
    model: opts.model,
    prompt: opts.prompt,
    stream: false,
    options: {
      temperature: opts.temperature ?? 0.1,
      num_predict: opts.maxTokens ?? 2048,
    },
  };
  if (opts.systemPrompt) body.system = opts.systemPrompt;
  if (opts.jsonOutput) body.format = 'json';
  if (opts.imageBuffer) {
    body.images = [opts.imageBuffer.toString('base64')];
  }

  const timeoutMs = opts.timeoutMs ?? 600_000;
  const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Ollama HTTP ${res.status} — ${txt.slice(0, 500)}`);
  }

  const json = (await res.json()) as { response?: string; error?: string };
  if (json.error) throw new Error(`Ollama error : ${json.error}`);

  const raw = json.response ?? '';
  const parsedJson = opts.jsonOutput ? tryParseJson(raw) : null;

  return {
    raw,
    parsedJson,
    model: opts.model,
    provider: 'ollama',
    durationMs: Date.now() - opts.start,
  };
}

// ───────────────────────────────────────────────────────────────────
//  Helpers
// ───────────────────────────────────────────────────────────────────

function tryParseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    // Certains modèles (qwen3, parfois Claude) wrappent en ```json ... ```
    // malgré response_format. Tente d'extraire le 1er {...} de la chaîne.
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

function detectImageMime(buf: Buffer): string {
  // Détection par magic bytes (suffisant pour PNG / JPEG / WebP / GIF)
  if (buf.length < 4) return 'image/jpeg';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return 'image/webp';
  return 'image/jpeg';
}

export const _internals = {
  PROVIDER,
  OPENROUTER_BASE_URL,
  OPENROUTER_APP_NAME,
};
