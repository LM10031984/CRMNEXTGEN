/* @vitest-environment jsdom */

/**
 * Lot C.2b-2, tâche 2 — le bloc « Signature » à l'écran.
 *
 * QUATRE PROMESSES, et ce fichier est ce qui les tient :
 *
 *  (a) **Le bouton n'est pas dans le DOM** quand il n'y a rien à envoyer
 *      (décision Laurent n°3). Pas `disabled`, pas masqué en CSS : absent.
 *      La mutation qui le rend grisé doit faire rougir ce test.
 *  (b) **L'avertissement « régime incohérent » est LISIBLE et NOMMÉ.** Il est
 *      calculé depuis C.1 et n'était affiché nulle part : en l'état, un
 *      apprenant type Florent HAUSSWIRTH perdait la génération de son dossier
 *      AGEFICE sans qu'aucun message ne le dise.
 *  (c) **Une pièce partie propose son ANNULATION.** `annulerEnvoiSignature`
 *      existe depuis C.2b-bis mais aucun bouton ne l'appelait, alors que
 *      `messageEnvoiEnCours` promet « Annulez l'envoi en cours ». Un écran qui
 *      promet un geste inatteignable est pire qu'un écran muet.
 *  (d) **Une pièce signée ne propose plus AUCUN des deux gestes** (décision
 *      n°4) : ni l'envoi, ni le dépôt de scan — quelle que soit l'origine du
 *      signé.
 *
 * ⚠ `vitest` n'a pas `globals: true` ici : sans `beforeEach(cleanup)`, le DOM du
 * test précédent survit et rend tous les `queryBy*` menteurs (constaté en
 * C.2b-1). Aligné sur `avant-tab-actions.test.tsx`.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

// --- mocks ------------------------------------------------------------------
const annulerEnvoiSignature = vi.fn(async (..._args: unknown[]) => ({
  ok: true as const,
  signatureRequestId: 'req-9',
  sessionId: 'sess-1',
  pieces: [],
}));
const preparerEnvoiSignature = vi.fn(async (..._args: unknown[]) => ({
  ok: true as const,
  sessionId: 'sess-1',
  envois: [],
  blocages: [],
  avertissements: [],
}));
const sendForSignature = vi.fn(async (..._args: unknown[]) => ({
  ok: true as const,
  envoyes: [],
  refus: [],
}));

// Module REMPLACÉ, jamais `importActual` : la chaîne @qualiof/shared/env valide
// l'environnement au chargement et ferait tomber la suite sur
// `DATABASE_URL: [ 'Required' ]` (écart n°7 du lot C.2a).
vi.mock('@/server/actions/signature-envoi', () => ({
  annulerEnvoiSignature: (...args: unknown[]) => annulerEnvoiSignature(...args),
  preparerEnvoiSignature: (...args: unknown[]) => preparerEnvoiSignature(...args),
  sendForSignature: (...args: unknown[]) => sendForSignature(...args),
}));

vi.mock('@/server/actions/qualiopi-matrix', () => ({
  // `<UploadSignedDocDialog>` importe la server action ; sans ce mock la chaîne
  // @/lib/rbac → @/lib/auth exécute `cache()` de React, indisponible en jsdom.
  uploadSignedDoc: vi.fn().mockResolvedValue({ ok: true }),
  uploadSignedScans: vi.fn().mockResolvedValue({ ok: true, saved: 0, failures: [] }),
}));

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { BlocSignature } from '../bloc-signature';
import type { LigneSignature, VueSignature } from '@/lib/sessions/bloc-signature-vue';

const SESSION_ID = 'sess-1';

function ligne(over: Partial<LigneSignature> = {}): LigneSignature {
  return {
    cle: 'ASSIDUITE:part-1',
    docType: 'ASSIDUITE',
    libelle: "Attestation d'assiduité — Jean DUPONT",
    participantIds: ['part-1'],
    participantIdUnique: 'part-1',
    etat: 'GENERE',
    documentId: 'doc-1',
    signatureRequestId: null,
    envoyable: true,
    ...over,
  };
}

function vue(over: Partial<VueSignature> = {}): VueSignature {
  const lignes = over.lignes ?? [];
  return {
    lignes,
    blocages: [],
    avertissements: [],
    canSign: true,
    boutonVisible: lignes.some((l) => l.envoyable),
    nbEnvoyables: lignes.filter((l) => l.envoyable).length,
    ...over,
  };
}

beforeEach(() => {
  cleanup();
  annulerEnvoiSignature.mockClear();
  preparerEnvoiSignature.mockClear();
  sendForSignature.mockClear();
  refresh.mockClear();
});

describe('PUISSANCE (a) — pas de bouton quand il n’y a rien à envoyer', () => {
  it('session 100 % OPCO côté APRÈS : AUCUN élément nommé « Envoyer pour signature »', () => {
    render(<BlocSignature sessionId={SESSION_ID} scope="AFTER" vue={vue({ lignes: [] })} />);
    // Ni actif, ni `disabled` : un bouton grisé laisse croire qu'il manque un
    // réglage (décision Laurent n°3). `queryAllByRole` voit AUSSI les boutons
    // désactivés — c'est ce qui fait échouer la mutation « disabled ».
    expect(screen.queryAllByRole('button', { name: /envoyer pour signature/i })).toHaveLength(0);
  });

  it('toutes les pièces déjà parties : aucun bouton d’envoi non plus', () => {
    render(
      <BlocSignature
        sessionId={SESSION_ID}
        scope="AFTER"
        vue={vue({
          lignes: [ligne({ etat: 'ENVOYE', envoyable: false, signatureRequestId: 'req-9' })],
        })}
      />,
    );
    expect(screen.queryAllByRole('button', { name: /envoyer pour signature/i })).toHaveLength(0);
  });

  it('`canSign` faux : rien à cliquer, même quand tout est prêt', () => {
    render(
      <BlocSignature
        sessionId={SESSION_ID}
        scope="AFTER"
        vue={vue({ lignes: [ligne()], canSign: false, boutonVisible: false })}
      />,
    );
    expect(screen.queryAllByRole('button', { name: /envoyer pour signature/i })).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: /déposer le scan/i })).toHaveLength(0);
  });

  it('une pièce prête AFFICHE bien le bouton — sans quoi le test (a) serait vide de sens', () => {
    render(
      <BlocSignature sessionId={SESSION_ID} scope="AFTER" vue={vue({ lignes: [ligne()] })} />,
    );
    expect(
      screen.queryAllByRole('button', { name: /envoyer pour signature/i }).length,
    ).toBeGreaterThan(0);
  });
});

describe('PUISSANCE (b) — l’avertissement « régime incohérent » se voit et se lit', () => {
  const avertissement = {
    participantId: 'part-3',
    nomAffiche: 'Florent HAUSSWIRTH',
    docType: 'AGEFICE' as const,
    message:
      'Florent HAUSSWIRTH : le financeur rattaché à « IMAGIMMO » n’ouvre pas le dossier ' +
      'AGEFICE, alors que le dossier de cet apprenant en porte les signaux. Corrigez le ' +
      'financeur de l’inscription : rien n’a été envoyé pour cette pièce.',
  };

  it('l’avertissement est dans un `role="alert"`, nomme l’apprenant et dit que rien n’est parti', () => {
    render(
      <BlocSignature
        sessionId={SESSION_ID}
        scope="BEFORE"
        vue={vue({ lignes: [], avertissements: [avertissement] })}
      />,
    );
    const alertes = screen.getAllByRole('alert');
    const texte = alertes.map((n) => n.textContent ?? '').join(' ');
    expect(texte).toContain('Florent HAUSSWIRTH');
    expect(texte).toContain('rien n’a été envoyé');
  });

  it('l’avertissement ne déclenche AUCUN envoi : pas de ligne, pas de bouton', () => {
    render(
      <BlocSignature
        sessionId={SESSION_ID}
        scope="BEFORE"
        vue={vue({ lignes: [], avertissements: [avertissement] })}
      />,
    );
    expect(screen.queryAllByRole('button', { name: /envoyer pour signature/i })).toHaveLength(0);
    expect(screen.queryByText(avertissement.nomAffiche + ' —')).toBeNull();
  });

  it('un blocage est rendu TEL QUEL lui aussi — il nomme déjà la personne et le geste', () => {
    render(
      <BlocSignature
        sessionId={SESSION_ID}
        scope="BEFORE"
        vue={vue({
          lignes: [],
          blocages: [
            {
              participantId: 'part-4',
              nomAffiche: 'Marie LEROY',
              docType: 'CONVENTION',
              message:
                'Marie LEROY : aucune organisation bénéficiaire rattachée à cette inscription.',
            },
          ],
        })}
      />,
    );
    const texte = screen
      .getAllByRole('alert')
      .map((n) => n.textContent ?? '')
      .join(' ');
    expect(texte).toContain('Marie LEROY');
    expect(texte).toContain('aucune organisation bénéficiaire');
  });
});

describe('PUISSANCE (c) — une pièce partie s’annule, et le dit', () => {
  const partie = ligne({
    etat: 'ENVOYE',
    envoyable: false,
    signatureRequestId: 'req-9',
  });

  it('la ligne dit « En attente de signature » et que personne n’a été prévenu (C.2c)', () => {
    render(
      <BlocSignature sessionId={SESSION_ID} scope="AFTER" vue={vue({ lignes: [partie] })} />,
    );
    expect(screen.getByText(/en attente de signature/i)).toBeTruthy();
    expect(document.body.textContent).toContain('C.2c');
  });

  it('« Annuler l’envoi » appelle `annulerEnvoiSignature` avec l’identifiant de la DEMANDE', async () => {
    render(
      <BlocSignature sessionId={SESSION_ID} scope="AFTER" vue={vue({ lignes: [partie] })} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /annuler l’envoi/i }));
    await waitFor(() => expect(annulerEnvoiSignature).toHaveBeenCalledTimes(1));
    expect(annulerEnvoiSignature.mock.calls[0]![0]).toEqual({ signatureRequestId: 'req-9' });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('aucun lien « Relancer » n’existe — il n’a rien à relancer avant C.2c', () => {
    render(
      <BlocSignature sessionId={SESSION_ID} scope="AFTER" vue={vue({ lignes: [partie] })} />,
    );
    expect(screen.queryAllByRole('button', { name: /relancer/i })).toHaveLength(0);
    expect(screen.queryAllByRole('link', { name: /relancer/i })).toHaveLength(0);
  });

  it('une demande partie SANS identifiant le dit, au lieu d’offrir un bouton qui échouerait', () => {
    render(
      <BlocSignature
        sessionId={SESSION_ID}
        scope="AFTER"
        vue={vue({ lignes: [ligne({ etat: 'ENVOYE', envoyable: false, signatureRequestId: null })] })}
      />,
    );
    expect(screen.queryAllByRole('button', { name: /annuler l’envoi/i })).toHaveLength(0);
    expect(document.body.textContent).toContain('annulable');
  });
});

describe('PUISSANCE (d) — décision n°4 : coexistence, puis exclusion dès qu’un signé existe', () => {
  it('pièce nominative prête : « Envoyer pour signature » ET « Déposer le scan » côte à côte', () => {
    render(
      <BlocSignature sessionId={SESSION_ID} scope="AFTER" vue={vue({ lignes: [ligne()] })} />,
    );
    expect(
      screen.queryAllByRole('button', { name: /envoyer pour signature/i }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryAllByRole('button', { name: /déposer le scan/i }).length).toBeGreaterThan(0);
  });

  it('pièce SIGNÉE : plus AUCUN des deux gestes — mais « Ouvrir » reste', () => {
    render(
      <BlocSignature
        sessionId={SESSION_ID}
        scope="AFTER"
        vue={vue({ lignes: [ligne({ etat: 'SIGNE', envoyable: false })] })}
      />,
    );
    expect(screen.queryAllByRole('button', { name: /envoyer pour signature/i })).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: /déposer le scan/i })).toHaveLength(0);
    expect(screen.queryAllByRole('link', { name: /ouvrir/i }).length).toBeGreaterThan(0);
  });

  it('pièce COLLECTIVE (convention de groupe) : pas de dépôt de scan par apprenant', () => {
    render(
      <BlocSignature
        sessionId={SESSION_ID}
        scope="BEFORE"
        vue={vue({
          lignes: [
            ligne({
              cle: 'CONVENTION:org-1',
              docType: 'CONVENTION',
              libelle: 'Convention — AGENCE MARTIN (2 participants)',
              participantIds: ['part-1', 'part-2'],
              participantIdUnique: null,
            }),
          ],
        })}
      />,
    );
    expect(screen.queryAllByRole('button', { name: /déposer le scan/i })).toHaveLength(0);
    expect(
      screen.queryAllByRole('button', { name: /envoyer pour signature/i }).length,
    ).toBeGreaterThan(0);
  });
});

describe('Le bloc se tait quand il n’a rien à dire', () => {
  it('aucune ligne, aucun blocage, aucun avertissement ⇒ rien n’est rendu', () => {
    const { container } = render(
      <BlocSignature sessionId={SESSION_ID} scope="AFTER" vue={vue({ lignes: [] })} />,
    );
    expect(container.textContent).toBe('');
  });
});
