import { describe, it, expect } from 'vitest';
import { renderInvoiceReminderEmail } from '../invoice-reminder';
import type { OfConfig } from '@/lib/of-config';

const MOCK_OF: OfConfig = {
  name: 'Start Academy',
  addressFull: '1 rue de la Paix, 75002 Paris',
  siret: '12345678900012',
  rnq: '11754321099',
} as OfConfig;

const BASE_INPUT = {
  invoiceNumber: 'FAC-000042',
  issueDate: new Date('2026-01-15T00:00:00Z'),
  dueDate: new Date('2026-02-14T00:00:00Z'),
  daysOverdue: 47,
  amountTtc: 1200,
  payerName: 'Société Dupont',
  invoiceUrl: 'https://app.example.fr/app/factures/inv-1',
};

describe('renderInvoiceReminderEmail', () => {
  it('level=1 → subject "Rappel — Facture {number} en attente" verbatim', () => {
    const { subject } = renderInvoiceReminderEmail({ ...BASE_INPUT, level: 1 }, MOCK_OF);
    expect(subject).toBe('Rappel — Facture FAC-000042 en attente');
  });

  it('level=2 → subject "Mise en demeure — Facture {number} impayée depuis {N} jours" verbatim', () => {
    const { subject } = renderInvoiceReminderEmail({ ...BASE_INPUT, level: 2 }, MOCK_OF);
    expect(subject).toBe('Mise en demeure — Facture FAC-000042 impayée depuis 47 jours');
  });

  it('text fallback contient invoiceNumber + amountTtc fr-FR + dueDate fr-FR', () => {
    const { text } = renderInvoiceReminderEmail({ ...BASE_INPUT, level: 1 }, MOCK_OF);
    expect(text).toContain('FAC-000042');
    // Intl fr-FR formatte 1200 → "1 200,00 €" (espace insécable + virgule)
    expect(text).toMatch(/1\s?200,00\s?€/);
    expect(text).toContain('14/02/2026');
  });

  it('html escape toutes les variables interpolées (Pitfall 6 — XSS)', () => {
    const { html } = renderInvoiceReminderEmail(
      { ...BASE_INPUT, level: 1, payerName: '<script>alert(1)</script>' },
      MOCK_OF,
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('level=2 html inclut la mention légale art. L441-10 Code de commerce', () => {
    const { html } = renderInvoiceReminderEmail({ ...BASE_INPUT, level: 2 }, MOCK_OF);
    expect(html).toContain('art. L441-10');
    expect(html).toContain('Code de commerce');
  });

  it('html contient le CTA <a href> vers invoiceUrl', () => {
    const { html } = renderInvoiceReminderEmail({ ...BASE_INPUT, level: 1 }, MOCK_OF);
    expect(html).toContain('href="https://app.example.fr/app/factures/inv-1"');
    expect(html).toContain('Consulter la facture');
  });

  it('html contient of.name dans header + footer', () => {
    const { html } = renderInvoiceReminderEmail({ ...BASE_INPUT, level: 1 }, MOCK_OF);
    const occurrences = html.split('Start Academy').length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2); // header + footer + signature
  });

  it('level=1 headline color = #00527A (BRAND_DARK)', () => {
    const { html } = renderInvoiceReminderEmail({ ...BASE_INPUT, level: 1 }, MOCK_OF);
    expect(html).toContain('background:#00527A');
  });

  it('level=2 headline color = #B91C1C (red-700)', () => {
    const { html } = renderInvoiceReminderEmail({ ...BASE_INPUT, level: 2 }, MOCK_OF);
    expect(html).toContain('background:#B91C1C');
  });
});
