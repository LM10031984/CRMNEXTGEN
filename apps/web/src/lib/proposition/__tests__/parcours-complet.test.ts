import { describe, expect, it } from 'vitest';
import { FUNDING_RULE_SEEDS } from '@qualiof/shared/diagnostic';
import { ProposalContentSchema } from '@qualiof/shared';
import { buildAuditData } from '@/lib/diagnostic-r1/audit-builder';
import type { FundingRuleValues } from '@/lib/financement/types';
import { buildPathOptions } from '../path-options';
import { seedContent } from '../builder';
import { FAROS_WORKSHOPS, farosContent } from '../faros-workshops';
import { FAROS_EXTENSION_WORKSHOPS } from '../faros-extensions';
import { recommendPathModules } from '../path-recommendations';
import { validateProposalSelection, uncoveredProposalNeeds } from '../selection-validation';
import type { LibraryModule } from '../module-matcher';

const rules = Object.fromEntries(
  FUNDING_RULE_SEEDS.map((s) => [s.key, s.valueNumeric]),
) as FundingRuleValues;
const library: LibraryModule[] = [...FAROS_WORKSHOPS, ...FAROS_EXTENSION_WORKSHOPS].map((w) => ({
  moduleId: w.sourceRef,
  sourceRef: w.sourceRef,
  title: w.title,
  durationMin: w.durationMin,
  family: 'Métier immobilier avec IA',
  targetProfile: 'conseiller',
  signals: w.ruleIds,
  needIdentification: null,
  isFoundation: w.ruleIds.includes('ia-parametree'),
  contentMd: farosContent(w),
  excludedFromClientOutputs: false,
  source: {
    productId: 'faros',
    code: 'FAROS',
    title: 'Faros',
    theme: null,
    fundingType: 'COEUR_METIER',
    isActive: false,
    supersededBy: null,
    excludedFromClientOutputs: false,
  },
}));
function input(values: Record<string, unknown>, modules = library) {
  const audit = buildAuditData({
    reference: 'DIAG-TEST',
    agencyName: 'Test',
    generatedAt: new Date('2026-09-18'),
    variant: 'COMPLET',
    answers: Object.entries(values).map(([questionId, value]) => ({
      questionId,
      value,
      isSkipped: false,
    })),
    participants: [
      {
        id: 'p1',
        displayName: 'Test',
        statut: 'INDEPENDANT',
        caN1: 50000,
        objectiveCa: null,
        strengths: null,
        priorityNeed: null,
        opcoEligible: null,
        trainings24mFunded: null,
        includedInProposal: true,
      },
    ],
    rules,
    of: { name: 'OF', siret: '', numDA: '', address: '', email: '', phone: '' },
    valueEuros: 3000,
  });
  return {
    audit,
    rules,
    library: modules,
    agencyName: 'Test',
    diagnosticReference: 'DIAG-TEST',
    ofName: 'OF',
    participantCount: 1,
    meetingAt: null,
  };
}
function recommendations(i: ReturnType<typeof input>) {
  return recommendPathModules(
    {
      chapterScores: i.audit.chapterScores,
      answers: i.audit.chapters.flatMap((c) => c.answers),
      alerts: i.audit.chapters.flatMap((c) => c.alerts),
      library: i.library,
    },
    'COMPLET_IA',
  );
}
const modulesOf = (content: ReturnType<typeof seedContent>['content']) =>
  content.axes.flatMap((a) => a.modules);

describe('parcours métier complet enrichi par IA', () => {
  it('conserve les priorités et ajoute des compléments justifiés sans fabriquer de douleur', () => {
    const i = input({ 'seller-discovery-formalized': 'no' });
    const priority = seedContent(i);
    const full = seedContent({ ...i, pathMode: 'COMPLET_IA' });
    const modules = modulesOf(full.content);
    expect(modules.map((m) => m.moduleId)).toEqual(
      expect.arrayContaining(modulesOf(priority.content).map((m) => m.moduleId)),
    );
    expect(modules.length).toBeGreaterThan(modulesOf(priority.content).length);
    expect(full.content.heard).toEqual(priority.content.heard);
    expect(modules.some((m) => m.selection?.kind === 'socle')).toBe(true);
    expect(modules.some((m) => m.selection?.kind === 'developpement')).toBe(true);
    expect(new Set(modules.map((m) => m.moduleId)).size).toBe(modules.length);
    expect(validateProposalSelection(full.content, recommendations(i).recommendations)).toEqual([]);
    expect(ProposalContentSchema.parse(full.content).pathMode).toBe('COMPLET_IA');
  });
  it('le comparatif restitue les montants effectivement vendus et le budget restant', () => {
    const i = input({ 'seller-discovery-formalized': 'no' });
    const previews = buildPathOptions({
      ...i,
      participants: [{ id: 'p1', displayName: 'Test', statut: 'INDEPENDANT' }],
    });
    expect(previews[0]!.totalHt).toBe(336);
    expect(previews[0]!.coverage).toBe(336);
    expect(previews[0]!.remainingBudget).toBe(2664);
    expect(previews[1]!.coverage).toBeGreaterThan(previews[0]!.coverage);
    expect(previews[1]!.budgets[0]!.used + previews[1]!.budgets[0]!.remaining).toBe(3000);
    expect(previews[1]!.uncoveredNeeds).toEqual([]);
  });
  it('les durées des compléments correspondent à de vrais déroulés avec livrable et évaluation', () => {
    for (const w of FAROS_EXTENSION_WORKSHOPS) {
      expect(w.steps.reduce((sum, step) => sum + step.minutes, 0)).toBe(w.durationMin);
      expect(w.sourceCapsules.length).toBeGreaterThan(0);
      expect(w.exercise.length).toBeGreaterThan(100);
      expect(w.evaluation.length).toBeGreaterThan(100);
    }
  });
  it('ne propose pas de socle déjà maîtrisé', () => {
    const full = seedContent({
      ...input({
        'seller-discovery-formalized': 'no',
        'tool-chatgpt-setup': 'yes',
        'tool-prompts-standard': 'yes',
        'tool-anti-hallucination': 'yes',
      }),
      pathMode: 'COMPLET_IA',
    });
    expect(modulesOf(full.content).some((m) => m.selection?.kind === 'socle')).toBe(false);
  });
  it('ne déduit pas un métier du seul budget ou du seul manque IA', () => {
    for (const answers of [{}, { 'tool-chatgpt-setup': 'no' }]) {
      const i = input(answers);
      expect(modulesOf(seedContent({ ...i, pathMode: 'COMPLET_IA' }).content)).toHaveLength(
        modulesOf(seedContent(i).content).length,
      );
    }
  });
  it('écarte les exclusions et les références ambiguës même en complément', () => {
    const i = input({ 'seller-discovery-formalized': 'no' });
    const forbidden = 'faros-complements:v1:annonces';
    const candidate = library.find((m) => m.sourceRef === forbidden)!;
    for (const changed of [
      library.map((m) => (m === candidate ? { ...m, excludedFromClientOutputs: true } : m)),
      [...library, { ...candidate, moduleId: 'doublon' }],
    ]) {
      const full = seedContent({ ...i, library: changed, pathMode: 'COMPLET_IA' });
      expect(modulesOf(full.content).some((m) => m.selection?.moduleSourceRef === forbidden)).toBe(
        false,
      );
    }
  });
  it('un complément ne masque jamais une douleur non couverte', () => {
    const i = input(
      { 'seller-discovery-formalized': 'no' },
      library.filter((m) => !m.sourceRef?.endsWith(':decouverte-vendeur')),
    );
    const full = seedContent({ ...i, pathMode: 'COMPLET_IA' });
    expect(full.content.uncoveredNeeds).toContain('Découverte vendeur formalisée');
    expect(
      uncoveredProposalNeeds(
        full.content,
        full.match.recommendations.filter((r) => !r.need.code.startsWith('complement:')),
      ),
    ).toHaveLength(1);
  });
  it('refuse un complément lorsque son contexte métier ou sa justification change', () => {
    const i = input({ 'seller-discovery-formalized': 'no' });
    const full = seedContent({ ...i, pathMode: 'COMPLET_IA' });
    expect(
      validateProposalSelection(full.content, recommendations(input({})).recommendations).length,
    ).toBeGreaterThan(0);
    const extra = modulesOf(full.content).find((m) => m.selection?.kind === 'developpement')!;
    extra.selection!.rationale = 'Justification falsifiée';
    expect(
      validateProposalSelection(full.content, recommendations(i).recommendations).length,
    ).toBeGreaterThan(0);
  });
  it('ne crée pas de complément facturé quand aucun droit n’est disponible', () => {
    const i = input({ 'seller-discovery-formalized': 'no' });
    i.audit.funding.agefice.budget = 0;
    i.audit.funding.participants.forEach((p) => {
      p.budget = 0;
    });
    i.audit.funding.halfDays = 0;
    expect(seedContent({ ...i, pathMode: 'COMPLET_IA' }).composition.totalHalfDays).toBe(0);
  });
});
