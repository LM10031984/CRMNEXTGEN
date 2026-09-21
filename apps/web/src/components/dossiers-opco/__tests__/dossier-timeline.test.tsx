// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@/server/actions/dossiers-opco', () => ({ toggleDossierBoolean: vi.fn() }));
import { DossierTimeline } from '../dossier-timeline';
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const initial = {
  invoiceSent: true,
  opcoApproved: false,
  opcoReimbursed: false,
  paymentReceived: false,
  invoiceSentAt: new Date('2026-01-01'),
  opcoApprovedAt: null,
  opcoReimbursedAt: null,
  paymentReceivedAt: null,
};
it('calcule le délai AGEFICE depuis le dépôt et jamais depuis une facture ancienne', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
  const view = render(
    <DossierTimeline
      participantId="p"
      initial={initial}
      agefice
      depositedAt="2026-10-19T12:00:00Z"
    />,
  );
  expect(screen.getByRole('button', { name: /Accord du financeur/ }).className).not.toContain(
    'bg-amber',
  );
  expect(screen.getByRole('button', { name: /Accord du financeur/ }).title).toContain(
    'dépôt il y a 1j',
  );
  view.rerender(
    <DossierTimeline
      participantId="p"
      initial={initial}
      agefice
      depositedAt="2026-10-01T12:00:00Z"
    />,
  );
  expect(screen.getByRole('button', { name: /Accord du financeur/ }).className).toContain(
    'bg-amber',
  );
});
it('reste neutre sans dépôt confirmé et sur un dossier historique', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
  const view = render(<DossierTimeline participantId="p" initial={initial} agefice />);
  expect(screen.getByRole('button', { name: /Accord du financeur/ }).className).not.toContain(
    'bg-amber',
  );
  view.rerender(
    <DossierTimeline
      participantId="p"
      initial={initial}
      agefice
      depositedAt="2026-01-01"
      alertsEnabled={false}
    />,
  );
  expect(screen.getByRole('button', { name: /Accord du financeur/ }).className).not.toContain(
    'bg-amber',
  );
});
