import type { ProposalContent } from '@qualiof/shared';
import type { ModuleRecommendation } from './module-matcher';

/** Vérifie le persisté contre les réponses et modules actuels, jamais le lexique. */
export function validateProposalSelection(content: ProposalContent, recommendations: readonly ModuleRecommendation[]): string[] {
  const errors: string[] = [];
  const modules = content.axes.flatMap((a) => a.modules);
  if (modules.length === 0) return ['Aucun atelier relié au diagnostic. Créez une nouvelle proposition depuis le diagnostic complété.'];
  const seen = new Set<string>();
  for (const m of modules) {
    if (seen.has(m.moduleId)) errors.push(`L’atelier « ${m.title} » figure plusieurs fois dans le parcours.`);
    seen.add(m.moduleId);
    if (!m.selection) {
      errors.push(`Le lien entre « ${m.title} » et le diagnostic doit être actualisé. Créez une nouvelle proposition depuis le diagnostic pour utiliser les ateliers adaptés.`);
      continue;
    }
    for (const selection of [m.selection, ...(m.additionalSelections ?? [])]) {
      const rec = recommendations.find((r) => r.need.code === selection.ruleId);
      const candidate = rec?.candidates.find((c) => c.moduleId === m.moduleId);
      const expected = candidate?.selection;
      const valid = expected && Object.entries(expected).every(([key, value]) => selection[key as keyof typeof selection] === value);
      const quotes = rec?.evidence.flatMap((e) => e.kind === 'alerte'
        ? e.answers.map((a) => `${a.label} : ${a.value}`.slice(0, 300))
        : [`${e.label} : ${e.value}`.slice(0, 300)]) ?? [];
      if (!valid || !quotes.some((q) => m.quotes.includes(q)) || candidate!.durationMin !== m.durationMin || candidate!.title !== m.title || candidate!.source.code !== m.sourceCode || candidate!.source.title !== m.sourceTitle) {
        errors.push(`« ${m.title} » ne correspond plus à un besoin prouvé et à un atelier disponible. Actualisez la proposition depuis le diagnostic.`);
        break;
      }
    }
  }
  return errors;
}

export function uncoveredProposalNeeds(content: ProposalContent, recommendations: readonly ModuleRecommendation[]): string[] {
  const covered = new Set(content.axes.flatMap((a) => a.modules.flatMap((m) =>
    [m.selection, ...(m.additionalSelections ?? [])].flatMap((s) => s ? [s.ruleId] : []))));
  return recommendations.filter((r) => !covered.has(r.need.code)).map((r) => r.need.label);
}
