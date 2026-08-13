import { describe, it, expect } from 'vitest';
import { renderInvoiceHtml, type InvoiceData } from '../invoice-template';

/**
 * Tests quick 260813-efh — édition ACQUITTÉE (duplicata OPCO/AGEFICE).
 *
 * Besoin métier : Laurent collait à la main, sur chaque dossier de
 * remboursement, la mention « payé », le « Fait à … le … », son tampon et sa
 * signature. Le mode `acquitted` produit cette pièce directement.
 *
 * Invariants vérifiés ici :
 *  - MÊME numéro que la facture d'origine (ce n'est pas une 2ᵉ facture — en
 *    émettre une doublerait le CA) ;
 *  - tout ce qui appelle un paiement disparaît (IBAN, échéance, pénalités) ;
 *  - « Fait à » utilise le LIEU DE FORMATION et la DATE DE FIN DE FORMATION,
 *    pas le siège social ni la date du jour (choix explicite de Laurent) ;
 *  - l'édition apprenant reste strictement inchangée (non-régression du
 *    gabarit officiel du 12/08).
 *
 * Approche source-regex sur le HTML retourné, cohérente avec
 * `invoice-template.credit-note.test.ts`.
 */

const BASE_DATA: InvoiceData = {
  number: 'FAC-000042',
  issueDate: new Date('2026-05-15T10:00:00Z'),
  dueDate: new Date('2026-06-14T10:00:00Z'),
  status: 'PAID',
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
  formationDateDebut: new Date('2026-04-01T08:30:00Z'),
  formationDateFin: new Date('2026-04-05T17:30:00Z'),
  formationDureeHeures: 21,
  amountHT: 1500,
  vatRate: 0,
  amountTTC: 1500,
  notes: null,
  paymentMethod: 'Virement bancaire',
  paymentIban: 'FR7610807001234567890123456',
  paymentBic: 'CCBPFRPPMAR',
};

const ACQUITTED: InvoiceData = {
  ...BASE_DATA,
  acquitted: {
    paidAt: new Date('2026-04-20T10:00:00Z'),
    lieu: '20 rue de France à Nice',
    date: new Date('2026-04-05T17:30:00Z'),
  },
};

describe('renderInvoiceHtml — édition acquittée (quick 260813-efh)', () => {
  it('porte le MÊME numéro que la facture d’origine, jamais un nouveau', () => {
    const html = renderInvoiceHtml(ACQUITTED);
    expect(html).toContain('FACTURE N° FAC-000042');
  });

  it('affiche la mention DUPLICATA — FACTURE ACQUITTÉE', () => {
    const html = renderInvoiceHtml(ACQUITTED);
    expect(html).toContain('DUPLICATA — FACTURE ACQUITTÉE');
  });

  it('affiche la date de règlement et le mode de paiement', () => {
    const html = renderInvoiceHtml(ACQUITTED);
    expect(html).toContain('Payé le 20/04/2026 par Virement bancaire');
  });

  it('date le « Fait à » du LIEU DE FORMATION et de la DATE DE FIN de formation', () => {
    const html = renderInvoiceHtml(ACQUITTED);
    expect(html).toContain('Fait à 20 rue de France à Nice, le 05/04/2026');
    // …et surtout pas la date d'émission de la facture.
    expect(html).not.toContain('Fait à 20 rue de France à Nice, le 15/05/2026');
  });

  it('retombe sur l’adresse de l’OF si le lieu de formation est inconnu', () => {
    const html = renderInvoiceHtml({
      ...ACQUITTED,
      acquitted: { ...ACQUITTED.acquitted!, lieu: null },
    });
    expect(html).toContain('Fait à 12 avenue des Camélias, 06800 Cagnes-sur-Mer, le 05/04/2026');
  });

  it('supprime tout ce qui appelle un paiement : IBAN, échéance, pénalités', () => {
    const html = renderInvoiceHtml(ACQUITTED);
    expect(html).not.toContain('Coordonnées bancaires');
    expect(html).not.toContain('FR76 1080 7001'); // IBAN formaté
    expect(html).not.toContain("Date d'échéance");
    expect(html).not.toContain('indemnité forfaitaire pour frais de recouvrement');
  });

  it('solde les totaux : « Réglé » puis « Reste dû » à 0,00 €', () => {
    const html = renderInvoiceHtml(ACQUITTED);
    expect(html).toContain('<td>Réglé</td>');
    expect(html).toContain('<td>Reste dû</td>');
    expect(html).not.toContain('<td>Total dû</td>');
  });

  it('embarque les trois visuels : tampon PAYÉ, cachet OF, signature', () => {
    const html = renderInvoiceHtml(ACQUITTED);
    expect(html).toContain('class="paid-stamp"');
    expect(html).toContain('class="acquit-tampon"');
    expect(html).toContain('class="acquit-signature"');
  });

  it('pose le tampon PAYÉ en multiply (scan à fond blanc opaque)', () => {
    const html = renderInvoiceHtml(ACQUITTED);
    expect(html).toMatch(/\.paid-stamp\s*\{[^}]*mix-blend-mode:\s*multiply/);
  });
});

describe('renderInvoiceHtml — non-régression de l’édition apprenant', () => {
  it('sans `acquitted`, le gabarit du 12/08 est inchangé', () => {
    const html = renderInvoiceHtml(BASE_DATA);
    expect(html).toContain("Date d'échéance");
    expect(html).toContain('Coordonnées bancaires');
    expect(html).toContain('indemnité forfaitaire pour frais de recouvrement');
    expect(html).toContain('<td>Total dû</td>');
    expect(html).not.toContain('DUPLICATA');
    expect(html).not.toContain('Fait à');
    expect(html).not.toContain('class="paid-stamp"');
  });

  it('le mode AVOIR reste intact', () => {
    const html = renderInvoiceHtml({
      ...BASE_DATA,
      documentKind: 'AVOIR',
      originalNumber: 'FAC-000041',
      originalIssueDate: new Date('2026-05-01T10:00:00Z'),
    });
    expect(html).toContain('AVOIR N° FAC-000042');
    expect(html).toContain('Avoir sur facture FAC-000041');
    expect(html).not.toContain('DUPLICATA');
  });
});
