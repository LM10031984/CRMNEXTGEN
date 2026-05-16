import { describe, it, expect } from 'vitest';
import { renderLeadAssignedEmail } from '../lead-assigned';
import type { OfConfig } from '@/lib/of-config';

/**
 * Phase 9 Plan 09-01 Task 3 — tests `renderLeadAssignedEmail`.
 *
 * Coverage :
 *  - subject inclut le prospectName
 *  - escapeHtml appliqué sur prospectName (<script> → &lt;script&gt;)
 *  - html contient le bouton ancré sur leadUrl (escapé)
 *  - text contient prospectName + leadUrl
 *  - of.name (Start Academy) rendu dans header ET footer
 */

const ofFixture: OfConfig = {
  name: 'Start Academy',
  siret: '12345678901234',
  rnq: 'NDA-123',
  addressStreet: '12 rue de la Formation',
  addressCp: '75001',
  addressVille: 'Paris',
  addressFull: '12 rue de la Formation, 75001 Paris',
  phone: '01 23 45 67 89',
  email: 'contact@start-academy.fr',
  emailFrom: 'noreply@start-academy.fr',
  tvaIntra: '',
  iban: '',
  bic: '',
  legalForm: 'SAS',
  legalMentions: '',
  rcs: '',
  invoicePrefix: 'FAC',
  logoPath: '',
  signaturePedagoPath: '',
  signatureDirigeantPath: '',
  handicapReferent: 'Laurent MARX',
  resp: {
    civilite: 'MR',
    nom: 'MARX',
    prenom: 'Laurent',
    titre: 'Dirigeant',
    phone: '',
    email: '',
  },
  contact: {
    civilite: 'MR',
    nom: 'MARX',
    prenom: 'Laurent',
    titre: 'Dirigeant',
    phone: '',
    email: '',
  },
};

describe('renderLeadAssignedEmail', () => {
  it('Test 1 — subject contient le prospectName', () => {
    const { subject } = renderLeadAssignedEmail(
      {
        commercialFirstName: 'Alice',
        prospectName: 'Jean Dupont',
        leadSource: 'Linkedin',
        productTitle: 'Formation IA Immobilier',
        leadUrl: 'https://app.example.com/app/leads/lead-1',
      },
      ofFixture,
    );
    expect(subject).toContain('Jean Dupont');
    expect(subject).toBe('Nouveau lead à traiter — Jean Dupont');
  });

  it('Test 2 — escape les valeurs interpolées (prospectName XSS)', () => {
    const { html } = renderLeadAssignedEmail(
      {
        commercialFirstName: 'Alice',
        prospectName: '<script>alert(1)</script>',
        leadSource: null,
        productTitle: null,
        leadUrl: 'https://app.example.com/app/leads/lead-xss',
      },
      ofFixture,
    );
    // L'HTML doit contenir la version escapée, PAS la balise raw.
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it("Test 3 — html contient un bouton ancré sur leadUrl + text contient prospectName + leadUrl", () => {
    const input = {
      commercialFirstName: 'Alice',
      prospectName: 'Jean Dupont',
      leadSource: 'Linkedin',
      productTitle: 'Formation IA Immobilier',
      leadUrl: 'https://app.example.com/app/leads/lead-42',
    };
    const { html, text } = renderLeadAssignedEmail(input, ofFixture);

    // html : bouton href avec leadUrl
    expect(html).toContain(`href="${input.leadUrl}"`);
    // html : texte du CTA
    expect(html).toContain('Voir le lead');

    // text fallback : contient prospectName + leadUrl
    expect(text).toContain('Jean Dupont');
    expect(text).toContain(input.leadUrl);
  });

  it("Test 4 — of.name rendu dans header ET footer", () => {
    const { html } = renderLeadAssignedEmail(
      {
        commercialFirstName: 'Alice',
        prospectName: 'Jean Dupont',
        leadSource: null,
        productTitle: null,
        leadUrl: 'https://app.example.com/app/leads/lead-1',
      },
      ofFixture,
    );
    // 'Start Academy' doit apparaître au moins 2 fois (header + footer + signature peut être 3)
    const occurrences = html.split('Start Academy').length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });
});
