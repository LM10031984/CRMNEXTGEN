/* @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

/**
 * Phase 15 Lot 2 (15-02) Task 1 — TDD RED.
 *
 * « AUCUNE ACTION PERDUE » côté onglet « Avant la formation ».
 *
 * Avant de supprimer le `<DocDockDrawer>` (seul consommateur de
 * `dispatchGenerateMissing`/`dispatchGenerateDoc`, vérifié RESEARCH Q2), on
 * doit réembarquer ses actions uniques dans `<TabAvant>`. Ce test garde
 * l'invariance :
 *  - « Tout générer » → `dispatchGenerateMissing({ sessionId, items })` une fois,
 *    avec les docs pré-formation MANQUANTS.
 *  - chaque docType pré-formation (CONVENTION · CONVOCATION · AGEFICE ·
 *    ANALYSE_BESOIN · ASSIDUITE_AGEFICE) a un bouton « Générer » qui appelle
 *    `dispatchGenerateDoc` avec le BON `docType` (+ participantId par stagiaire).
 *    L'assertion explicite sur `docType` est la branche que le test de
 *    puissance cassera (CONVOCATION→CONVENTION ⇒ rouge).
 */

// --- mocks ------------------------------------------------------------------
const dispatchGenerateMissing = vi.fn(
  async (..._args: unknown[]) => ({ ok: true, total: 0, success: 0, failed: 0, errors: [] }),
);
const dispatchGenerateDoc = vi.fn(async (..._args: unknown[]) => ({ ok: true }));
vi.mock('@/server/actions/dispatch-generate-doc', () => ({
  dispatchGenerateMissing: (...args: unknown[]) => dispatchGenerateMissing(...args),
  dispatchGenerateDoc: (...args: unknown[]) => dispatchGenerateDoc(...args),
}));

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import { TabAvant } from '../tab-avant';
import type { DocDockItem } from '@/lib/sessions/dispatch-doc-types';

const SESSION_ID = 'sess-1';
const P1 = 'part-1';

/**
 * Items pré-formation. ASSIDUITE_AGEFICE explicitement présent (RESEARCH note
 * qu'il n'est couvert NI par les 4 cartes session NI par SessionOnlyDocsBlock).
 * Tous `missing` pour pouvoir cliquer « Générer ».
 */
const items: DocDockItem[] = [
  {
    key: `convention-${P1}`,
    docType: 'CONVENTION',
    label: 'Convention — Jean DUPONT',
    participantName: 'Jean DUPONT',
    participantId: P1,
    section: 'participant',
    state: 'missing',
  },
  {
    key: `convocation-${P1}`,
    docType: 'CONVOCATION',
    label: 'Convocation — Jean DUPONT',
    participantName: 'Jean DUPONT',
    participantId: P1,
    section: 'participant',
    state: 'missing',
  },
  {
    key: `agefice-${P1}`,
    docType: 'AGEFICE',
    label: 'Demande AGEFICE — Jean DUPONT',
    participantName: 'Jean DUPONT',
    participantId: P1,
    section: 'participant',
    state: 'missing',
  },
  {
    key: `analyse-${P1}`,
    docType: 'ANALYSE_BESOIN',
    label: 'Analyse besoin — Jean DUPONT',
    participantName: 'Jean DUPONT',
    participantId: P1,
    section: 'ai',
    state: 'missing',
  },
  {
    key: `assiduite-${P1}`,
    docType: 'ASSIDUITE_AGEFICE',
    label: 'Assiduité AGEFICE — Jean DUPONT',
    participantName: 'Jean DUPONT',
    participantId: P1,
    section: 'participant',
    state: 'missing',
  },
];

beforeEach(() => {
  cleanup();
  dispatchGenerateMissing.mockClear();
  dispatchGenerateDoc.mockClear();
  refresh.mockClear();
});

describe('TabAvant — « Tout générer » (dispatchGenerateMissing)', () => {
  it('clic « Tout générer » appelle dispatchGenerateMissing une fois avec les manquants', async () => {
    render(<TabAvant sessionId={SESSION_ID} items={items} canGenerate />);
    fireEvent.click(screen.getByRole('button', { name: /tout générer/i }));
    await waitFor(() => expect(dispatchGenerateMissing).toHaveBeenCalledTimes(1));
    const arg = dispatchGenerateMissing.mock.calls[0]![0] as {
      sessionId: string;
      items: Array<{ docType: string; participantId?: string }>;
    };
    expect(arg.sessionId).toBe(SESSION_ID);
    // 5 docs pré-formation manquants → 5 items passés au bulk.
    expect(arg.items).toHaveLength(5);
    const docTypes = arg.items.map((i) => i.docType);
    expect(docTypes).toEqual(
      expect.arrayContaining([
        'CONVENTION',
        'CONVOCATION',
        'AGEFICE',
        'ANALYSE_BESOIN',
        'ASSIDUITE_AGEFICE',
      ]),
    );
  });
});

describe('TabAvant — une ligne par doc/stagiaire (dispatchGenerateDoc)', () => {
  // Labels désambiguïsés : « AGEFICE » seul matcherait aussi « Assiduité
  // AGEFICE ». On cible le label complet de chaque doc (rendu dans aria-label
  // « Générer {label} »), ce qui reste un test comportemental sur la ligne.
  const cases: Array<{ docType: string; label: RegExp }> = [
    { docType: 'CONVENTION', label: /générer convention/i },
    { docType: 'CONVOCATION', label: /générer convocation/i },
    { docType: 'AGEFICE', label: /générer demande agefice/i },
    { docType: 'ANALYSE_BESOIN', label: /générer analyse besoin/i },
    { docType: 'ASSIDUITE_AGEFICE', label: /générer assiduité agefice/i },
  ];

  for (const c of cases) {
    it(`bouton Générer du doc ${c.docType} appelle dispatchGenerateDoc avec docType=${c.docType} + participantId`, async () => {
      render(<TabAvant sessionId={SESSION_ID} items={items} canGenerate />);
      // Chaque ligne expose un bouton accessible nommé d'après son doc (label).
      const btn = screen.getByRole('button', { name: c.label });
      fireEvent.click(btn);
      await waitFor(() => expect(dispatchGenerateDoc).toHaveBeenCalledTimes(1));
      const arg = dispatchGenerateDoc.mock.calls[0]![0] as {
        sessionId: string;
        docType: string;
        participantId?: string;
      };
      expect(arg.sessionId).toBe(SESSION_ID);
      // Assertion explicite sur le docType — branche cassée par le test de puissance.
      expect(arg.docType).toBe(c.docType);
      expect(arg.participantId).toBe(P1);
    });
  }
});


/**
 * Retour Laurent du 02/09 : « j'ai pas de bouton pour regénérer le programme ».
 *
 * L'action existait — mais sous la forme d'une icône de 32 px sans texte, collée
 * à un lien « Ouvrir ». Invisible en pratique, alors que c'est le SEUL moyen de
 * refaire un document après une correction (tarif de session revu, représentant
 * légal ajouté à la fiche entreprise…).
 *
 * Test de puissance : remonter le bouton en icône seule (retirer le texte
 * « Régénérer ») fait rougir « porte un libellé VISIBLE ».
 */
describe('TabAvant — régénérer un document déjà produit', () => {
  const dejaGenere: DocDockItem[] = [
    {
      key: 'programme',
      docType: 'PROGRAMME',
      label: 'Programme de formation',
      section: 'shared',
      state: 'generated',
      pdfUrl: '/api/documents/doc-1',
    },
  ];

  it('porte un libellé VISIBLE, pas seulement une icône', () => {
    render(<TabAvant sessionId={SESSION_ID} items={dejaGenere} canGenerate />);
    // getByText ne voit que le texte rendu : une icône seule ne le satisfait pas.
    expect(screen.getByText(/^Régénérer$/)).toBeDefined();
    expect(screen.getByRole('button', { name: /régénérer programme de formation/i })).toBeDefined();
  });

  it('régénère bien le PROGRAMME de CETTE session, en forçant', async () => {
    render(<TabAvant sessionId={SESSION_ID} items={dejaGenere} canGenerate />);
    fireEvent.click(screen.getByRole('button', { name: /régénérer programme de formation/i }));

    await waitFor(() => expect(dispatchGenerateDoc).toHaveBeenCalledTimes(1));
    const arg = dispatchGenerateDoc.mock.calls[0]![0] as {
      sessionId: string;
      docType: string;
      force?: boolean;
    };
    expect(arg.sessionId).toBe(SESSION_ID);
    expect(arg.docType).toBe('PROGRAMME');
    expect(arg.force).toBe(true);
  });

  it('laisse « Ouvrir » accessible à côté', () => {
    render(<TabAvant sessionId={SESSION_ID} items={dejaGenere} canGenerate />);
    expect(screen.getByText(/Ouvrir/)).toBeDefined();
  });

  it('ne propose rien à qui n’a pas le droit de générer', () => {
    render(<TabAvant sessionId={SESSION_ID} items={dejaGenere} canGenerate={false} />);
    expect(screen.queryByText(/^Régénérer$/)).toBeNull();
  });
});
