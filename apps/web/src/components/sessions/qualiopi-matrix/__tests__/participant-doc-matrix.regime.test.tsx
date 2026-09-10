/* @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

/**
 * Lot C.2b-1 — la matrice cesse de trancher le régime toute seule.
 *
 * DEUX GARDE-FOUS ÉCRITS EN C.1 ÉTAIENT INVISIBLES : `deriveCellState` accepte
 * `docTypesHorsRegime` depuis le lot C.1, mais AUCUN appelant ne le passait —
 * donc `NA` n'apparaissait jamais ; et le composant portait sa propre règle en
 * dur (`if (docType === 'AGEFICE' && !p.isAgefice) return NA`), qui écrasait
 * jusqu'au document existant.
 *
 * LE TEST DE PUISSANCE de ce fichier est le second cas : un participant HORS
 * RÉGIME dont le dossier AGEFICE EXISTE doit voir son document, pas un `NA`.
 * C'est le raccourci du composant qu'il tue — rétablir ce raccourci le fait
 * rougir.
 *
 * Seul `MatrixClientShell` est remplacé : il embarque `matrix-row`, qui importe
 * une server action (`@/server/actions/qualiopi-matrix`) et donc `@qualiof/db`.
 * Ce qu'on vérifie ici est de toute façon ce que le composant CALCULE et passe
 * — les colonnes retenues et l'état de chaque cellule.
 */

import type { MatrixClientShellProps } from '../matrix-client-shell';

vi.mock('../matrix-client-shell', () => ({
  MatrixClientShell: ({ rows, columns }: MatrixClientShellProps) => (
    <ul>
      <li data-testid="colonnes">{columns.join(' ')}</li>
      {rows.flatMap((ligne) =>
        ligne.cells.map((cellule) => (
          <li key={`${ligne.participant.id}:${cellule.docType}`}>
            {`${ligne.participant.id} | ${cellule.docType} | ${cellule.state.state}`}
          </li>
        )),
      )}
    </ul>
  ),
}));

import { ParticipantDocMatrix, type MatrixParticipant } from '../participant-doc-matrix';

const HORS_REGIME_OPCO: ReadonlySet<string> = new Set(['AGEFICE', 'ASSIDUITE']);

function participant(over: Partial<MatrixParticipant> & { id: string }): MatrixParticipant {
  return {
    personId: `pers-${over.id}`,
    fullName: 'Florent HAUSSWIRTH',
    sponsorOrgId: 'org-imagimmo',
    sponsorOrgLabel: 'Imagimmo',
    sponsorOrgOpcoCode: 'OPCO_EP',
    financingMode: 'OPCO',
    docStatus: null,
    isAgefice: false,
    participantDocs: new Map<string, { id: string }>(),
    pedagogicalAssets: new Map<string, { id: string }>(),
    ...over,
  };
}

function monter(participants: MatrixParticipant[], hasAgeficeParticipant = true) {
  render(
    <ParticipantDocMatrix
      sessionId="ses-1"
      userRole="ADMIN"
      hasAgeficeParticipant={hasAgeficeParticipant}
      participants={participants}
      productDocs={new Map()}
      sessionDocs={new Map()}
    />,
  );
}

// Sans `globals: true`, l'auto-cleanup de testing-library ne s'arme pas : le
// DOM du test précédent survivrait et rendrait tous les `queryBy*` menteurs.
beforeEach(() => {
  cleanup();
});

describe('ParticipantDocMatrix — le régime décide, pas le composant', () => {
  it('une pièce HORS RÉGIME et SANS document est « NA », jamais « MISSING »', () => {
    monter([
      participant({ id: 'part-florent', docTypesHorsRegime: HORS_REGIME_OPCO }),
    ]);

    expect(screen.getByText('part-florent | AGEFICE | NA')).toBeTruthy();
    // L'assiduité, elle aussi hors régime chez un OPCO classique.
    expect(screen.getByText('part-florent | ASSIDUITE | NA')).toBeTruthy();
    // La convention, EN régime, reste réclamée.
    expect(screen.getByText('part-florent | CONVENTION | MISSING')).toBeTruthy();
  });

  it('PUISSANCE — une pièce hors régime dont le DOCUMENT EXISTE reste affichée telle quelle', () => {
    monter([
      participant({
        id: 'part-florent',
        docTypesHorsRegime: HORS_REGIME_OPCO,
        participantDocs: new Map([['AGEFICE', { id: 'doc-agefice-existant' }]]),
      }),
    ]);

    expect(screen.getByText('part-florent | AGEFICE | GENERATED')).toBeTruthy();
    expect(screen.queryByText('part-florent | AGEFICE | NA')).toBeNull();
  });

  it('sans `docTypesHorsRegime`, la matrice rend exactement ce qu’elle rendait avant', () => {
    monter([participant({ id: 'part-sans-regime' })]);

    expect(screen.getByText('part-sans-regime | AGEFICE | MISSING')).toBeTruthy();
    expect(screen.getByText('part-sans-regime | CONVENTION | MISSING')).toBeTruthy();
  });

  it('financeur INCONNU : les pièces de financeur sont « NA », la convention reste « MISSING »', () => {
    // Ce que `docTypesSansObjet(null)` rend : un commanditaire sans code
    // financeur (fonds propres) doit toujours sa convention.
    monter([
      participant({
        id: 'part-auto',
        docTypesHorsRegime: new Set(['AGEFICE', 'ASSIDUITE']),
      }),
    ]);

    expect(screen.getByText('part-auto | AGEFICE | NA')).toBeTruthy();
    expect(screen.getByText('part-auto | CONVENTION | MISSING')).toBeTruthy();
  });

  it('la colonne AGEFICE reste absente quand la page ne la demande pas', () => {
    monter([participant({ id: 'part-marie', docTypesHorsRegime: HORS_REGIME_OPCO })], false);

    const colonnes = screen.getByTestId('colonnes').textContent ?? '';
    expect(colonnes.includes('AGEFICE')).toBe(false);
    expect(screen.queryByText('part-marie | AGEFICE | NA')).toBeNull();
  });
});
