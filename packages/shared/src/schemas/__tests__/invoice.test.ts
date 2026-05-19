import { describe, it, expect } from 'vitest';
import {
  CreateCreditNoteSchema,
  InvoiceReminderSettingsSchema,
  ExportInvoicesQuerySchema,
} from '../invoice';

/**
 * Tests Phase 11 Plan 11-04 Task 1 — schémas Zod centralisés Factures.
 *
 * Coverage (12 tests) — D-02/D-10/D-19 CONTEXT.md verrouillés :
 *  - CreateCreditNoteSchema (4 tests) : uuid + montant positif + motif ≥3 chars
 *  - InvoiceReminderSettingsSchema (7 tests) : array 1-3 entiers strictement
 *    croissants + creditNotePrefix regex /^[A-Z0-9]+$/ 1-8 chars optional
 *  - ExportInvoicesQuerySchema (1 test) : z.coerce.date sur strings ISO
 *
 * Pattern clone-strict tenant.test.ts (Phase 7-02).
 */

// ─── CreateCreditNoteSchema (Plans 11-05/11-07) ──────────────────────────

describe('CreateCreditNoteSchema', () => {
  it('Test 1 — accepte un input valide (uuid + positive + motif ≥3 chars)', () => {
    const parsed = CreateCreditNoteSchema.parse({
      originalInvoiceId: '11111111-1111-1111-1111-111111111111',
      amountHtToCredit: 250.5,
      motif: 'Erreur de tarif sur la facture initiale',
    });
    expect(parsed.originalInvoiceId).toBe('11111111-1111-1111-1111-111111111111');
    expect(parsed.amountHtToCredit).toBe(250.5);
    expect(parsed.motif).toMatch(/Erreur de tarif/);
  });

  it('Test 2 — rejette motif vide ou < 3 caractères', () => {
    const result = CreateCreditNoteSchema.safeParse({
      originalInvoiceId: '11111111-1111-1111-1111-111111111111',
      amountHtToCredit: 100,
      motif: 'ab',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.motif).toBeDefined();
    }
  });

  it('Test 3 — rejette amountHtToCredit négatif ou 0', () => {
    const r1 = CreateCreditNoteSchema.safeParse({
      originalInvoiceId: '11111111-1111-1111-1111-111111111111',
      amountHtToCredit: 0,
      motif: 'Motif valide',
    });
    expect(r1.success).toBe(false);

    const r2 = CreateCreditNoteSchema.safeParse({
      originalInvoiceId: '11111111-1111-1111-1111-111111111111',
      amountHtToCredit: -10,
      motif: 'Motif valide',
    });
    expect(r2.success).toBe(false);
  });

  it('Test 3bis — rejette un originalInvoiceId qui n\'est pas un uuid', () => {
    const r = CreateCreditNoteSchema.safeParse({
      originalInvoiceId: 'not-an-uuid',
      amountHtToCredit: 100,
      motif: 'Motif valide',
    });
    expect(r.success).toBe(false);
  });
});

// ─── InvoiceReminderSettingsSchema (Plans 11-04 server action + 11-06 worker) ─

describe('InvoiceReminderSettingsSchema', () => {
  it('Test 4 — invoiceReminderDays accepte [30, 45]', () => {
    const parsed = InvoiceReminderSettingsSchema.parse({
      invoiceReminderDays: [30, 45],
    });
    expect(parsed.invoiceReminderDays).toEqual([30, 45]);
  });

  it('Test 5 — rejette invoiceReminderDays vide []', () => {
    const result = InvoiceReminderSettingsSchema.safeParse({
      invoiceReminderDays: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.invoiceReminderDays).toBeDefined();
    }
  });

  it('Test 6 — rejette invoiceReminderDays > 3 items', () => {
    const result = InvoiceReminderSettingsSchema.safeParse({
      invoiceReminderDays: [30, 45, 60, 90],
    });
    expect(result.success).toBe(false);
  });

  it('Test 7 — rejette [45, 30] (non strictement croissant)', () => {
    const result = InvoiceReminderSettingsSchema.safeParse({
      invoiceReminderDays: [45, 30],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      // Le message custom doit mentionner "croissants"
      const flat = result.error.flatten();
      const messages = JSON.stringify(flat);
      expect(messages).toMatch(/croissants?/i);
    }
  });

  it('Test 8 — rejette [30, 30] (non strict, doublon)', () => {
    const result = InvoiceReminderSettingsSchema.safeParse({
      invoiceReminderDays: [30, 30],
    });
    expect(result.success).toBe(false);
  });

  it("Test 9 — creditNotePrefix='AVO' accepté", () => {
    const parsed = InvoiceReminderSettingsSchema.parse({
      invoiceReminderDays: [30, 45],
      creditNotePrefix: 'AVO',
    });
    expect(parsed.creditNotePrefix).toBe('AVO');
  });

  it("Test 10 — creditNotePrefix='avo' rejeté (regex /^[A-Z0-9]+$/)", () => {
    const result = InvoiceReminderSettingsSchema.safeParse({
      invoiceReminderDays: [30, 45],
      creditNotePrefix: 'avo',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.creditNotePrefix).toBeDefined();
    }
  });

  it("Test 11 — creditNotePrefix='TROPLONG12' rejeté (max 8)", () => {
    const result = InvoiceReminderSettingsSchema.safeParse({
      invoiceReminderDays: [30, 45],
      creditNotePrefix: 'TROPLONG12',
    });
    expect(result.success).toBe(false);
  });

  it("Test 11bis — creditNotePrefix optionnel (omis → undefined)", () => {
    const parsed = InvoiceReminderSettingsSchema.parse({
      invoiceReminderDays: [30, 45],
    });
    expect(parsed.creditNotePrefix).toBeUndefined();
  });

  it("Test 11ter — invoiceReminderDays accepte [30, 45, 60] (3 délais croissants)", () => {
    const parsed = InvoiceReminderSettingsSchema.parse({
      invoiceReminderDays: [30, 45, 60],
    });
    expect(parsed.invoiceReminderDays).toEqual([30, 45, 60]);
  });
});

// ─── ExportInvoicesQuerySchema (Plan 11-07 export comptable) ─────────────

describe('ExportInvoicesQuerySchema', () => {
  it('Test 12 — coerce string ISO → Date sur from/to', () => {
    const parsed = ExportInvoicesQuerySchema.parse({
      from: '2026-01-01',
      to: '2026-01-31',
    });
    expect(parsed.from).toBeInstanceOf(Date);
    expect(parsed.to).toBeInstanceOf(Date);
    expect(parsed.from.getUTCFullYear()).toBe(2026);
  });

  it('Test 12bis — accepte statuses optionnel', () => {
    const parsed = ExportInvoicesQuerySchema.parse({
      from: '2026-01-01',
      to: '2026-12-31',
      statuses: ['ISSUED', 'PAID'],
    });
    expect(parsed.statuses).toEqual(['ISSUED', 'PAID']);
  });
});
