import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 17 Plan 17-03 — Task 1 : câblage `DOC_ENGINE_TOKEN` en `Authorization: Bearer`
 * sur les 2 fonctions de rendu PDF (Gotenberg multipart + WeasyPrint body string).
 *
 * Fondement Option A « dual-ingress public authentifié » (décision v6) : les doc-engines
 * seront exposés en HTTPS public (Phase 20/21), il faut un Bearer côté client dès maintenant.
 * Phase 17 câble UNIQUEMENT le CLIENT : le token est OPTIONNEL (header omis si absent →
 * dev local sans token non cassé). L'enforcement server-side est Phase 20/21.
 *
 * HERMÉTIQUE : vitest ne charge pas `.env`. On mocke :
 *   - `@qualiof/shared/env` DIRECTEMENT via un objet mutable `mockEnv` (contrôle
 *     `DOC_ENGINE_TOKEN` / `GOTENBERG_URL` / `WEASYPRINT_URL` par test) — ne JAMAIS
 *     importer un module qui exécute createEnv() au load (leçon 17-02).
 *   - `global.fetch` avec `vi.fn()` retournant `{ ok, arrayBuffer }`.
 *
 * Le code source construit un objet plain `Record<string,string>` pour les headers,
 * donc l'assertion lit directement `.Authorization` (pas de `Headers.get`).
 *
 * Coverage (4 comportements) :
 *  1. Gotenberg + token → fetch `/forms/chromium/convert/html` reçoit `Authorization: Bearer tok-abc`.
 *  2. Gotenberg multipart préservé → PAS de `Content-Type` manuel dans headers (boundary FormData auto).
 *  3. WeasyPrint + token → fetch `/pdf` reçoit `Authorization: Bearer tok-abc` ET `Content-Type: text/html; charset=utf-8` (coexistence).
 *  4. Sans token (dev local) → les 2 fonctions n'ajoutent AUCUN header Authorization et ne throw pas.
 *
 * PROTOCOLE DE MUTATION (non commité, à exécuter à la main pour prouver le garde —
 * feedback_test_de_puissance_mutation) :
 *   Dans pdf-render.ts, retirer l'ajout du Bearer (`headers: authHeaders()` sur Gotenberg
 *   OU `...authHeaders()` sur WeasyPrint).
 *   → Test 1 (Gotenberg) et/ou Test 3 (WeasyPrint) DOIVENT virer ROUGE.
 *   → restaurer → tout revient VERT.
 */

// `vi.hoisted` : le factory de `vi.mock` est hoisté au-dessus des `const` ; on
// déclare donc `mockEnv` dans un bloc hoisté pour qu'il soit initialisé AVANT
// que la source lise ses constantes top-level (`sharedEnv.GOTENBERG_URL`).
const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    DOC_ENGINE_TOKEN: undefined as string | undefined,
    GOTENBERG_URL: 'http://gotenberg.test:3001',
    WEASYPRINT_URL: 'http://weasyprint.test:5001',
  },
}));

vi.mock('@qualiof/shared/env', () => ({
  get sharedEnv() {
    return mockEnv;
  },
}));

const fetchMock = vi.fn();

import { renderHtmlToPdf, renderHtmlToPdfWeasy } from '@/lib/pdf-render';

describe('pdf-render — Bearer DOC_ENGINE_TOKEN (Plan 17-03 Task 1)', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    mockEnv.DOC_ENGINE_TOKEN = undefined;
    mockEnv.GOTENBERG_URL = 'http://gotenberg.test:3001';
    mockEnv.WEASYPRINT_URL = 'http://weasyprint.test:5001';
  });

  it('Test 1 — Gotenberg avec token → Authorization: Bearer', async () => {
    mockEnv.DOC_ENGINE_TOKEN = 'tok-abc';

    await renderHtmlToPdf('<p>x</p>');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://gotenberg.test:3001/forms/chromium/convert/html');
    const headers = (init as RequestInit).headers as Record<string, string>;
    // Assertion mutation-safe : câblage Bearer sur Gotenberg
    expect(headers.Authorization).toBe('Bearer tok-abc');
  });

  it('Test 2 — Gotenberg multipart préservé : PAS de Content-Type manuel', async () => {
    mockEnv.DOC_ENGINE_TOKEN = 'tok-abc';

    await renderHtmlToPdf('<p>x</p>');

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    // Boundary FormData auto → aucun Content-Type figé (sinon 400, tous les PDF cassent)
    expect(headers['Content-Type']).toBeUndefined();
    // Le body reste FormData (footer HTML dans body non régressé)
    expect((init as RequestInit).body).toBeInstanceOf(FormData);
  });

  it('Test 3 — WeasyPrint avec token → Authorization: Bearer ET Content-Type coexistent', async () => {
    mockEnv.DOC_ENGINE_TOKEN = 'tok-abc';

    await renderHtmlToPdfWeasy('<p>x</p>');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://weasyprint.test:5001/pdf');
    const headers = (init as RequestInit).headers as Record<string, string>;
    // Assertion mutation-safe : câblage Bearer sur WeasyPrint
    expect(headers.Authorization).toBe('Bearer tok-abc');
    // Le Content-Type existant coexiste avec le Bearer (spread)
    expect(headers['Content-Type']).toBe('text/html; charset=utf-8');
  });

  it('Test 4 — sans token (dev local) : aucun header Authorization, pas de throw', async () => {
    mockEnv.DOC_ENGINE_TOKEN = undefined;

    await expect(renderHtmlToPdf('<p>x</p>')).resolves.toBeInstanceOf(Buffer);
    const gotenbergHeaders = (fetchMock.mock.calls[0]![1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(gotenbergHeaders.Authorization).toBeUndefined();

    fetchMock.mockClear();

    await expect(renderHtmlToPdfWeasy('<p>x</p>')).resolves.toBeInstanceOf(Buffer);
    const weasyHeaders = (fetchMock.mock.calls[0]![1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(weasyHeaders.Authorization).toBeUndefined();
    // Content-Type WeasyPrint toujours présent sans token
    expect(weasyHeaders['Content-Type']).toBe('text/html; charset=utf-8');
  });
});
