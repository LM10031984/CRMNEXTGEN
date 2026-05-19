// Wave 0 stub — Phase 11 — implemented in Plan 11-03
import { describe, it } from 'vitest';

describe('renderInvoiceReminderEmail', () => {
  it.todo("level=1 → subject contient 'Rappel'");
  it.todo('level=1 → subject "Rappel — Facture {number} en attente" verbatim');
  it.todo("level=2 → subject contient 'Mise en demeure' + daysOverdue");
  it.todo('level=2 → subject "Mise en demeure — Facture {number} impayée depuis {N} jours" verbatim');
  it.todo('text fallback contient invoiceNumber + amountTtc (Intl fr-FR) + dueDate (Intl fr-FR)');
  it.todo('html escape toutes les variables interpolées (Pitfall 6)');
  it.todo('level=2 inclut la mention légale art. L441-10 Code de commerce');
  it.todo('html inclut <a href> vers invoiceUrl');
  it.todo('html inclut of.name dans header + footer');
});
