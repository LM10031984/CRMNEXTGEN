import { describe, it, expect } from 'vitest';

import { subtractBusinessDaysISO } from '../business-days';
import { renderConventionHtml, type ConventionData } from '../convention-template';
import type { OfConfig } from '../of-config';

// OfConfig minimal mocké — uniquement les champs lus par le template convention.
const of: OfConfig = {
  name: 'START ACADEMY',
  siret: '12345678901234',
  rnq: 'RNQ-0001',
  addressStreet: '1 rue de Vence',
  addressCp: '06140',
  addressVille: 'Vence',
  addressFull: '1 rue de Vence, 06140 Vence',
  phone: '06 31 05 63 90',
  email: 'contact@start-academy.fr',
  emailFrom: 'contact@start-academy.fr',
  tvaIntra: 'FR00123456789',
  iban: 'FR7600000000000000000000000',
  bic: 'AGRIFRPP',
  legalForm: 'SARL',
  legalMentions: '',
  rcs: 'Grasse',
  invoicePrefix: 'F',
  logoPath: '',
  signaturePedagoPath: '',
  signatureDirigeantPath: '',
  handicapReferent: 'Laurent MARX',
  resp: { prenom: 'Laurent', nom: 'MARX', titre: 'Gérant' } as OfConfig['resp'],
  contact: { prenom: 'Laurent', nom: 'MARX', titre: 'Gérant' } as OfConfig['contact'],
};

function baseData(overrides: Partial<ConventionData> = {}): ConventionData {
  return {
    beneficiaireRaisonSociale: 'Nestenn Vitrolles',
    beneficiaireSiret: '98765432109876',
    beneficiaireRcsVille: 'Aix-en-Provence',
    beneficiaireRepresentantNom: 'Jean DUPONT',
    stagiaires: [{ prenom: 'Marie', nom: 'Martin', email: 'marie@example.com' }],
    sessionStartDate: new Date('2026-05-11T00:00:00Z'),
    sessionEndDate: new Date('2026-05-11T00:00:00Z'),
    sessionLieu: 'Nestenn, place de provence, 13127 Vitrolles',
    conventionDate: new Date('2026-04-16T00:00:00Z'),
    produitTitre: "Maîtrisez l'IA",
    produitDureeHeures: 8,
    produitObjectifs: ['Identifier les usages IA'],
    produitProgrammeMd: '## Module 1\n\nContenu.',
    produitTrainerProfile: 'Formateur expert IA',
    produitPriceHTPerStagiaire: 3024,
    ...overrides,
  };
}

describe('conventionDate (COR-1) + nettoyage puces (COR-4)', () => {
  // Test 1 — ancre la règle J-15 jours ouvrés utilisée par les 2 fournisseurs.
  it('subtractBusinessDaysISO(2026-05-11, 15) === 2026-04-16', () => {
    expect(subtractBusinessDaysISO('2026-05-11', 15)).toBe('2026-04-16');
  });

  // Test 2 — le rendu utilise conventionDate, PAS la date du jour.
  it('rend la conventionDate dans « Fait à … le » et jamais la date du jour', () => {
    const html = renderConventionHtml(baseData(), of);
    expect(html).toContain('16/04/2026');
    // ne contient pas la date du jour (test déterministe : on vérifie l'absence
    // de la date courante formatée fr-FR)
    const today = new Date().toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    if (today !== '16/04/2026') {
      expect(html).not.toContain(`le <strong>${today}</strong>`);
    }
  });

  // Test 3 — pas de puce orpheline « • » dans le programme rendu.
  it('ne laisse aucune puce orpheline dans le programme rendu de la convention', () => {
    const md = '## Module 1\n•\n\n* \n\n● \nContenu réel.';
    const html = renderConventionHtml(baseData({ produitProgrammeMd: md }), of);
    // aucune puce vide isolée dans une balise (•/●/·/‣ seuls)
    expect(html).not.toMatch(/<li>\s*[•●·‣]\s*<\/li>/);
    expect(html).not.toMatch(/<p>\s*[•●·‣]\s*<\/p>/);
    // le contenu réel est bien rendu
    expect(html).toContain('Contenu réel');
  });
});
