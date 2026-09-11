import { describe, expect, it } from 'vitest';

import { buildAuditData } from '@/lib/diagnostic-r1/audit-builder';
import type { FundingRuleValues } from '@/lib/financement/types';

import { seedContent, seedPricing, conventionedHoursOf } from '../builder';
import { computePricing } from '../pricing';
import type { LibraryModule, ModuleSourceProgramme } from '../module-matcher';

/**
 * Le lot I-2 de bout en bout : d'un diagnostic réel à une proposition dont
 * chaque demi-journée est composée de modules justifiés.
 *
 * `seedContent` n'était couvert par aucun test avant ce lot — c'est pourtant
 * la fonction qui décide de ce qu'un dirigeant lit, et de ce qu'il paie.
 */

const RULES = {
  AGEFICE_THRESHOLD_CA_N1: 7000,
  AGEFICE_ANNUAL_CAP: 3000,
  AGEFICE_ANNUAL_CAP_REDUCED: 600,
  AGEFICE_HOURLY_PRESENTIEL: 42,
  AGEFICE_HOURLY_DISTANCIEL: 35,
  AGEFICE_LEAD_DAYS_MIN: 15,
  AGEFICE_INDEMNITY_MIN: 700,
  AGEFICE_INDEMNITY_MAX: 800,
  OPCO_EP_ENVELOPE_LT_11: 2500,
  OPCO_EP_ENVELOPE_11_TO_50: 4500,
  OPCO_EP_RATE_REGLEMENTAIRE: 40,
  OPCO_EP_RATE_COEUR_METIER: 30,
  PRICE_PER_HOUR_PER_PARTICIPANT: 84,
  HALF_DAY_ONSITE_HOURS: 4,
  TRAINER_COUNT_DEFAULT: 2,
  CONSUMPTION_LEVER_PERCENT: 30,
  DISCOUNT_WARNING_PERCENT: 15,
  PROPOSAL_VALIDITY_DAYS: 30,
} as unknown as FundingRuleValues;

/** Une agence qui décroche sur l'exclusivité, le suivi vendeur et l'acquéreur. */
const ANSWERS = [
  { questionId: 'identity-revenue-n1', value: '720000', isSkipped: false },
  { questionId: 'identity-sales-n1', value: '95', isSkipped: false },
  { questionId: 'identity-revenue-goal', value: '25', isSkipped: false },
  { questionId: 'team-total-count', value: '4', isSkipped: false },
  { questionId: 'team-independents-count', value: '4', isSkipped: false },
  { questionId: 'team-employees-count', value: '0', isSkipped: false },
  { questionId: 'mandates-exclusivity-percent', value: '25', isSkipped: false },
  { questionId: 'seller-discovery-formalized', value: 'no', isSkipped: false },
  { questionId: 'buyers-financing-verified', value: 'no', isSkipped: false },
  { questionId: 'commercial-followup-frequency', value: 'a_la_demande', isSkipped: false },
  { questionId: 'prospecting-who', value: 'personne', isSkipped: false },
];

const PARTICIPANTS = Array.from({ length: 4 }, (_, i) => ({
  id: `p${i + 1}`,
  displayName: `Agent ${i + 1}`,
  statut: 'INDEPENDANT' as const,
  caN1: 120000,
  objectiveCa: null,
  strengths: null,
  priorityNeed: null,
  opcoEligible: false,
  trainings24mFunded: null,
  includedInProposal: true,
}));

const OF = {
  name: 'Start Academy',
  siret: '80012345600017',
  numDA: '93060812345',
  address: '12 avenue des Alpes, 06000 Nice',
  email: 'formation@start-academy.fr',
  phone: '04 93 00 00 00',
};

const audit = buildAuditData({
  reference: 'DIAG-0042',
  agencyName: 'Agence du Baou',
  generatedAt: new Date('2026-09-10T10:00:00Z'),
  variant: 'LEGER',
  answers: ANSWERS,
  participants: PARTICIPANTS,
  rules: RULES,
  of: OF,
  valueEuros: 3000,
});

function rayon(code: string, title: string): ModuleSourceProgramme {
  return {
    productId: `id-${code}`,
    code,
    title,
    theme: null,
    fundingType: 'COEUR_METIER',
    // Le cas nominal depuis D-19 : les rayons ne sont jamais activés.
    isActive: false,
    excludedFromClientOutputs: false,
    supersededBy: null,
  };
}

const VENDEUR = rayon('BIB-D058', 'Booster vendeur');
const ACHETEUR = rayon('BIB-D008', 'Face à face acheteurs');
const SUIVI = rayon('BIB-D005', 'Le suivi vendeur');

function mod(
  moduleId: string,
  title: string,
  source: ModuleSourceProgramme,
  durationMin: number,
  signals: string[] = [],
): LibraryModule {
  return {
    moduleId,
    title,
    family: null,
    targetProfile: null,
    signals,
    needIdentification: null,
    isFoundation: false,
    durationMin,
    excludedFromClientOutputs: false,
    source,
  };
}

/** Une bibliothèque tirée de plusieurs programmes, comme après l'import I-1. */
const LIBRARY: LibraryModule[] = [
  mod('m-excl', 'Signer plus de mandats exclusifs', VENDEUR, 120, [
    'Mandat — Trop de mandats simples, exclusivité difficile à obtenir',
  ]),
  mod('m-prospect', 'Prospecter autrement sur son secteur', VENDEUR, 120),
  mod('m-suivi', 'Ritualiser le suivi vendeur', SUIVI, 120, [
    'Suivi vendeur — Suivi irrégulier, vendeur surpris, baisses tardives',
  ]),
  mod('m-decouverte', 'Formaliser la découverte vendeur et l’estimation', SUIVI, 120),
  mod('m-acq', 'Qualifier le financement de l’acquéreur', ACHETEUR, 120),
  mod('m-pige', 'Exploiter la pige quotidienne', VENDEUR, 120, [
    'Mandat — Trop de mandats simples, exclusivité difficile à obtenir',
  ]),
];
LIBRARY[5]!.excludedFromClientOutputs = true;

function seed() {
  return seedContent({
    audit,
    rules: RULES,
    library: LIBRARY,
    agencyName: 'Agence du Baou',
    diagnosticReference: 'DIAG-0042',
    meetingAt: new Date('2026-09-10T10:00:00Z'),
    ofName: 'Start Academy',
    participantCount: 4,
  });
}

describe('seedContent — la proposition compose, elle ne découpe plus un total', () => {
  it('sort un axe par demi-journée, chacun valant exactement une demi-journée', () => {
    const { content, composition } = seed();

    expect(content.axes.length).toBe(composition.totalHalfDays);
    for (const a of content.axes) expect(a.halfDays).toBe(1);
    expect(content.axes.reduce((s, a) => s + a.halfDays, 0)).toBe(composition.totalHalfDays);
  });

  it('compose depuis PLUSIEURS programmes sources', () => {
    const { content } = seed();
    const sources = new Set(content.axes.flatMap((a) => a.modules.map((m) => m.sourceCode)));
    expect(sources.size).toBeGreaterThanOrEqual(2);
  });

  it('rattache chaque module à une réponse du diagnostic', () => {
    const { content } = seed();
    const modules = content.axes.flatMap((a) => a.modules);

    expect(modules.length).toBeGreaterThan(0);
    for (const m of modules) {
      expect(m.needLabel.length).toBeGreaterThan(0);
      expect(m.quotes.length).toBeGreaterThan(0);
    }
  });

  it('ne fait entrer AUCUN module interdit en sortie client', () => {
    const { content } = seed();
    const ids = content.axes.flatMap((a) => a.modules.map((m) => m.moduleId));
    expect(ids).not.toContain('m-pige');
  });

  it('lit la bibliothèque alors que tous les rayons sont inactifs (D-19)', () => {
    expect(LIBRARY.every((m) => !m.source.isActive)).toBe(true);
    const { content } = seed();
    expect(content.axes.length).toBeGreaterThan(0);
  });
});

describe('seedContent — D-20 et §8.2 : on vend ce qui est justifié', () => {
  it('chiffre le volume COMPOSÉ, pas l’enveloppe de droits', () => {
    const { composition } = seed();
    const pricing = seedPricing({
      funding: audit.funding,
      rules: RULES,
      agencyName: 'Agence du Baou',
      participants: PARTICIPANTS.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        statut: p.statut,
      })),
      halfDaysSold: composition.totalHalfDays,
    });
    const synthesis = computePricing({ pricing, rules: RULES });

    expect(synthesis.halfDaysMax).toBe(composition.totalHalfDays);
    // Le parcours détaillé explique donc exactement le volume facturé.
    expect(synthesis.halfDaysMax).toBe(
      seed().content.axes.reduce((s, a) => s + a.halfDays, 0),
    );
  });

  it('affiche le surplus d’enveloppe au lieu de le facturer', () => {
    const { composition } = seed();
    if (composition.spareHalfDays > 0) {
      expect(composition.totalHalfDays).toBeLessThan(audit.funding.halfDays);
      expect(composition.notices.some((n) => n.includes('ne sont PAS ajoutées d’office'))).toBe(
        true,
      );
    }
  });

  it('porte les mêmes heures conventionnées partout — la valeur unique', () => {
    const { composition, content } = seed();
    const axesHalfDays = content.axes.reduce((s, a) => s + a.halfDays, 0);

    expect(conventionedHoursOf(axesHalfDays, RULES)).toBe(composition.totalConventionedHours);
    expect(composition.totalConventionedHours).toBe(composition.totalHalfDays * 8);
  });
});
