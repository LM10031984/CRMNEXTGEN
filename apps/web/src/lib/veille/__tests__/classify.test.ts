import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 16 Plan 16-02 — Tests `classifyItem` migrés vers `callLlm` (tier fast).
 *
 * Migration Ollama→Claude API (branche cloud-migration) : le call site veille
 * ne route plus `callOllama` en direct mais `callLlm({ tier: 'fast' })`
 * (gateway OpenRouter → Claude Haiku en fast). Le tracing AIGenerationJob lit
 * provider/model DYNAMIQUEMENT sur le résultat (r.provider / r.model).
 *
 * Stratégie de mock :
 *  - `@/lib/llm-client` (callLlm) mocké pour simuler 4 scénarios.
 *  - `@qualiof/db` (prisma.aIGenerationJob.create) mocké — vérifie tracing.
 *
 * HERMÉTIQUE : on mocke `@/lib/llm-client` directement (vitest ne charge pas
 * `.env` ; ne JAMAIS importer un module qui exécute createEnv() au load).
 *
 * Coverage (4 tests minimum) :
 *  1. callLlm JSON valide INDIC_23 conf=85 → ClassifyOutput correct + AIGenerationJob status='ok'.
 *  2. callLlm JSON malformé / Zod fail → null + AIGenerationJob status='error'.
 *  3. theme='OTHER' → ClassifyOutput renvoyé + AIGenerationJob status='skipped_other'.
 *  4. callLlm throw (timeout, HTTP error) → null + AIGenerationJob status='error'.
 *
 * Acceptance : appel routé tier='fast' — testable via mock.calls.
 *
 * PROTOCOLE DE MUTATION (non commité, à exécuter à la main pour prouver le garde) :
 *   Dans classify.ts, inverser `tier: 'fast'` → `tier: 'quality'`.
 *   → le Test 1 (`expect.objectContaining({ tier: 'fast' })`) DOIT virer ROUGE.
 *   → restaurer `tier: 'fast'` → tout revient VERT.
 *   Prouve que l'assertion garde bien le routage tier fast (feedback_test_de_puissance_mutation).
 */

const { callLlmMock, aiGenJobCreate } = vi.hoisted(() => ({
  callLlmMock: vi.fn(),
  aiGenJobCreate: vi.fn().mockResolvedValue({ id: 'gen-1' }),
}));
vi.mock('@/lib/llm-client', () => ({
  callLlm: callLlmMock,
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
  it('returns ClassifyOutput when callLlm returns valid JSON INDIC_23 confidence=85', async () => {
    callLlmMock.mockResolvedValueOnce({
      raw: '{"theme":"INDIC_23","confidence":85,"exploitation_draft":"Action concrète : mettre à jour la procédure Qualiopi pour intégrer cette évolution."}',
      parsedJson: {
        theme: 'INDIC_23',
        confidence: 85,
        exploitation_draft:
          'Action concrète : mettre à jour la procédure Qualiopi pour intégrer cette évolution.',
      },
      model: 'anthropic/claude-haiku-4.5',
      provider: 'openrouter',
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
    // Routage tier fast (mutation-safe) : inverser en 'quality' → ce test vire ROUGE.
    expect(callLlmMock).toHaveBeenCalledWith(expect.objectContaining({ tier: 'fast' }));
    // AIGenerationJob ok — provider/model tracés DYNAMIQUEMENT depuis le résultat.
    expect(aiGenJobCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          provider: 'openrouter',
          model: 'anthropic/claude-haiku-4.5',
          status: 'ok',
        }),
      }),
    );
  });

  it('returns null and logs AIGenerationJob status=error when callLlm JSON malformed', async () => {
    callLlmMock.mockResolvedValueOnce({
      raw: 'not a json {{{',
      parsedJson: null,
      model: 'anthropic/claude-haiku-4.5',
      provider: 'openrouter',
      durationMs: 800,
    });
    const out = await classifyItem({ title: 'x', snippet: 'y', source: 's' }, 'tenant-1');
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
      model: 'anthropic/claude-haiku-4.5',
      provider: 'openrouter',
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

  it('returns null and logs AIGenerationJob status=error when callLlm throws (timeout)', async () => {
    callLlmMock.mockRejectedValueOnce(new Error('OpenRouter timeout after 60000ms'));
    const out = await classifyItem({ title: 'x', snippet: 'y', source: 's' }, 'tenant-1');
    expect(out).toBeNull();
    // Dans le catch, r n'est pas défini → provider de repli non figé ici ;
    // on asserte seulement le statut d'erreur + le message tracé.
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
