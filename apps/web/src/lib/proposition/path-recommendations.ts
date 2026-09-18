import {
  recommendModules,
  isAnimable,
  type ModuleMatchInput,
  type ModuleMatchOutput,
} from './module-matcher';
import { FAROS_WORKSHOPS } from './faros-workshops';
import { FAROS_EXTENSION_WORKSHOPS } from './faros-extensions';
import type { FundingRuleValues, FundingSynthesis } from '../financement/types';

export type PathMode = 'PRIORITAIRE' | 'COMPLET_IA';
export const PATH_SELECTION_VERSION = 'parcours-faros-v1-2026-09-18';
const METIER = [3, 4, 5, 6, 7, 8, 9, 11];
/** Liens éditoriaux explicites entre contexte métier et compétence de développement. */
export const COMPLEMENT_CONTEXTS: Readonly<Record<string, readonly number[]>> = {
  'prospection-locale': [3],
  'decouverte-vendeur': [4],
  'strategie-mandat': [4],
  'defense-prix': [4, 5],
  'suivi-vendeur': [5, 6],
  'requalification-stock': [5, 6],
  'decouverte-acheteur': [7],
  'base-fiable': [3, 9],
  'base-dormante': [3, 9],
  'collecte-avis': [8],
  'assistant-metier': METIER,
  'prompts-metier': METIER,
  'verification-ia': METIER,
  lancement: [4, 5, 6],
  photos: [4, 5, 6],
  annonces: [4, 5, 6],
  'video-lancement': [4, 5, 6],
  'dossier-documentaire': [4, 5, 6, 7],
  'coordination-compromis': [6, 7],
  'mails-metier': METIER,
  'outil-personnel': METIER,
  'selection-acheteur': [7],
  'pilotage-activite': METIER,
};

export function recommendPathModules(input: ModuleMatchInput, mode: PathMode): ModuleMatchOutput {
  const core = recommendModules(input);
  if (mode !== 'COMPLET_IA') return core;
  const contexts = core.recommendations.filter((r) => r.need.families.includes('METIER'));
  if (!contexts.length) return core;
  // Ne pas transformer une compétence déclarée acquise en prérequis manquant.
  const mastered = new Set(
    input.chapterScores
      .flatMap((c) => c.breakdown ?? [])
      .filter((b) => b.earned !== null && b.earned >= 60)
      .map((b) => b.rule),
  );
  const coreRefs = new Set(
    core.recommendations.flatMap((r) =>
      r.candidates.slice(0, 1).map((c) => c.selection?.moduleSourceRef),
    ),
  );
  const foundations = FAROS_WORKSHOPS.filter((w) =>
    ['ia-parametree', 'prompts-communs', 'anti-hallucination'].some((r) => w.ruleIds.includes(r)),
  );
  const workshops = [
    ...foundations,
    ...FAROS_WORKSHOPS.filter((w) => !foundations.includes(w)),
    ...FAROS_EXTENSION_WORKSHOPS,
  ];
  const recommendations = [...core.recommendations];
  for (const w of workshops) {
    if (coreRefs.has(w.sourceRef) || w.ruleIds.some((r) => mastered.has(r))) continue;
    const slug = w.sourceRef.split(':').at(-1)!;
    const context = contexts.find((r) =>
      r.need.chapters.some((c) => COMPLEMENT_CONTEXTS[slug]?.includes(c)),
    );
    if (!context) continue;
    const matches = input.library.filter((m) => m.sourceRef === w.sourceRef);
    const m = matches[0];
    if (
      matches.length !== 1 ||
      !m ||
      m.excludedFromClientOutputs ||
      m.source.excludedFromClientOutputs ||
      m.source.supersededBy !== null ||
      m.source.fundingType === 'REGLEMENTAIRE' ||
      !isAnimable(m) ||
      !Number.isFinite(m.durationMin) ||
      m.durationMin <= 0
    )
      continue;
    const kind = foundations.includes(w) ? ('socle' as const) : ('developpement' as const);
    const code = `complement:${slug}`;
    const rationale =
      kind === 'socle'
        ? `Socle pour appliquer l’IA au parcours « ${context.need.label} ». Niveau à confirmer lors du positionnement initial.`
        : `Développement du parcours « ${context.need.label} » : ${w.outcome}`;
    recommendations.push({
      need: {
        ...context.need,
        code,
        label: `${kind === 'socle' ? 'Socle IA' : 'Développement métier'} : ${w.title}`.slice(
          0,
          200,
        ),
      },
      evidence: context.evidence,
      trigger: rationale,
      unmet: false,
      metierGap: false,
      candidates: [
        {
          moduleId: m.moduleId,
          title: m.title,
          source: m.source,
          family: 'METIER',
          score: 100,
          matchSource: 'signaux',
          confidence: 'forte',
          matchedSignals: [w.outcome],
          matchedTerms: [],
          isFoundation: kind === 'socle',
          durationMin: m.durationMin,
          targetProfile: 'conseiller',
          selection: {
            version: PATH_SELECTION_VERSION,
            ruleId: code,
            moduleSourceRef: w.sourceRef,
            outcome: w.outcome,
            aiUsage: true,
            audience: 'conseiller',
            kind,
            rationale,
          },
        },
      ],
    });
  }
  return { ...core, recommendations };
}

/** Groupe commun : aucun transfert de droits entre payeurs. Le reste à charge est affiché avant choix. */
export function pathHalfDayLimit(
  funding: FundingSynthesis,
  rules: FundingRuleValues,
  mode: PathMode,
): number {
  if (mode === 'PRIORITAIRE') return Math.min(12, funding.halfDays);
  const hours = rules.HALF_DAY_ONSITE_HOURS * rules.TRAINER_COUNT_DEFAULT;
  const commercial = rules.HALF_DAY_ONSITE_HOURS * rules.PRICE_PER_HOUR_PER_PARTICIPANT;
  const limits = funding.participants
    .filter((p) => p.regime === 'AGEFICE')
    .map((p) => {
      const coveredPerBlock = Math.min(commercial, hours * p.hourlyRate);
      return coveredPerBlock > 0 ? Math.ceil(p.budget / coveredPerBlock) : 0;
    });
  const opcoRate =
    funding.fundingType === 'REGLEMENTAIRE'
      ? rules.OPCO_EP_RATE_REGLEMENTAIRE
      : rules.OPCO_EP_RATE_COEUR_METIER;
  if (
    !funding.opcoEp.manualValidationRequired &&
    funding.modality !== 'DISTANCIEL' &&
    funding.opcoEp.participantCount > 0 &&
    opcoRate > 0
  ) {
    limits.push(
      Math.ceil(funding.opcoEp.budget / (hours * opcoRate * funding.opcoEp.participantCount)),
    );
  }
  return Math.min(12, Math.max(funding.halfDays, ...limits));
}
