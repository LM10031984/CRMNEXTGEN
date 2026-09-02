/* @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

/**
 * Inscription d'un apprenant SANS casquette — friction remontée par Laurent le
 * 28/08 : « si l'apprenant n'existe pas je dois repartir dans les apprenants,
 * le créer, etc. ».
 *
 * Le picker refusait net une personne sans LegalLink (« Crée d'abord un
 * LegalLink depuis sa fiche », TODO palier 2.2bis) : il fallait quitter la
 * session, aller sur la fiche apprenant, rattacher l'entreprise, revenir.
 *
 * Attendu : le picker propose de rattacher l'entreprise SUR PLACE (recherche
 * d'une organisation existante ou création), choisit le rôle, crée le lien et
 * finalise la sélection.
 *
 * Test de puissance : remplacer le panneau de rattachement par le `return`
 * historique fait virer ROUGE « propose de rattacher une entreprise ».
 */

const { searchPersonsMock, searchOrganizationsMock, createLegalLinkMock, createOrganizationMock } =
  vi.hoisted(() => ({
    searchPersonsMock: vi.fn(),
    searchOrganizationsMock: vi.fn(),
    createLegalLinkMock: vi.fn(),
    createOrganizationMock: vi.fn(),
  }));

vi.mock('@/server/actions/persons', () => ({ searchPersons: searchPersonsMock }));
vi.mock('@/server/actions/legal-links', () => ({
  searchOrganizations: searchOrganizationsMock,
  createLegalLink: createLegalLinkMock,
}));
vi.mock('@/server/actions/crud-edits', () => ({ createOrganization: createOrganizationMock }));
vi.mock('sonner', () => ({ toast: { warning: vi.fn(), error: vi.fn(), success: vi.fn() } }));

const SANS_CASQUETTE = {
  id: 'per-1',
  firstName: 'Camille',
  lastName: 'Nouvelle',
  email: 'camille@ex.fr',
  legalLinks: [],
};

afterEach(() => cleanup());

beforeEach(() => {
  vi.clearAllMocks();
  searchPersonsMock.mockResolvedValue([SANS_CASQUETTE]);
  searchOrganizationsMock.mockResolvedValue([
    { id: 'org-1', legalName: 'ASSALIT SYNDIC', legalForm: 'SARL', siret: null, opcoCode: null },
  ]);
  createLegalLinkMock.mockResolvedValue({ ok: true, id: 'link-1' });
  createOrganizationMock.mockResolvedValue({ ok: true, orgId: 'org-neuve' });
});

async function ouvrirSurPersonneSansCasquette() {
  const onChange = vi.fn();
  const { PersonOrOrgPicker } = await import('../person-or-org-picker');
  render(<PersonOrOrgPicker onChange={onChange} defaultQuery="Camille" />);
  fireEvent.focus(screen.getByPlaceholderText(/Rechercher un apprenant/i));
  const ligne = await screen.findByText(/Camille/, {}, { timeout: 2000 });
  fireEvent.click(ligne.closest('button')!);
  return onChange;
}

describe('PersonOrOrgPicker — apprenant sans casquette', () => {
  it('propose de rattacher une entreprise sur place, sans quitter la session', async () => {
    await ouvrirSurPersonneSansCasquette();
    expect(await screen.findByText(/Rattacher une entreprise/i)).toBeDefined();
  });

  it('crée le lien juridique avec le rôle choisi puis sélectionne l’apprenant', async () => {
    const onChange = await ouvrirSurPersonneSansCasquette();
    await screen.findByText(/Rattacher une entreprise/i);

    fireEvent.change(screen.getByLabelText(/Rôle/i), { target: { value: 'SALARIE' } });
    fireEvent.click(await screen.findByText('ASSALIT SYNDIC'));

    await waitFor(() => expect(createLegalLinkMock).toHaveBeenCalled());
    expect(createLegalLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({ personId: 'per-1', organizationId: 'org-1', role: 'SALARIE' }),
    );
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ personId: 'per-1', sponsorOrgId: 'org-1', role: 'SALARIE' }),
      ),
    );
  });

  /**
   * Rôle jamais présumé : un SALARIE par défaut pourrissait les données
   * (recommandation d'audit reprise dans `addParticipant`).
   */
  it('n’enregistre rien tant que le rôle n’est pas choisi', async () => {
    await ouvrirSurPersonneSansCasquette();
    await screen.findByText(/Rattacher une entreprise/i);

    fireEvent.click(await screen.findByText('ASSALIT SYNDIC'));

    await new Promise((r) => setTimeout(r, 50));
    expect(createLegalLinkMock).not.toHaveBeenCalled();
  });
});

/**
 * Retour Laurent du 02/09 (cas AGENCE DE L'OLIVIER / SES-0109) : « quand je crée
 * l'entreprise par la session je devrais pouvoir rentrer les champs de
 * l'entreprise et là on me le propose même pas ».
 *
 * Le formulaire ne demandait que raison sociale + forme juridique. L'entreprise
 * naissait donc SANS représentant, SANS SIRET et SANS adresse — et trois
 * semaines plus tard la convention d'entreprise était refusée faute de
 * signataire, sans que rien n'ait signalé le manque au bon moment.
 *
 * Test de puissance : retirer le champ « Représentant légal » du formulaire, ou
 * cesser de le transmettre à `createOrganization`, fait virer ce test au rouge.
 */
describe('PersonOrOrgPicker — création d’entreprise depuis la session', () => {
  async function ouvrirFormulaireCreation() {
    await ouvrirSurPersonneSansCasquette();
    await screen.findByText(/Rattacher une entreprise/i);
    fireEvent.click(screen.getByText(/Créer une entreprise/i));
  }

  it('demande le représentant, le SIRET et l’adresse — pas seulement la raison sociale', async () => {
    await ouvrirFormulaireCreation();
    expect(screen.getByLabelText(/Raison sociale/i)).toBeDefined();
    expect(screen.getByLabelText(/Forme juridique/i)).toBeDefined();
    expect(screen.getByLabelText(/Représentant légal/i)).toBeDefined();
    expect(screen.getByLabelText(/SIRET/i)).toBeDefined();
    expect(screen.getByLabelText(/^Adresse$/i)).toBeDefined();
    expect(screen.getByLabelText(/Code postal/i)).toBeDefined();
    expect(screen.getByLabelText(/Ville/i)).toBeDefined();
  });

  it('transmet ces champs à la création — sinon ils sont perdus pour toujours', async () => {
    await ouvrirFormulaireCreation();

    fireEvent.change(screen.getByLabelText(/Rôle/i), { target: { value: 'SALARIE' } });
    fireEvent.change(screen.getByLabelText(/Raison sociale/i), {
      target: { value: "AGENCE DE L'OLIVIER" },
    });
    fireEvent.change(screen.getByLabelText(/Forme juridique/i), { target: { value: 'SAS' } });
    fireEvent.change(screen.getByLabelText(/Représentant légal/i), {
      target: { value: 'Olivier Martin' },
    });
    fireEvent.change(screen.getByLabelText(/SIRET/i), { target: { value: '83879522700019' } });
    fireEvent.change(screen.getByLabelText(/^Adresse$/i), { target: { value: '3 rue Gambetta' } });
    fireEvent.change(screen.getByLabelText(/Code postal/i), { target: { value: '06800' } });
    fireEvent.change(screen.getByLabelText(/Ville/i), { target: { value: 'Cagnes-sur-Mer' } });

    fireEvent.click(screen.getByText(/Créer et rattacher/i));

    await waitFor(() => expect(createOrganizationMock).toHaveBeenCalled());
    expect(createOrganizationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        legalName: "AGENCE DE L'OLIVIER",
        legalForm: 'SAS',
        representative: 'Olivier Martin',
        siret: '83879522700019',
        addressStreet: '3 rue Gambetta',
        addressPostalCode: '06800',
        addressCity: 'Cagnes-sur-Mer',
      }),
    );
  });

  it('laisse créer avec la seule raison sociale — on n’empêche pas d’aller vite', async () => {
    await ouvrirFormulaireCreation();
    fireEvent.change(screen.getByLabelText(/Rôle/i), { target: { value: 'SALARIE' } });
    fireEvent.change(screen.getByLabelText(/Raison sociale/i), { target: { value: 'RAPIDE SARL' } });
    fireEvent.click(screen.getByText(/Créer et rattacher/i));

    await waitFor(() => expect(createOrganizationMock).toHaveBeenCalled());
    expect(createOrganizationMock).toHaveBeenCalledWith(
      expect.objectContaining({ legalName: 'RAPIDE SARL', representative: null, siret: null }),
    );
  });
});
