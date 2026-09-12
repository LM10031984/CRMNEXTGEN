/* @vitest-environment jsdom */
/**
 * Le tri de la liste des factures, vu du clic (Laurent 2026-09-10 : « que je
 * puisse cliquer sur numéro, date, payeur, montant ou statut »).
 *
 * Ce qui est vérifié ici et nulle part ailleurs : le classement voyage dans
 * l'URL, et un changement de colonne REMET À LA PAGE 1 — sinon on reste page 3
 * d'un classement qui n'existe plus, sur un extrait du milieu sans rapport avec
 * le clic.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const replace = vi.fn();
let searchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/app/factures',
  useSearchParams: () => searchParams,
}));

import { InvoicesListTable } from '../invoices-list-table';
import type { InvoiceRow } from '@/server/actions/invoices-list';

const ROWS: InvoiceRow[] = [
  {
    id: 'inv-1',
    number: 'F-202601-214',
    status: 'ISSUED',
    issueDate: new Date('2026-08-12T00:00:00Z'),
    amountTtc: 3024,
    amountPaid: 0,
    payerLabel: 'BIANCO INVEST',
    isAvoir: false,
    originalInvoiceId: null,
    originalNumber: null,
    lastReminderAt: null,
    reminderCount: 0,
  },
];

function tri(nom: RegExp) {
  return screen.getByRole('button', { name: nom });
}

describe('InvoicesListTable — colonnes triables', () => {
  beforeEach(() => {
    cleanup();
    replace.mockClear();
    searchParams = new URLSearchParams();
  });

  it('rend cliquables les cinq colonnes demandées', () => {
    render(<InvoicesListTable rows={ROWS} />);
    for (const nom of [/numéro/i, /date/i, /payeur/i, /montant ttc/i, /statut/i]) {
      expect(tri(nom)).toBeTruthy();
    }
  });

  it('laisse « Reste » et « Relances » fixes — ce sont des valeurs calculées', () => {
    render(<InvoicesListTable rows={ROWS} />);
    expect(screen.queryByRole('button', { name: /reste/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /relances/i })).toBeNull();
  });

  it('premier clic : croissant sur cette colonne', () => {
    render(<InvoicesListTable rows={ROWS} />);
    fireEvent.click(tri(/montant ttc/i));
    expect(replace).toHaveBeenCalledWith('/app/factures?sort=montant&dir=asc');
  });

  it('deuxième clic : décroissant', () => {
    searchParams = new URLSearchParams('sort=montant&dir=asc');
    render(<InvoicesListTable rows={ROWS} />);
    fireEvent.click(tri(/montant ttc/i));
    expect(replace).toHaveBeenCalledWith('/app/factures?sort=montant&dir=desc');
  });

  it('troisième clic : retour au classement par défaut', () => {
    searchParams = new URLSearchParams('sort=montant&dir=desc');
    render(<InvoicesListTable rows={ROWS} />);
    fireEvent.click(tri(/montant ttc/i));
    expect(replace).toHaveBeenCalledWith('/app/factures?');
  });

  it('garde les filtres en cours et repart à la première page', () => {
    searchParams = new URLSearchParams('status=OVERDUE&period=year&page=3');
    render(<InvoicesListTable rows={ROWS} />);
    fireEvent.click(tri(/payeur/i));
    const url = replace.mock.calls[0]![0] as string;
    expect(url).toContain('status=OVERDUE');
    expect(url).toContain('period=year');
    expect(url).toContain('sort=payeur&dir=asc');
    expect(url).not.toContain('page=3');
  });
});
