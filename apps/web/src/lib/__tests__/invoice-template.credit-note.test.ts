import { describe, it, expect } from 'vitest';
import { renderInvoiceHtml, type InvoiceData } from '../invoice-template';

/**
 * Tests Phase 11 Plan 11-05 Task 1 — extension `renderInvoiceHtml` mode AVOIR.
 *
 * Convention CGI art. 289 (note de crédit / NCN) :
 *  - Header `AVOIR` au lieu de `FACTURE`
 *  - Bandeau jaune visible « Avoir sur facture {originalNumber} émise le {originalIssueDate} »
 *
 * Rétro-compat OBLIGATOIRE :
 *  - Mode FACTURE par défaut (sans `documentKind`) → header inchangé
 *  - Mode FACTURE explicite (`documentKind: 'FACTURE'`) → idem
 *
 * Approche source-regex sur le HTML retourné (cohérent
 * `invoice-template.credit-note.test.ts` du plan).
 */

const BASE_DATA: InvoiceData = {
  number: 'FAC-000042',
  issueDate: new Date('2026-05-15T10:00:00Z'),
  dueDate: new Date('2026-06-14T10:00:00Z'),
  status: 'ISSUED',
  ofName: 'Start Academy',
  ofSiret: '12345678900012',
  ofRnq: '11756789012',
  ofAddress: '12 rue de la Paix, 75001 Paris',
  ofPhone: '01 23 45 67 89',
  ofEmail: 'contact@start-academy.fr',
  ofTvaIntra: null,
  payerName: 'Acme SARL',
  payerSiret: '11122233344455',
  payerAddress: '5 avenue des Champs-Élysées',
  payerCp: '75008',
  payerVille: 'Paris',
  payerEmail: 'compta@acme.fr',
  apprenantNom: 'Dupont',
  apprenantPrenom: 'Jean',
  formationTitre: 'Formation IA pour agents commerciaux',
  formationCode: 'SES-0042',
  formationDateDebut: new Date('2026-04-01T08:30:00Z'),
  formationDateFin: new Date('2026-04-05T17:30:00Z'),
  formationDureeHeures: 21,
  amountHT: 1500,
  vatRate: 0,
  amountTTC: 1500,
  notes: null,
  paymentMethod: 'Virement bancaire',
  paymentIban: null,
  paymentBic: null,
};

describe('renderInvoiceHtml — mode AVOIR (Plan 11-05)', () => {
  it("Test 1 — sans documentKind → header '<h1>FACTURE</h1>' (rétro-compat)", () => {
    const html = renderInvoiceHtml(BASE_DATA);
    expect(html).toContain('<h1>FACTURE</h1>');
    expect(html).not.toContain('<h1>AVOIR</h1>');
  });

  it("Test 2 — documentKind: 'FACTURE' → header '<h1>FACTURE</h1>'", () => {
    const html = renderInvoiceHtml({ ...BASE_DATA, documentKind: 'FACTURE' });
    expect(html).toContain('<h1>FACTURE</h1>');
    expect(html).not.toContain('<h1>AVOIR</h1>');
  });

  it("Test 3 — documentKind: 'AVOIR' → header '<h1>AVOIR</h1>'", () => {
    const html = renderInvoiceHtml({
      ...BASE_DATA,
      number: 'AVO-000001',
      documentKind: 'AVOIR',
      originalNumber: 'FAC-000042',
      originalIssueDate: new Date('2026-05-15T10:00:00Z'),
    });
    expect(html).toContain('<h1>AVOIR</h1>');
    expect(html).not.toContain('<h1>FACTURE</h1>');
  });

  it("Test 4 — mode AVOIR contient la mention 'Avoir sur facture FAC-000042'", () => {
    const html = renderInvoiceHtml({
      ...BASE_DATA,
      number: 'AVO-000001',
      documentKind: 'AVOIR',
      originalNumber: 'FAC-000042',
      originalIssueDate: new Date('2026-05-15T10:00:00Z'),
    });
    expect(html).toMatch(/Avoir sur facture\s+FAC-000042/);
  });

  it("Test 5 — mode AVOIR contient la date d'émission originale formatée fr-FR", () => {
    const html = renderInvoiceHtml({
      ...BASE_DATA,
      number: 'AVO-000001',
      documentKind: 'AVOIR',
      originalNumber: 'FAC-000042',
      originalIssueDate: new Date('2026-05-15T10:00:00Z'),
    });
    // Intl fr-FR sur 2026-05-15 → "15/05/2026"
    expect(html).toContain('15/05/2026');
  });
});
