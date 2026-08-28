/* @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

/**
 * « Je voudrais pouvoir générer un programme sans générer de session » +
 * « je voudrais lui mettre ce que j'ai proposé au client et qu'elle me le
 * retranscrive » — Laurent, 28/08.
 *
 * Le formulaire complet (tous les champs Qualiopi, programme éditable,
 * pré-remplissage IA) n'existait que DANS le wizard de session : pour obtenir
 * un programme travaillé, il fallait commencer une session. La page Produits
 * n'offrait qu'un formulaire minimal, sans champ programme ni relecture.
 *
 * Test de puissance : ne plus passer `propositionClient` à `aiPreFillProduct`
 * fait virer ROUGE « transmet la proposition à l'IA ».
 */

const { aiPreFillMock, createProductMock, pushMock } = vi.hoisted(() => ({
  aiPreFillMock: vi.fn(),
  createProductMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock('@/server/actions/ai-fill-product', () => ({ aiPreFillProduct: aiPreFillMock }));
vi.mock('@/server/actions/crud-edits', () => ({ createTrainingProduct: createProductMock }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock, refresh: vi.fn() }) }));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn(), dismiss: vi.fn() },
}));

const DRAFT = {
  objectives: ['Auditer son portefeuille'],
  targetAudience: 'Conseillers',
  prerequisites: 'Aucun',
  pedagogicalMethods: 'Présentiel',
  pedagogicalSupport: 'Livret',
  evaluationMethods: '- QCM',
  trainerProfile: 'Formateurs',
  accessibility: 'La loi du 5 septembre 2018…',
  accessConditions: 'Afin de vous inscrire…',
  programMd: '## Jour 1\n- Auditer le portefeuille',
};

afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
  aiPreFillMock.mockResolvedValue({ ok: true, draft: DRAFT });
  createProductMock.mockResolvedValue({ ok: true, productId: 'prod-9', code: 'PROD-0099' });
});

async function ouvrir() {
  const { QuickCreateProductButton } = await import('../quick-create-product');
  render(<QuickCreateProductButton label="Nouveau programme" />);
  fireEvent.click(screen.getByRole('button', { name: /Nouveau programme/i }));
}

describe('Création de programme — contexte donné à l’IA', () => {
  it('s’utilise sans session : aucun callback requis', async () => {
    await ouvrir();
    expect(screen.getByLabelText(/Intitulé/i)).toBeDefined();
  });

  it('transmet la proposition client à l’IA', async () => {
    await ouvrir();
    fireEvent.change(screen.getByLabelText(/Intitulé/i), {
      target: { value: 'Prospecter avec l’IA' },
    });
    fireEvent.change(screen.getByLabelText(/Durée/i), { target: { value: '21' } });
    fireEvent.change(screen.getByLabelText(/proposé au client/i), {
      target: { value: 'Module 1 : audit du portefeuille' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Pré-remplir avec l['’]IA/i }));

    await waitFor(() => expect(aiPreFillMock).toHaveBeenCalled());
    expect(aiPreFillMock.mock.calls[0]![0]).toMatchObject({
      title: 'Prospecter avec l’IA',
      durationHours: 21,
      propositionClient: 'Module 1 : audit du portefeuille',
    });
  });

  it('ouvre le programme créé quand on ne vient pas d’un wizard', async () => {
    await ouvrir();
    fireEvent.change(screen.getByLabelText(/Intitulé/i), { target: { value: 'Prospection' } });
    fireEvent.change(screen.getByLabelText(/Durée/i), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: /^Créer/i }));

    await waitFor(() => expect(createProductMock).toHaveBeenCalled());
    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith('/app/produits/prod-9?tab=programme'),
    );
  });
});
