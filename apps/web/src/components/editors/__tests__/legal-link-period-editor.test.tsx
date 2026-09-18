/* @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
const update = vi.hoisted(() => vi.fn());
vi.mock('@/server/actions/legal-links', () => ({ updateLegalLink: update }));
import { LegalLinkPeriodEditor } from '../legal-link-period-editor';
it('montre la période puis exige la revue avant la confirmation', async () => {
  update
    .mockResolvedValueOnce({
      ok: true,
      changed: false,
      confirmationKey: 'reviewed',
      preview: {
        before: { role: 'AGENT_COMMERCIAL', startDate: null, endDate: null },
        after: { role: 'AGENT_COMMERCIAL', startDate: null, endDate: '2026-01-31' },
        next: { role: 'SALARIE', startDate: '2026-02-01', endDate: null },
      },
    })
    .mockResolvedValueOnce({ ok: true, changed: true });
  render(
    <LegalLinkPeriodEditor
      link={{
        id: 'link',
        role: 'AGENT_COMMERCIAL',
        startDate: null,
        endDate: null,
        function: null,
      }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Modifier le rattachement' }));
  fireEvent.change(screen.getByLabelText('Opération'), { target: { value: 'role' } });
  fireEvent.change(screen.getByLabelText('Nouveau rôle'), { target: { value: 'SALARIE' } });
  fireEvent.change(screen.getByLabelText('À partir du'), { target: { value: '2026-02-01' } });
  fireEvent.click(screen.getByRole('button', { name: 'Vérifier les changements' }));
  await screen.findByText(/2026-01-31/);
  expect(update.mock.calls[0]?.[0].apply).not.toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer les changements' }));
  await waitFor(() =>
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({ apply: true, confirmationKey: 'reviewed' }),
    ),
  );
});
