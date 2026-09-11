/* @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

/**
 * Recherche de lieu sur la fiche session — demande de Laurent du 11/09/2026 :
 * « je peux aller le choisir dans le menu déroulant, mais est-il possible de
 * créer la petite loupe pour ne pas avoir à aller le chercher dans toute la
 * liste ? » (59 lieux en base).
 *
 * Le filtrage lui-même est verrouillé par `filtrer-lieux.test.ts` (module pur).
 * Ici on couvre l'INTERACTION, c'est-à-dire ce qui casse le plus souvent dans
 * ce repo : la sélection à la souris (le blur de l'input refermait la liste
 * avant le clic — d'où `onMouseDown` et non `onClick`) et le fait qu'on ne
 * puisse pas « Définir » un lieu qu'on ne voit plus.
 *
 * Test de puissance : repasser la sélection en `onClick` fait virer ROUGE
 * « choisit un lieu à la souris » ; retirer le `setSelected('')` de la saisie
 * fait virer ROUGE « retaper invalide le lieu déjà choisi ».
 */

const { listLocationsMock, updateSessionLocationMock, refreshMock } = vi.hoisted(() => ({
  listLocationsMock: vi.fn(),
  updateSessionLocationMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock('@/server/actions/sessions', () => ({
  listLocations: listLocationsMock,
  updateSessionLocation: updateSessionLocationMock,
  createLocationAndAttachToSession: vi.fn(),
  updateLocationDetails: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }));

import { SessionLocationPicker } from '../session-location-picker';

const LIEUX = [
  {
    id: 'loc-nice',
    name: 'Agence Nice Centre',
    legalName: "SARL L'Agence Signature",
    address: { street: '12 rue Masséna', postalCode: '06000', city: 'Nice' },
  },
  {
    id: 'loc-cagnes',
    name: 'Start Academy Cagnes',
    legalName: 'Start Academy',
    address: { street: '12 avenue des Camélias', postalCode: '06800', city: 'Cagnes-sur-Mer' },
  },
  {
    id: 'loc-lyon',
    name: 'Espace Bellecour',
    legalName: 'SAS Bellecour Formation',
    address: { street: '3 place Bellecour', postalCode: '69002', city: 'Lyon' },
  },
];

beforeEach(() => {
  listLocationsMock.mockResolvedValue(LIEUX);
  updateSessionLocationMock.mockReset().mockResolvedValue({ ok: true });
  refreshMock.mockClear();
});
afterEach(cleanup);

async function monterEtOuvrir() {
  render(<SessionLocationPicker sessionId="ses-1" currentLocation={null} />);
  const champ = await screen.findByPlaceholderText(/Rechercher un lieu/i);
  fireEvent.focus(champ);
  return champ as HTMLInputElement;
}

describe('SessionLocationPicker — recherche de lieu', () => {
  it('réduit la liste à mesure qu’on tape', async () => {
    const champ = await monterEtOuvrir();
    expect(await screen.findByText('Agence Nice Centre')).toBeTruthy();
    expect(screen.getByText('Espace Bellecour')).toBeTruthy();

    fireEvent.change(champ, { target: { value: 'nice' } });

    await waitFor(() => expect(screen.queryByText('Espace Bellecour')).toBeNull());
    expect(screen.getByText('Agence Nice Centre')).toBeTruthy();
  });

  it('trouve par code postal, pas seulement par nom', async () => {
    const champ = await monterEtOuvrir();
    fireEvent.change(champ, { target: { value: '69002' } });

    await waitFor(() => expect(screen.getByText('Espace Bellecour')).toBeTruthy());
    expect(screen.queryByText('Agence Nice Centre')).toBeNull();
  });

  it('choisit un lieu à la souris, puis « Définir » l’enregistre', async () => {
    const champ = await monterEtOuvrir();
    fireEvent.change(champ, { target: { value: 'cagnes' } });

    const option = await screen.findByText('Start Academy Cagnes');
    // mousedown : c'est l'événement que le composant écoute, parce que le blur
    // de l'input refermerait la liste avant un clic.
    fireEvent.mouseDown(option);

    await waitFor(() => expect(champ.value).toContain('Start Academy Cagnes'));

    fireEvent.click(screen.getByRole('button', { name: /Définir/i }));

    await waitFor(() =>
      expect(updateSessionLocationMock).toHaveBeenCalledWith({
        sessionId: 'ses-1',
        locationId: 'loc-cagnes',
      }),
    );
  });

  it('retaper invalide le lieu déjà choisi — on ne définit pas un lieu qu’on ne voit plus', async () => {
    const champ = await monterEtOuvrir();
    fireEvent.change(champ, { target: { value: 'cagnes' } });
    fireEvent.mouseDown(await screen.findByText('Start Academy Cagnes'));
    await waitFor(() => expect(champ.value).toContain('Start Academy Cagnes'));

    fireEvent.change(champ, { target: { value: 'lyo' } });

    const definir = screen.getByRole('button', { name: /Définir/i }) as HTMLButtonElement;
    expect(definir.disabled).toBe(true);
    fireEvent.click(definir);
    expect(updateSessionLocationMock).not.toHaveBeenCalled();
  });

  it('annonce clairement une recherche sans résultat', async () => {
    const champ = await monterEtOuvrir();
    fireEvent.change(champ, { target: { value: 'marseille' } });

    expect(await screen.findByText(/Aucun lieu ne correspond/i)).toBeTruthy();
  });
});
