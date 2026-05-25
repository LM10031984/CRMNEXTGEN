import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 13 Plan 13-05 Task 0 — Tests Wave 0 RED pour `classifyItem`.
 *
 * Stratégie de mock :
 *  - `@/lib/ai-ollama` (callOllama) mocké pour simuler 4 scénarios.
 *  - `@qualiof/db` (prisma.aIGenerationJob.create) mocké — vérifie tracing.
 *
 * Coverage (4 tests minimum) :
 *  1. Ollama JSON valide INDIC_23 conf=85 → ClassifyOutput correct + AIGenerationJob status='ok'.
 *  2. Ollama JSON malformé / Zod fail → null + AIGenerationJob status='error'.
 *  3. theme='OTHER' → ClassifyOutput renvoyé + AIGenerationJob status='skipped_other'.
 *  4. Ollama throw (timeout, HTTP error) → null + AIGenerationJob status='error'.
 *
 * Acceptance : modèle figé `mistral-small:24b` (D-06) — testable via mock.calls.
 */

const { callOllamaMock, aiGenJobCreate } = vi.hoisted(() => ({
  callOllamaMock: vi.fn(),
  aiGenJobCreate: vi.fn().mockResolvedValue({ id: 'gen-1' }),
}));
vi.mock('@/lib/ai-ollama', () => ({
  callOllama: callOllamaMock,
}));
vi.mock('@qualiof/db', () => ({
  prisma: {
    aIGenerationJob: { create: aiGenJobCreate },
  },
}));

import { classifyItem } from '../classify';

beforeEach(() => {
  callOllamaMock.mockReset();
  aiGenJobCreate.mockClear();
});

describe('classifyItem', () => {
  it('returns ClassifyOutput when Ollama returns valid JSON INDIC_23 confidence=85', async () => {
    callOllamaMock.mockResolvedValueOnce({
      raw: '{"theme":"INDIC_23","confidence":85,"exploitation_draft":"Action concrète : mettre à jour la procédure Qualiopi pour intégrer cette évolution."}',
      parsedJson: {
        theme: 'INDIC_23',
        confidence: 85,
        exploitation_draft:
          'Action concrète : mettre à jour la procédure Qualiopi pour intégrer cette évolution.',
      },
      model: 'mistral-small:24b',
      durationMs: 1234,
    });

    const out = await classifyItem(
      { title: 'Décret Qualiopi 2026', snippet: 'Lorem ipsum dolor', source: 'Ministère' },
      'tenant-1',
    );
    expect(out).not.toBeNull();
    expect(out?.theme).toBe('INDIC_23');
    expect(out?.confidence).toBe(85);
    expect(out?.exploitation_draft).toContain('Action concrète');
    // model figé D-06
    expect(callOllamaMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'mistral-small:24b' }),
    );
    // AIGenerationJob ok
    expect(aiGenJobCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          provider: 'ollama',
          model: 'mistral-small:24b',
          status: 'ok',
        }),
      }),
    );
  });

  it('returns null and logs AIGenerationJob status=error when Ollama JSON malformed', async () => {
    callOllamaMock.mockResolvedValueOnce({
      raw: 'not a json {{{',
      parsedJson: null,
      model: 'mistral-small:24b',
      durationMs: 800,
    });
    const out = await classifyItem(
      { title: 'x', snippet: 'y', source: 's' },
      'tenant-1',
    );
    expect(out).toBeNull();
    expect(aiGenJobCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'error' }),
      }),
    );
  });

  it('returns OTHER classification with AIGenerationJob status=skipped_other', async () => {
    callOllamaMock.mockResolvedValueOnce({
      raw: '{"theme":"OTHER","confidence":20,"exploitation_draft":"Hors scope Qualiopi."}',
      parsedJson: {
        theme: 'OTHER',
        confidence: 20,
        exploitation_draft: 'Hors scope Qualiopi.',
      },
      model: 'mistral-small:24b',
      durationMs: 800,
    });
    const out = await classifyItem(
      { title: 'Sport football PSG', snippet: 'résultat match', source: 'lequipe.fr' },
      'tenant-1',
    );
    expect(out?.theme).toBe('OTHER');
    expect(aiGenJobCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'skipped_other' }),
      }),
    );
  });

  it('returns null and logs AIGenerationJob status=error when Ollama throws (timeout)', async () => {
    callOllamaMock.mockRejectedValueOnce(new Error('Ollama timeout after 60000ms'));
    const out = await classifyItem(
      { title: 'x', snippet: 'y', source: 's' },
      'tenant-1',
    );
    expect(out).toBeNull();
    expect(aiGenJobCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'error',
          errorMsg: expect.stringContaining('Ollama timeout'),
        }),
      }),
    );
  });
});
