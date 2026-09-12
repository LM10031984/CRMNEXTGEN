/* @vitest-environment jsdom */

/**
 * La fiche organisation s'ouvre PAR URL sur son champ financeur — correction
 * n°7 bis de Laurent (11/09/2026, cas A).
 *
 * CE QUI MANQUAIT. `EditOrganizationButton` éditait déjà `opcoCode`, mais sa
 * modale était pilotée par un `useState` local : rien, depuis une autre page, ne
 * pouvait l'ouvrir. Or le cas A de l'avertissement « régime incohérent » — le
 * commanditaire est le BON, il lui manque son code financeur — n'a rien à
 * corriger sur l'inscription. Il doit mener ICI.
 *
 * ⚠ LE PIÈGE DE C.2b-5 NE SE REPOSE PAS ICI, et c'est pour ça que la cible est
 * une autre page : les panneaux d'onglet inactifs sont `hidden` (donc
 * `display:none`), ce qui masque jusqu'aux enfants `position:fixed`. Sur
 * `/app/organisations/{id}` il n'y a pas d'onglet — la modale est visible.
 * Ce qui doit être VÉRIFIÉ, en revanche, c'est le RETOUR : d'où le dernier
 * describe, qui monte le lien de retour tel qu'il sera rendu À L'ARRIVÉE.
 *
 * ⚠ `vitest` n'a pas `globals: true` : sans `beforeEach(cleanup)`, le DOM du
 * test précédent survit et rend tous les `queryBy*` menteurs.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

// --- next/navigation ---------------------------------------------------------
let parametresCourants = new URLSearchParams('');
function poserUrl(qs: string) {
  parametresCourants = new URLSearchParams(qs);
}
const replace = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh, push: vi.fn() }),
  useSearchParams: () => parametresCourants,
  usePathname: () => '/app/organisations/org-roussel',
}));

const updateOrganization = vi.fn(async (..._a: unknown[]) => ({ ok: true as const }));
vi.mock('@/server/actions/crud-edits', () => ({
  updateOrganization: (...a: unknown[]) => updateOrganization(...a),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { EditOrganizationButton } from '../edit-organization-button';
import { BackToListLink } from '@/components/ui/back-to-list-link';
import {
  LIBELLE_CHAMP_FINANCEUR_ORG,
  lienRenseignerFinanceur,
  retourVersOnglet,
} from '@/lib/sessions/lien-renseigner-financeur';

const ORG_ID = 'org-roussel';

function monter() {
  return render(
    <EditOrganizationButton
      organizationId={ORG_ID}
      current={{
        legalName: 'DEMO-SIG ROUSSEL Camille, EI',
        legalForm: 'AUTO_ENTREPRENEUR',
        opcoCode: null,
      }}
    />,
  );
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  poserUrl('');
  updateOrganization.mockResolvedValue({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('ouverture pilotée par l’URL', () => {
  it('?champ=financeur ouvre la fiche SANS aucun clic', async () => {
    poserUrl('champ=financeur&from=%2Fapp%2Fsessions%2Fsess-1%3Ftab%3Davant');
    monter();

    expect(await screen.findByLabelText(LIBELLE_CHAMP_FINANCEUR_ORG)).toBeTruthy();
  });

  it('PUISSANCE — sans `champ=` dans l’URL, la modale reste FERMÉE', async () => {
    monter();
    await waitFor(() =>
      expect(screen.queryByLabelText(LIBELLE_CHAMP_FINANCEUR_ORG)).toBeNull(),
    );
    // …et le bouton local continue de l'ouvrir.
    fireEvent.click(screen.getByRole('button', { name: /Éditer la fiche/i }));
    expect(await screen.findByLabelText(LIBELLE_CHAMP_FINANCEUR_ORG)).toBeTruthy();
  });

  it('le champ financeur est mis EN ÉVIDENCE et prend le focus', async () => {
    poserUrl('champ=financeur');
    monter();

    const champ = await screen.findByLabelText(LIBELLE_CHAMP_FINANCEUR_ORG);
    await waitFor(() => expect(document.activeElement).toBe(champ));
    expect(champ.closest('[data-champ-en-evidence="true"]')).not.toBeNull();
  });

  it('ouverture au clic : aucune mise en évidence', async () => {
    monter();
    fireEvent.click(screen.getByRole('button', { name: /Éditer la fiche/i }));
    const champ = await screen.findByLabelText(LIBELLE_CHAMP_FINANCEUR_ORG);
    expect(champ.closest('[data-champ-en-evidence="true"]')).toBeNull();
  });

  it('PUISSANCE — refermer efface `champ=` et PRÉSERVE `from=` : ni boucle, ni retour perdu', async () => {
    poserUrl('champ=financeur&from=%2Fapp%2Fsessions%2Fsess-1%3Ftab%3Davant');
    monter();

    await screen.findByLabelText(LIBELLE_CHAMP_FINANCEUR_ORG);
    fireEvent.click(screen.getByRole('button', { name: /Annuler/i }));

    await waitFor(() => expect(replace).toHaveBeenCalled());
    const url = replace.mock.calls[0]![0] as string;
    expect(url).not.toContain('champ=');
    expect(url).toContain('from=%2Fapp%2Fsessions%2Fsess-1%3Ftab%3Davant');
  });

  it('enregistrer écrit bien `opcoCode` et referme sans recharger la page', async () => {
    poserUrl('champ=financeur');
    monter();

    const champ = await screen.findByLabelText(LIBELLE_CHAMP_FINANCEUR_ORG);
    fireEvent.change(champ, { target: { value: 'AGEFICE' } });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/i }));

    await waitFor(() => expect(updateOrganization).toHaveBeenCalledTimes(1));
    expect(
      (updateOrganization.mock.calls[0]![0] as { opcoCode: string | null }).opcoCode,
    ).toBe('AGEFICE');
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});

/**
 * LE RETOUR, VÉRIFIÉ À L'ARRIVÉE — pas supposé.
 *
 * Le lien produit par `lienRenseignerFinanceur` porte un `from=`. Ce qui suit
 * monte le composant qui le LIT sur la fiche organisation, avec la valeur
 * exacte que le lien y a mise, et vérifie où il ramène. Un `from` mal encodé ou
 * refusé par `parseFrom` produirait ici « Retour à la liste » vers
 * `/app/organisations` — et personne ne s'en apercevrait.
 */
describe('retour vers la session, à l’arrivée sur la fiche organisation', () => {
  function fromDuLien(onglet: 'avant' | 'apres'): string {
    const url = lienRenseignerFinanceur({
      organizationId: ORG_ID,
      retourVers: retourVersOnglet('sess-1', onglet),
    });
    return new URLSearchParams(url.split('?')[1]).get('from') ?? '';
  }

  it('le bouton retour ramène sur l’onglet « Avant » de la session, et le DIT', () => {
    render(
      <BackToListLink
        fallbackHref="/app/organisations"
        label="Retour à la liste"
        from={fromDuLien('avant')}
      />,
    );
    const lien = screen.getByRole('link');
    expect(lien.getAttribute('href')).toBe('/app/sessions/sess-1?tab=avant');
    expect(lien.textContent).toContain('Retour à la session');
  });

  it('depuis l’onglet Après, il ramène sur Après', () => {
    render(
      <BackToListLink
        fallbackHref="/app/organisations"
        label="Retour à la liste"
        from={fromDuLien('apres')}
      />,
    );
    expect(screen.getByRole('link').getAttribute('href')).toBe('/app/sessions/sess-1?tab=apres');
  });
});
