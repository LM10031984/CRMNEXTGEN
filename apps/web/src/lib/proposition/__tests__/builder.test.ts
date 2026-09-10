import { describe, expect, it } from 'vitest';
import { FUNDING_RULE_SEEDS } from '@qualiof/shared/diagnostic';

import { computeFunding } from '@/lib/financement/funding-engine';
import type { FundingRuleValues, FundingSynthesis } from '@/lib/financement/types';

import {
  buildCoverHeadline,
  buildFundingSection,
  buildLegalMention,
  mergeRecommendationsByProduct,
  planningMismatches,
  rebuildPlanningFromAxes,
  seedPayers,
} from '../builder';
import type { ProposalAxis, ProposalPlanningRow } from '@qualiof/shared';
import type { ProgrammeCandidate, ProgrammeRecommendation } from '../programme-matcher';

const RULES = Object.fromEntries(
  FUNDING_RULE_SEEDS.map((s) => [s.key, s.valueNumeric]),
) as FundingRuleValues;

function funding(args: {
  independants?: number;
  salaries?: number;
  employeeCount?: number | null;
  dirigeant?: boolean;
}): { synthesis: FundingSynthesis; participants: { id: string; displayName: string; statut: 'INDEPENDANT' | 'SALARIE' | 'DIRIGEANT' }[] } {
  const participants: { id: string; displayName: string; statut: 'INDEPENDANT' | 'SALARIE' | 'DIRIGEANT' }[] = [];
  for (let i = 0; i < (args.independants ?? 0); i += 1) {
    participants.push({ id: `i${i}`, displayName: `Indé ${i}`, statut: 'INDEPENDANT' });
  }
  for (let i = 0; i < (args.salaries ?? 0); i += 1) {
    participants.push({ id: `s${i}`, displayName: `Salarié ${i}`, statut: 'SALARIE' });
  }
  if (args.dirigeant) {
    participants.push({ id: 'd0', displayName: 'La gérante', statut: 'DIRIGEANT' });
  }

  const synthesis = computeFunding({
    rules: RULES,
    participants: participants.map((p) => ({
      id: p.id,
      statut: p.statut,
      caN1: p.statut === 'SALARIE' ? null : 100000,
      cfpEligibleBudget: null,
      opcoEligible: p.statut === 'SALARIE' ? true : null,
      consumedThisYear: null,
      trainings24mFunded: null,
      includedInProposal: true,
    })),
    employeeCount: args.employeeCount ?? (args.salaries ?? 0),
    companyOpcoConsumed: null,
    modality: 'PRESENTIEL',
    fundingType: 'COEUR_METIER',
    computedAt: '2026-09-04T08:00:00.000Z',
  });

  return { synthesis, participants };
}

describe('Les payeurs — qui paye pour qui', () => {
  it('fait un payeur par indépendant, et un seul pour l’entreprise', () => {
    const { synthesis, participants } = funding({ independants: 4, salaries: 3 });
    const payers = seedPayers({
      funding: synthesis,
      rules: RULES,
      agencyName: 'Agence du Baou SARL',
      participants,
    });
    expect(payers.filter((p) => p.kind === 'INDEPENDANT')).toHaveLength(4);
    const entreprise = payers.filter((p) => p.kind === 'ENTREPRISE');
    expect(entreprise).toHaveLength(1);
    expect(entreprise[0]!.participantCount).toBe(3);
    expect(entreprise[0]!.name).toBe('Agence du Baou SARL');
  });

  it('range le dirigeant TNS du côté AGEFICE, pas du côté entreprise', () => {
    const { synthesis, participants } = funding({ independants: 1, dirigeant: true });
    const payers = seedPayers({
      funding: synthesis,
      rules: RULES,
      agencyName: 'Agence',
      participants,
    });
    expect(payers.every((p) => p.kind === 'INDEPENDANT')).toBe(true);
    expect(payers).toHaveLength(2);
  });

  it('n’annonce aucune prise en charge pour un participant sans droits', () => {
    const { synthesis, participants } = funding({ salaries: 2, employeeCount: 80 });
    const payers = seedPayers({
      funding: synthesis,
      rules: RULES,
      agencyName: 'Grand réseau',
      participants,
    });
    // Plus de 50 salariés : aucune enveloppe automatique, donc aucune ligne.
    expect(payers[0]!.coverages).toHaveLength(0);
  });
});

describe('Le tableau « budget mobilisable »', () => {
  it('affiche le brut, la déduction, et un total qui retombe sur le net du moteur', () => {
    const { synthesis } = funding({ independants: 4, salaries: 3 });
    const section = buildFundingSection({
      funding: synthesis,
      rules: RULES,
      agencyName: 'Agence du Baou SARL',
      declaredEmployeeCount: 3,
    });
    const agefice = section.rows.find((r) => r.funder === 'AGEFICE')!;
    const opco = section.rows.find((r) => r.funder === 'OPCO EP')!;
    expect(agefice.amount).toBe(12000);
    expect(opco.amount).toBe(RULES.OPCO_EP_ENVELOPE_LT_11);
    expect(section.rows.some((r) => r.isDeduction)).toBe(true);
    expect(section.total).toBe(12000 + RULES.OPCO_EP_ENVELOPE_LT_11);
  });

  it('n’affiche aucun droit OPCO EP sans bénéficiaire salarié', () => {
    const { synthesis } = funding({ independants: 4 });
    const section = buildFundingSection({
      funding: synthesis,
      rules: RULES,
      agencyName: 'Agence',
      declaredEmployeeCount: 0,
    });
    expect(section.rows.find((r) => r.funder === 'OPCO EP')).toBeUndefined();
  });

  it('rend « à valider manuellement » plutôt qu’un montant au-delà de 50 salariés', () => {
    const { synthesis } = funding({ salaries: 2, employeeCount: 80 });
    const section = buildFundingSection({
      funding: synthesis,
      rules: RULES,
      agencyName: 'Grand réseau',
      declaredEmployeeCount: 80,
    });
    const opco = section.rows.find((r) => r.funder === 'OPCO EP')!;
    expect(opco.amount).toBe(0);
    expect(opco.basis).toMatch(/à valider avec l’opérateur/);
  });

  it('porte les heures conventionnées du parcours, identiques au moteur budget', () => {
    const { synthesis } = funding({ independants: 4 });
    const section = buildFundingSection({
      funding: synthesis,
      rules: RULES,
      agencyName: 'Agence',
      declaredEmployeeCount: 0,
    });
    expect(section.conventionedHoursPerParticipant).toBe(synthesis.conventionedHours);
    expect(section.halfDays).toBe(synthesis.halfDays);
  });

  it('ne présente les droits du dirigeant que comme un potentiel', () => {
    const { synthesis } = funding({ independants: 2, dirigeant: true });
    const section = buildFundingSection({
      funding: synthesis,
      rules: RULES,
      agencyName: 'Agence',
      declaredEmployeeCount: 0,
    });
    expect(section.potentialNote).toMatch(/sous réserve|dès réception/);
    expect(section.potentialNote).toMatch(/contribution formation professionnelle/);
  });

  it('remonte les réserves présentables au dirigeant, et elles seules', () => {
    const { synthesis } = funding({ independants: 4 });
    const section = buildFundingSection({
      funding: synthesis,
      rules: RULES,
      agencyName: 'Agence',
      declaredEmployeeCount: 0,
    });
    const internes = synthesis.alerts.filter((a) => a.audience === 'internal').map((a) => a.label);
    for (const interne of internes) expect(section.clientAlerts).not.toContain(interne);
    expect(section.clientAlerts.join(' ')).toMatch(/estimation|plafond|dossiers/i);
  });
});

describe('La mention légale', () => {
  it('dit la réserve, la validité et l’identité de l’organisme', () => {
    const mention = buildLegalMention({
      validityDays: 30,
      ofName: 'Start Academy',
      numDA: '93060000000',
      siret: '12345678900012',
    });
    expect(mention).toContain('sous réserve des droits réellement disponibles');
    expect(mention).toContain('Proposition valable 30 jours');
    expect(mention).toContain('NDA 93060000000');
    expect(mention).toContain('SIRET 12345678900012');
  });
});


describe('Un programme = un axe (défaut vu sur DIAG-0001)', () => {
  function candidat(productId: string, code: string): ProgrammeCandidate {
    return {
      productId,
      code,
      title: `Programme ${code}`,
      family: 'METIER',
      score: 4,
      matchSource: 'lexique',
      confidence: 'faible',
      matchedTerms: ['vente'],
      durationHours: 8,
    };
  }
  function reco(need: string, candidate: ProgrammeCandidate, trigger: string): ProgrammeRecommendation {
    return {
      need: { code: need, label: need, families: ['METIER'], chapters: [], alertCodes: [], keywords: [] },
      trigger,
      candidates: [candidate],
      unmet: false,
      metierGap: false,
    };
  }

  it('regroupe deux besoins servis par le même programme en UN seul axe', () => {
    const booster = candidat('id-0059', 'PROD-0059');
    const merged = mergeRecommendationsByProduct([
      reco('decouverte_vendeur', booster, 'La découverte vendeur n’est pas formalisée.'),
      reco('mandat_exclusivite', booster, 'L’exclusivité pèse 25 % contre 30 % attendus.'),
      reco('suivi_vendeur', candidat('id-053', 'PROD-053'), 'Le suivi vendeur n’est pas ritualisé.'),
    ]);

    expect(merged).toHaveLength(2);
    // …et l'axe porte les DEUX constats, au lieu d'en perdre un.
    expect(merged[0]!.triggers).toHaveLength(2);
    expect(merged[0]!.triggers.join(' ')).toContain('découverte vendeur');
    expect(merged[0]!.triggers.join(' ')).toContain('exclusivité');
  });

  it('conserve l’ordre des besoins — celui de la chaîne commerciale', () => {
    const merged = mergeRecommendationsByProduct([
      reco('prospection', candidat('a', 'PROD-A'), 'A'),
      reco('transformation', candidat('b', 'PROD-B'), 'B'),
    ]);
    expect(merged.map((m) => m.candidate.code)).toEqual(['PROD-A', 'PROD-B']);
  });

  it('ignore un besoin sans candidat plutôt que d’inventer un axe', () => {
    const vide: ProgrammeRecommendation = {
      need: { code: 'x', label: 'x', families: ['METIER'], chapters: [], alertCodes: [], keywords: [] },
      trigger: 'rien',
      candidates: [],
      unmet: true,
      metierGap: false,
    };
    expect(mergeRecommendationsByProduct([vide])).toHaveLength(0);
  });
});


describe('Le planning suit les axes (défaut vu sur PROP-0001)', () => {
  const axe = (id: string, label: string, title: string, periodLabel = ''): ProposalAxis => ({
    id,
    label,
    title,
    productId: null,
    productCode: null,
    description: '',
    why: 'un constat',
    halfDays: 3,
    periodLabel,
    matchSource: 'manuel',
  });

  it('repère une ligne de planning qui ne correspond plus à aucun axe', () => {
    const axes = [axe('a1', 'Axe 1', 'Booster vendeur')];
    const planning: ProposalPlanningRow[] = [
      { id: 'p1', dateLabel: 'octobre', sessionLabel: 'Axe 1 — Booster vendeur', participantsLabel: '4' },
      { id: 'p2', dateLabel: 'novembre', sessionLabel: 'Axe 2 — Programme retiré', participantsLabel: '4' },
    ];
    expect(planningMismatches(axes, planning)).toEqual(['Axe 2 — Programme retiré']);
  });

  it('ne signale rien quand les deux blocs racontent la même chose', () => {
    const axes = [axe('a1', 'Axe 1', 'Booster vendeur')];
    const planning = rebuildPlanningFromAxes(axes, [], 4);
    expect(planningMismatches(axes, planning)).toEqual([]);
  });

  it('recompose depuis les axes en conservant les dates déjà arrêtées', () => {
    const axes = [
      axe('a1', 'Axe 1', 'Booster vendeur', 'octobre'),
      axe('a2', 'Axe 2', 'Cycle prospection', 'novembre'),
    ];
    const precedent: ProposalPlanningRow[] = [
      { id: 'p1', dateLabel: 'Jeudi 24/09 · 9 h – 13 h', sessionLabel: 'peu importe', participantsLabel: 'Toute l’équipe' },
    ];
    const recompose = rebuildPlanningFromAxes(axes, precedent, 4);

    expect(recompose).toHaveLength(2);
    expect(recompose[0]!.dateLabel).toBe('Jeudi 24/09 · 9 h – 13 h');
    expect(recompose[0]!.participantsLabel).toBe('Toute l’équipe');
    expect(recompose[0]!.sessionLabel).toBe('Axe 1 — Booster vendeur');
    // La ligne sans antécédent repart du repère de période de l'axe.
    expect(recompose[1]!.dateLabel).toBe('À arrêter — novembre');
    expect(recompose[1]!.participantsLabel).toBe('4 participants');
  });
});

describe('L’accroche de couverture', () => {
  it('reprend les priorités de l’audit, pas le nom de l’agence', () => {
    expect(
      buildCoverHeadline([
        'Programmer le suivi vendeur',
        'Qualifier le financement acquéreur',
        'Collecter les avis',
      ]),
    ).toBe('Programmer le suivi vendeur, qualifier le financement acquéreur, collecter les avis');
  });

  it('reste présentable quand l’audit n’a dégagé aucune priorité', () => {
    expect(buildCoverHeadline([])).toBe('Un parcours dimensionné sur vos droits à la formation');
    expect(buildCoverHeadline(['   '])).toBe('Un parcours dimensionné sur vos droits à la formation');
  });
});
