// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  leads: vi.fn(),
  commercials: vi.fn(),
  diagnostics: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ validateRequest: mocks.user }));
vi.mock('@qualiof/db', () => ({
  prisma: { lead: { findMany: mocks.leads }, user: { findMany: mocks.commercials } },
}));
vi.mock('@/lib/diagnostic/file-attente', () => ({
  compterDiagnosticsEnAttente: mocks.diagnostics,
}));
vi.mock('@/components/leads/auto-assign-button', () => ({ AutoAssignLeadsButton: () => null }));
vi.mock('@/components/diagnostic/programmes-en-attente-button', () => ({
  ProgrammesEnAttenteButton: () => null,
}));

import LeadsPage from '../page';

function record(id: number, city = 'Nice', tenantId = 'tenant-a') {
  return {
    id: `lead-${id}`,
    firstName: 'Contact',
    lastName: `${id}`,
    person: null,
    email: null,
    phone: null,
    source: 'MLS_COTE_D_AZUR',
    status: 'NEW',
    createdAt: new Date('2026-09-20'),
    ownerUserId: 'commercial-a',
    owner: { firstName: 'Commercial', lastName: 'Test' },
    lastAction: null,
    interestedProduct: null,
    organization: {
      id: `org-${city}`,
      tenantId,
      legalName: 'Agence Azur',
      brandName: null,
      representative: 'Signataire différent',
      crmManagers: ['Alice Martin'],
      contacts: [],
      address: { street: '12 rue de la Paix', city },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ user: { tenantId: 'tenant-a' } });
  mocks.leads.mockResolvedValue([record(1), record(2, 'Cannes')]);
  mocks.commercials.mockResolvedValue([{ id: 'commercial-a' }]);
  mocks.diagnostics.mockResolvedValue(0);
});
afterEach(cleanup);

describe('liste CRM classée', () => {
  it('affiche les filtres métier et distingue responsable d’agence et commercial', async () => {
    render(await LeadsPage({}));
    for (const label of [
      'Agence',
      'Responsable d’agence',
      'Point de vente',
      'Commercial chargé du suivi',
    ]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect(screen.getByText(/1 agence · 2 points de vente/)).toBeTruthy();
    const table = screen.getByRole('table');
    expect(within(table).getAllByText('Alice Martin')).toHaveLength(2);
    expect(within(table).getAllByText('Commercial Test')).toHaveLength(2);
    expect(within(table).getByText('12 rue de la Paix, Cannes')).toBeTruthy();
  });
  it('charge uniquement les leads du tenant connecté sans plafond de 200', async () => {
    await LeadsPage({ searchParams: { agence: 'autre agence' } });
    expect(mocks.leads).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-a' } }),
    );
    expect(mocks.leads.mock.calls[0]![0]).not.toHaveProperty('take');
  });
  it('ne charge rien sans authentification', async () => {
    mocks.user.mockResolvedValue({ user: null });
    expect(await LeadsPage({})).toBeNull();
    expect(mocks.leads).not.toHaveBeenCalled();
    expect(mocks.diagnostics).not.toHaveBeenCalled();
  });
  it('ne révèle pas une agence accidentellement rattachée à un autre tenant', async () => {
    mocks.leads.mockResolvedValue([record(1, 'Ville confidentielle', 'tenant-b')]);
    render(await LeadsPage({}));
    expect(screen.queryByText(/Ville confidentielle/)).toBeNull();
    expect(within(screen.getByRole('table')).getByText('Agence à rattacher')).toBeTruthy();
  });
  it('pagine après filtrage et conserve les filtres dans les liens de pagination', async () => {
    mocks.leads.mockResolvedValue(Array.from({ length: 251 }, (_, i) => record(i)));
    render(
      await LeadsPage({ searchParams: { source: 'MLS_COTE_D_AZUR', tri: 'agence', page: '5' } }),
    );
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(51);
    const next = screen.getByRole('link', { name: /Suiv/ });
    expect(next.getAttribute('href')).toContain('page=6');
    expect(next.getAttribute('href')).toContain('source=MLS_COTE_D_AZUR');
    expect(screen.getByText('251 contacts dans la base')).toBeTruthy();
  });
  it('conserve le rappel d’un contact situé après la première page', async () => {
    const leads = Array.from({ length: 80 }, (_, i) => record(i));
    leads[79]!.lastAction = '[A] Diagnostic — Gagner du temps — rappel cette semaine' as never;
    mocks.leads.mockResolvedValue(leads);
    render(await LeadsPage({}));
    expect(screen.getByRole('heading', { name: /À rappeler aujourd/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Contact 79' })).toBeTruthy();
  });
  it('affiche un état vide explicite pour des filtres incompatibles', async () => {
    render(await LeadsPage({ searchParams: { agence: 'agence absente' } }));
    expect(screen.getByText('Aucun contact ne correspond aux filtres')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
