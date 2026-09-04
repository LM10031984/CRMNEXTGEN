import { describe, it, expect } from 'vitest';

/**
 * Lot B — ancres de signature dans les 3 gabarits signés électroniquement
 * (spec 2026-09-04 §5 lot B + D-7) : convention, dossier AGEFICE, attestation
 * d'assiduité.
 *
 * Décision d'implémentation, à retenir : les ancres sont **optionnelles**
 * (`signatureTags`, faux par défaut). Deux raisons :
 *  - aucune régression sur les milliers de PDF déjà produits pour signature
 *    manuscrite (le lot A vient d'en faire la brique de dépôt) ;
 *  - la convention et l'attestation d'assiduité **tamponnent aujourd'hui la
 *    signature de l'OF** (image `signature-dirigeant`). Si l'OF signe
 *    électroniquement (§3 + D-8), le tampon ferait doublon : deux signatures
 *    de la même personne sur la même pièce, dont une hors audit trail. En mode
 *    ancres, le tampon disparaît donc au profit du champ DocuSeal.
 *
 * PROTOCOLE DE MUTATION : laisser le tampon dirigeant en mode ancres →
 * le test « ne tamponne plus » vire ROUGE.
 */

import { renderConventionHtml, type ConventionData } from '../convention-template';
import { renderAgeficeHtml, type AgeficePdfData } from '../agefice-template';
import {
  renderAgeficeAttendanceHtml,
  type AgeficeAttendanceTemplateData,
} from '../closure/agefice-attendance-template';
import { SIGNATURE_ROLES } from '../signature/text-tags';
import type { OfConfig } from '../of-config';

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
  tvaIntra: '',
  iban: '',
  bic: '',
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

function conventionData(overrides: Partial<ConventionData> = {}): ConventionData {
  return {
    beneficiaireRaisonSociale: 'EXPERTA',
    beneficiaireSiret: '81234567800042',
    beneficiaireSiren: '812345678',
    beneficiaireRcsVille: 'Nice',
    beneficiaireRepresentantNom: 'Gilles BLANCHON',
    stagiaires: [{ prenom: 'Sophie', nom: 'Augustin', email: null }],
    sessionStartDate: new Date('2026-10-07T00:00:00Z'),
    sessionEndDate: new Date('2026-12-16T00:00:00Z'),
    sessionLieu: 'EXPERTA, Nice',
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

function ageficeData(overrides: Partial<AgeficePdfData> = {}): AgeficePdfData {
  return {
    stagiaireNom: 'AUGUSTIN',
    stagiairePrenom: 'Sophie',
    stagiaireNomNaissance: null,
    stagiaireDateNaissance: new Date('1985-04-12T00:00:00Z'),
    stagiaireLieuNaissance: 'Nice',
    stagiaireSecu: null,
    stagiaireEmail: 'sophie@experta.fr',
    stagiaireTel: null,
    stagiaireAdresse: null,
    stagiaireCp: null,
    stagiaireVille: null,
    entrepriseRaisonSociale: 'EXPERTA',
    entrepriseSiret: '81234567800042',
    entrepriseSiren: '812345678',
    entrepriseNaf: null,
    entrepriseFormeJuridique: 'EI',
    entrepriseRcs: null,
    entrepriseAdresse: null,
    entrepriseCp: null,
    entrepriseVille: null,
    entrepriseTel: null,
    entrepriseEmail: null,
    entrepriseActivite: null,
    iban: null,
    bic: null,
    banque: null,
    paName: null,
    paAddress: null,
    paContact: null,
    affiliationUrssaf: null,
    formationTitre: "Intégrer l'IA",
    formationCode: 'IA-01',
    formationDureeHeures: 88,
    formationDateDebut: new Date('2026-10-07T00:00:00Z'),
    formationDateFin: new Date('2026-12-16T00:00:00Z'),
    formationLieu: 'Nice',
    formationModalite: 'Présentiel',
    formationFormateur: 'Laurent MARX',
    formationTarifHT: 2500,
    formationTarifTotal: 2500,
    ofName: 'START ACADEMY',
    ofSiret: '12345678901234',
    ofRnq: 'RNQ-0001',
    ofAddress: 'Cagnes-sur-Mer',
    ofPhone: '0631056390',
    ofEmail: 'contact@start-academy.fr',
    demandeDate: new Date('2026-09-16T00:00:00Z'),
    ...overrides,
  };
}

function attendanceData(
  overrides: Partial<AgeficeAttendanceTemplateData> = {},
): AgeficeAttendanceTemplateData {
  return {
    tenantId: 'tenant-1',
    formationIntitule: "Intégrer l'IA",
    formationDateDebut: new Date('2026-10-07T00:00:00Z'),
    formationDateFin: new Date('2026-12-16T00:00:00Z'),
    formateurNomQualite: 'Laurent MARX, formateur',
    nombreParticipants: 5,
    ofRaisonSociale: 'START ACADEMY',
    ofNumeroDeclaration: 'RNQ-0001',
    ofDreetsVille: 'Nice',
    ofResponsablePrenomNom: 'Laurent MARX',
    ofResponsableQualite: 'Gérant',
    ofLieuDelivrance: 'Cagnes-sur-Mer',
    stagiaireNomPrenom: 'Sophie AUGUSTIN',
    entrepriseRaisonSociale: 'EXPERTA',
    prevuePresIndividuel: 0,
    prevuePresCollectif: 88,
    prevueFoadSync: 0,
    prevueFoadAsync: 0,
    realiseePresIndividuel: 0,
    realiseePresCollectif: 88,
    realiseeFoadSync: 0,
    realiseeFoadAsync: 0,
    sommeChiffres: 2500,
    sommeLettres: 'deux mille cinq cents euros',
    modeReglement: 'Virement',
    dateReglement: new Date('2026-12-20T00:00:00Z'),
    dateDelivrance: new Date('2026-12-20T00:00:00Z'),
    ...overrides,
  };
}

describe('convention — ancres de signature', () => {
  it('n’en pose AUCUNE par défaut (signature manuscrite inchangée)', () => {
    expect(renderConventionHtml(conventionData(), of)).not.toContain('{{');
  });

  it('pose une ancre par partie en mode e-signature', () => {
    const html = renderConventionHtml(conventionData({ signatureTags: true }), of);

    expect(html).toContain(`role=${SIGNATURE_ROLES.CLIENT};type=signature`);
    expect(html).toContain(`role=${SIGNATURE_ROLES.OF};type=signature`);
  });

  it('ne tamponne plus la signature du dirigeant en mode e-signature (pas de doublon)', () => {
    const html = renderConventionHtml(
      conventionData({ signatureTags: true, tenantId: 'tenant-1' }),
      of,
    );
    expect(html).not.toContain('alt="Signature"');
  });

  it('garde le tampon dirigeant hors mode e-signature (comportement historique)', () => {
    const html = renderConventionHtml(conventionData({ tenantId: 'tenant-1' }), of);
    expect(html).toContain('alt="Signature"');
  });
});

describe('dossier AGEFICE — ancres de signature', () => {
  it('aucune ancre par défaut', () => {
    expect(renderAgeficeHtml(ageficeData())).not.toContain('{{');
  });

  it('pose l’ancre du stagiaire (le signataire TNS) et celle de l’OF', () => {
    const html = renderAgeficeHtml(ageficeData({ signatureTags: true }));

    expect(html).toContain(`role=${SIGNATURE_ROLES.STAGIAIRE};type=signature`);
    expect(html).toContain(`role=${SIGNATURE_ROLES.OF};type=signature`);
  });
});

describe('attestation d’assiduité — ancres de signature', () => {
  it('aucune ancre par défaut', () => {
    expect(renderAgeficeAttendanceHtml(attendanceData())).not.toContain('{{');
  });

  it('pose les ancres stagiaire + OF et retire le tampon OF', () => {
    const html = renderAgeficeAttendanceHtml(attendanceData({ signatureTags: true }));

    expect(html).toContain(`role=${SIGNATURE_ROLES.STAGIAIRE};type=signature`);
    expect(html).toContain(`role=${SIGNATURE_ROLES.OF};type=signature`);
    expect(html).not.toContain('class="sig"');
  });
});

describe('invisibilité des ancres', () => {
  it('les ancres restent invisibles à l’œil (blanc sur blanc) dans les 3 gabarits', () => {
    for (const html of [
      renderConventionHtml(conventionData({ signatureTags: true }), of),
      renderAgeficeHtml(ageficeData({ signatureTags: true })),
      renderAgeficeAttendanceHtml(attendanceData({ signatureTags: true })),
    ]) {
      // Chaque `{{` doit appartenir à un span blanc — jamais de tag « nu ».
      const ancres = html.match(/<span[^>]*>\s*\{\{[^}]+\}\}\s*<\/span>/g) ?? [];
      expect(ancres.length).toBeGreaterThan(0);
      expect((html.match(/\{\{/g) ?? []).length).toBe(ancres.length);
      for (const a of ancres) expect(a.toLowerCase()).toMatch(/color:\s*#fff/);
    }
  });
});
