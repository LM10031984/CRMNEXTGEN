import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Tests Phase 11 Plan 11-04 Task 3 — InvoiceSettingsForm source-regex.
 *
 * Pattern D-Phase9-N : `@testing-library/react` n'est pas installé et
 * `vitest.config.ts` déclare environment 'node'. On vérifie structurellement
 * la présence des éléments clés (anti-régression) :
 *  - directive 'use client'
 *  - imports Zod schema + server action + RHF
 *  - 2 inputs identifiés (creditNotePrefix + invoiceReminderDaysCsv)
 *  - button submit avec disabled isPending
 *
 * Couverture (4 tests + sanity additionnels) :
 *  Test 1 — 'use client' directive en première ligne
 *  Test 2 — imports : InvoiceReminderSettingsSchema, updateInvoiceReminderSettings, useForm
 *  Test 3 — 2 inputs identifiés par leur id
 *  Test 4 — bouton submit utilise `disabled={isPending}`
 */

const SOURCE = readFileSync(
  resolve(__dirname, '../invoice-settings-form.tsx'),
  'utf-8',
);

describe('InvoiceSettingsForm source-regex', () => {
  it("Test 1 — 'use client' directive présente en début de fichier", () => {
    const firstNonEmptyLine = SOURCE.split('\n').find((l) => l.trim().length > 0);
    expect(firstNonEmptyLine).toBe("'use client';");
  });

  it("Test 2 — imports critiques : InvoiceReminderSettingsSchema, updateInvoiceReminderSettings, useForm", () => {
    expect(SOURCE).toMatch(/from\s+['"]@qualiof\/shared['"]/);
    expect(SOURCE).toMatch(/InvoiceReminderSettingsSchema/);
    expect(SOURCE).toMatch(
      /from\s+['"]@\/server\/actions\/invoice-settings['"]/,
    );
    expect(SOURCE).toMatch(/updateInvoiceReminderSettings/);
    expect(SOURCE).toMatch(/from\s+['"]react-hook-form['"]/);
    expect(SOURCE).toMatch(/useForm/);
  });

  it("Test 3 — 2 inputs identifiés : creditNotePrefix + invoiceReminderDaysCsv", () => {
    expect(SOURCE).toMatch(/id="invoice-creditNotePrefix"/);
    expect(SOURCE).toMatch(/id="invoice-invoiceReminderDaysCsv"/);
    // Anti-régression : register sur les 2 fields
    expect(SOURCE).toMatch(/register\(['"]creditNotePrefix['"]/);
    expect(SOURCE).toMatch(/register\(['"]invoiceReminderDaysCsv['"]/);
  });

  it("Test 4 — bouton submit avec disabled={isPending} et useTransition", () => {
    expect(SOURCE).toMatch(/useTransition/);
    expect(SOURCE).toMatch(/type="submit"/);
    expect(SOURCE).toMatch(/disabled=\{isPending\}/);
    // Label dynamique pendant l'envoi
    expect(SOURCE).toMatch(/Enregistrement/);
  });

  it("Test 5 sanity — sonner toast.error + toast.success branchés", () => {
    expect(SOURCE).toMatch(/from\s+['"]sonner['"]/);
    expect(SOURCE).toMatch(/toast\.error/);
    expect(SOURCE).toMatch(/toast\.success/);
  });

  it("Test 6 sanity — accessibility hints (aria-describedby + label htmlFor)", () => {
    // Chaque input doit avoir un aria-describedby vers son hint
    expect(SOURCE).toMatch(/aria-describedby="invoice-creditNotePrefix-help"/);
    expect(SOURCE).toMatch(/aria-describedby="invoice-reminder-days-help"/);
    expect(SOURCE).toMatch(/htmlFor="invoice-creditNotePrefix"/);
    expect(SOURCE).toMatch(/htmlFor="invoice-invoiceReminderDaysCsv"/);
  });
});
