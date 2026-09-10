import { describe, it, expect } from 'vitest';
import { renderInvoiceHtml, type InvoiceData } from '../invoice-template';

/**
 * Quick 260910-lon — la période de formation, verrouillée sur le gabarit.
 *
 * ⚠ Ce fichier n'est PAS un RED : ses assertions passaient déjà avant le lot B,
 * et c'est assumé. C'est un VERROU, pas une preuve de changement — d'où sa
 * place au commit GREEN et non au commit RED (quick.md §2, « pas de test qui
 * passe déjà »).
 *
 * Sa raison d'être tient en une phrase : depuis le lot B, le bloc désignation
 * est le SEUL endroit de la facture où la période réelle de la formation
 * apparaît. Avant, l'en-tête « Date » la portait implicitement, puisque la
 * facture se datait de la fin de prestation. Ce qui n'est protégé par rien
 * finit par disparaître, et personne ne s'en apercevrait avant qu'un financeur
 * ne réclame la période sur une pièce déjà partie.
 *
 * Le pendant côté données est déjà couvert : `invoice-snapshot.test.ts` assert
 * que `InvoiceLine.label` porte les deux bornes. Ici on couvre le RENDU.
 */

const BASE: InvoiceData = {
  number: 'FAC-000042',
  // Émise le 07/09/2026 — le rattrapage de septembre.
  issueDate: new Date('2026-09-07T12:00:00Z'),
  dueDate: new Date('2026-10-07T12:00:00Z'),
  status: 'ISSUED',
  ofName: 'Start Academy',
  ofSiret: '12345678900012',
  ofRnq: '11756789012',
  ofAddress: '12 avenue des Camélias, 06800 Cagnes-sur-Mer',
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
  // …pour une formation réellement exécutée du 01 au 03 juin 2026.
  formationDateDebut: new Date('2026-06-01T12:00:00Z'),
  formationDateFin: new Date('2026-06-03T12:00:00Z'),
  formationDureeHeures: 21,
  amountHT: 1500,
  vatRate: 0,
  amountTTC: 1500,
  notes: null,
  paymentMethod: 'Virement bancaire',
  paymentIban: 'FR7610807001234567890123456',
  paymentBic: 'CCBPFRPPMAR',
};

describe('renderInvoiceHtml — la période de formation survit au lot B', () => {
  it('le bloc désignation porte la période RÉELLE de la formation', () => {
    const html = renderInvoiceHtml(BASE);
    expect(html).toContain('<strong>Dates :</strong> du 01/06/2026 au 03/06/2026');
  });

  it('l’en-tête porte la date d’ÉMISSION, celle du jour d’établissement', () => {
    const html = renderInvoiceHtml(BASE);
    expect(html).toContain('Date: 07/09/2026');
  });

  it('les deux valeurs sont DISTINCTES sur la même page — c’est tout l’objet du lot', () => {
    const html = renderInvoiceHtml(BASE);

    // L'en-tête ne doit pas porter une date de juin…
    const enTete = html.match(/<div class="date">Date: ([^<]+)<\/div>/);
    expect(enTete).not.toBeNull();
    expect(enTete![1]).toBe('07/09/2026');

    // …et le bloc désignation ne doit pas porter la date d'émission.
    const designation = html.match(/<strong>Dates :<\/strong> ([^<]+)</);
    expect(designation).not.toBeNull();
    expect(designation![1]!.trim()).toBe('du 01/06/2026 au 03/06/2026');
    expect(designation![1]).not.toContain('07/09/2026');
  });

  it('journée unique : « le 01/06/2026 », pas « du … au … »', () => {
    const html = renderInvoiceHtml({
      ...BASE,
      formationDateDebut: new Date('2026-06-01T09:00:00Z'),
      formationDateFin: new Date('2026-06-01T17:00:00Z'),
    });

    expect(html).toContain('<strong>Dates :</strong> le 01/06/2026');
    expect(html).not.toContain('<strong>Dates :</strong> du 01/06/2026');
  });

  it('la période reste lisible sur une facture GROUPÉE (plusieurs stagiaires)', () => {
    const html = renderInvoiceHtml({
      ...BASE,
      stagiaires: ['Jean DUPONT', 'Marie MARTIN', 'Paul BERNARD'],
      amountHT: 4500,
      amountTTC: 4500,
    });

    expect(html).toContain('<strong>Dates :</strong> du 01/06/2026 au 03/06/2026');
    expect(html).toContain('Date: 07/09/2026');
  });
});
