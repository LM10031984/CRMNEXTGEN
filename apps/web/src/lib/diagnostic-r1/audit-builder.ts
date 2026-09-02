/**
 * Assemblage des données du rapport d'audit — fonction pure.
 *
 * Prend l'état d'un diagnostic (réponses, fiches équipe, règles) et produit le
 * `AuditData` que le template met en forme. Séparé du template ET des accès
 * base : c'est ce qui permet de tester le contenu du rapport — « toutes les
 * réponses sont restituées », « le financement est en dernier » — sans PDF ni
 * base de données.
 */

import {
  auditLabelFor,
  DIAGNOSTIC_CHAPTERS,
  DIAGNOSTIC_QUESTIONS,
  type DiagnosticQuestion,
  type DiagnosticVariantKey,
} from '@qualiof/shared/diagnostic';

import { computeFunding } from '@/lib/financement/funding-engine';
import type { FundingRuleValues } from '@/lib/financement/types';

import { buildChapterLecture, buildChapterLever } from './lecture';
import { computePipeline } from './pipeline';
import { getVisibleChapterQuestions, hasValue, type AnswerLike } from './progress';
import { computeRatios, type DiagnosticAlert } from './ratios';
import { computeScoring } from './scoring';
import { resolveEmployeeCount } from './snapshot';
import type { AuditData, AuditPriority, AuditTeamMember } from './templates/audit-data';

const QUESTIONS_BY_ID = new Map(DIAGNOSTIC_QUESTIONS.map((q) => [q.id, q]));

export interface AuditBuildInput {
  reference: string;
  agencyName: string;
  generatedAt: Date;
  variant: DiagnosticVariantKey;
  answers: AnswerLike[];
  participants: {
    id: string;
    displayName: string;
    statut: 'INDEPENDANT' | 'SALARIE' | 'DIRIGEANT';
    caN1: number | null;
    objectiveCa: number | null;
    strengths: string | null;
    priorityNeed: string | null;
    opcoEligible: boolean | null;
    trainings24mFunded: number | null;
    includedInProposal: boolean;
  }[];
  rules: FundingRuleValues;
  of: AuditData['of'];
  /** Valeur affichée en couverture. Paramètre, pas constante (§9.2). */
  valueEuros: number;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const n = Number(value.replace(/[%€\s ]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Une réponse brute rendue lisible pour le document remis.
 *
 * Les valeurs techniques (`ne_sait_pas`, `transaction_ancien`) ne sortent
 * jamais : un dirigeant lit des mots, pas des clés de base de données.
 */
export function renderAnswerValue(question: DiagnosticQuestion, answer: AnswerLike): string {
  if (answer.isSkipped) return 'Non connu au moment du rendez-vous';
  const v = answer.value;
  if (!hasValue(v)) return '—';

  switch (question.type) {
    case 'yesno': {
      const labels = question.answerLabels ?? { yes: 'Oui', no: 'Non' };
      return v === 'yes' ? labels.yes : v === 'no' ? labels.no : String(v);
    }
    case 'choice':
      return question.optionLabels?.[String(v)] ?? String(v);
    case 'multichoice': {
      const values = Array.isArray(v) ? (v as string[]) : [String(v)];
      return values.map((x) => question.optionLabels?.[x] ?? x).join(', ');
    }
    case 'percent':
      return `${toNumber(v) ?? v} %`;
    case 'money': {
      const n = toNumber(v);
      return n === null
        ? String(v)
        : new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR',
            maximumFractionDigits: 0,
          }).format(n);
    }
    case 'date': {
      const d = new Date(String(v));
      return Number.isNaN(d.getTime())
        ? String(v)
        : new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(d);
    }
    default:
      return String(v);
  }
}

/**
 * Les trois priorités du plan 90 jours.
 *
 * Dérivées des chapitres les plus faibles, dans l'ordre de la chaîne de
 * production : on corrige en amont d'abord. Réparer la transformation quand
 * l'entrée de chaîne est tarie ne sert à rien.
 */
function buildPriorities(
  chapterScores: { chapter: number; title: string; score: number | null }[],
  alertsByChapter: Map<number, DiagnosticAlert[]>,
): AuditPriority[] {
  const horizons = ['Jours 1 à 30', 'Jours 31 à 60', 'Jours 61 à 90'];
  return chapterScores
    .filter((c) => c.score !== null && c.chapter >= 3)
    .sort((a, b) => a.score! - b.score!)
    .slice(0, 3)
    .sort((a, b) => a.chapter - b.chapter)
    .map((c, i) => {
      const alerts = (alertsByChapter.get(c.chapter) ?? []).filter((a) => a.audience === 'client');
      const lever = buildChapterLever(c.chapter as never, alerts);
      return {
        title: lever.title,
        why:
          alerts[0]?.label ??
          `${c.title} est noté ${c.score} / 100 : c'est le chapitre où l'effort rapporte le plus vite.`,
        horizon: horizons[i] ?? 'Au-delà de 90 jours',
      };
    });
}

export function buildAuditData(input: AuditBuildInput): AuditData {
  const answerMap = Object.fromEntries(
    input.answers.filter((a) => !a.isSkipped).map((a) => [a.questionId, a.value]),
  );
  const byQuestion = new Map(input.answers.map((a) => [a.questionId, a]));

  const participantsForEngine = input.participants.map((p) => ({
    id: p.id,
    statut: p.statut,
    caN1: p.caN1,
    cfpEligibleBudget: null,
    opcoEligible: p.opcoEligible,
    consumedThisYear: null,
    trainings24mFunded: p.trainings24mFunded,
    includedInProposal: p.includedInProposal,
  }));

  const { ratios, alerts } = computeRatios({
    answers: answerMap,
    participants: input.participants.map((p) => ({
      statut: p.statut,
      caN1: p.caN1,
      trainings24mFunded: p.trainings24mFunded,
    })),
    ageficeAnnualCap: input.rules.AGEFICE_ANNUAL_CAP,
    consumptionLeverPercent: input.rules.CONSUMPTION_LEVER_PERCENT,
  });

  const scoring = computeScoring({ answers: answerMap, ratios });
  const pipeline = computePipeline({ answers: answerMap });
  const funding = computeFunding({
    rules: input.rules,
    participants: participantsForEngine,
    employeeCount: resolveEmployeeCount(answerMap, participantsForEngine),
    companyOpcoConsumed: null,
    modality: 'PRESENTIEL',
    fundingType: 'COEUR_METIER',
    computedAt: input.generatedAt.toISOString(),
  });

  const alertsByChapter = new Map<number, DiagnosticAlert[]>();
  for (const a of alerts) {
    if (a.chapter === null) continue;
    alertsByChapter.set(a.chapter, [...(alertsByChapter.get(a.chapter) ?? []), a]);
  }

  const chapters = DIAGNOSTIC_CHAPTERS.map((meta) => {
    // Ce qui a été POSÉ dépend de la variante — c'est ce qui donne le « sur N
    // questions » affiché à côté du score.
    const asked = getVisibleChapterQuestions(meta.chapter, input.variant, input.answers);

    // Ce qui est RESTITUÉ ne dépend PAS de la variante : toute réponse qui a une
    // trace figure au rapport (§9.2 — « restitution de TOUTES les réponses »).
    // Un diagnostic léger peut porter des réponses hors de son set : passage en
    // complet puis retour, pré-remplissage par transcript, saisie antérieure.
    // Les taire ferait un audit qui contredit ce que le client a dit.
    const lines = DIAGNOSTIC_QUESTIONS.filter((q) => q.chapter === meta.chapter)
      .map((q) => ({ q, a: byQuestion.get(q.id) }))
      .filter((x) => x.a !== undefined && (x.a.isSkipped || hasValue(x.a.value)))
      .map(({ q, a }) => ({
        questionId: q.id,
        label: auditLabelFor(q.id, q.question),
        value: renderAnswerValue(q, a!),
      }));

    const visible = asked.length >= lines.length ? asked : lines;

    const chapterScore = scoring.chapters.find((c) => c.chapter === meta.chapter)!;
    const chapterAlerts = alertsByChapter.get(meta.chapter) ?? [];

    return {
      chapter: meta.chapter,
      title: meta.title,
      score: chapterScore.score,
      coverage: chapterScore.coverage,
      answeredCount: lines.length,
      visibleCount: visible.length,
      answers: lines,
      lecture: buildChapterLecture({
        chapter: meta.chapter,
        chapterTitle: meta.title,
        score: chapterScore.score,
        coverage: chapterScore.coverage,
        answeredCount: lines.length,
        visibleCount: visible.length,
        alerts: chapterAlerts,
        ratios,
      }).text,
      lever: buildChapterLever(meta.chapter, chapterAlerts).action,
      alerts: chapterAlerts,
    };
  });

  const team: AuditTeamMember[] = input.participants.map((p) => ({
    displayName: p.displayName,
    statut: p.statut,
    caN1: p.caN1,
    objectiveCa: p.objectiveCa,
    strengths: p.strengths,
    priorityNeed: p.priorityNeed,
  }));

  // Les verbatims du dirigeant : ses mots, tels qu'ils ont été notés.
  const directorQuotes = ['mgmt-top3-difficulties', 'mgmt-top3-priorities', 'identity-ambition-3y']
    .map((id) => byQuestion.get(id))
    .filter((a): a is AnswerLike => Boolean(a) && !a!.isSkipped && hasValue(a!.value))
    .map((a) => String(a.value).trim())
    .filter((t) => t.length > 0);

  const context: { label: string; value: string }[] = [];
  for (const id of [
    'identity-network',
    'identity-agencies-count',
    'identity-geo-areas',
    'identity-activities',
    'identity-transaction-ancien-percent',
    'identity-property-types',
  ]) {
    const q = QUESTIONS_BY_ID.get(id);
    const a = byQuestion.get(id);
    if (!q || !a || (!a.isSkipped && !hasValue(a.value))) continue;
    context.push({ label: auditLabelFor(id, q.question), value: renderAnswerValue(q, a) });
  }

  return {
    reference: input.reference,
    agencyName: input.agencyName,
    agencyContext: context,
    generatedAt: input.generatedAt,
    valueEuros: input.valueEuros,
    of: input.of,
    globalScore: scoring.global,
    scoringVersion: scoring.version,
    chapters,
    chapterScores: scoring.chapters,
    pipeline,
    funding,
    team,
    directorQuotes,
    revenueGoal: toNumber(answerMap['identity-revenue-goal']),
    revenueN1: toNumber(answerMap['identity-revenue-n1']),
    priorities: buildPriorities(scoring.chapters, alertsByChapter),
    // E-3 : la source de rédaction est toujours dite, jamais devinée.
    generationSource: 'heuristique',
  };
}
