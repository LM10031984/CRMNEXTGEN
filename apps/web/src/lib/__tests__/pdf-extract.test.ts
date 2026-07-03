import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 16 Plan 16-03 — Task 1 : OCR vision `extractTextFromImage` migré vers `callLlm`.
 *
 * Migration Ollama→Claude API (branche cloud-migration, pilier #4 pré-inscriptions IA) :
 * l'OCR vision ne route plus `callOllamaVision` (`@/lib/ai-ollama`) mais
 * `callLlm({ imageBuffer })` (`@/lib/llm-client`) → `imageBuffer` force le tier
 * vision (Claude Haiku vision en cloud, llama3.2-vision en local).
 *
 * HERMÉTIQUE : vitest ne charge pas `.env`. On mocke `@/lib/llm-client`
 * DIRECTEMENT (ne JAMAIS importer un module qui exécute createEnv() au load).
 * On teste UNIQUEMENT `extractTextFromImage` (input Buffer direct, mock callLlm) —
 * PAS de pdftoppm ni de réseau réel.
 *
 * Coverage (3 comportements) :
 *  1. callLlm appelé avec imageBuffer + raw non vide → { text, pages:1 } sans warning OCR-vide.
 *  2. callLlm raw '' → warning OCR quasi-vide + text ''.
 *  3. callLlm throw → catch → { text:'', pages:0, warnings:[...] } (échec → null-équivalent, PAS de stub).
 *
 * PROTOCOLE DE MUTATION (non commité, à exécuter à la main pour prouver le garde) :
 *   Dans pdf-extract.ts, retirer `imageBuffer: buffer` de l'appel callLlm.
 *   → le Test 1 (`expect.objectContaining({ imageBuffer })`) DOIT virer ROUGE.
 *   → restaurer → tout revient VERT.
 *   Prouve que l'assertion garde le routage vision (feedback_test_de_puissance_mutation).
 */

const { callLlmMock } = vi.hoisted(() => ({
  callLlmMock: vi.fn(),
}));

vi.mock('@/lib/llm-client', () => ({
  callLlm: callLlmMock,
}));

import { extractTextFromImage } from '@/lib/pdf-extract';

const IMG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]); // magic bytes JPEG

describe('extractTextFromImage → callLlm vision (Plan 16-03 Task 1)', () => {
  beforeEach(() => {
    callLlmMock.mockReset();
  });

  it('Test 1 — route vers callLlm avec imageBuffer, retourne { text, pages:1 }', async () => {
    callLlmMock.mockResolvedValue({
      raw: 'REPUBLIQUE FRANCAISE\nNOEL STEVE\n06 12 34 56 78',
      parsedJson: null,
      model: 'anthropic/claude-haiku-4.5',
      provider: 'openrouter',
      durationMs: 42,
    });

    const res = await extractTextFromImage(IMG);

    // Câblage vision : callLlm reçoit imageBuffer (assertion mutation-safe)
    expect(callLlmMock).toHaveBeenCalledTimes(1);
    expect(callLlmMock).toHaveBeenCalledWith(expect.objectContaining({ imageBuffer: IMG }));

    expect(res.pages).toBe(1);
    expect(res.text).toContain('NOEL STEVE');
    expect(res.warnings).toEqual([]);
  });

  it('Test 2 — raw vide → warning OCR quasi-vide, text ""', async () => {
    callLlmMock.mockResolvedValue({
      raw: '',
      parsedJson: null,
      model: 'anthropic/claude-haiku-4.5',
      provider: 'openrouter',
      durationMs: 10,
    });

    const res = await extractTextFromImage(IMG);

    expect(res.text).toBe('');
    expect(res.pages).toBe(1);
    expect(res.warnings.length).toBeGreaterThan(0);
    expect(res.warnings[0]).toMatch(/quasi-vide|vide/i);
  });

  it('Test 3 — callLlm throw → échec → { text:"", pages:0 } (PAS de stub)', async () => {
    callLlmMock.mockRejectedValue(new Error('OpenRouter HTTP 401 — no key'));

    const res = await extractTextFromImage(IMG);

    expect(res.text).toBe('');
    expect(res.pages).toBe(0);
    expect(res.warnings.length).toBeGreaterThan(0);
    // Message cloud-compatible : plus de référence à `ollama pull`
    expect(res.warnings.join(' ')).not.toMatch(/ollama pull/i);
  });
});
