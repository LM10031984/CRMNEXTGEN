import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FUNDING_RULE_SEEDS } from '@qualiof/shared/diagnostic';
import { ProposalContentSchema } from '@qualiof/shared';
import { buildAuditData } from '@/lib/diagnostic-r1/audit-builder';
import type { FundingRuleValues } from '@/lib/financement/types';
import { recommendModules, type LibraryModule } from '../module-matcher';
import { composeProgramme } from '../composer';
import { seedContent } from '../builder';

const rules = Object.fromEntries(FUNDING_RULE_SEEDS.map((s) => [s.key, s.valueNumeric])) as FundingRuleValues;
const catalogue = JSON.parse(readFileSync('../../packages/db/scripts/data/drive-programmes-catalog.json', 'utf8')) as {
  programmes: { sourceRef: string; title: string; modules: { sourceRef: string; title: string; contentMd: string; durationMin: number | null }[] }[];
};

// Fixtures indépendantes de la table de sélection : contenus effectivement importés.
function module(ref: string, overrides: Partial<LibraryModule> = {}): LibraryModule {
  const p = catalogue.programmes.find((p) => p.modules.some((m) => m.sourceRef === ref))!;
  const m = p.modules.find((m) => m.sourceRef === ref)!;
  return {
    moduleId: ref, sourceRef: ref, title: m.title, family: null, targetProfile: null,
    signals: [], needIdentification: null, isFoundation: false,
    durationMin: m.durationMin ?? 120, contentMd: m.contentMd, excludedFromClientOutputs: false,
    source: { productId: p.sourceRef, code: p.sourceRef, title: p.title, theme: null,
      fundingType: 'COEUR_METIER', isActive: false, supersededBy: null, excludedFromClientOutputs: false },
    ...overrides,
  };
}

function audit(values: Record<string, unknown>) {
  return buildAuditData({
    reference: 'DIAG-TEST', agencyName: 'Agence témoin', generatedAt: new Date('2026-09-18T08:00:00Z'),
    variant: 'COMPLET', answers: Object.entries(values).map(([questionId, value]) => ({ questionId, value, isSkipped: false })),
    participants: [{ id: 'p1', displayName: 'Conseiller', statut: 'INDEPENDANT', caN1: 50000,
      objectiveCa: null, strengths: null, priorityNeed: null, opcoEligible: null, trainings24mFunded: null, includedInProposal: true }],
    rules, of: { name: 'OF', siret: '80012345600017', numDA: '93060812345', address: '', email: '', phone: '' }, valueEuros: 3000,
  });
}

function match(values: Record<string, unknown>, library: LibraryModule[]) {
  const a = audit(values);
  return recommendModules({ chapterScores: a.chapterScores, alerts: a.chapters.flatMap((c) => c.alerts),
    answers: a.chapters.flatMap((c) => c.answers), library });
}

function propose(values: Record<string, unknown>, library: LibraryModule[]) {
  const a = audit(values);
  return { audit: a, ...seedContent({ audit: a, rules, library, agencyName: 'Agence témoin', diagnosticReference: 'DIAG-TEST',
    ofName: 'OF', participantCount: 1 }) };
}

describe('diagnostic → proposition : la compétence doit traiter la douleur précise', () => {
  it('un CRM mal tenu ne prescrit pas une formation aux réponses aux avis', () => {
    const out = match({ 'db-crm-uptodate': 'non' }, [module('drive:047#20')]);
    expect(out.recommendations.map((r) => r.need.code)).toEqual(['crm-a-jour']);
    expect(out.recommendations[0]!.candidates).toEqual([]);
    expect(out.recommendations[0]!.unmet).toBe(true);
  });

  it('une lacune demeure visible même si les autres réponses du chapitre sont bonnes', () => {
    const out = match({ 'tool-chatgpt-setup': 'no', 'tools-esignature': 'yes',
      'tool-prompts-standard': 'yes', 'tool-anti-hallucination': 'yes', 'tool-team-access': 'yes' }, [module('drive:070#2')]);
    expect(out.recommendations.map((r) => r.need.code)).toEqual(['ia-parametree']);
    expect(out.recommendations[0]!.candidates.map((c) => c.moduleId)).toEqual(['drive:070#2']);
  });

  it('la découverte vendeur ne sélectionne jamais un atelier de découverte acheteur', () => {
    const out = match({ 'seller-discovery-formalized': 'no', 'buyers-discovery-formalized': 'yes' },
      [module('drive:008#1', { signals: ['Découverte vendeur estimation rendez-vous vente'] }), module('drive:017#1')]);
    expect(out.recommendations[0]!.candidates.map((c) => c.moduleId)).toEqual(['drive:017#1']);
    expect(out.recommendations[0]!.evidence).toEqual([expect.objectContaining({ questionId: 'seller-discovery-formalized' })]);
  });

  it('les mots-clés d’un module inconnu ne remplacent pas un rattachement explicite', () => {
    const out = match({ 'seller-discovery-formalized': 'no' }, [module('drive:017#1', {
      sourceRef: 'inconnu:1', signals: ['Découverte vendeur estimation rendez-vous vente'],
    })]);
    expect(out.recommendations[0]!.candidates).toEqual([]);
  });

  it('un renommage et un nouvel identifiant en base préservent le rattachement stable', () => {
    const out = match({ 'seller-discovery-formalized': 'no' }, [module('drive:017#1', {
      moduleId: 'nouvel-id', title: 'Préparer son prochain entretien avec IA',
    })]);
    expect(out.recommendations[0]!.candidates.map((c) => c.moduleId)).toEqual(['nouvel-id']);
  });

  it('une compétence de management avec IA répond au besoin métier de réunion', () => {
    const out = match({ 'mgmt-team-meeting-frequency': 'jamais' }, [module('drive:060#2')]);
    expect(out.recommendations[0]!.need.code).toBe('reunion-equipe');
    expect(out.recommendations[0]!.candidates.map((c) => c.moduleId)).toEqual(['drive:060#2']);
  });

  it('la collecte d’avis reste non couverte par une formation qui répond aux avis existants', () => {
    const out = match({ 'reviews-collection-process': 'no' }, [module('drive:047#20')]);
    expect(out.recommendations[0]!.need.code).toBe('collecte-avis');
    expect(out.recommendations[0]!.candidates).toEqual([]);
  });

  it('le suivi après compromis ne prescrit pas une formation à la négociation', () => {
    const out = match({ 'compromis-per-month': 10, 'actes-per-month': 2 }, [module('drive:034#3')]);
    const besoin = out.recommendations.find((r) => r.need.code === 'compromis-vers-acte');
    expect(besoin).toBeDefined();
    expect(besoin!.candidates).toEqual([]);
  });

  it('une moyenne seule sans réponse ni alerte ne crée aucune douleur', () => {
    expect(recommendModules({ chapterScores: [{ chapter: 4, score: 0 }], answers: [], alerts: [],
      library: [module('drive:017#1')] }).recommendations).toEqual([]);
  });

  it.each([
    { excludedFromClientOutputs: true },
    { contentMd: '' },
    { durationMin: 0 },
  ])('écarte les modules non utilisables : %j', (overrides) => {
    const out = match({ 'seller-discovery-formalized': 'no' }, [module('drive:017#1', overrides)]);
    expect(out.recommendations[0]!.candidates).toEqual([]);
  });

  it('écarte les programmes non diffusables et les rayons remplacés', () => {
    for (const change of [{ excludedFromClientOutputs: true }, { supersededBy: 'produit-vendu' }]) {
      const m = module('drive:017#1');
      Object.assign(m.source, change);
      expect(match({ 'seller-discovery-formalized': 'no' }, [m]).recommendations[0]!.candidates).toEqual([]);
    }
  });

  it('une référence dupliquée dans la bibliothèque ne choisit pas arbitrairement un module', () => {
    const out = match({ 'seller-discovery-formalized': 'no' }, [module('drive:017#1'), module('drive:017#1', { moduleId: 'autre' })]);
    expect(out.recommendations[0]!.candidates).toEqual([]);
  });

  it('ne prétend pas couvrir toutes les douleurs lorsqu’une douleur reste sans module', () => {
    const out = match({ 'seller-discovery-formalized': 'no', 'reviews-collection-process': 'no' }, [module('drive:017#1')]);
    const plan = composeProgramme({ recommendations: out.recommendations, rules, envelopeHalfDays: 9 });
    expect(plan.uncovered).toEqual([expect.objectContaining({ code: 'collecte-avis' })]);
    expect(plan.notices.join(' ')).not.toContain('Toutes les douleurs tracées sont couvertes');
  });

  it('la proposition conserve le besoin précis, son résultat et la version de sélection', () => {
    const { content } = propose({ 'seller-discovery-formalized': 'no' }, [module('drive:017#1')]);
    const parsed = ProposalContentSchema.parse(content);
    expect(parsed.axes).toHaveLength(1);
    expect(parsed.axes[0]!.modules[0]).toMatchObject({
      selection: { ruleId: 'decouverte', moduleSourceRef: 'drive:017#1',
        outcome: 'Conduire une découverte vendeur structurée avant de présenter une estimation.' },
    });
  });

  it('l’audit et le programme traitent les mêmes priorités dans le même ordre', () => {
    const out = propose({ 'seller-discovery-formalized': 'no', 'db-crm-uptodate': 'partiellement' },
      [module('drive:058#4'), module('drive:017#1')]);
    expect(out.audit.priorities[0]!.title).toBe('Découverte vendeur formalisée');
    expect(out.content.axes[0]!.modules[0]!.needLabel).toBe('Découverte vendeur formalisée');
    expect(out.content.heard.join(' ')).toContain('Découverte');
  });
});
