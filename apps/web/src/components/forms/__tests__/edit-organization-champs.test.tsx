/* @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

/**
 * Constat Laurent du 02/09, sur AGENCE DE L'OLIVIER : « il affiche RCS —,
 * Type —, une adresse… mais quand je clique sur éditer je n'ai pas les champs
 * manquants ».
 *
 * La fiche entreprise montrait sept informations qu'aucun écran ne permettait
 * de saisir. Deux d'entre elles ne sont pas cosmétiques :
 *  - le REPRÉSENTANT LÉGAL : sans lui, `generateConventionEntrepriseCore`
 *    refuse net (« Représentée par , » n'est pas opposable). Il n'était
 *    saisissable que depuis le panneau documents d'une session — invisible
 *    pour qui ouvre la fiche entreprise ;
 *  - l'ADRESSE : elle figure sur la convention et dans le dossier OPCO.
 *
 * Règle que ce test protège : ce que la fiche AFFICHE doit être ÉDITABLE.
 *
 * Test de puissance : retirer le champ « Représentant légal » du dialogue, ou
 * cesser de le transmettre à `updateOrganization`, fait virer ce test au rouge.
 */

const { updateOrganizationMock } = vi.hoisted(() => ({ updateOrganizationMock: vi.fn() }));
vi.mock('@/server/actions/crud-edits', () => ({ updateOrganization: updateOrganizationMock }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const ACTUEL = {
  legalName: "AGENCE DE L'OLIVIER",
  legalForm: 'EI',
  siret: '33770050400018',
  siren: '337700504',
  naf: '6831Z',
  vatNumber: 'FR59337700504',
  email: 'info@agenceolivier.com',
  phone: '04 93 12 10 33',
  opcoCode: 'OPCO_EP',
  network: null,
  activityDescription: null,
  representative: null,
  rcs: null,
  type: null,
  brandName: null,
  addressStreet: null,
  addressPostalCode: null,
  addressCity: null,
};

afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
  updateOrganizationMock.mockResolvedValue({ ok: true });
});

async function ouvrirDialogue() {
  const { EditOrganizationButton } = await import('../edit-organization-button');
  render(<EditOrganizationButton organizationId="org-1" current={ACTUEL} />);
  fireEvent.click(screen.getByText(/Éditer la fiche/i));
}

describe('Éditer l’organisation — tout ce que la fiche affiche est saisissable', () => {
  it('expose le représentant légal, le RCS, le Type et l’adresse', async () => {
    await ouvrirDialogue();
    for (const libelle of [
      /Représentant légal/i,
      /^RCS$/i,
      /^Type$/i,
      /^Adresse$/i,
      /Code postal/i,
      /^Ville$/i,
      /Nom commercial/i,
    ]) {
      expect(screen.getByLabelText(libelle), `champ manquant : ${libelle}`).toBeDefined();
    }
  });

  it('conserve les champs qui existaient déjà', async () => {
    await ouvrirDialogue();
    for (const libelle of [/Raison sociale/i, /Forme juridique/i, /^SIRET$/i, /^SIREN$/i]) {
      expect(screen.getByLabelText(libelle)).toBeDefined();
    }
  });

  it('transmet le représentant et l’adresse à l’enregistrement', async () => {
    await ouvrirDialogue();

    fireEvent.change(screen.getByLabelText(/Représentant légal/i), {
      target: { value: 'Olivier MARTIN' },
    });
    fireEvent.change(screen.getByLabelText(/^Adresse$/i), { target: { value: '12 rue des Oliviers' } });
    fireEvent.change(screen.getByLabelText(/Code postal/i), { target: { value: '06800' } });
    fireEvent.change(screen.getByLabelText(/^Ville$/i), { target: { value: 'Cagnes-sur-Mer' } });
    fireEvent.change(screen.getByLabelText(/Forme juridique/i), { target: { value: 'SARL' } });

    fireEvent.click(screen.getByText(/Enregistrer/i));

    await waitFor(() => expect(updateOrganizationMock).toHaveBeenCalled());
    expect(updateOrganizationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        legalForm: 'SARL',
        representative: 'Olivier MARTIN',
        addressStreet: '12 rue des Oliviers',
        addressPostalCode: '06800',
        addressCity: 'Cagnes-sur-Mer',
      }),
    );
  });
});
