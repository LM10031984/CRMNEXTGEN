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

it('bloque les clics répétés pendant la requête puis ferme le formulaire avec une confirmation visible', async () => {
  const { act, waitFor } = await import('@testing-library/react');
  const { recordCompanyOpcoDeposit } = await import('@/server/actions/opco-deposit');
  let finish!: (value: { ok: boolean }) => void;
  vi.mocked(recordCompanyOpcoDeposit).mockClear();
  vi.mocked(recordCompanyOpcoDeposit).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  render(<CompanyDepositTracker sessionId="s" sponsorOrgId="o" members={[{id:'p',depositedAt:null,depositedBy:null}]} depositedAt={null} depositedBy={null} userEmail="laurent@start-academy.fr" canWrite />);
  fireEvent.click(screen.getByRole('button',{name:'Déclarer le dépôt du groupe'}));
  const confirm = screen.getByRole('button',{name:/Confirmer pour/});
  fireEvent.click(confirm);
  expect((confirm as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole('button',{name:/Enregistrement en cours/})).toBeTruthy();
  fireEvent.click(confirm);
  expect(recordCompanyOpcoDeposit).toHaveBeenCalledTimes(1);
  await act(async () => finish({ok:true}));
  await waitFor(() => expect(screen.queryByRole('button',{name:/Confirmer pour/})).toBeNull());
  expect(screen.getByRole('status').textContent).toContain('Dépôt OPCO enregistré');
});

it('affiche une erreur persistante près du bouton et permet de réessayer', async () => {
  const { waitFor } = await import('@testing-library/react');
  const { recordCompanyOpcoDeposit } = await import('@/server/actions/opco-deposit');
  vi.mocked(recordCompanyOpcoDeposit).mockResolvedValueOnce({ok:false,error:'Le groupe a changé.'});
  render(<CompanyDepositTracker sessionId="s" sponsorOrgId="o" members={[{id:'p',depositedAt:null,depositedBy:null}]} depositedAt={null} depositedBy={null} userEmail="laurent@start-academy.fr" canWrite />);
  fireEvent.click(screen.getByRole('button',{name:'Déclarer le dépôt du groupe'}));
  fireEvent.click(screen.getByRole('button',{name:/Confirmer pour/}));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Le groupe a changé.'));
  expect((screen.getByRole('button',{name:/Confirmer pour/}) as HTMLButtonElement).disabled).toBe(false);
});
