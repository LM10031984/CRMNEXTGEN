import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * L'appel d'extraction, vu depuis ses pannes.
 *
 * Ce qui est testé ici n'est pas la qualité du modèle — on ne teste pas un LLM.
 * C'est le comportement de QualiOF quand le modèle déraille : réponse coupée,
 * JSON hors format, appel qui échoue. Dans les trois cas, la règle est la même :
 * rien n'entre en base, et l'écran sait quoi dire au commercial.
 */

const { callLlmMock } = vi.hoisted(() => ({ callLlmMock: vi.fn() }));
vi.mock('@/lib/llm-client', () => ({ callLlm: callLlmMock }));

const { extraireDuTranscript } = await import('../extract');

const TRANSCRIPT = `Laurent : et le chiffre d'affaires ?
Dirigeant : on a fait 720 000 euros hors taxes sur 2025.`;

const reponseLlm = (parsedJson: unknown, extra: Record<string, unknown> = {}) => ({
  raw: JSON.stringify(parsedJson),
  parsedJson,
  model: 'anthropic/claude-sonnet-4.6',
  provider: 'openrouter' as const,
  durationMs: 4210,
  finishReason: 'stop',
  ...extra,
});

// On efface les appels, pas les implémentations : chaque test pose la sienne.
// Et une implémentation qui REJETTE se pose toujours avec `…Once` — installée
// durablement, elle survit au test et Vitest fait alors remonter son rejet
// comme s'il n'avait jamais été attrapé (convention déjà en place ailleurs
// dans la suite : `mockRejectedValueOnce`).
beforeEach(() => callLlmMock.mockClear());

describe('Le chemin nominal', () => {
  it('rend les réponses retenues et de quoi tracer la génération', async () => {
    callLlmMock.mockResolvedValue(
      reponseLlm({
        reponses: [
          {
            questionId: 'identity-revenue-n1',
            value: '720 000 €',
            confidence: 0.95,
            quote: 'on a fait 720 000 euros hors taxes sur 2025',
          },
        ],
      }),
    );

    const r = await extraireDuTranscript({
      transcript: TRANSCRIPT,
      variant: 'LEGER',
      existantes: [],
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.retenues).toEqual([
      expect.objectContaining({ questionId: 'identity-revenue-n1', value: 720000 }),
    ]);
    expect(r.meta.model).toBe('anthropic/claude-sonnet-4.6');
    expect(r.meta.promptVersion).toBe('transcript-v1');
    expect(r.meta.soumises).toBeGreaterThan(0);
  });

  it('ne soumet pas les questions déjà servies par le commercial', async () => {
    callLlmMock.mockResolvedValue(reponseLlm({ reponses: [] }));

    const sans = await extraireDuTranscript({
      transcript: TRANSCRIPT,
      variant: 'LEGER',
      existantes: [],
    });
    const avec = await extraireDuTranscript({
      transcript: TRANSCRIPT,
      variant: 'LEGER',
      existantes: [
        {
          questionId: 'identity-revenue-n1',
          value: 690000,
          isSkipped: false,
          origin: 'COMMERCIAL',
          confirmed: true,
        },
      ],
    });

    expect(sans.ok && avec.ok).toBe(true);
    if (!sans.ok || !avec.ok) return;
    expect(avec.meta.soumises).toBe(sans.meta.soumises - 1);
    // Et la question ne figure même plus dans le texte envoyé au modèle.
    const dernierPrompt = callLlmMock.mock.calls.at(-1)![0].prompt as string;
    expect(dernierPrompt).not.toContain('identity-revenue-n1');
  });

  it('rejette silencieusement une citation inventée — rien ne remonte à l’écran', async () => {
    callLlmMock.mockResolvedValue(
      reponseLlm({
        reponses: [
          {
            questionId: 'identity-revenue-n1',
            value: 850000,
            confidence: 0.99,
            quote: 'notre chiffre d’affaires s’élève à 850 000 euros',
          },
        ],
      }),
    );

    const r = await extraireDuTranscript({
      transcript: TRANSCRIPT,
      variant: 'LEGER',
      existantes: [],
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.retenues).toEqual([]);
    expect(r.rejets).toEqual([
      { questionId: 'identity-revenue-n1', motif: 'citation-absente' },
    ]);
  });
});

describe('Quand ça se passe mal', () => {
  it('ne dérange pas le modèle pour un transcript vide', async () => {
    const r = await extraireDuTranscript({ transcript: '   ', variant: 'LEGER', existantes: [] });
    expect(r).toEqual({ ok: false, erreur: 'transcript-vide' });
    expect(callLlmMock).not.toHaveBeenCalled();
  });

  it('nomme la réponse coupée pour ce qu’elle est — pas un « JSON invalide »', async () => {
    callLlmMock.mockResolvedValue(reponseLlm(null, { finishReason: 'length' }));
    const r = await extraireDuTranscript({
      transcript: TRANSCRIPT,
      variant: 'LEGER',
      existantes: [],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erreur).toBe('reponse-coupee');
    expect(r.detail).toContain('trop long');
  });

  it('refuse un JSON hors format plutôt que d’en deviner le sens', async () => {
    callLlmMock.mockResolvedValue(reponseLlm({ answers: [{ id: 'x' }] }));
    const r = await extraireDuTranscript({
      transcript: TRANSCRIPT,
      variant: 'LEGER',
      existantes: [],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erreur).toBe('json-hors-format');
  });

  it('attrape un appel qui échoue au lieu de faire tomber l’écran', async () => {
    callLlmMock.mockRejectedValueOnce(new Error('502 Bad Gateway'));
    const r = await extraireDuTranscript({
      transcript: TRANSCRIPT,
      variant: 'LEGER',
      existantes: [],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erreur).toBe('appel-echoue');
    expect(r.detail).toContain('502');
  });
});
