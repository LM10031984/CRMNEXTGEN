/* @vitest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/server/actions/qualiopi-matrix', () => ({ uploadSignedScans: vi.fn() }));
import { DepotPiecesSignees } from '../depot-pieces-signees';
afterEach(cleanup);
it('offre les quatre types et une affectation individuelle avant enregistrement', () => {
  const { container } = render(
    <DepotPiecesSignees
      sessionId="session"
      participants={[
        { id: 'a', fullName: 'Gavina FORLANI' },
        { id: 'b', fullName: 'Jean DUPONT' },
      ]}
    />,
  );
  expect(screen.getByText(/DocuSeal se rangent automatiquement/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Déposer des pièces signées' }));
  const type = screen.getByLabelText('Type de document') as HTMLSelectElement;
  expect(Array.from(type.options).map((o) => o.value)).toEqual([
    'CONVENTION',
    'AGEFICE',
    'EMARGEMENT',
    'ASSIDUITE',
  ]);
  fireEvent.change(type, { target: { value: 'ASSIDUITE' } });
  expect(screen.getByText('Déposer les attestations d’assiduité signées')).toBeTruthy();
  fireEvent.change(container.querySelector('input[type=file]')!, {
    target: { files: [new File(['%PDF'], 'forlani.pdf', { type: 'application/pdf' })] },
  });
  const assigned = screen.getByLabelText('Stagiaire pour forlani.pdf') as HTMLSelectElement;
  expect(assigned.value).toBe('a');
  expect(Array.from(assigned.options).some((o) => o.value === 'b')).toBe(true);
});
it('permet de consulter le PDF signé dans un nouvel onglet', () => {
  render(
    <DepotPiecesSignees
      sessionId="session"
      participants={[]}
      pieces={[
        {
          apprenant: 'Gavina FORLANI',
          label: 'Assiduité',
          href: '/api/signed/assiduite',
          source: 'Dépôt manuel',
        },
      ]}
    />,
  );
  const link = screen.getByRole('link', { name: 'Consulter Assiduité de Gavina FORLANI' });
  expect(link.getAttribute('href')).toBe('/api/signed/assiduite');
  expect(link.getAttribute('target')).toBe('_blank');
});
