import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Tests Phase 11 Plan 11-06 Task 3 — `SendReminderButton`.
 *
 * Approche source-regex (D-Phase9-N + pattern Phase 11
 * `create-credit-note-dialog.test.ts`) : on grep le fichier source pour
 * vérifier la présence des éléments structurels imposés par les décisions
 * D-09 (triggered_by:'manual'), D-Phase9-J (Radix Dialog vs AlertDialog) et
 * la spec Plan 11-06 Task 3 (bouton désactivé si status non éligible ou
 * niveau max atteint).
 *
 * On évite de rendre le composant via React Testing Library (non installé,
 * vitest env=node) — ce composant sera vérifié visuellement dans le test
 * E2E manuel de 11-VALIDATION.md.
 */

const SOURCE = readFileSync(
  resolve(__dirname, '../send-reminder-button.tsx'),
  'utf-8',
);

describe('SendReminderButton — source regex', () => {
  it("Test 1 — directive 'use client' présente (Client Component)", () => {
    expect(SOURCE).toMatch(/^'use client'/);
  });

  it("Test 2 — import @radix-ui/react-dialog (D-Phase9-J) + sendInvoiceReminder", () => {
    expect(SOURCE).toMatch(/from\s+['"]@radix-ui\/react-dialog['"]/);
    expect(SOURCE).toContain('sendInvoiceReminder');
    expect(SOURCE).toMatch(
      /from\s+['"]@\/server\/actions\/invoices['"]/,
    );
  });

  it('Test 3 — trigger contient verbatim "Envoyer relance maintenant"', () => {
    expect(SOURCE).toContain('Envoyer relance maintenant');
  });

  it("Test 4 — appelle sendInvoiceReminder avec triggered_by: 'manual' (D-09)", () => {
    expect(SOURCE).toMatch(/triggered_by:\s*['"]manual['"]/);
  });

  it('Test 5 — disabled si status non éligible OU reminderCount >= maxLevel', () => {
    // pattern : check status ∈ {ISSUED, PARTIAL, OVERDUE}
    expect(SOURCE).toMatch(/ISSUED.*PARTIAL.*OVERDUE/);
    // pattern : reminderCount >= maxLevel
    expect(SOURCE).toMatch(/reminderCount\s*>=\s*maxLevel/);
    // pattern : prop disabled wired
    expect(SOURCE).toMatch(/disabled=\{disabled\}/);
  });
});
