/* @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ action: vi.fn(), refresh: vi.fn() }));
vi.mock('@/server/actions/session-regime', () => ({ setSessionRegime: f.action }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: f.refresh }) }));
import { SessionRegimeEditor } from '../session-regime-editor';
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
