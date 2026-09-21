/* @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

/**
 * Le menu de cellule face à une génération en vol ou échouée (21/09).
 *
 * Deux états, deux garanties :
 *   · GENERATING        → AUCUN geste. Ouvrir viserait un identifiant mourant,
 *                         « Régénérer » empilerait un second job.
 *   · GENERATION_FAILED → UN geste : « Relancer ». Jamais de menu, donc jamais
 *                         d'« Ouvrir » ni de « Télécharger » vers l'ancien
 *                         document — c'est la décision de Laurent : un échec ne
 *                         ressert pas l'ancien PDF.
 */

const { regenerateParticipantDoc, refresh } = vi.hoisted(() => ({
  regenerateParticipantDoc: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('@/server/actions/qualiopi-matrix', () => ({
  regenerateParticipantDoc,
  deleteDocument: vi.fn(),
  markDocStatus: vi.fn(),
}));
vi.mock('../upload-signed-doc-dialog', () => ({ UploadSignedDocDialog: () => null }));

import { DocCellMenu } from '../doc-cell-menu';

const props = {
  participantId: 'p1',
  docType: 'ATTESTATION_FIN',
  readOnly: false,
  participantName: 'Katia T.',
  docLabel: 'Attestation de fin de formation',
} as const;

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('DocCellMenu — génération', () => {
  it('GENERATING : ne rend aucun geste', () => {
    const { container } = render(<DocCellMenu {...props} state="GENERATING" />);
    expect(container.firstChild).toBeNull();
  });

  it('GENERATION_FAILED : « Relancer », et rien d’autre — ni menu, ni lien vers l’ancien document', () => {
    render(
      <DocCellMenu
        {...props}
        state="GENERATION_FAILED"
        // Même si un appelant passait encore la référence de l'ancien document,
        // l'état d'échec ne doit rien en faire.
        pdfRef={{ kind: 'document', id: 'ancien-id' }}
      />,
    );
    expect(screen.getByRole('button', { name: /Relancer la génération/i })).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(document.querySelector('a')).toBeNull();
    expect(document.body.innerHTML).not.toContain('ancien-id');
  });

  it('« Relancer » repasse par le même point de contrôle serveur que « Régénérer »', async () => {
    regenerateParticipantDoc.mockResolvedValue({ ok: true, batchId: 'b2' });
    render(<DocCellMenu {...props} state="GENERATION_FAILED" />);
    fireEvent.click(screen.getByRole('button', { name: /Relancer la génération/i }));
    await waitFor(() =>
      expect(regenerateParticipantDoc).toHaveBeenCalledWith({
        participantId: 'p1',
        docKind: 'ATTESTATION_FIN',
      }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
