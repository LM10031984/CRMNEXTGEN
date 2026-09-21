/* @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';

/**
 * Le panneau « génération en cours » de la matrice (prod, 21/09).
 *
 * Il ferme la seconde moitié du défaut : ne pas offrir de lien tant que le job
 * tourne ne suffit pas, encore faut-il que l'écran se REMETTE À JOUR tout seul
 * quand il a fini — sinon on a remplacé « not found jusqu'à ce que je
 * recharge » par « en cours jusqu'à ce que je recharge ».
 *
 * Il réutilise `ClosureBatchProgress`, qui savait déjà suivre un batch mais
 * n'était monté que sur sa page dédiée : le chemin unitaire de la matrice
 * jetait le `batchId` et affichait un toast « résultat dans ~2 min ».
 */

const { refresh, getClosureBatchStatus } = vi.hoisted(() => ({
  refresh: vi.fn(),
  getClosureBatchStatus: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('@/server/actions/closure-pack', () => ({
  getClosureBatchStatus,
  retryClosureBatchErrors: vi.fn(),
}));
vi.mock('@/server/actions/qualiopi-matrix', () => ({ regenerateParticipantDoc: vi.fn() }));

import { GenerationEnCoursPanel } from '../generation-en-cours-panel';

const batch = (status: string, doneDocs: number) => ({
  ok: true,
  batch: {
    id: 'b1',
    status,
    totalDocs: 1,
    doneDocs,
    errorDocs: 0,
    jobs: [
      {
        id: 'j1',
        participantId: 'p1',
        participantName: 'Katia T.',
        kind: 'ATTESTATION',
        status: status === 'COMPLETED' ? 'DONE' : 'PROCESSING',
      },
    ],
  },
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('GenerationEnCoursPanel', () => {
  it('ne rend rien quand aucune génération n’est en vol', () => {
    const { container } = render(<GenerationEnCoursPanel sessionId="s1" batchIds={[]} />);
    expect(container.firstChild).toBeNull();
    expect(getClosureBatchStatus).not.toHaveBeenCalled();
  });

  it('dit que la génération est en cours tant que le batch tourne', async () => {
    getClosureBatchStatus.mockResolvedValue(batch('RUNNING', 0));
    render(<GenerationEnCoursPanel sessionId="s1" batchIds={['b1']} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText(/Génération en cours/i)).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('rafraîchit la page UNE fois quand le batch se termine — l’écran reprend les nouveaux identifiants', async () => {
    getClosureBatchStatus
      .mockResolvedValueOnce(batch('RUNNING', 0))
      .mockResolvedValue(batch('COMPLETED', 1));
    render(<GenerationEnCoursPanel sessionId="s1" batchIds={['b1']} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(refresh).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    // Un tick de plus ne redéclenche rien : le polling s'est arrêté.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('rafraîchit aussi sur un échec : la cellule doit redevenir actionnable', async () => {
    getClosureBatchStatus.mockResolvedValue(batch('FAILED', 0));
    render(<GenerationEnCoursPanel sessionId="s1" batchIds={['b1']} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
