/* @vitest-environment jsdom */

/**
 * Lot C.2b-2, tâche 3 — le récapitulatif d'envoi.
 *
 * CE QUE CE FICHIER GARDE, et pourquoi chaque promesse compte :
 *
 *  - **L'aperçu montre le PDF EXACT qui partira** (amendement n°5). L'ouverture
 *    appelle `preparerEnvoiSignature`, qui RÉGÉNÈRE avec les ancres ; l'iframe
 *    sert `?original=1` — jamais la version signée qui traînerait en base.
 *  - **Le hash vient TOUJOURS de la DERNIÈRE préparation.** C'est ce couplage —
 *    hash et aperçu dans le même état — qui empêche de fabriquer soi-même le
 *    refus `DOCUMENT_MODIFIE` qu'on prétend éviter.
 *  - **Le refus se REND, il ne se résume pas.** `messageDocumentModifie` dit ce
 *    qui a changé, que rien n'est parti, et le geste. Un `toast.error('Erreur')`
 *    perdrait les trois.
 *  - **L'adresse dérogatoire est SAISIE, jamais devinée.** Aucun repli
 *    automatique sur un autre contact : l'écran montre quel nom signera avec
 *    quelle adresse, et c'est ce couple qui est journalisé.
 *  - **Personne n'est prévenu.** Le `signUrl` est affiché avec de quoi le
 *    copier, et la phrase qui dit que l'envoi des emails arrive au lot C.2c.
 *
 * ⚠ `beforeEach(cleanup)` obligatoire : `vitest` n'a pas `globals: true` ici,
 * donc l'auto-cleanup de `@testing-library/react` ne s'arme pas et le DOM du
 * test précédent survit (constaté en C.2b-1).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

// --- mocks ------------------------------------------------------------------
const preparerEnvoiSignature = vi.fn();
const sendForSignature = vi.fn();
const annulerEnvoiSignature = vi.fn();

// Module REMPLACÉ entièrement, jamais `importActual` : la chaîne
// @qualiof/shared/env valide l'environnement au chargement et ferait tomber la
// suite sur `DATABASE_URL: [ 'Required' ]` (écart n°7 du lot C.2a).
vi.mock('@/server/actions/signature-envoi', () => ({
  preparerEnvoiSignature: (...args: unknown[]) => preparerEnvoiSignature(...args),
  sendForSignature: (...args: unknown[]) => sendForSignature(...args),
  annulerEnvoiSignature: (...args: unknown[]) => annulerEnvoiSignature(...args),
}));

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: (...args: unknown[]) => toastError(...args),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

import { RecapitulatifEnvoi } from '../recapitulatif-envoi';
import { messageDocumentModifie } from '@/lib/signature/envoi-contrats';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';

const CONVENTION = {
  cle: 'CONVENTION:org-1',
  docType: 'CONVENTION' as const,
  libelle: 'Convention — AGENCE MARTIN (2 participants)',
  role: 'DIRIGEANT' as const,
  participantIds: ['part-1', 'part-2'],
  document: { documentId: 'doc-conv', pdfUrl: 'docs/conv.pdf', hash: 'HASH-A', regenere: true },
  signataire: {
    nom: 'Paul MARTIN',
    email: 'paul@agence-martin.fr',
    sourceNom: 'ORG_REPRESENTATIVE' as const,
    sourceEmail: 'PERSON' as const,
  },
  empechements: [] as { raison: string; message: string }[],
};

function preparationOk(over: Partial<typeof CONVENTION>[] = [CONVENTION]) {
  return {
    ok: true as const,
    sessionId: SESSION_ID,
    envois: over,
    blocages: [],
    avertissements: [],
  };
}

function ouvrir(cles?: string[]) {
  return render(
    <RecapitulatifEnvoi
      open
      onOpenChange={() => {}}
      sessionId={SESSION_ID}
      scope="BEFORE"
      cles={cles}
    />,
  );
}

beforeEach(() => {
  cleanup();
  preparerEnvoiSignature.mockReset();
  sendForSignature.mockReset();
  annulerEnvoiSignature.mockReset();
  refresh.mockClear();
  toastError.mockClear();
  preparerEnvoiSignature.mockResolvedValue(preparationOk());
  sendForSignature.mockResolvedValue({ ok: true, envoyes: [], refus: [] });
});

describe('Ouverture — la préparation RÉGÉNÈRE, et le dit', () => {
  it('appelle `preparerEnvoiSignature` UNE fois, avec la session, le moment et les clés', async () => {
    ouvrir(['CONVENTION:org-1']);
    await waitFor(() => expect(preparerEnvoiSignature).toHaveBeenCalledTimes(1));
    expect(preparerEnvoiSignature.mock.calls[0]![0]).toEqual({
      sessionId: SESSION_ID,
      scope: 'BEFORE',
      cles: ['CONVENTION:org-1'],
    });
  });

  it('affiche une attente EXPLICITE : l’appel régénère les PDF, il n’est pas instantané', () => {
    ouvrir();
    expect(screen.getByText(/régénération des documents/i)).toBeTruthy();
  });

  it('l’aperçu est celui du PDF RÉGÉNÉRÉ, servi en `?original=1`', async () => {
    ouvrir();
    await waitFor(() => expect(screen.getByTitle(/aperçu/i)).toBeTruthy());
    const iframe = screen.getByTitle(/aperçu/i) as HTMLIFrameElement;
    // `?original=1` : le récapitulatif montre CE QUI PARTIRA (`pdfUrl`), jamais
    // une version signée déjà en base — qui, elle, ne porte plus d'ancres.
    expect(iframe.getAttribute('src')).toBe('/api/documents/doc-conv?original=1');
  });

  it('dit que la pièce vient d’être régénérée avec ses zones de signature', async () => {
    ouvrir();
    await waitFor(() => expect(screen.getByTitle(/aperçu/i)).toBeTruthy());
    expect(document.body.textContent).toContain('régénérée à l’instant');
  });

  it('un échec global rend le message du serveur, pas un « Erreur » maison', async () => {
    preparerEnvoiSignature.mockResolvedValue({
      ok: false,
      error: 'Session introuvable dans cet espace : impossible de préparer un envoi.',
    });
    ouvrir();
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('alert')
          .map((n) => n.textContent ?? '')
          .join(' '),
      ).toContain('Session introuvable dans cet espace'),
    );
    expect(toastError).not.toHaveBeenCalled();
  });
});

describe('Le couple qui signera — quel NOM, quelle ADRESSE, et d’où viennent les deux', () => {
  it('affiche le nom, l’adresse, et la provenance de chaque moitié en clair', async () => {
    ouvrir();
    await waitFor(() => expect(screen.getByTitle(/aperçu/i)).toBeTruthy());
    const texte = document.body.textContent ?? '';
    expect(texte).toContain('Paul MARTIN');
    expect(texte).toContain('paul@agence-martin.fr');
    // La provenance en clair : « ORG_REPRESENTATIVE » ne se lit pas.
    expect(texte).toContain('représentant de l’organisation');
    expect(texte).toContain('fiche de la personne');
  });

  it('un signataire résolu par le régime (stagiaire) le dit aussi', async () => {
    preparerEnvoiSignature.mockResolvedValue(
      preparationOk([
        {
          ...CONVENTION,
          cle: 'AGEFICE:part-1',
          docType: 'AGEFICE',
          libelle: 'Dossier AGEFICE — Jean DUPONT',
          role: 'STAGIAIRE',
          signataire: {
            nom: 'Jean DUPONT',
            email: 'jean@dupont.fr',
            sourceNom: 'APPRENANT_STAGIAIRE',
            sourceEmail: 'PERSON',
          },
        },
      ]),
    );
    ouvrir();
    await waitFor(() => expect(screen.getByTitle(/aperçu/i)).toBeTruthy());
    expect(document.body.textContent).toContain('l’apprenant lui-même');
  });
});

describe('Adresse dérogatoire — saisie, jamais devinée', () => {
  const sansEmail = {
    ...CONVENTION,
    signataire: null as (typeof CONVENTION)['signataire'] | null,
    empechements: [
      {
        raison: 'SIGNATAIRE_SANS_EMAIL',
        message:
          'Aucune adresse email connue pour Paul MARTIN, représentant d’AGENCE MARTIN : ' +
          'saisissez-en une pour envoyer la convention.',
      },
    ],
  };

  it('un champ email nommé apparaît, et la pièce est EXCLUE tant qu’il est vide', async () => {
    preparerEnvoiSignature.mockResolvedValue(preparationOk([sansEmail]));
    ouvrir();
    await waitFor(() => expect(screen.getByLabelText(/adresse email du signataire/i)).toBeTruthy());
    // Rien à envoyer tant que l'adresse manque : pas de repli automatique sur
    // un autre contact — c'est le sens même de la dérogation.
    expect(document.body.textContent).toContain('ne partira pas');
    fireEvent.click(screen.getByRole('button', { name: /^envoyer/i }));
    await waitFor(() => expect(sendForSignature).not.toHaveBeenCalled());
  });

  it('l’adresse saisie part dans `cibles[].emailSaisi`, avec le hash de la préparation', async () => {
    preparerEnvoiSignature.mockResolvedValue(preparationOk([sansEmail]));
    ouvrir();
    const champ = await screen.findByLabelText(/adresse email du signataire/i);
    fireEvent.change(champ, { target: { value: 'paul@perso.fr' } });
    fireEvent.click(screen.getByRole('button', { name: /^envoyer/i }));
    await waitFor(() => expect(sendForSignature).toHaveBeenCalledTimes(1));
    expect(sendForSignature.mock.calls[0]![0]).toEqual({
      sessionId: SESSION_ID,
      scope: 'BEFORE',
      cibles: [
        { cle: 'CONVENTION:org-1', hashConfirme: 'HASH-A', emailSaisi: 'paul@perso.fr' },
      ],
    });
  });

  it('tout AUTRE empêchement est rendu tel quel, et la pièce n’est pas envoyable', async () => {
    preparerEnvoiSignature.mockResolvedValue(
      preparationOk([
        {
          ...CONVENTION,
          empechements: [
            {
              raison: 'ENVOI_EN_COURS',
              message:
                '« Convention — AGENCE MARTIN » est déjà partie en signature et attend son ' +
                'signataire. Annulez l’envoi en cours avant d’en relancer un.',
            },
          ],
        },
      ]),
    );
    ouvrir();
    await waitFor(() =>
      expect(document.body.textContent).toContain('est déjà partie en signature'),
    );
    // Aucun champ email : ce n'est pas ce qui manque.
    expect(screen.queryAllByLabelText(/adresse email du signataire/i)).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: /^envoyer/i }));
    await waitFor(() => expect(sendForSignature).not.toHaveBeenCalled());
  });
});

describe('PUISSANCE (c) — un refus DOCUMENT_MODIFIE se comprend au lieu de se subir', () => {
  const MESSAGE = messageDocumentModifie('Convention — AGENCE MARTIN (2 participants)');

  beforeEach(() => {
    sendForSignature.mockResolvedValue({
      ok: true,
      envoyes: [],
      refus: [
        {
          cle: 'CONVENTION:org-1',
          docType: 'CONVENTION',
          raison: 'DOCUMENT_MODIFIE',
          message: MESSAGE,
        },
      ],
    });
  });

  it('le message EXACT du moteur est dans le DOM — pas un résumé, pas un toast', async () => {
    ouvrir();
    await waitFor(() => expect(screen.getByTitle(/aperçu/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^envoyer/i }));
    await waitFor(() => expect(document.body.textContent).toContain('a changé depuis l’aperçu'));

    const texte = document.body.textContent ?? '';
    // Les trois choses que le message dit, et qu'un « Erreur » perdrait :
    // ce qui s'est passé, ce qui n'a PAS eu lieu, et le geste.
    expect(texte).toContain('a changé depuis l’aperçu');
    expect(texte).toContain('rien n’a été envoyé');
    expect(texte).toContain('Rouvrez le récapitulatif');
    // Le message intégral, mot pour mot.
    expect(texte).toContain(MESSAGE);
    // ⚠ INTERDIT sur ce chemin : `toast.error('Erreur')` ferait disparaître le
    // seul texte qui dit quoi faire.
    expect(toastError).not.toHaveBeenCalled();
  });

  it('le refus est dans un `role="alert"` — il ne se rate pas', async () => {
    ouvrir();
    await waitFor(() => expect(screen.getByTitle(/aperçu/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^envoyer/i }));
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('alert')
          .map((n) => n.textContent ?? '')
          .join(' '),
      ).toContain('a changé depuis l’aperçu'),
    );
  });

  it('un bouton « Rouvrir le récapitulatif » existe, et il RELANCE la préparation', async () => {
    ouvrir();
    await waitFor(() => expect(preparerEnvoiSignature).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /^envoyer/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /rouvrir le récapitulatif/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /rouvrir le récapitulatif/i }));
    await waitFor(() => expect(preparerEnvoiSignature).toHaveBeenCalledTimes(2));
  });

  it('PUISSANCE — le hash repassé vient du DERNIER `preparerEnvoiSignature`, pas du premier', async () => {
    preparerEnvoiSignature
      .mockResolvedValueOnce(preparationOk())
      .mockResolvedValueOnce(
        preparationOk([
          {
            ...CONVENTION,
            document: { ...CONVENTION.document, hash: 'HASH-B', regenere: true },
          },
        ]),
      );
    ouvrir();
    await waitFor(() => expect(screen.getByTitle(/aperçu/i)).toBeTruthy());

    // 1er envoi : le document a bougé chez quelqu'un d'autre ⇒ refus.
    fireEvent.click(screen.getByRole('button', { name: /^envoyer/i }));
    await waitFor(() => expect(sendForSignature).toHaveBeenCalledTimes(1));
    expect(
      (sendForSignature.mock.calls[0]![0] as { cibles: { hashConfirme: string }[] }).cibles[0]!
        .hashConfirme,
    ).toBe('HASH-A');

    // On rouvre : la 2e préparation rend un AUTRE hash.
    fireEvent.click(screen.getByRole('button', { name: /rouvrir le récapitulatif/i }));
    await waitFor(() => expect(preparerEnvoiSignature).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole('button', { name: /^envoyer/i })).toBeTruthy());

    sendForSignature.mockResolvedValue({ ok: true, envoyes: [], refus: [] });
    fireEvent.click(screen.getByRole('button', { name: /^envoyer/i }));
    await waitFor(() => expect(sendForSignature).toHaveBeenCalledTimes(2));
    // ⚠ CE QUI COMPTE : le hash du DERNIER aperçu. Le figer à la première
    // préparation ferait re-confirmer un PDF que l'admin n'a plus sous les yeux.
    expect(
      (sendForSignature.mock.calls[1]![0] as { cibles: { hashConfirme: string }[] }).cibles[0]!
        .hashConfirme,
    ).toBe('HASH-B');
  });
});

describe('Résultat — ce qui est parti, et surtout ce qui n’est pas parti', () => {
  const ENVOYE = {
    cle: 'CONVENTION:org-1',
    docType: 'CONVENTION' as const,
    signatureRequestId: 'req-1',
    providerId: 'sub-1',
    documentId: 'doc-conv',
    hash: 'HASH-A',
    signataire: {
      nom: 'Paul MARTIN',
      email: 'paul@agence-martin.fr',
      source: 'PERSON' as const,
    },
    signUrl: 'https://docuseal.eu/s/le-lien-du-dirigeant',
  };

  it('affiche le nom et l’adresse retenus, et le bandeau honnête « aucun email »', async () => {
    sendForSignature.mockResolvedValue({ ok: true, envoyes: [ENVOYE], refus: [] });
    ouvrir();
    await waitFor(() => expect(screen.getByTitle(/aperçu/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^envoyer/i }));
    await waitFor(() => expect(document.body.textContent).toContain('Paul MARTIN'));

    const texte = document.body.textContent ?? '';
    expect(texte).toContain('paul@agence-martin.fr');
    expect(texte).toContain('aucun email n’a été envoyé');
    expect(texte).toContain('C.2c');
  });

  it('le `signUrl` est AFFICHÉ avec de quoi le copier — seul moyen de le communiquer avant C.2c', async () => {
    sendForSignature.mockResolvedValue({ ok: true, envoyes: [ENVOYE], refus: [] });
    ouvrir();
    await waitFor(() => expect(screen.getByTitle(/aperçu/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^envoyer/i }));
    await waitFor(() => expect(screen.getByLabelText(/lien de signature/i)).toBeTruthy());

    const champ = screen.getByLabelText(/lien de signature/i) as HTMLInputElement;
    expect(champ.value).toBe('https://docuseal.eu/s/le-lien-du-dirigeant');
    expect(screen.getByRole('button', { name: /copier le lien/i })).toBeTruthy();
  });

  it('un prestataire qui ne rend AUCUN lien le dit, au lieu d’afficher un champ vide', async () => {
    sendForSignature.mockResolvedValue({
      ok: true,
      envoyes: [{ ...ENVOYE, signUrl: null }],
      refus: [],
    });
    ouvrir();
    await waitFor(() => expect(screen.getByTitle(/aperçu/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^envoyer/i }));
    await waitFor(() => expect(document.body.textContent).toContain('Paul MARTIN'));
    expect(screen.queryAllByLabelText(/lien de signature/i)).toHaveLength(0);
    expect(document.body.textContent).toContain('n’a rendu aucun lien');
  });

  it('un envoi MIXTE montre les deux : la pièce partie ET la pièce refusée', async () => {
    sendForSignature.mockResolvedValue({
      ok: true,
      envoyes: [ENVOYE],
      refus: [
        {
          cle: 'AGEFICE:part-1',
          docType: 'AGEFICE',
          raison: 'DOCUMENT_MODIFIE',
          message: messageDocumentModifie('Dossier AGEFICE — Jean DUPONT'),
        },
      ],
    });
    ouvrir();
    await waitFor(() => expect(screen.getByTitle(/aperçu/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^envoyer/i }));
    await waitFor(() => expect(document.body.textContent).toContain('Paul MARTIN'));
    // Un lot ne tombe pas parce qu'une pièce a refusé.
    expect(document.body.textContent).toContain('Dossier AGEFICE — Jean DUPONT');
    expect(document.body.textContent).toContain('a changé depuis l’aperçu');
  });

  it('rafraîchit la fiche session après un envoi réussi', async () => {
    sendForSignature.mockResolvedValue({ ok: true, envoyes: [ENVOYE], refus: [] });
    ouvrir();
    await waitFor(() => expect(screen.getByTitle(/aperçu/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^envoyer/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});

describe('Le bandeau « aucun email » est PERMANENT — à la revue comme au résultat', () => {
  it('il est déjà là avant le clic : personne ne doit croire qu’un clic prévient quelqu’un', async () => {
    ouvrir();
    await waitFor(() => expect(screen.getByTitle(/aperçu/i)).toBeTruthy());
    expect(document.body.textContent).toContain('C.2c');
  });

  it('aucun lien « Relancer » — il n’a rien à relancer avant C.2c', async () => {
    ouvrir();
    await waitFor(() => expect(screen.getByTitle(/aperçu/i)).toBeTruthy());
    expect(screen.queryAllByRole('button', { name: /relancer/i })).toHaveLength(0);
  });
});
