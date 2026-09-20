/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ action: vi.fn(), refresh: vi.fn() }));
vi.mock('@/server/actions/session-regime', () => ({ setSessionRegime: f.action }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: f.refresh }) }));
import { SessionRegimeEditor } from '../session-regime-editor';
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('ne confond pas le prix historique par stagiaire avec le nouveau forfait et exige la revue', async () => {
  f.action
    .mockResolvedValueOnce({ ok: true, changed: false, confirmationKey: 'review' })
    .mockResolvedValueOnce({ ok: true, changed: true });
  render(<SessionRegimeEditor sessionId="s" regime={null} price={120} />);
  fireEvent.click(screen.getByRole('button', { name: /Régime non déclaré/ }));
  fireEvent.change(screen.getByLabelText('Régime de la session'), {
    target: { value: 'ENTREPRISE' },
  });
  const price = screen.getByLabelText('Prix total HT (€)') as HTMLInputElement;
  expect(price.value).toBe('');
  fireEvent.change(price, { target: { value: '240' } });
  fireEvent.click(screen.getByRole('button', { name: 'Prévisualiser' }));
  await screen.findByRole('button', { name: 'Confirmer' });
  expect(f.action).toHaveBeenLastCalledWith(
    expect.objectContaining({ priceHT: 240, regime: 'ENTREPRISE', apply: false }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
  await waitFor(() =>
    expect(f.action).toHaveBeenLastCalledWith(
      expect.objectContaining({ apply: true, confirmationKey: 'review' }),
    ),
  );
});

it('verrouille la prévisualisation pendant la requête et affiche une erreur réseau récupérable', async () => {
  let reject!: (reason: Error) => void;
  f.action.mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  render(<SessionRegimeEditor sessionId="s" regime="ENTREPRISE" price={240} />);
  fireEvent.click(screen.getByRole('button', { name: /Entreprise ·/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Prévisualiser' }));
  const pending = screen.getByRole('button', { name: 'Vérification…' }) as HTMLButtonElement;
  expect(pending.disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Annuler' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  fireEvent.click(pending);
  expect(f.action).toHaveBeenCalledTimes(1);
  await act(async () => reject(new Error('network')));
  expect(screen.getByRole('alert').textContent).toContain('Enregistrement non confirmé');
  expect(
    (screen.getByRole('button', { name: 'Prévisualiser' }) as HTMLButtonElement).disabled,
  ).toBe(false);
});

it('reprend les valeurs actuelles après annulation et actualisation du régime', () => {
  const view = render(<SessionRegimeEditor sessionId="s" regime="ENTREPRISE" price={240} />);
  fireEvent.click(screen.getByRole('button', { name: /Entreprise ·/ }));
  fireEvent.change(screen.getByLabelText('Prix total HT (€)'), { target: { value: '999' } });
  fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
  view.rerender(<SessionRegimeEditor sessionId="s" regime="ENTREPRISE" price={360} />);
  fireEvent.click(screen.getByRole('button', { name: /Entreprise ·/ }));
  expect((screen.getByLabelText('Prix total HT (€)') as HTMLInputElement).value).toBe('360');
});
