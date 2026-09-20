// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/server/actions/opco-deposit', () => ({ recordCompanyOpcoDeposit: vi.fn() }));

import { CompanyDepositTracker } from '../company-deposit-tracker';
afterEach(cleanup);

describe('CompanyDepositTracker — correction d’un faux dépôt', () => {
  it('laisse annuler une déclaration existante quand les pièces sont désormais incomplètes', () => {
    render(
      <CompanyDepositTracker
        sessionId="session"
        sponsorOrgId="org"
        members={[
          {
            id: 'p',
            depositedAt: '2026-09-20T12:00:00.000Z',
            depositedBy: 'formation@start-academy.fr',
          },
        ]}
        depositedAt="2026-09-20T12:00:00.000Z"
        depositedBy="formation@start-academy.fr"
        userEmail="formation@start-academy.fr"
        canWrite
        readyToDeposit={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Corriger la déclaration du groupe' }));
    expect(screen.getByRole('button', { name: 'Annuler la déclaration' })).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: /Confirmer pour/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByText(/peut toujours être corrigée ou annulée/)).toBeTruthy();
  });
});


it('garde le bouton visible et explique le blocage, puis autorise la confirmation une fois les pièces ajoutées', () => {
  const props = {
    sessionId: 'session', sponsorOrgId: 'gcs',
    members: [{ id: 'pierre', depositedAt: null, depositedBy: null }],
    depositedAt: null, depositedBy: null, userEmail: 'laurent@start-academy.fr', canWrite: true,
  };
  const view = render(<CompanyDepositTracker {...props} readyToDeposit={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Déclarer le dépôt du groupe' }));
  expect((screen.getByRole('button', { name: /Confirmer pour/ }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/après ajout de la convention signée et du programme/)).toBeTruthy();
  view.rerender(<CompanyDepositTracker {...props} readyToDeposit />);
  expect((screen.getByRole('button', { name: /Confirmer pour/ }) as HTMLButtonElement).disabled).toBe(false);
});
