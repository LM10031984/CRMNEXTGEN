import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Réponse TRONQUÉE par la limite de tokens — remontée de Laurent le 28/08 :
 * « le modèle n'a pas trouvé de JSON valide, réessaie ou ajuste les paramètres ».
 *
 * La cause n'est pas un modèle capricieux : quand la réponse dépasse
 * `max_tokens`, le fournisseur coupe au milieu du JSON. Le message d'erreur
 * envoyait alors chercher un problème de prompt, là où il fallait de la place.
 *
 * Le client doit donc REMONTER l'information (`finishReason`), pour que
 * l'appelant dise ce qui s'est réellement passé.
 *
 * Test de puissance : ne plus propager `finish_reason` fait virer ROUGE
 * « signale une réponse coupée ».
 */

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.stubGlobal('fetch', fetchMock);

vi.mock('@qualiof/db', () => ({ prisma: { aIGenerationJob: { create: vi.fn() } } }));

function reponse(finishReason: string, content: string) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content }, finish_reason: finishReason }],
      usage: { prompt_tokens: 100, completion_tokens: 4096 },
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AI_PROVIDER = 'openrouter';
  process.env.OPENROUTER_API_KEY = 'sk-test';
});

describe('callLlm — réponse coupée par la limite de tokens', () => {
  it('signale une réponse coupée', async () => {
    fetchMock.mockResolvedValue(reponse('length', '{"objectives": ["a", "b"'));
    const { callLlm } = await import('@/lib/llm-client');
    const r = await callLlm({ tier: 'quality', prompt: 'x', jsonOutput: true });

    expect(r.finishReason).toBe('length');
    expect(r.parsedJson).toBeNull();
  });

  it('ne crie pas au loup sur une réponse complète', async () => {
    fetchMock.mockResolvedValue(reponse('stop', '{"objectives": ["a"]}'));
    const { callLlm } = await import('@/lib/llm-client');
    const r = await callLlm({ tier: 'quality', prompt: 'x', jsonOutput: true });

    expect(r.finishReason).toBe('stop');
    expect(r.parsedJson).toEqual({ objectives: ['a'] });
  });
});
