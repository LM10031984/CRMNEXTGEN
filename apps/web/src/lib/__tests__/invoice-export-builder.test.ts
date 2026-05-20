import { describe, it, expect } from 'vitest';

/**
 * Tests Phase 11 Plan 11-07 Task 1 — Helper pur `buildInvoiceExportRows`.
 *
 * Helper sans I/O — pas de mock Prisma nécessaire. Couvre :
 *  - Forme des headers (12 colonnes verbatim D-14)
 *  - Mapping Type FAC / AVO selon status (D-16)
 *  - Calcul TVA = TTC - HT
 *  - Calcul Reste = TTC - Payé
 *  - Libellé : participant.person ou "Facture groupée"
 *  - Edge cases : SIRET vide, issueDate null, sheet vide
 */

import {
  buildInvoiceExportRows,
  EXPORT_HEADERS,
  type InvoiceExportInput,
} from '../invoice-export-builder';

const baseInvoice: InvoiceExportInput = {
  status: 'ISSUED',
  number: 'FAC-000001',
  issueDate: new Date('2026-05-15T00:00:00Z'),
  amountHT: 1000,
  amountTTC: 1200,
  amountPaid: 0,
  payerOrg: { legalName: 'Acme Corp', siret: '12345678900012' },
  participant: { person: { firstName: 'Jean', lastName: 'Dupont' } },
};

describe('buildInvoiceExportRows', () => {
  it('Test 1 — sheet vide accepté : retourne headers + rows=[]', () => {
    const { headers, rows } = buildInvoiceExportRows([]);
    expect(headers).toEqual(EXPORT_HEADERS);
    expect(rows).toEqual([]);
  });

  it('Test 2 — EXPORT_HEADERS contient exactement 12 colonnes verbatim D-14', () => {
    expect(EXPORT_HEADERS).toHaveLength(12);
    expect(EXPORT_HEADERS).toEqual([
      'Date émission',
      'Numéro',
      'Type',
      'Libellé',
      'Payeur',
      'SIRET',
      'Montant HT',
      'TVA',
      'Montant TTC',
      'Payé',
      'Reste',
      'Statut',
    ]);
  });

  it('Test 3 — Invoice status=ISSUED → row Type="FAC" + amountHT positif', () => {
    const { rows } = buildInvoiceExportRows([baseInvoice]);
    expect(rows[0]![2]).toBe('FAC');
    expect(rows[0]![6]).toBe(1000); // HT positif
  });

  it('Test 4 — Invoice status=CREDIT_NOTE → row Type="AVO" + amountHT négatif', () => {
    const avoir: InvoiceExportInput = {
      ...baseInvoice,
      status: 'CREDIT_NOTE',
      number: 'AVO-000001',
      amountHT: -500,
      amountTTC: -600,
    };
    const { rows } = buildInvoiceExportRows([avoir]);
    expect(rows[0]![2]).toBe('AVO');
    expect(rows[0]![6]).toBe(-500); // HT négatif (déjà stocké signé côté BDD Plan 11-05)
    expect(rows[0]![8]).toBe(-600); // TTC négatif
  });

  it('Test 5 — Invoice avec participant.person → Libellé = "{firstName} {lastName}"', () => {
    const { rows } = buildInvoiceExportRows([baseInvoice]);
    expect(rows[0]![3]).toBe('Jean Dupont');
  });

  it('Test 6 — Invoice sans participant → Libellé = "Facture groupée"', () => {
    const grouped: InvoiceExportInput = { ...baseInvoice, participant: null };
    const { rows } = buildInvoiceExportRows([grouped]);
    expect(rows[0]![3]).toBe('Facture groupée');
  });

  it('Test 7 — SIRET vide si pas de payerOrg', () => {
    const noPayer: InvoiceExportInput = { ...baseInvoice, payerOrg: null };
    const { rows } = buildInvoiceExportRows([noPayer]);
    expect(rows[0]![4]).toBe(''); // Payeur vide
    expect(rows[0]![5]).toBe(''); // SIRET vide
  });

  it('Test 8 — Calcul TVA = amountTTC - amountHT', () => {
    const { rows } = buildInvoiceExportRows([baseInvoice]);
    // TTC=1200 / HT=1000 → TVA=200
    expect(rows[0]![7]).toBe(200);
  });

  it('Test 9 — Calcul Reste = amountTTC - amountPaid', () => {
    const partial: InvoiceExportInput = { ...baseInvoice, amountPaid: 400 };
    const { rows } = buildInvoiceExportRows([partial]);
    // TTC=1200 / Payé=400 → Reste=800
    expect(rows[0]![9]).toBe(400);
    expect(rows[0]![10]).toBe(800);
  });

  it('Test 10 — issueDate null → colonne vide (string "")', () => {
    const noDate: InvoiceExportInput = { ...baseInvoice, issueDate: null };
    const { rows } = buildInvoiceExportRows([noDate]);
    expect(rows[0]![0]).toBe('');
  });

  it('Test 11 — Decimal stringifiés (Prisma) → coerced en Number proprement', () => {
    // Prisma Decimal arrive parfois en string — vérifier que Number() convertit OK.
    const decimalInvoice: InvoiceExportInput = {
      ...baseInvoice,
      amountHT: '1000.50',
      amountTTC: '1200.60',
      amountPaid: '500.25',
    };
    const { rows } = buildInvoiceExportRows([decimalInvoice]);
    expect(rows[0]![6]).toBe(1000.5);
    expect(rows[0]![8]).toBe(1200.6);
    // TVA = 1200.60 - 1000.50 = 200.10
    expect(rows[0]![7]).toBeCloseTo(200.1, 2);
    // Reste = 1200.60 - 500.25 = 700.35
    expect(rows[0]![10]).toBeCloseTo(700.35, 2);
  });

  it('Test 12 — issueDate Date → string ISO YYYY-MM-DD', () => {
    const inv: InvoiceExportInput = {
      ...baseInvoice,
      issueDate: new Date('2026-01-15T14:30:00Z'),
    };
    const { rows } = buildInvoiceExportRows([inv]);
    expect(rows[0]![0]).toBe('2026-01-15');
  });
});
