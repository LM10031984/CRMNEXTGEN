'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleDashed,
  CloudOff,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import {
  DIAGNOSTIC_CHAPTERS,
  getChapterMeta,
  type DiagnosticChapter,
  type DiagnosticVariantKey,
} from '@qualiof/shared/diagnostic';

import { computePipeline } from '@/lib/diagnostic-r1/pipeline';
import { computeProgress, getVisibleChapterQuestions } from '@/lib/diagnostic-r1/progress';
import { computeFunding } from '@/lib/financement/funding-engine';
import type { FundingRuleValues } from '@/lib/financement/types';
import { recomputeDiagnosticSnapshot, saveDiagnosticAnswer } from '@/server/actions/diagnostics';

import { FundingSynthesisPanel } from './funding-synthesis';
import { PipelineSynthesisPanel } from './pipeline-synthesis';
import { QuestionField } from './question-field';
import { TeamGrid, type TeamRow } from './team-grid';
import { useAutosave } from './use-autosave';

/**
 * L'écran d'un chapitre — l'unité de saisie du R1.
 *
 * Le parti pris qui structure tout : UNE PAGE PAR CHAPITRE, jamais une question
 * par écran. Le point de douleur du prototype était précisément là — faire
 * défiler 69 écrans en face d'un dirigeant.
 *
 * Les deux synthèses sont calculées ICI, côté client, par les moteurs purs :
 * elles se mettent à jour à la frappe, sans aller-retour serveur ni IA. Le
 * snapshot serveur, lui, est persisté en fond — c'est ce que le rapport d'audit
 * reprendra.
 */

export interface AnswerState {
  questionId: string;
  value: unknown;
  isSkipped: boolean;
}

export interface ChapterWorkspaceProps {
  diagnosticId: string;
  reference: string;
  variant: DiagnosticVariantKey;
  chapter: DiagnosticChapter;
  readOnly: boolean;
  initialAnswers: AnswerState[];
  initialParticipants: TeamRow[];
  rules: FundingRuleValues;
}

export function ChapterWorkspace({
  diagnosticId,
  reference,
  variant,
  chapter,
  readOnly,
  initialAnswers,
  initialParticipants,
  rules,
}: ChapterWorkspaceProps) {
  const router = useRouter();
  const [answers, setAnswers] = useState<AnswerState[]>(initialAnswers);
  const [participants, setParticipants] = useState<TeamRow[]>(initialParticipants);
  const [syncing, startSync] = useTransition();
  const { state: saveState, save, flushNow, lastError } = useAutosave();

  // Le serveur reste la source de vérité : quand il renvoie de nouvelles
  // données (ajout d'une fiche équipe, navigation), on s'y réaligne.
  useEffect(() => setParticipants(initialParticipants), [initialParticipants]);

  const meta = getChapterMeta(chapter);
  const answerMap = useMemo(() => new Map(answers.map((a) => [a.questionId, a])), [answers]);

  const questions = useMemo(
    () => getVisibleChapterQuestions(chapter, variant, answers),
    [chapter, variant, answers],
  );

  const progress = useMemo(
    () => computeProgress(variant, answers, participants.length),
    [variant, answers, participants.length],
  );

  // ── Les synthèses, calculées en pur : instantanées, sans réseau, sans IA ────
  const funding = useMemo(
    () =>
      computeFunding({
        rules,
        participants: participants.map((p) => ({
          id: p.id,
          statut: p.statut,
          caN1: p.caN1,
          cfpEligibleBudget: null,
          opcoEligible: p.opcoEligible,
          consumedThisYear: null,
          trainings24mFunded: p.trainings24mFunded,
          includedInProposal: p.includedInProposal,
        })),
        employeeCount: readNumber(answerMap.get('team-employees-count')?.value),
        companyOpcoConsumed: null,
        modality: 'PRESENTIEL',
        fundingType: 'COEUR_METIER',
      }),
    [rules, participants, answerMap],
  );

  const pipeline = useMemo(
    () =>
      computePipeline({
        answers: Object.fromEntries(
          answers.filter((a) => !a.isSkipped).map((a) => [a.questionId, a.value]),
        ),
      }),
    [answers],
  );

  const setAnswer = useCallback(
    (questionId: string, value: unknown, isSkipped: boolean) => {
      setAnswers((prev) => {
        const next = prev.filter((a) => a.questionId !== questionId);
        next.push({ questionId, value, isSkipped });
        return next;
      });
      if (readOnly) return;
      save(questionId, async () => {
        const r = await saveDiagnosticAnswer({ diagnosticId, questionId, value, isSkipped });
        return r.ok ? { ok: true } : { ok: false, error: r.error };
      });
    },
    [diagnosticId, readOnly, save],
  );

  const chapterIndex = DIAGNOSTIC_CHAPTERS.findIndex((c) => c.chapter === chapter);
  const previous = DIAGNOSTIC_CHAPTERS[chapterIndex - 1];
  const next = DIAGNOSTIC_CHAPTERS[chapterIndex + 1];

  /**
   * La grille équipe est ce qui FABRIQUE le budget : dès qu'elle bouge, le
   * snapshot serveur doit suivre. Sans ça, il resterait figé sur l'état d'avant
   * la saisie de l'équipe, et le rapport d'audit reprendrait des zéros alors
   * que l'écran affichait 12 000 €.
   */
  const onTeamChanged = useCallback(() => {
    router.refresh();
    if (readOnly) return;
    startSync(async () => {
      await recomputeDiagnosticSnapshot(diagnosticId);
    });
  }, [diagnosticId, readOnly, router]);

  const goTo = useCallback(
    async (target: DiagnosticChapter) => {
      // On vide la file d'attente AVANT de naviguer : rien ne se perd entre
      // deux chapitres, même si la dernière frappe date d'une demi-seconde.
      await flushNow();
      if (!readOnly) {
        startSync(async () => {
          await recomputeDiagnosticSnapshot(diagnosticId);
        });
      }
      router.push(`/app/diagnostics/${diagnosticId}/chapitre/${target}` as Route);
    },
    [diagnosticId, flushNow, readOnly, router],
  );

  // ⌘←/⌘→ pour changer de chapitre — le commercial ne lâche pas le clavier.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.metaKey && !e.ctrlKey) return;
      if (e.key === 'ArrowLeft' && previous) {
        e.preventDefault();
        void goTo(previous.chapter);
      }
      if (e.key === 'ArrowRight' && next) {
        e.preventDefault();
        void goTo(next.chapter);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo, next, previous]);

  const chapterProgress = progress.chapters.find((c) => c.chapter === chapter)!;

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      {/* ── Progression par chapitre ─────────────────────────────────────── */}
      <nav aria-label="Chapitres" className="lg:sticky lg:top-4 lg:self-start">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
          {reference} · {progress.answeredCount}/{progress.visibleCount} réponses
        </p>
        <ol className="space-y-0.5">
          {progress.chapters.map((c) => {
            const active = c.chapter === chapter;
            return (
              <li key={c.chapter}>
                <button
                  type="button"
                  onClick={() => void goTo(c.chapter)}
                  className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${
                    active ? 'bg-primary/10 font-medium' : 'hover:bg-muted'
                  }`}
                  aria-current={active ? 'step' : undefined}
                >
                  {c.isComplete ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                  ) : (
                    <CircleDashed
                      className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  )}
                  <span className="truncate">
                    {c.chapter}. {c.title}
                  </span>
                  <span className="ml-auto tabular-nums text-[10px] text-muted-foreground">
                    {c.answeredCount}/{c.visibleCount}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* ── Le chapitre ──────────────────────────────────────────────────── */}
      <div className="min-w-0 space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">
              {chapter}. {meta.title}
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{meta.objective}</p>
          </div>
          <SaveIndicator state={saveState} error={lastError} syncing={syncing} />
        </header>

        {chapter === 2 && (
          <section className="rounded-lg border border-border p-4">
            <h2 className="text-sm font-semibold mb-1">L’équipe</h2>
            <p className="text-xs text-muted-foreground mb-3">
              Une ligne par personne à former. C’est cette grille qui fabrique le budget.
            </p>
            <TeamGrid
              diagnosticId={diagnosticId}
              rows={participants}
              disabled={readOnly}
              onChanged={onTeamChanged}
            />
          </section>
        )}

        {questions.length > 0 ? (
          <div className="divide-y divide-border rounded-lg border border-border px-4">
            {questions.map((q) => {
              const a = answerMap.get(q.id);
              return (
                <QuestionField
                  key={q.id}
                  question={q}
                  value={a?.value ?? null}
                  isSkipped={a?.isSkipped ?? false}
                  disabled={readOnly}
                  onChange={(v) => setAnswer(q.id, v, false)}
                  onSkipToggle={(skipped) =>
                    setAnswer(q.id, skipped ? null : (a?.value ?? null), skipped)
                  }
                />
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Aucune question de ce chapitre dans le diagnostic léger.
          </p>
        )}

        {chapterProgress.missingRequired.length > 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {chapterProgress.missingRequired.length} réponse(s) obligatoire(s) encore vide(s) — ça
            ne bloque rien, mais ça figurera comme donnée manquante dans le rapport.
          </p>
        )}

        {/* Les deux moments de démonstration du R1. */}
        {meta.followedBySynthesis === 'funding' && (
          <FundingSynthesisPanel synthesis={funding} participantCount={participants.length} />
        )}
        {meta.followedBySynthesis === 'pipeline' && <PipelineSynthesisPanel synthesis={pipeline} />}

        <nav className="flex items-center justify-between gap-3 border-t border-border pt-4">
          {previous ? (
            <button
              type="button"
              onClick={() => void goTo(previous.chapter)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4" />
              {previous.chapter}. {previous.title}
            </button>
          ) : (
            <Link
              href={`/app/diagnostics/${diagnosticId}` as Route}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4" />
              Le diagnostic
            </Link>
          )}
          {next ? (
            <button
              type="button"
              onClick={() => void goTo(next.chapter)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-primary bg-primary/10 text-sm font-medium hover:bg-primary/20"
            >
              {next.chapter}. {next.title}
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <Link
              href={`/app/diagnostics/${diagnosticId}` as Route}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-primary bg-primary/10 text-sm font-medium hover:bg-primary/20"
            >
              Terminer
              <Check className="h-4 w-4" />
            </Link>
          )}
        </nav>

        <p className="text-[11px] text-muted-foreground">
          Entrée passe au champ suivant · ⌘← et ⌘→ changent de chapitre · tout s’enregistre seul.
        </p>
      </div>
    </div>
  );
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const n = Number(value.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function SaveIndicator({
  state,
  error,
  syncing,
}: {
  state: ReturnType<typeof useAutosave>['state'];
  error: string | null;
  syncing: boolean;
}) {
  if (state === 'error') {
    return (
      <span
        className="shrink-0 inline-flex items-center gap-1.5 text-xs text-red-600"
        role="status"
      >
        <CloudOff className="h-3.5 w-3.5" aria-hidden />
        {error ?? 'Non enregistré'} — la saisie continue, elle sera rejouée
      </span>
    );
  }
  if (state === 'retrying') {
    return (
      <span
        className="shrink-0 inline-flex items-center gap-1.5 text-xs text-amber-600"
        role="status"
      >
        <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Nouvel essai…
      </span>
    );
  }
  if (state === 'saving' || syncing) {
    return (
      <span
        className="shrink-0 inline-flex items-center gap-1.5 text-xs text-muted-foreground"
        role="status"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Enregistrement…
      </span>
    );
  }
  if (state === 'saved') {
    return (
      <span
        className="shrink-0 inline-flex items-center gap-1.5 text-xs text-emerald-600"
        role="status"
      >
        <Check className="h-3.5 w-3.5" aria-hidden />
        Enregistré
      </span>
    );
  }
  return null;
}
