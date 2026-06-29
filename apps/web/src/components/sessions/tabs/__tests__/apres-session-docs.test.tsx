/* @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

/**
 * Phase 15 Lot 2 (15-02) Task 1 — TDD RED.
 *
 * Les 4 docs « niveau session » réembarqués dans `<TabApres>` (repris de
 * `SessionOnlyDocsBlock`, à supprimer) ont chacun un bouton câblé sur la BONNE
 * server action :
 *  - Déroulé                 → generateDerouleForProduct(productId, {force})
 *  - Grille obs session      → generateGrilleObsSessionForSession(sessionId, {force})
 *  - Checklist               → generateChecklistForSession(sessionId, {force})
 *  - Bilan satisfaction sess → generateSatisfactionSessionForSession(sessionId)
 *
 * Assertion sur l'action EXACTE appelée par bouton (branche cassable au gate).
 */

// --- mocks des 4 actions niveau session ------------------------------------
const generateDerouleForProduct = vi.fn(async (..._a: unknown[]) => ({ ok: true }));
const generateGrilleObsSessionForSession = vi.fn(async (..._a: unknown[]) => ({ ok: true }));
const generateChecklistForSession = vi.fn(async (..._a: unknown[]) => ({ ok: true }));
const generateSatisfactionSessionForSession = vi.fn(async (..._a: unknown[]) => ({ ok: true }));

vi.mock('@/server/actions/deroule-product-generator', () => ({
  generateDerouleForProduct: (...a: unknown[]) => generateDerouleForProduct(...a),
}));
vi.mock('@/server/actions/generate-grille-obs-session', () => ({
  generateGrilleObsSessionForSession: (...a: unknown[]) => generateGrilleObsSessionForSession(...a),
}));
vi.mock('@/server/actions/generate-checklist-formation', () => ({
  generateChecklistForSession: (...a: unknown[]) => generateChecklistForSession(...a),
}));
vi.mock('@/server/actions/generate-satisfaction-session', () => ({
  generateSatisfactionSessionForSession: (...a: unknown[]) => generateSatisfactionSessionForSession(...a),
}));

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import { TabApres } from '../tab-apres';

const SESSION_ID = 'sess-1';
const PRODUCT_ID = 'prod-1';

function renderTab() {
  return render(
    <TabApres
      sessionId={SESSION_ID}
      productId={PRODUCT_ID}
      canWrite
      sessionDocs={{
        deroule: { state: 'missing' },
        grilleObs: { state: 'missing' },
        checklist: { state: 'missing' },
        satisfactionSession: { state: 'missing' },
      }}
      closureItems={[{ state: 'missing' }, { state: 'generated' }]}
    />,
  );
}

beforeEach(() => {
  cleanup();
  generateDerouleForProduct.mockClear();
  generateGrilleObsSessionForSession.mockClear();
  generateChecklistForSession.mockClear();
  generateSatisfactionSessionForSession.mockClear();
  refresh.mockClear();
});

describe('TabApres — 4 docs niveau session câblés sur la bonne action', () => {
  it('Déroulé → generateDerouleForProduct', async () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /déroulé/i }));
    await waitFor(() => expect(generateDerouleForProduct).toHaveBeenCalledTimes(1));
    expect(generateDerouleForProduct.mock.calls[0]![0]).toBe(PRODUCT_ID);
    // les 3 autres ne bougent pas
    expect(generateGrilleObsSessionForSession).not.toHaveBeenCalled();
    expect(generateChecklistForSession).not.toHaveBeenCalled();
    expect(generateSatisfactionSessionForSession).not.toHaveBeenCalled();
  });

  it('Grille obs session → generateGrilleObsSessionForSession', async () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /grille/i }));
    await waitFor(() => expect(generateGrilleObsSessionForSession).toHaveBeenCalledTimes(1));
    expect(generateGrilleObsSessionForSession.mock.calls[0]![0]).toBe(SESSION_ID);
    expect(generateDerouleForProduct).not.toHaveBeenCalled();
  });

  it('Checklist → generateChecklistForSession', async () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /checklist/i }));
    await waitFor(() => expect(generateChecklistForSession).toHaveBeenCalledTimes(1));
    expect(generateChecklistForSession.mock.calls[0]![0]).toBe(SESSION_ID);
    expect(generateSatisfactionSessionForSession).not.toHaveBeenCalled();
  });

  it('Bilan satisfaction session → generateSatisfactionSessionForSession', async () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /bilan satisfaction/i }));
    await waitFor(() => expect(generateSatisfactionSessionForSession).toHaveBeenCalledTimes(1));
    expect(generateSatisfactionSessionForSession.mock.calls[0]![0]).toBe(SESSION_ID);
    expect(generateChecklistForSession).not.toHaveBeenCalled();
  });
});
