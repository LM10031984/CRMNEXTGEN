import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Tests Phase 11 Plan 11-05 Task 3 — `CreateCreditNoteDialog`.
 *
 * Approche source-regex (pattern Phase 9 smoke tests + Phase 11
 * `invoice-settings-form.test.ts`) : on grep le fichier source pour vérifier
 * la présence des éléments structurels imposés par la décision D-Phase9-J
 * (Radix Dialog) et la spec Plan 11-05.
 *
 * On évite de rendre le composant avec React Testing Library pour ne pas
 * avoir à mocker `next/navigation` (router) + `next-cache` + sonner +
 * la server action côté browser. Ce composant sera vérifié visuellement
 * dans le test E2E manuel de 11-VALIDATION.md.
 */

const SOURCE = readFileSync(
  resolve(__dirname, '../create-credit-note-dialog.tsx'),
  'utf-8',
);

describe('CreateCreditNoteDialog — source regex', () => {
  it("Test 1 — directive 'use client' présente (Client Component)", () => {
    expect(SOURCE).toMatch(/^'use client'/);
  });

  it("Test 2 — import @radix-ui/react-dialog (D-Phase9-J : pas d'AlertDialog)", () => {
    expect(SOURCE).toMatch(/from\s+['"]@radix-ui\/react-dialog['"]/);
  });

  it('Test 3 — importe CreateCreditNoteSchema et createCreditNote', () => {
    expect(SOURCE).toContain('CreateCreditNoteSchema');
    expect(SOURCE).toContain('createCreditNote');
    expect(SOURCE).toMatch(/from\s+['"]@qualiof\/shared['"]/);
    expect(SOURCE).toMatch(/from\s+['"]@\/server\/actions\/invoices['"]/);
  });

  it('Test 4 — contient Dialog.Title + Dialog.Description + Dialog.Close (a11y Radix)', () => {
    expect(SOURCE).toContain('<Dialog.Title');
    expect(SOURCE).toContain('<Dialog.Description');
    expect(SOURCE).toContain('<Dialog.Close');
  });

  it('Test 5 — bouton trigger contient verbatim "Créer un avoir"', () => {
    expect(SOURCE).toContain('Créer un avoir');
  });

  it('Test 6 — bouton submit disabled si pending (useTransition)', () => {
    // pattern : `disabled={pending}` sur le bouton submit
    expect(SOURCE).toMatch(/disabled=\{pending\}/);
    // useTransition importé
    expect(SOURCE).toMatch(/useTransition/);
  });

  it('Test 7 — RHF + zodResolver wired sur CreateCreditNoteSchema', () => {
    expect(SOURCE).toMatch(/useForm</);
    expect(SOURCE).toMatch(/zodResolver\(CreateCreditNoteSchema\)/);
  });
});
