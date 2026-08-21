import { describe, it, expect } from 'vitest';

import {
  renderConventionHtml,
  deriveSiren,
  type ConventionData,
} from '../convention-template';
import type { OfConfig } from '../of-config';

/**
 * Quick 260821-md8 — défaut (a) du gabarit de convention.
 *
 * Constat du 21/08 sur la convention EXPERTA destinée au portail OPCO EP :
 * la ligne « Immatriculée au Registre du Commerce et des Sociétés de X sous le
 * numéro … » affichait le **SIRET** (14 chiffres). Le numéro d'immatriculation
 * au RCS est le **SIREN** (9 chiffres) ; le SIRET identifie l'établissement et
 * mérite sa propre ligne, comme dans le bloc « organisme de formation » juste
 * au-dessus.
 *
 * Un numéro RCS faux sur une pièce contractuelle envoyée à un financeur, ce
 * n'est pas cosmétique.
 */

const of: OfConfig = {
  name: 'START ACADEMY',
  siret: '12345678901234',
  rnq: 'RNQ-0001',
  addressStreet: '12 avenue des Camélias',
  addressCp: '06800',
  addressVille: 'Cagnes-sur-Mer',
  addressFull: '12 avenue des Camélias, 06800 Cagnes-sur-Mer',
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
    beneficiaireRaisonSociale: 'EXPERTA',
    beneficiaireSiret: '81234567800042',
    beneficiaireSiren: '812345678',
    beneficiaireRcsVille: 'Nice',
    beneficiaireRepresentantNom: 'Gilles BLANCHON',
    stagiaires: [{ prenom: 'Sophie', nom: 'Augustin', email: null }],
    sessionStartDate: new Date('2026-10-07T00:00:00Z'),
    sessionEndDate: new Date('2026-12-16T00:00:00Z'),
    sessionLieu: "EXPERTA, 5 place de l'Ile de Beauté, 06300 Nice",
    conventionDate: new Date('2026-09-16T00:00:00Z'),
    produitTitre: "Intégrer l'IA dans son entreprise",
    produitDureeHeures: 88,
    produitObjectifs: ['Objectif A'],
    produitProgrammeMd: '## Module 1',
    produitTrainerProfile: null,
    produitPriceHTPerStagiaire: 2500,
    ...overrides,
  };
}

describe('deriveSiren', () => {
  it('déduit le SIREN des 9 premiers chiffres du SIRET', () => {
    expect(deriveSiren(null, '81234567800042')).toBe('812345678');
  });

  it('privilégie toujours le champ SIREN explicite', () => {
    expect(deriveSiren('812345678', '99999999900011')).toBe('812345678');
  });

  it('ignore les espaces de saisie', () => {
    expect(deriveSiren(null, '812 345 678 00042')).toBe('812345678');
    expect(deriveSiren('812 345 678', null)).toBe('812345678');
  });

  it('rend null plutôt qu’un numéro tronqué', () => {
    expect(deriveSiren(null, null)).toBeNull();
    expect(deriveSiren('', '')).toBeNull();
    expect(deriveSiren(null, '8123')).toBeNull(); // trop court pour un SIREN
    expect(deriveSiren('12345', null)).toBeNull();
  });
});

describe('renderConventionHtml — ligne RCS et ligne SIRET', () => {
  it('porte le SIREN sur la ligne RCS, jamais le SIRET', () => {
    const html = renderConventionHtml(baseData(), of);
    expect(html).toMatch(
      /Registre du Commerce et des Sociétés de Nice sous le numéro 812345678/,
    );
    // Le défaut exact constaté : le SIRET après « sous le numéro ».
    expect(html).not.toMatch(/sous le numéro 81234567800042/);
  });

  it('affiche le SIRET sur sa propre ligne, comme pour l’organisme de formation', () => {
    const html = renderConventionHtml(baseData(), of);
    expect(html).toMatch(/N° SIRET : 81234567800042/);
  });

  it('fait disparaître la ligne RCS entière quand le SIREN est inconnu', () => {
    const html = renderConventionHtml(
      baseData({ beneficiaireSiren: null, beneficiaireSiret: null }),
      of,
    );
    // Pas de « … sous le numéro » orphelin côté bénéficiaire, pas de ligne
    // SIRET vide. (Le bloc « organisme de formation » a sa propre phrase
    // « … sous le numéro {RNQ} » : on ne l'attrape pas.)
    expect(html).not.toMatch(/Registre du Commerce et des Sociétés/);
    expect(html).not.toMatch(/N° SIRET :\s*<br>/);
    // Le bénéficiaire et son représentant restent affichés.
    expect(html).toMatch(/EXPERTA/);
    expect(html).toMatch(/Gilles BLANCHON/);
  });

  it('garde la ligne SIRET même sans ville de RCS', () => {
    const html = renderConventionHtml(baseData({ beneficiaireRcsVille: null }), of);
    expect(html).toMatch(/Registre du Commerce et des Sociétés sous le numéro 812345678/);
    expect(html).toMatch(/N° SIRET : 81234567800042/);
  });

  it('redérive le SIREN pour les appelants historiques qui ne passent que le SIRET', () => {
    // Les scripts `_gen-*` construisent `ConventionData` à la main et ne
    // renseignent pas `beneficiaireSiren` : le gabarit doit rester juste.
    const html = renderConventionHtml(
      baseData({ beneficiaireSiren: undefined, beneficiaireSiret: '81234567800042' }),
      of,
    );
    expect(html).toMatch(/sous le numéro 812345678/);
    expect(html).toMatch(/N° SIRET : 81234567800042/);
  });

  it('affiche le SIRET seul quand le numéro est trop court pour un SIREN', () => {
    const html = renderConventionHtml(
      baseData({ beneficiaireSiren: null, beneficiaireSiret: '8123' }),
      of,
    );
    expect(html).not.toMatch(/Registre du Commerce et des Sociétés/);
    expect(html).toMatch(/N° SIRET : 8123/);
  });
});
