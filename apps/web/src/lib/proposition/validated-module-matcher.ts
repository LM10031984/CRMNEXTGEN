import { identifyTrainingNeeds } from '../diagnostic-r1/training-needs';
import { COMPETENCY_LINKS, DIAGNOSTIC_SELECTION_VERSION } from './competency-links';
import { isAnimable, type ModuleCandidate, type ModuleMatchInput, type ModuleMatchOutput } from './module-matcher';

/** Sélection client : seuls des liens explicites entre compétence et douleur. */
export function recommendModules(input: ModuleMatchInput): ModuleMatchOutput {
  const notices: string[] = [];
  const references = new Map<string, typeof input.library[number][]>();
  for (const m of input.library) {
    if (m.sourceRef) references.set(m.sourceRef, [...(references.get(m.sourceRef) ?? []), m]);
  }
  const usable = (m: typeof input.library[number]) => !m.excludedFromClientOutputs &&
    !m.source.excludedFromClientOutputs && m.source.supersededBy === null &&
    m.source.fundingType !== 'REGLEMENTAIRE' && isAnimable(m) && Number.isFinite(m.durationMin) && m.durationMin > 0;

  if (input.library.length === 0) notices.push('La bibliothèque ne contient aucun module disponible.');
  const empty = input.library.filter((m) => !isAnimable(m));
  if (empty.length) notices.push(`${empty.length} module(s) écarté(s) : aucun déroulé pédagogique exploitable.`);
  const recommendations = identifyTrainingNeeds(input).map(({ need, evidence, trigger }) => {
    const candidates: ModuleCandidate[] = [];
    for (const link of COMPETENCY_LINKS.filter((l) => l.ruleId === need.code)) {
      const matches = references.get(link.moduleSourceRef) ?? [];
      if (matches.length > 1) {
        notices.push(`« ${need.label} » : référence de module ambiguë (${link.moduleSourceRef}). Le rattachement doit être vérifié.`);
        continue;
      }
      const m = matches[0];
      if (!m || !usable(m)) continue;
      candidates.push({ moduleId: m.moduleId, title: m.title, source: m.source,
        // La famille décrit la compétence servie ; l'IA décrit la pratique.
        family: need.families[0]!, score: 100 - candidates.length, matchSource: 'signaux', confidence: 'forte',
        matchedSignals: [link.outcome], matchedTerms: [], isFoundation: m.isFoundation,
        durationMin: m.durationMin, targetProfile: link.audience === 'tous' ? m.targetProfile : link.audience,
        selection: { version: DIAGNOSTIC_SELECTION_VERSION, ...link },
      });
      if (candidates.length >= (input.maxCandidates ?? 5)) break;
    }
    if (candidates.length === 0) notices.push(`Besoin non couvert : « ${need.label} ». Aucun module disponible n’a de lien validé avec cette compétence. À compléter avant de promettre un résultat.`);
    return { need, evidence, trigger, candidates, unmet: candidates.length === 0, metierGap: false };
  });
  return { recommendations, notices, libraryModuleCount: input.library.filter(usable).length,
    sourceProgrammeCount: new Set(recommendations.flatMap((r) => r.candidates.map((c) => c.source.productId))).size };
}
