import { describe, it, expect } from 'vitest';
import { renderProgrammeHtml, type ProgrammeData } from '../programme-template';
import type { OfConfig } from '../of-config';
import { MENTION_EXONERATION_TVA } from '../tva-exoneration';

/**
 * Le bloc Tarif du programme, vu par un OPCO.
 *
 * ASSALIT SYNDIC (SES-0107, 11/09) : le programme annonçait « 2 500,00 € HT par
 * stagiaire » alors que la convention de la même enveloppe engageait
 * l'entreprise sur 2 500 € pour huit salariés. Lu au pied de la lettre, le
 * programme chiffrait le dossier à 20 000 €. Arbitrage Laurent : quand le
 * montant est celui d'une convention d'entreprise, on écrit le montant, la
 * mention de TVA, et rien d'autre — aucune mention d'effectif, puisque toute
 * mention d'effectif invite à multiplier.
 */
const of = {
  name: 'Start Academy',
  siret: '95131909400029',
  rnq: 'RNQ-0000',
  addressStreet: '12 avenue des Camélias',
  addressCp: '06800',
  addressVille: 'Cagnes-sur-Mer',
  addressFull: '12 avenue des Camélias, 06800 Cagnes-sur-Mer',
  phone: '00 00 00 00 00',
  email: 'contact@example.test',
  emailFrom: 'contact@example.test',
  tvaIntra: '',
  iban: '',
  bic: '',
  legalForm: 'SASU',
  legalMentions: '',
  rcs: '',
  invoicePrefix: 'F',
  logoPath: '',
  signaturePedagoPath: '',
  signatureDirigeantPath: '',
  handicapReferent: 'Laurent MARX',
  resp: { civilite: 'MR', firstName: 'Laurent', lastName: 'MARX', role: 'Dirigeant' },
  contact: { civilite: 'MR', firstName: 'Laurent', lastName: 'MARX', role: 'Dirigeant' },
} as unknown as OfConfig;

const base: ProgrammeData = {
  produitTitre: 'Intégrer l’IA dans son entreprise',
  produitCode: 'PROD-TEST',
  produitDureeHeures: 88,
  produitPriceHT: 2500,
  produitObjectifs: ['Identifier les usages de l’IA'],
  produitProgrammeMd: '## JOUR 1\n- Séquence 1',
  produitPrerequisites: null,
  produitTargetAudience: null,
  produitPedagogicalMethods: null,
  produitEvaluationMethods: null,
  produitAccessibility: null,
  produitAccessConditions: null,
  produitTrainerProfile: null,
  produitPedagogicalSupport: null,
  ofName: of.name,
  ofSiret: of.siret,
  ofAddress: of.addressFull,
  ofRnq: of.rnq,
  ofPhone: of.phone,
  ofEmail: of.email,
};

/** Isole le bloc Tarif du reste du document (le mot « stagiaire » vit ailleurs). */
const MONTANT_2500 = /2\s*500\s*€/u;

function blocTarif(html: string): string {
  const m = html.match(/<div class="tarif">([\s\S]*?)<\/div>/);
  expect(m, 'bloc Tarif introuvable dans le programme').not.toBeNull();
  return m![1]!;
}

describe('programme — bloc Tarif', () => {
  it('convention d’entreprise : le montant, la TVA, et rien d’autre', () => {
    const tarif = blocTarif(renderProgrammeHtml({ ...base, prixMode: 'TOTAL_ENTREPRISE' }, of));
    expect(tarif).toMatch(MONTANT_2500);
    expect(tarif).toContain('HT');
    expect(tarif).toContain(MENTION_EXONERATION_TVA);
    expect(tarif).not.toMatch(/stagiaire/i);
    expect(tarif).not.toMatch(/participant/i);
  });

  it('session inter : le prix reste explicitement par stagiaire', () => {
    const tarif = blocTarif(renderProgrammeHtml({ ...base, prixMode: 'PAR_STAGIAIRE' }, of));
    expect(tarif).toMatch(MONTANT_2500);
    expect(tarif).toContain('par stagiaire');
    expect(tarif).toContain(MENTION_EXONERATION_TVA);
  });

  it('sans mode explicite (programme de catalogue), on reste par stagiaire', () => {
    expect(blocTarif(renderProgrammeHtml(base, of))).toContain('par stagiaire');
  });
});
