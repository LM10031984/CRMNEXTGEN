import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 16 Plan 16-03 — Task 2 : extraction texte OCR-isé migrée vers `callLlm` tier fast.
 *
 * Migration Ollama→Claude API (branche cloud-migration, PILIER #4 pré-inscriptions IA,
 * chemin PII CNI/RIB/CFP). `extractOne` ne route plus `callOllama`
 * (`@/lib/ai-ollama`, modèle Ollama codé en dur) mais `callLlm({ tier: 'fast' })`
 * (`@/lib/llm-client`) — le modèle est gouverné par resolveModel selon AI_PROVIDER
 * (Haiku cloud / mistral-small local). Le champ persisté `aiModel` devient dynamique.
 *
 * HERMÉTIQUE : vitest ne charge pas `.env`. On mocke `@/lib/llm-client` et
 * `@/lib/pdf-extract` DIRECTEMENT (ne JAMAIS importer un module qui exécute
 * createEnv() au load). Cible = `extractDocsFromBuffers` (fonction PURE, aucun
 * side-effect DB → pas besoin de mocker prisma).
 *
 * Coverage :
 *  1. Câblage tier fast : callLlm appelé avec objectContaining({ tier:'fast', jsonOutput:true }).
 *  2. Pas de chemin Ollama : callLlm est la SEULE source LLM (mock unique) — garanti par mock + grep acceptance.
 *  3. Échec → null : callLlm renvoie { parsedJson: null } → champ résultat null (PAS de stub).
 *
 * PROTOCOLE DE MUTATION (non commité, à exécuter à la main pour prouver le garde) :
 *   Dans preinscription-extractor.ts, casser le câblage — retirer `tier: 'fast'`
 *   (ou remettre `callOllama`).
 *   → le Test 1 (`expect.objectContaining({ tier: 'fast' })`) DOIT virer ROUGE.
 *   → restaurer → tout revient VERT.
 *   Prouve que l'assertion garde le routage tier fast sur le chemin PII
 *   (feedback_test_de_puissance_mutation).
 */

const { callLlmMock, resolveModelMock, extractTextFromFileMock } = vi.hoisted(() => ({
  callLlmMock: vi.fn(),
  resolveModelMock: vi.fn(() => 'cloud-fast'),
  extractTextFromFileMock: vi.fn(),
}));

vi.mock('@/lib/llm-client', () => ({
  callLlm: callLlmMock,
  resolveModel: resolveModelMock,
}));

vi.mock('@/lib/pdf-extract', () => ({
  extractTextFromFile: extractTextFromFileMock,
}));

// Phase 17-02 : `@/lib/storage` consomme désormais `sharedEnv` (createEnv au load).
// L'extracteur l'importe statiquement (downloadFile/PREENROLLMENT_BUCKET) mais
// `extractDocsFromBuffers` (chemin buffer) ne l'appelle jamais. Mock hermétique
// pour respecter la règle « ne JAMAIS importer un module qui exécute createEnv() ».
vi.mock('@/lib/storage', () => ({
  downloadFile: vi.fn(),
  PREENROLLMENT_BUCKET: 'preinscriptions',
}));

import { extractDocsFromBuffers } from '@/lib/preinscription-extractor';

const BUF = Buffer.from('MR NOEL STEVE 12 RUE DES LILAS 06140 VENCE');

describe('extractDocsFromBuffers → callLlm tier fast (Plan 16-03 Task 2, PII)', () => {
  beforeEach(() => {
    callLlmMock.mockReset();
    resolveModelMock.mockReset().mockReturnValue('cloud-fast');
    extractTextFromFileMock.mockReset().mockResolvedValue({
      text: 'MR NOEL STEVE 12 RUE DES LILAS 06140 VENCE — texte OCR-isé > 20 caractères',
      pages: 1,
      warnings: [],
    });
  });

  it('Test 1 — câblage tier fast + jsonOutput (assertion mutation-safe)', async () => {
    callLlmMock.mockResolvedValue({
      raw: '{"firstName":"STEVE","lastName":"NOEL"}',
      parsedJson: { firstName: 'STEVE', lastName: 'NOEL' },
      model: 'cloud-fast',
      provider: 'openrouter',
      durationMs: 30,
    });

    const res = await extractDocsFromBuffers([
      { kind: 'CFP', buffer: BUF, contentType: 'text/plain' },
    ]);

    expect(callLlmMock).toHaveBeenCalledTimes(1);
    expect(callLlmMock).toHaveBeenCalledWith(
      expect.objectContaining({ tier: 'fast', jsonOutput: true }),
    );
    // callLlm est la SEULE source LLM appelée (pas de chemin Ollama)
    expect(res.cfp).toEqual({ firstName: 'STEVE', lastName: 'NOEL' });
  });

  it('Test 2 — mock unique callLlm = pas de chemin Ollama exercé', async () => {
    callLlmMock.mockResolvedValue({
      raw: '{"iban":"FR76"}',
      parsedJson: { iban: 'FR76', bic: null },
      model: 'cloud-fast',
      provider: 'openrouter',
      durationMs: 20,
    });

    await extractDocsFromBuffers([{ kind: 'RIB', buffer: BUF, contentType: 'text/plain' }]);

    // La seule voie LLM est le mock : aucun appel réseau Ollama réel.
    expect(callLlmMock).toHaveBeenCalledTimes(1);
    const arg = callLlmMock.mock.calls[0]?.[0] ?? {};
    expect(arg).not.toHaveProperty('model'); // resolveModel gouverne (pas de modèle codé)
  });

  it('Test 3 — parsedJson null → champ résultat null (PAS de stub)', async () => {
    callLlmMock.mockResolvedValue({
      raw: 'not json',
      parsedJson: null,
      model: 'cloud-fast',
      provider: 'openrouter',
      durationMs: 15,
    });

    const res = await extractDocsFromBuffers([
      { kind: 'CNI', buffer: BUF, contentType: 'text/plain' },
    ]);

    expect(res.cni).toBeNull();
  });
});
