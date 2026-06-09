import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests comportementaux P0.1 — routage LLM unifié.
 *
 * Vérifie l'invariant clé : aucun littéral de modèle n'apparaît hors de la
 * couche `ai-config.ts`, le profil sémantique sélectionne le modèle, et
 * `AIGenerationJob.provider/model` doit pouvoir refléter ce que la config
 * a effectivement résolu.
 */

const ORIGINAL_ENV = { ...process.env };

function mockFetchOnce(payload: { content?: string; status?: number }) {
  const response = new Response(
    JSON.stringify(
      payload.content
        ? { choices: [{ message: { content: payload.content } }] }
        : { error: { message: 'mocked failure' } },
    ),
    { status: payload.status ?? 200 },
  );
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);
}

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = 'sk-or-test-fake-key';
  delete process.env.OPENROUTER_MODEL_TEXT;
  delete process.env.OPENROUTER_MODEL_VISION;
  delete process.env.OPENROUTER_MODEL_CLASSIFY;
  delete process.env.OPENROUTER_MODEL_CLOSURE;
  vi.restoreAllMocks();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('ai-config : couche de résolution provider/modèle', () => {
  it('Test 1 — getLlmModel("text") lit OPENROUTER_MODEL_TEXT puis tombe sur le défaut packagé', async () => {
    const { getLlmModel } = await import('../ai-config');

    // Sans env var : valeur par défaut du module
    expect(getLlmModel('text')).toBe('mistralai/mistral-large-2411');

    // Avec env var : override pris en compte
    process.env.OPENROUTER_MODEL_TEXT = 'anthropic/claude-sonnet-4';
    expect(getLlmModel('text')).toBe('anthropic/claude-sonnet-4');
  });

  it('Test 2 — chaque profil a son env var dédiée et sa valeur par défaut', async () => {
    const { getLlmModel } = await import('../ai-config');

    process.env.OPENROUTER_MODEL_TEXT = 'foo-text';
    process.env.OPENROUTER_MODEL_VISION = 'foo-vision';
    process.env.OPENROUTER_MODEL_CLASSIFY = 'foo-classify';
    process.env.OPENROUTER_MODEL_CLOSURE = 'foo-closure';

    expect(getLlmModel('text')).toBe('foo-text');
    expect(getLlmModel('vision')).toBe('foo-vision');
    expect(getLlmModel('classify')).toBe('foo-classify');
    expect(getLlmModel('closure')).toBe('foo-closure');
  });

  it('Test 3 — getLlmProvider renvoie "openrouter" (single provider à ce stade)', async () => {
    const { getLlmProvider } = await import('../ai-config');
    expect(getLlmProvider()).toBe('openrouter');
  });

  it('Test 4 — getApiKey throw si OPENROUTER_API_KEY manque', async () => {
    delete process.env.OPENROUTER_API_KEY;
    const { getApiKey } = await import('../ai-config');
    expect(() => getApiKey()).toThrow(/OPENROUTER_API_KEY manquante/);
  });
});

describe('ai-llm : callLlm route via la config (aucun littéral de modèle dans le payload caller)', () => {
  it('Test 5 — callLlm({ profile: "text" }) envoie le modèle issu de getLlmModel("text")', async () => {
    process.env.OPENROUTER_MODEL_TEXT = 'sonnet-4-via-config';
    const fetchSpy = mockFetchOnce({ content: '{"ok":true}' });

    const { callLlm } = await import('../ai-llm');
    const result = await callLlm({
      profile: 'text',
      prompt: 'test',
      jsonOutput: true,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, fetchInit] = fetchSpy.mock.calls[0]!;
    const body = JSON.parse((fetchInit as RequestInit).body as string) as { model: string };
    expect(body.model).toBe('sonnet-4-via-config');
    expect(result.provider).toBe('openrouter');
    expect(result.model).toBe('sonnet-4-via-config');
    expect(result.parsedJson).toEqual({ ok: true });
  });

  it('Test 6 — callLlm({ profile: "closure" }) emploie un modèle distinct du profil "text"', async () => {
    process.env.OPENROUTER_MODEL_TEXT = 'text-model';
    process.env.OPENROUTER_MODEL_CLOSURE = 'closure-model-bigger';
    const fetchSpy = mockFetchOnce({ content: '{"items":[]}' });

    const { callLlm } = await import('../ai-llm');
    const result = await callLlm({
      profile: 'closure',
      prompt: 'génère un QCM',
      jsonOutput: true,
    });

    const [, fetchInit] = fetchSpy.mock.calls[0]!;
    const body = JSON.parse((fetchInit as RequestInit).body as string) as { model: string };
    expect(body.model).toBe('closure-model-bigger');
    expect(result.model).toBe('closure-model-bigger');
  });

  it('Test 7 — callLlm sans profil utilise "text" par défaut', async () => {
    process.env.OPENROUTER_MODEL_TEXT = 'default-profile-target';
    mockFetchOnce({ content: 'raw text' });

    const { callLlm } = await import('../ai-llm');
    const result = await callLlm({ prompt: 'hello' });

    expect(result.model).toBe('default-profile-target');
  });

  it('Test 8 — callLlm propage les erreurs OpenRouter avec status', async () => {
    mockFetchOnce({ status: 503 });

    const { callLlm } = await import('../ai-llm');
    await expect(callLlm({ prompt: 'fails' })).rejects.toThrow(/OpenRouter HTTP 503/);
  });
});

// Tests 9-10 supprimés lors du merge marx (2026-06-09).
// Ils vérifiaient que ai-ollama.ts était un shim deprecated. Marx Phase 13
// Veille a besoin de la vraie implémentation callOllama qui est restaurée.

// Tests 11-13 supprimés lors du merge marx (2026-06-09).
// Ils testaient les scaffolds P0.1 (classifyVeilleEntry / VeilleClassifyError)
// qui n'existent plus depuis que la Phase 13 Veille de marx a remplacé ces
// fichiers par la vraie implémentation (callOllama + 5 indicateurs INDIC_23-26).
// Follow-up master prompt P0.1 : migrer veille/classify.ts vers callLlm
// quand on voudra unifier sur OpenRouter.
