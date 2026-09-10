/**
 * Le tri de la liste des factures vient de l'URL — donc de l'utilisateur, donc
 * de n'importe quoi. Ces tests tiennent les deux bouts : ce qui entre est
 * validé, ce qui sort est un `orderBy` Prisma stable.
 *
 * Le départage par numéro n'est pas décoratif : sans lui, deux factures émises
 * le même jour changent de place d'un rafraîchissement à l'autre, et la
 * pagination fait alors réapparaître ou disparaître une ligne entre deux pages.
 */

import { describe, it, expect } from 'vitest';
import {
  coerceInvoiceSort,
  buildInvoicesOrderBy,
  INVOICE_SORT_KEYS,
  DEFAULT_INVOICES_ORDER_BY,
} from '../list-sort';

describe('coerceInvoiceSort', () => {
  it('accepte les cinq colonnes triables', () => {
    for (const key of INVOICE_SORT_KEYS) {
      expect(coerceInvoiceSort(key, 'asc')).toEqual({ sort: key, dir: 'asc' });
    }
  });

  it('ignore une colonne inconnue plutôt que de la passer à Prisma', () => {
    expect(coerceInvoiceSort('relances', 'asc')).toEqual({ sort: null, dir: 'desc' });
    expect(coerceInvoiceSort('; DROP TABLE', 'asc')).toEqual({ sort: null, dir: 'desc' });
    expect(coerceInvoiceSort(undefined, undefined)).toEqual({ sort: null, dir: 'desc' });
  });

  it('retombe sur « décroissant » quand le sens est absent ou fantaisiste', () => {
    expect(coerceInvoiceSort('montant', undefined).dir).toBe('desc');
    expect(coerceInvoiceSort('montant', 'ASC').dir).toBe('desc');
    expect(coerceInvoiceSort('montant', 'asc').dir).toBe('asc');
  });
});

describe('buildInvoicesOrderBy', () => {
  it('garde le classement par défaut quand aucune colonne n’est demandée', () => {
    expect(buildInvoicesOrderBy(null, 'desc')).toEqual(DEFAULT_INVOICES_ORDER_BY);
  });

  it('classe par numéro', () => {
    expect(buildInvoicesOrderBy('numero', 'asc')).toEqual([{ number: 'asc' }]);
  });

  it('classe par date, en repoussant les factures sans date en fin de liste', () => {
    expect(buildInvoicesOrderBy('date', 'asc')).toEqual([
      { issueDate: { sort: 'asc', nulls: 'last' } },
      { number: 'desc' },
    ]);
  });

  it('classe par payeur : la raison sociale, puis le nom de la personne', () => {
    expect(buildInvoicesOrderBy('payeur', 'asc')).toEqual([
      { payerOrg: { legalName: 'asc' } },
      { participant: { person: { lastName: 'asc' } } },
      { number: 'desc' },
    ]);
  });

  it('classe par montant TTC', () => {
    expect(buildInvoicesOrderBy('montant', 'desc')).toEqual([
      { amountTTC: 'desc' },
      { number: 'desc' },
    ]);
  });

  it('classe par statut', () => {
    expect(buildInvoicesOrderBy('statut', 'asc')).toEqual([
      { status: 'asc' },
      { number: 'desc' },
    ]);
  });

  it('départage toujours par numéro, sur toutes les colonnes', () => {
    for (const key of INVOICE_SORT_KEYS) {
      const orderBy = buildInvoicesOrderBy(key, 'asc');
      const dernier = orderBy[orderBy.length - 1] as Record<string, unknown>;
      // Le tri par numéro se départage tout seul.
      if (key === 'numero') continue;
      expect(Object.keys(dernier)).toEqual(['number']);
    }
  });
});
