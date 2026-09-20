// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/server/actions/opco-deposit', () => ({ recordCompanyOpcoDeposit: vi.fn() }));

import { CompanyDepositTracker } from '../company-deposit-tracker';

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
