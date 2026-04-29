/**
 * Adapter Ollama HTTP — extraction structurée par appel local.
 *
 * Modèle par défaut : qwen3:30b-a3b (déjà installé chez l'utilisateur).
 * Format JSON imposé via `format: 'json'` côté Ollama, on parse en JS.
 */

const OLLAMA_HOST = process.env.OLLAMA_URL ?? process.env.OLLAMA_HOST ?? 'http://localhost:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL_REASONING ?? process.env.OLLAMA_DEFAULT_MODEL ?? 'qwen3:30b-a3b';
const VISION_MODEL = process.env.OLLAMA_MODEL_VISION ?? 'qwen2.5vl:7b';

export interface OllamaCallOptions {
  model?: string;
  systemPrompt?: string;
  prompt: string;
  jsonOutput?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export interface OllamaResult {
  raw: string;
  parsedJson: unknown | null;
  model: string;
  durationMs: number;
}

export async function callOllama(opts: OllamaCallOptions): Promise<OllamaResult> {
  const model = opts.model ?? DEFAULT_MODEL;
  const start = Date.now();

  const body: Record<string, unknown> = {
    model,
    prompt: opts.prompt,
    stream: false,
    options: {
      temperature: opts.temperature ?? 0.1,
      num_predict: opts.maxTokens ?? 2048,
    },
  };
  if (opts.systemPrompt) body.system = opts.systemPrompt;
  if (opts.jsonOutput) body.format = 'json';

  const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Ollama HTTP ${res.status} — ${txt.slice(0, 300)}`);
  }
  const json = (await res.json()) as { response?: string; error?: string };
  if (json.error) throw new Error(`Ollama error : ${json.error}`);
  const raw = json.response ?? '';

  let parsedJson: unknown | null = null;
  if (opts.jsonOutput) {
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      // qwen3 wraps parfois en ```json ... ``` malgré format:json. Tente d'extraire.
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          parsedJson = JSON.parse(m[0]);
        } catch {
          parsedJson = null;
        }
      }
    }
  }

  return {
    raw,
    parsedJson,
    model,
    durationMs: Date.now() - start,
  };
}

export interface OllamaVisionOptions {
  model?: string;            // override OLLAMA_VISION_MODEL
  imageBuffer: Buffer;       // image binaire (jpg/png/webp)
  prompt: string;            // ce qu'on demande au modèle de faire avec l'image
  systemPrompt?: string;
  jsonOutput?: boolean;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Appelle un modèle vision Ollama (qwen2.5vl, llava, minicpm-v…) avec une
 * image en input. L'image est encodée en base64 et passée via le champ
 * `images` accepté par /api/generate.
 *
 * Cas d'usage : OCR de photos de CNI/RIB envoyées par les apprenants à la
 * place du PDF natif.
 */
export async function callOllamaVision(opts: OllamaVisionOptions): Promise<OllamaResult> {
  const model = opts.model ?? VISION_MODEL;
  const start = Date.now();

  const body: Record<string, unknown> = {
    model,
    prompt: opts.prompt,
    images: [opts.imageBuffer.toString('base64')],
    stream: false,
    options: {
      temperature: opts.temperature ?? 0.1,
      num_predict: opts.maxTokens ?? 2048,
    },
  };
  if (opts.systemPrompt) body.system = opts.systemPrompt;
  if (opts.jsonOutput) body.format = 'json';

  const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Ollama vision HTTP ${res.status} — ${txt.slice(0, 300)}`);
  }
  const json = (await res.json()) as { response?: string; error?: string };
  if (json.error) throw new Error(`Ollama vision error : ${json.error}`);
  const raw = json.response ?? '';

  let parsedJson: unknown | null = null;
  if (opts.jsonOutput) {
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          parsedJson = JSON.parse(m[0]);
        } catch {
          parsedJson = null;
        }
      }
    }
  }

  return { raw, parsedJson, model, durationMs: Date.now() - start };
}
