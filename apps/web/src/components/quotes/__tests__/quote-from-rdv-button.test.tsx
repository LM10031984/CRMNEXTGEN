/* @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

/**
 * « Je mets juste le nombre de jours et le tarif, une case où je colle mon
 * retranscript, et j'ai un devis propre » — Laurent, 28/08.
 *
 * L'écran ne demande que ce que Laurent SAIT au retour du rendez-vous. Tout le
 * reste — intitulé, argumentaire, modules — est déduit du compte rendu.
 *
 * Test de puissance : retirer le calcul du total prévisionnel fait virer ROUGE
 * « annonce le montant avant de lancer ».
 */

const { createQuoteFromRdvMock, pushMock } = vi.hoisted(() => ({
  createQuoteFromRdvMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock('@/server/actions/quote-from-rdv', () => ({
  createQuoteFromRdv: createQuoteFromRdvMock,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock, refresh: vi.fn() }) }));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), loading: vi.fn(), dismiss: vi.fn() },
}));

afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
  createQuoteFromRdvMock.mockResolvedValue({ ok: true, quoteId: 'q-1', number: 'DEV-0001' });
});

async function ouvrir() {
  const { QuoteFromRdvButton } = await import('../quote-from-rdv-button');
  render(<QuoteFromRdvButton />);
  fireEvent.click(screen.getByRole('button', { name: /compte rendu/i }));
}

function soumettre() {
  // jsdom ne déclenche pas la soumission au clic d'un bouton `type="submit"`.
  // On soumet le formulaire — c'est ce que fait le navigateur derrière ce clic.
  const form = screen.getByRole('button', { name: /Générer le devis/i }).closest('form')!;
  fireEvent.submit(form);
}

function remplir() {
  fireEvent.change(screen.getByLabelText(/Client/i), { target: { value: 'ASSALIT SYNDIC' } });
  fireEvent.change(screen.getByLabelText(/Nombre de jours/i), { target: { value: '3' } });
  fireEvent.change(screen.getByLabelText(/Tarif journalier/i), { target: { value: '1200' } });
  fireEvent.change(screen.getByLabelText(/Compte rendu/i), {
    target: { value: 'Le client a 8 négociateurs, ses mandats dorment.' },
  });
}

describe('QuoteFromRdvButton', () => {
  it('annonce le montant avant de lancer', async () => {
    await ouvrir();
    remplir();
    // 3 jours × 1 200 € : Laurent voit ce que le client va lire.
    expect(screen.getByText(/3\s?600/)).toBeDefined();
  });

  it('transmet la saisie et le compte rendu à l’action', async () => {
    await ouvrir();
    remplir();
    soumettre();

    await waitFor(() => expect(createQuoteFromRdvMock).toHaveBeenCalled());
    expect(createQuoteFromRdvMock.mock.calls[0]![0]).toMatchObject({
      recipientName: 'ASSALIT SYNDIC',
      jours: 3,
      tarifJourHT: 1200,
      creerProgramme: false,
    });
    expect(createQuoteFromRdvMock.mock.calls[0]![0].transcript).toContain('8 négociateurs');
  });

  it('crée aussi le programme quand la case est cochée', async () => {
    await ouvrir();
    remplir();
    fireEvent.click(screen.getByLabelText(/programme de formation/i));
    soumettre();

    await waitFor(() => expect(createQuoteFromRdvMock).toHaveBeenCalled());
    expect(createQuoteFromRdvMock.mock.calls[0]![0].creerProgramme).toBe(true);
  });

  it('ouvre le devis produit', async () => {
    await ouvrir();
    remplir();
    soumettre();
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/app/devis/q-1'));
  });

  it('garde la saisie à l’écran quand la génération échoue', async () => {
    createQuoteFromRdvMock.mockResolvedValue({ ok: false, error: 'Compte rendu inexploitable' });
    await ouvrir();
    remplir();
    soumettre();

    expect(await screen.findByText(/Compte rendu inexploitable/i)).toBeDefined();
    // Rien n'est perdu : le compte rendu collé est toujours là.
    expect((screen.getByLabelText(/Compte rendu/i) as HTMLTextAreaElement).value).toContain(
      '8 négociateurs',
    );
    expect(pushMock).not.toHaveBeenCalled();
  });
});
