import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 13 Plan 13-05 Task 0 — Tests pour `classifyItem`.
 *
 * Refactor 2026-06-10 : callOllama → callLlm (profil 'classify').
 *
 * Stratégie de mock :
 *  - `@/lib/ai-llm` (callLlm) mocké pour simuler 4 scénarios.
 *  - `@/lib/ai-config` (getLlmModel/getLlmProvider) mocké pour le model/provider tracé.
 *  - `@qualiof/db` (prisma.aIGenerationJob.create) mocké — vérifie tracing.
 *
 * Coverage (4 tests minimum) :
 *  1. LLM JSON valide INDIC_23 conf=85 → ClassifyOutput correct + AIGenerationJob status='ok'.
 *  2. LLM JSON malformé / Zod fail → null + AIGenerationJob status='error'.
 *  3. theme='OTHER' → ClassifyOutput renvoyé + AIGenerationJob status='skipped_other'.
 *  4. LLM throw (timeout, HTTP error) → null + AIGenerationJob status='error'.
 */

const { callLlmMock, aiGenJobCreate, getLlmModelMock, getLlmProviderMock } =
  vi.hoisted(() => ({
    callLlmMock: vi.fn(),
    aiGenJobCreate: vi.fn().mockResolvedValue({ id: 'gen-1' }),
    getLlmModelMock: vi.fn().mockReturnValue('mistralai/mistral-small-2402'),
    getLlmProviderMock: vi.fn().mockReturnValue('openrouter'),
  }));
vi.mock('@/lib/ai-llm', () => ({
  callLlm: callLlmMock,
}));
vi.mock('@/lib/ai-config', () => ({
  getLlmModel: getLlmModelMock,
  getLlmProvider: getLlmProviderMock,
}));
vi.mock('@qualiof/db', () => ({
  prisma: {
    aIGenerationJob: { create: aiGenJobCreate },
  },
}));

import { classifyItem } from '../classify';

beforeEach(() => {
  callLlmMock.mockReset();
  aiGenJobCreate.mockClear();
});

describe('classifyItem', () => {
  it('returns ClassifyOutput when LLM returns valid JSON INDIC_23 confidence=85', async () => {
    callLlmMock.mockResolvedValueOnce({
      raw: '{"theme":"INDIC_23","confidence":85,"exploitation_draft":"Action concrète : mettre à jour la procédure Qualiopi pour intégrer cette évolution."}',
      parsedJson: {
        theme: 'INDIC_23',
        confidence: 85,
        exploitation_draft:
          'Action concrète : mettre à jour la procédure Qualiopi pour intégrer cette évolution.',
      },
      provider: 'openrouter',
      model: 'mistralai/mistral-small-2402',
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
    // Le profil 'classify' est explicitement passé à callLlm
    expect(callLlmMock).toHaveBeenCalledWith(
      expect.objectContaining({ profile: 'classify', jsonOutput: true }),
    );
    // AIGenerationJob ok avec provider/model issus de callLlm
    expect(aiGenJobCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          provider: 'openrouter',
          model: 'mistralai/mistral-small-2402',
          status: 'ok',
        }),
      }),
    );
  });

  it('returns null and logs AIGenerationJob status=error when LLM JSON malformed', async () => {
    callLlmMock.mockResolvedValueOnce({
      raw: 'not a json {{{',
      parsedJson: null,
      provider: 'openrouter',
      model: 'mistralai/mistral-small-2402',
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
    callLlmMock.mockResolvedValueOnce({
      raw: '{"theme":"OTHER","confidence":20,"exploitation_draft":"Hors scope Qualiopi."}',
      parsedJson: {
        theme: 'OTHER',
        confidence: 20,
        exploitation_draft: 'Hors scope Qualiopi.',
      },
      provider: 'openrouter',
      model: 'mistralai/mistral-small-2402',
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

  it('returns null and logs AIGenerationJob status=error when LLM throws (timeout)', async () => {
    callLlmMock.mockRejectedValueOnce(new Error('OpenRouter timeout after 60000ms'));
    const out = await classifyItem(
      { title: 'x', snippet: 'y', source: 's' },
      'tenant-1',
    );
    expect(out).toBeNull();
    expect(aiGenJobCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'error',
          errorMsg: expect.stringContaining('OpenRouter timeout'),
        }),
      }),
    );
  });
});
