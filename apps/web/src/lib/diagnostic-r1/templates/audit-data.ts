/**
 * Le contrat de données du rapport d'audit.
 *
 * Volontairement séparé du rendu : le template ne fait que mettre en forme ce
 * qu'on lui donne. Aucun calcul dans le HTML — les chiffres viennent des
 * moteurs purs, déjà arrêtés et snapshotés.
 */

import type { DiagnosticChapter, DiagnosticVariantKey } from '@qualiof/shared/diagnostic';

import type { FundingSynthesis } from '@/lib/financement/types';
import type { PipelineSynthesis } from '../pipeline';
import type { DiagnosticAlert } from '../ratios';
import type { ChapterScore } from '../scoring';
import type { TeamObjectives } from '../team-objectives';

export interface AuditAnswerLine {
  questionId: string;
  /** La question, reformulée pour l'écrit — pas la question orale du rendez-vous. */
  label: string;
  /** La réponse, déjà rendue lisible (libellés d'options, unités, « ne sait pas »). */
  value: string;
}

export interface AuditChapter {
  chapter: DiagnosticChapter;
  title: string;
  score: number | null;
  coverage: number;
  answeredCount: number;
  visibleCount: number;
  answers: AuditAnswerLine[];
  lecture: string;
  lever: string;
  alerts: DiagnosticAlert[];
}

export interface AuditPriority {
  title: string;
  why: string;
  horizon: string;
}

export interface AuditData {
  /** DIAG-NNNN */
  reference: string;
  /**
   * Pilote la mise en page : un diagnostic LÉGER sort au format condensé
   * (chapitres au fil de l'eau), un COMPLET garde une page par chapitre.
   */
  variant: DiagnosticVariantKey;
  agencyName: string;
  agencyContext: { label: string; value: string }[];
  generatedAt: Date;
  /** Ce que le document vaut — affiché en couverture (§9.2). */
  valueEuros: number;
  of: {
    name: string;
    siret: string | null;
    numDA: string | null;
    address: string | null;
    email: string | null;
    phone: string | null;
  };
  globalScore: number | null;
  scoringVersion: string;
  chapters: AuditChapter[];
  chapterScores: ChapterScore[];
  pipeline: PipelineSynthesis;
  funding: FundingSynthesis;
  /**
   * Les fiches équipe, objectifs proposés et préconisations déjà arrêtés par
   * `buildTeamObjectives()`. Le template ne fait que mettre en forme.
   */
  teamObjectives: TeamObjectives;
  /**
   * L'effectif salarié DÉCLARÉ au chapitre 2 — distinct du nombre de fiches
   * cartographiées. Les deux se contredisaient dans le rapport (« Salariés : 1 »
   * page 3, « 0 salarié(s) » page 17) ; la page financement les réconcilie.
   */
  declaredEmployeeCount: number | null;
  /** Verbatims du dirigeant — ses mots, dans son ordre. */
  directorQuotes: string[];
  revenueGoal: number | null;
  revenueN1: number | null;
  priorities: AuditPriority[];
  /** « heuristique » ou « llm:<modèle> » — E-3 : jamais silencieux. */
  generationSource: string;
}
