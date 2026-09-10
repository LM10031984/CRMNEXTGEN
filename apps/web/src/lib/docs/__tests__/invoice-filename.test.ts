import { describe, it, expect } from 'vitest';
import { invoiceDownloadFilename } from '../invoice-filename';

describe('invoiceDownloadFilename', () => {
  it('nomme la facture avec son numéro puis le payeur', () => {
    expect(
      invoiceDownloadFilename({
        number: 'F-202601-214',
        payerOrg: { brandName: 'BIANCO INVEST ASSURANCES', legalName: 'BIANCO INVEST SARL' },
      }),
    ).toBe('Facture-F-202601-214-BIANCO-INVEST-ASSURANCES.pdf');
  });

  it('retombe sur la raison sociale quand il n’y a pas de nom commercial', () => {
    expect(
      invoiceDownloadFilename({
        number: 'F-202601-215',
        payerOrg: { brandName: null, legalName: 'OPTIMMO SAS' },
      }),
    ).toBe('Facture-F-202601-215-OPTIMMO-SAS.pdf');
  });

  it('prend l’apprenant quand il se paye lui-même', () => {
    expect(
      invoiceDownloadFilename({
        number: 'F-202601-216',
        payerOrg: null,
        participant: { person: { firstName: 'Stéphane', lastName: 'Rousseau' } },
      }),
    ).toBe('Facture-F-202601-216-Stephane-ROUSSEAU.pdf');
  });

  it('distingue le duplicata acquitté de la facture', () => {
    // Règle métier verrouillée : une seule facture, deux éditions au MÊME
    // numéro. Les deux fichiers doivent donc être distinguables au nom, sinon
    // le second écrase le premier dans le dossier de téléchargement.
    const facture = invoiceDownloadFilename({
      number: 'F-202601-214',
      payerOrg: { legalName: 'OPTIMMO' },
    });
    const acquittee = invoiceDownloadFilename(
      { number: 'F-202601-214', payerOrg: { legalName: 'OPTIMMO' } },
      { acquittee: true },
    );
    expect(acquittee).toBe('Facture-acquittee-F-202601-214-OPTIMMO.pdf');
    expect(acquittee).not.toBe(facture);
  });

  it('n’invente pas de client quand personne n’est identifiable', () => {
    expect(invoiceDownloadFilename({ number: 'F-202601-217' })).toBe(
      'Facture-F-202601-217.pdf',
    );
  });

  it('reste ASCII strict — le nom part dans un en-tête HTTP', () => {
    const name = invoiceDownloadFilename({
      number: 'F-202601-218',
      payerOrg: { legalName: "L'Agence Immobilière & Cie" },
    });
    expect(name).toMatch(/^[A-Za-z0-9.-]+$/);
  });
});
