/* @vitest-environment jsdom */

/**
 * Lot C.2b-3 — « Une pièce, un seul chemin ouvert » (Laurent, 11/09/2026),
 * côté écran.
 *
 * LA PROMESSE GARDÉE ICI : **le dépôt d'un scan n'annule jamais une demande de
 * signature en silence.** Le serveur refuse un dépôt non confirmé (cf.
 * `signature-depot-scan.test.ts`) ; ce fichier garde l'autre moitié — que
 * l'utilisateur ait LU ce qui va se passer, et l'ait confirmé, avant que la
 * moindre requête ne parte.
 *
 * POURQUOI UNE ÉTAPE, ET PAS UNE CASE À COCHER. Une case se coche sans lire.
 * Une étape qui remplace le bouton « Téléverser » par un avertissement et un
 * bouton nommé oblige à passer par le texte. C'est la différence entre une
 * confirmation et une formalité.
 *
 * ⚠ LE DRAPEAU SUIT LA CONFIRMATION, PAS LA PROP. `annulerEnvoiEnCours` n'est
 * posé que si l'utilisateur a confirmé — jamais parce que `envoiEnAttente` est
 * vrai. Si l'étape de confirmation disparaissait, le drapeau disparaîtrait avec
 * elle et le serveur refuserait : l'échec serait visible, jamais silencieux.
 *
 * ⚠ `vitest` n'a pas `globals: true` : sans `beforeEach(cleanup)`, le DOM du
 * test précédent survit et rend tous les `queryBy*` menteurs.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const uploadSignedDoc = vi.fn(async (..._args: unknown[]) => ({ ok: true as const }));
vi.mock('@/server/actions/qualiopi-matrix', () => ({
  uploadSignedDoc: (...args: unknown[]) => uploadSignedDoc(...args),
}));

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import {
  UploadSignedDocDialog,
  AVERTISSEMENT_DEPOT_ANNULE_ENVOI,
  LIBELLE_CONFIRMER_DEPOT,
} from '../upload-signed-doc-dialog';

const PARTICIPANT_ID = 'part-1';

function pdf(name = 'assiduite-dupont.pdf') {
  return new File([new Uint8Array(2048)], name, { type: 'application/pdf' });
}

function ouvrir(props: { envoiEnAttente?: boolean } = {}) {
  return render(
    <UploadSignedDocDialog
      open
      onOpenChange={() => {}}
      participantId={PARTICIPANT_ID}
      docType="ASSIDUITE"
      envoiEnAttente={props.envoiEnAttente}
    />,
  );
}

/** Choisir le fichier puis soumettre le formulaire — le geste réel de l'admin. */
function deposer() {
  const input = document.getElementById('signed-pdf-file') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [pdf()] } });
  const form = input.closest('form');
  expect(form).not.toBeNull();
  fireEvent.submit(form!);
}

beforeEach(() => {
  cleanup();
  uploadSignedDoc.mockClear();
  refresh.mockClear();
});

describe('Pièce PARTIE en signature — la confirmation précède tout', () => {
  it('PUISSANCE — le premier envoi du formulaire n’appelle RIEN : il demande confirmation', () => {
    ouvrir({ envoiEnAttente: true });

    deposer();

    // Aucune requête. C'est exactement ce que la mutation « retirer la
    // confirmation » casse : elle ferait partir le dépôt du premier coup, et
    // avec lui l'annulation d'un envoi que personne n'a validée.
    expect(uploadSignedDoc).not.toHaveBeenCalled();
  });

  it('l’avertissement est affiché DÈS L’OUVERTURE, avant même le choix du fichier', () => {
    ouvrir({ envoiEnAttente: true });

    // Comparé à la constante IMPORTÉE : recopier la phrase ferait passer un
    // test qui ne garde rien (apostrophes typographiques contre droites).
    expect(screen.getByText(AVERTISSEMENT_DEPOT_ANNULE_ENVOI)).toBeDefined();
  });

  it('PUISSANCE — l’avertissement est dans un `role="alert"` : il ne se rate pas', () => {
    ouvrir({ envoiEnAttente: true });

    const alertes = screen
      .queryAllByRole('alert')
      .map((n) => n.textContent ?? '')
      .join(' | ');
    expect(alertes).toContain(AVERTISSEMENT_DEPOT_ANNULE_ENVOI);
  });

  it('PUISSANCE — après confirmation, le dépôt part AVEC le drapeau d’annulation', async () => {
    ouvrir({ envoiEnAttente: true });

    deposer();
    fireEvent.click(screen.getByRole('button', { name: LIBELLE_CONFIRMER_DEPOT }));

    await waitFor(() => expect(uploadSignedDoc).toHaveBeenCalledTimes(1));
    const fd = uploadSignedDoc.mock.calls[0]![0] as FormData;
    expect(fd.get('annulerEnvoiEnCours')).toBe('1');
    expect(fd.get('participantId')).toBe(PARTICIPANT_ID);
    expect(fd.get('docType')).toBe('ASSIDUITE');
  });

  it('PUISSANCE — le bouton de confirmation dit ce qu’il fait : il nomme l’annulation', () => {
    ouvrir({ envoiEnAttente: true });
    deposer();

    const bouton = screen.getByRole('button', { name: LIBELLE_CONFIRMER_DEPOT });
    // Un « Confirmer » nu laisserait croire qu'on confirme le seul dépôt.
    expect((bouton.textContent ?? '').toLowerCase()).toContain('annul');
  });

  it('on peut REVENIR sans rien annuler — la confirmation n’est pas un piège', () => {
    ouvrir({ envoiEnAttente: true });
    deposer();

    fireEvent.click(screen.getByRole('button', { name: /revenir/i }));

    expect(uploadSignedDoc).not.toHaveBeenCalled();
    expect(screen.queryAllByRole('button', { name: LIBELLE_CONFIRMER_DEPOT })).toHaveLength(0);
  });

  it('changer de fichier après avoir confirmé REDEMANDE la confirmation', () => {
    ouvrir({ envoiEnAttente: true });
    deposer();
    expect(screen.queryAllByRole('button', { name: LIBELLE_CONFIRMER_DEPOT })).toHaveLength(1);

    const input = document.getElementById('signed-pdf-file') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [pdf('autre-scan.pdf')] } });

    expect(screen.queryAllByRole('button', { name: LIBELLE_CONFIRMER_DEPOT })).toHaveLength(0);
    expect(uploadSignedDoc).not.toHaveBeenCalled();
  });
});

describe('Pièce SANS envoi en cours — le dépôt du lot A n’a pas changé', () => {
  it('aucun avertissement, et le dépôt part du premier coup', async () => {
    ouvrir({ envoiEnAttente: false });

    expect(screen.queryAllByText(AVERTISSEMENT_DEPOT_ANNULE_ENVOI)).toHaveLength(0);

    deposer();

    await waitFor(() => expect(uploadSignedDoc).toHaveBeenCalledTimes(1));
  });

  it('PUISSANCE — le drapeau d’annulation n’est PAS posé quand rien n’est parti', async () => {
    ouvrir({ envoiEnAttente: false });

    deposer();

    await waitFor(() => expect(uploadSignedDoc).toHaveBeenCalledTimes(1));
    const fd = uploadSignedDoc.mock.calls[0]![0] as FormData;
    // Poser le drapeau « au cas où » ferait annuler un envoi inexistant — ou,
    // le jour où le garde-fou serveur changerait, un envoi bien réel.
    expect(fd.get('annulerEnvoiEnCours')).toBeNull();
  });

  it('la prop absente vaut « pas d’envoi en cours » — le menu de la matrice ne la passe pas', async () => {
    render(
      <UploadSignedDocDialog
        open
        onOpenChange={() => {}}
        participantId={PARTICIPANT_ID}
        docType="EMARGEMENT"
      />,
    );

    expect(screen.queryAllByText(AVERTISSEMENT_DEPOT_ANNULE_ENVOI)).toHaveLength(0);
    deposer();
    await waitFor(() => expect(uploadSignedDoc).toHaveBeenCalledTimes(1));
  });
});
