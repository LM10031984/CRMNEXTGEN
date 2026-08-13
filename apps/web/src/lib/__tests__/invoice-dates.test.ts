import { describe, it, expect } from 'vitest';
import { resolveInvoiceIssueDate } from '../invoice-dates';

/**
 * Quick 260813-efh — règle de datation des factures (décision Laurent 13/08).
 *
 * Une facture de formation porte la date de FIN DE PRESTATION, jamais la date
 * du clic. Seule exception : on ne date pas dans le futur.
 */
describe('resolveInvoiceIssueDate', () => {
  const NOW = new Date('2026-08-13T10:00:00Z');

  it('date la facture de la fin de formation quand la session est terminée', () => {
    const fin = new Date('2026-06-17T17:30:00Z');
    expect(resolveInvoiceIssueDate(fin, NOW)).toEqual(fin);
  });

  it('ne date JAMAIS dans le futur : session non terminée → date du jour', () => {
    const finFuture = new Date('2026-09-30T17:30:00Z');
    expect(resolveInvoiceIssueDate(finFuture, NOW)).toEqual(NOW);
  });

  it('retombe sur la date du jour si la session n’a pas de date de fin', () => {
    expect(resolveInvoiceIssueDate(null, NOW)).toEqual(NOW);
    expect(resolveInvoiceIssueDate(undefined, NOW)).toEqual(NOW);
  });

  it('accepte une session qui se termine à l’instant même', () => {
    expect(resolveInvoiceIssueDate(NOW, NOW)).toEqual(NOW);
  });
});
