/* @vitest-environment jsdom */

/**
 * Le champ « Financeur de l'inscription » dans le formulaire d'édition d'une
 * inscription — décision Laurent du 11/09/2026 (retours d'écran C.2b, point 7).
 *
 * CE QUE CE FICHIER GARDE.
 *
 *  1. LE LIBELLÉ EXACT, et sa DISTINCTION d'avec « Mode de financement ». Les
 *     deux champs coexistent désormais dans la même modale, et ils ne disent pas
 *     la même chose : le mode dit COMMENT c'est financé, le financeur dit PAR
 *     QUI l'inscription est portée. Deux `<select>` voisins sans cette levée
 *     d'ambiguïté, c'est la garantie que quelqu'un corrigera le mauvais.
 *
 *  2. L'OUVERTURE PAR URL. Le lien qui pointera ce formulaire vit dans un AUTRE
 *     onglet : l'ouverture doit être pilotée par `?inscription=…&champ=financeur`,
 *     pas par un état local qui ne franchit pas cette distance.
 *
 *  3. LE RETOUR SUR L'ONGLET D'ORIGINE une fois l'édition terminée (`?retour=`).
 *
 *  4. QU'UN REFUS SERVEUR S'AFFICHE, ET ARRÊTE TOUT. C'est le test de puissance
 *     du fichier : si le changement de financeur est refusé (dossier parti,
 *     pièce signée) mais que `updateParticipant` part quand même, l'écran
 *     enregistre à moitié, affiche une erreur, et l'admin ne sait plus ce qui a
 *     été écrit.
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
  usePathname: () => '/app/sessions/ses-0048',
}));

// --- server actions ----------------------------------------------------------
const updateParticipant = vi.fn(async (..._a: unknown[]) => ({ ok: true as const }));
vi.mock('@/server/actions/sessions', () => ({
  updateParticipant: (...a: unknown[]) => updateParticipant(...a),
}));

const listerFinanceursPossibles = vi.fn(async (..._a: unknown[]) => ({
  ok: true as const,
  financeurs: [
    { id: 'org-ei', label: 'MARION DELAUNAY EI', legalName: 'MARION DELAUNAY EI', siret: null, opcoCode: 'AGEFICE' },
    { id: 'org-sigma', label: 'Sigma', legalName: 'SIGMA IMMOBILIER', siret: null, opcoCode: 'OPCO_EP' },
  ],
  financeurActuelId: 'org-ei' as string | null,
}));
const changerFinanceurInscription = vi.fn(async (..._a: unknown[]) => ({ ok: true as const }));
vi.mock('@/server/actions/participant-sponsor', () => ({
  listerFinanceursPossibles: (...a: unknown[]) => listerFinanceursPossibles(...a),
  changerFinanceurInscription: (...a: unknown[]) => changerFinanceurInscription(...a),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { EditParticipantButton } from '../edit-participant-button';

const PARTICIPANT_ID = 'part-marion';
const LIBELLE_FINANCEUR = "Financeur de l'inscription";
const LIBELLE_MODE = 'Mode de financement';

function monter(participantId = PARTICIPANT_ID) {
  return render(
    <EditParticipantButton
      participantId={participantId}
      currentPriceHT={2000}
      currentStatus="VALIDATED"
      currentFinancingMode="OPCO"
      currentFinancingRequestDate={null}
    />,
  );
}

/** Ouvre la modale au clic et attend que la liste des financeurs soit chargée. */
async function ouvrirAuClic() {
  monter();
  fireEvent.click(screen.getByRole('button', { name: /Éditer/i }));
  return screen.findByLabelText(LIBELLE_FINANCEUR);
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  poserUrl('');
  listerFinanceursPossibles.mockResolvedValue({
    ok: true,
    financeurs: [
      { id: 'org-ei', label: 'MARION DELAUNAY EI', legalName: 'MARION DELAUNAY EI', siret: null, opcoCode: 'AGEFICE' },
      { id: 'org-sigma', label: 'Sigma', legalName: 'SIGMA IMMOBILIER', siret: null, opcoCode: 'OPCO_EP' },
    ],
    financeurActuelId: 'org-ei',
  });
  updateParticipant.mockResolvedValue({ ok: true });
  changerFinanceurInscription.mockResolvedValue({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('le champ existe, sous le bon nom, et ne se confond pas avec le mode', () => {
  it('le libellé est EXACTEMENT « Financeur de l’inscription »', async () => {
    const champ = await ouvrirAuClic();
    expect(champ).toBeTruthy();
    expect(screen.getByText(LIBELLE_FINANCEUR)).toBeTruthy();
  });

  it('PUISSANCE — les DEUX champs coexistent et sont des contrôles DISTINCTS', async () => {
    await ouvrirAuClic();
    const financeur = screen.getByLabelText(LIBELLE_FINANCEUR);
    const mode = screen.getByLabelText(LIBELLE_MODE);
    expect(financeur).not.toBe(mode);
    // Deux <select> voisins qui porteraient le même id seraient indiscernables
    // pour un lecteur d'écran comme pour un test.
    expect((financeur as HTMLSelectElement).id).not.toBe((mode as HTMLSelectElement).id);
  });

  it('l’écran lève l’ambiguïté : COMMENT (mode) vs PAR QUI (financeur)', async () => {
    await ouvrirAuClic();
    expect(screen.getByText(/COMMENT/)).toBeTruthy();
    expect(screen.getByText(/PAR QUI/)).toBeTruthy();
  });

  it('le financeur courant est présélectionné — l’écran ne ment pas sur l’état réel', async () => {
    const champ = (await ouvrirAuClic()) as HTMLSelectElement;
    expect(champ.value).toBe('org-ei');
    expect(listerFinanceursPossibles).toHaveBeenCalledWith({ participantId: PARTICIPANT_ID });
  });
});

describe('ouverture pilotée par l’URL', () => {
  it('?inscription=<id>&champ=financeur ouvre le formulaire SANS aucun clic', async () => {
    poserUrl(`inscription=${PARTICIPANT_ID}&champ=financeur&retour=avant`);
    monter();

    expect(await screen.findByLabelText(LIBELLE_FINANCEUR)).toBeTruthy();
  });

  it('PUISSANCE — l’URL ne vise QUE l’inscription nommée : les autres lignes restent fermées', async () => {
    poserUrl(`inscription=${PARTICIPANT_ID}&champ=financeur`);
    monter('part-clothilde');

    // Laisse le temps à un éventuel effet d'ouverture de partir.
    await waitFor(() => expect(listerFinanceursPossibles).not.toHaveBeenCalled());
    expect(screen.queryByLabelText(LIBELLE_FINANCEUR)).toBeNull();
  });

  it('champ=financeur met le champ EN ÉVIDENCE et lui donne le focus', async () => {
    poserUrl(`inscription=${PARTICIPANT_ID}&champ=financeur&retour=avant`);
    monter();

    const champ = await screen.findByLabelText(LIBELLE_FINANCEUR);
    await waitFor(() => expect(document.activeElement).toBe(champ));
    expect(champ.closest('[data-champ-en-evidence="true"]')).not.toBeNull();
  });

  it('ouverture au clic (sans champ= dans l’URL) : aucune mise en évidence', async () => {
    const champ = await ouvrirAuClic();
    expect(champ.closest('[data-champ-en-evidence="true"]')).toBeNull();
  });
});

describe('enregistrement', () => {
  it('financeur changé → l’action DÉDIÉE est appelée avec l’organisation choisie', async () => {
    const champ = await ouvrirAuClic();
    fireEvent.change(champ, { target: { value: 'org-sigma' } });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/i }));

    await waitFor(() =>
      expect(changerFinanceurInscription).toHaveBeenCalledWith({
        participantId: PARTICIPANT_ID,
        sponsorOrgId: 'org-sigma',
      }),
    );
    await waitFor(() => expect(updateParticipant).toHaveBeenCalledTimes(1));
  });

  it('financeur inchangé → l’action dédiée n’est PAS appelée (pas d’AuditLog pour rien)', async () => {
    await ouvrirAuClic();
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/i }));

    await waitFor(() => expect(updateParticipant).toHaveBeenCalledTimes(1));
    expect(changerFinanceurInscription).not.toHaveBeenCalled();
  });

  it('PUISSANCE — refus serveur : le message NOMINATIF s’affiche ET rien d’autre n’est enregistré', async () => {
    const REFUS =
      'Financeur non modifiable pour Marion DELAUNAY : son dossier de prise en charge chez ' +
      'AGEFICE Grand Est est déjà parti (statut « accord de prise en charge reçu »).';
    changerFinanceurInscription.mockResolvedValue({ ok: false, error: REFUS } as never);

    const champ = await ouvrirAuClic();
    fireEvent.change(champ, { target: { value: 'org-sigma' } });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/i }));

    expect(await screen.findByText(REFUS)).toBeTruthy();
    // Un enregistrement à moitié fait est pire qu'un refus : l'admin ne sait
    // plus ce qui a été écrit.
    expect(updateParticipant).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    // …et la modale reste ouverte, sur l'erreur.
    expect(screen.getByLabelText(LIBELLE_FINANCEUR)).toBeTruthy();
  });

  it('succès + ?retour=avant → on revient sur l’onglet « Avant »', async () => {
    poserUrl(`tab=session&inscription=${PARTICIPANT_ID}&champ=financeur&retour=avant`);
    monter();

    const champ = await screen.findByLabelText(LIBELLE_FINANCEUR);
    fireEvent.change(champ, { target: { value: 'org-sigma' } });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/i }));

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/app/sessions/ses-0048?tab=avant'),
    );
  });

  it('PUISSANCE — après enregistrement, `inscription=` disparaît : pas de réouverture en boucle', async () => {
    poserUrl(`tab=session&inscription=${PARTICIPANT_ID}&champ=financeur&retour=avant`);
    monter();

    await screen.findByLabelText(LIBELLE_FINANCEUR);
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/i }));

    await waitFor(() => expect(replace).toHaveBeenCalled());
    const url = replace.mock.calls[0]![0] as string;
    expect(url).not.toContain('inscription=');
    expect(url).not.toContain('champ=');
  });
});

describe('rôle insuffisant pour changer le financeur', () => {
  it('le sélecteur n’est pas rendu, et l’écran DIT pourquoi plutôt que de mentir', async () => {
    listerFinanceursPossibles.mockResolvedValue({ ok: false, error: 'Accès refusé' } as never);

    monter();
    fireEvent.click(screen.getByRole('button', { name: /Éditer/i }));

    // Le reste du formulaire fonctionne toujours…
    expect(await screen.findByLabelText(LIBELLE_MODE)).toBeTruthy();
    // …mais le champ financeur, lui, est absent et expliqué.
    await waitFor(() => expect(screen.queryByLabelText(LIBELLE_FINANCEUR)).toBeNull());
    expect(screen.getByText(/Accès refusé/)).toBeTruthy();
  });
});
