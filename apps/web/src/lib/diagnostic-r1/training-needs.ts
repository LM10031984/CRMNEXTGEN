/** Besoins unitaires partagés par l'audit et le parcours, sans dépendance I/O. */
import { listDiagnosticPainPoints } from './scoring';
import type { DiagnosticEvidence, ModuleMatchInput, ProgrammeNeed } from '../proposition/module-matcher';

const ALERTS: Readonly<Record<string, string>> = {
  'contacts-vers-rdv': 'contacts_to_rdv_below_benchmark',
  'rdv-vers-mandat': 'rdv_to_mandat_below_benchmark',
  exclusivite: 'exclusivity_below_benchmark',
  'offres-vers-compromis': 'offres_to_compromis_below_benchmark',
  'compromis-vers-acte': 'compromis_to_acte_below_benchmark',
  'visites-par-vente': 'visits_per_vente_high',
  'avis-par-vente': 'reviews_per_vente_below_benchmark',
};

export interface TrainingNeed {
  need: ProgrammeNeed;
  evidence: DiagnosticEvidence[];
  priority: number;
  trigger: string;
}

export function identifyTrainingNeeds(input: Pick<ModuleMatchInput, 'chapterScores' | 'alerts' | 'answers'>): TrainingNeed[] {
  const answers = new Map(input.answers.map((a) => [a.questionId, a]));
  const needs: TrainingNeed[] = [];
  for (const point of listDiagnosticPainPoints().filter((p) => p.answerableByTraining)) {
    const result = input.chapterScores.find((c) => c.chapter === point.chapter)?.breakdown?.find((b) => b.rule === point.ruleId);
    const alert = input.alerts.find((a) => a.code === ALERTS[point.ruleId] && a.audience === 'client');
    const weak = result?.earned !== null && result?.earned !== undefined && result.earned < 60;
    if (!weak && !alert) continue;

    const evidence: DiagnosticEvidence[] = [];
    const answer = point.questionId ? answers.get(point.questionId) : undefined;
    if (weak && answer && answer.value.trim()) {
      evidence.push({ kind: 'reponse', ...answer, rule: point.ruleId, note: point.note, earned: result!.earned! });
    } else if (alert && alert.questionIds.length > 0 && alert.questionIds.every((id) => answers.get(id)?.value.trim())) {
      evidence.push({ kind: 'alerte', code: alert.code, label: alert.label, chapter: alert.chapter,
        answers: alert.questionIds.map((id) => answers.get(id)!) });
    }
    // Un chapitre faible ou une alerte privée de sa source ne sont pas des preuves.
    if (evidence.length === 0) continue;
    needs.push({
      need: { code: point.ruleId, label: point.note, chapters: [point.chapter],
        families: [point.chapter === 10 ? 'IA' : 'METIER'], alertCodes: ALERTS[point.ruleId] ? [ALERTS[point.ruleId]!] : [], keywords: [] },
      evidence,
      priority: (100 - (result?.earned ?? 0)) * point.weight,
      trigger: evidence[0]!.kind === 'alerte' ? evidence[0]!.label : `${answer!.label} : ${answer!.value}`,
    });
  }
  return needs.sort((a, b) => b.priority - a.priority || a.need.chapters[0]! - b.need.chapters[0]! || a.need.code.localeCompare(b.need.code));
}
