'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
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
  RotateCw,
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
import {
  completeDiagnostic,
  recomputeDiagnosticSnapshot,
  saveDiagnosticAnswer,
} from '@/server/actions/diagnostics';
import { recapHref, resolveFinishAction } from '@/lib/diagnostic-r1/finish';

import { FundingSynthesisPanel } from './funding-synthesis';
import { PipelineSynthesisPanel } from './pipeline-synthesis';
import { QuestionField } from './question-field';
import { TeamGrid, type TeamRow } from './team-grid';
import { useAutosave, type FailedWrite } from './use-autosave';

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

/**
 * Ce que l'écran dit quand la borne est atteinte. Le fond du message : on a
 * cessé d'ATTENDRE, on n'a pas cessé d'ÉCRIRE — et l'indicateur d'en-tête reste
 * la source de vérité sur ce qui est parti.
 */
const ATTENTE_DEPASSEE =
  'Enregistrement plus long que prévu — il continue en arrière-plan, rien n’est perdu.';

export interface AnswerState {
  questionId: string;
  value: unknown;
  isSkipped: boolean;
  /** Extraction du compte rendu pas encore relue (lot C). */
  aRelire?: boolean;
  /** L'extrait qui la justifie, affiché sous le champ. */
  quote?: string | null;
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
  const { state: saveState, save, flushNow, retryFailed, lastError, failed } = useAutosave();

  /**
   * La cible en cours de navigation — deux rôles, et les deux comptent.
   *
   * Le ref GARDE : trois clics sur « suivant » ne doivent produire qu'une
   * navigation. Contre le code d'origine, ils en produisaient deux — le premier
   * clic restait bloqué pendant que le deuxième passait, ce qui rendait le
   * défaut incompréhensible en rendez-vous.
   *
   * L'état AFFICHE : le bouton cliqué s'annonce occupé dans la milliseconde.
   * Une attente légitime ne doit jamais ressembler à un bouton mort.
   */
  const navigatingRef = useRef<number | 'finish' | null>(null);
  const [navigatingTo, setNavigatingTo] = useState<number | 'finish' | null>(null);

  // Arrivé au chapitre demandé : on relâche le garde.
  useEffect(() => {
    navigatingRef.current = null;
    setNavigatingTo(null);
  }, [chapter]);

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
        // Reprendre la main sur une réponse extraite VAUT confirmation :
        // `saveDiagnosticAnswer` la repasse en COMMERCIAL confirmée côté
        // serveur, le badge doit tomber ici dans la seconde.
        next.push({ questionId, value, isSkipped, aRelire: false, quote: null });
        return next;
      });
      if (readOnly) return;
      // Le libellé accompagne l'écriture : si elle échoue, l'écran doit pouvoir
      // NOMMER la réponse qui n'est pas partie, pas afficher un identifiant.
      const label = questions.find((q) => q.id === questionId)?.question ?? questionId;
      save(
        questionId,
        async () => {
          const r = await saveDiagnosticAnswer({ diagnosticId, questionId, value, isSkipped });
          return r.ok ? { ok: true } : { ok: false, error: r.error };
        },
        label,
      );
    },
    [diagnosticId, questions, readOnly, save],
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

  /**
   * « Terminer » — le bouton du dernier chapitre.
   *
   * Il TERMINE. C'était le défaut du 03/09 : ce n'était qu'un lien vers la
   * fiche, laquelle redirigeait vers le premier chapitre incomplet, et le
   * commercial repartait saisir sans comprendre pourquoi.
   *
   * S'il manque des obligatoires, on ne clôt pas tout de suite mais on emmène
   * au récapitulatif qui les liste avec des liens directs. Ce n'est pas un
   * barrage : le récapitulatif porte un bouton « Terminer quand même ».
   */
  const finish = useCallback(() => {
    if (navigatingRef.current !== null) return;
    navigatingRef.current = 'finish';
    setNavigatingTo('finish');
    startSync(async () => {
      // Même borne qu'un changement de chapitre : « Terminer » était atteint
      // par le même défaut — il attendait `flushNow` sans limite.
      const complete = await flushNow();
      if (!complete) toast.warning(ATTENTE_DEPASSEE);
      const action = resolveFinishAction(diagnosticId, progress);
      if (action.kind === 'complete') {
        const r = await completeDiagnostic(diagnosticId);
        if (!r.ok) {
          toast.error(r.error);
          navigatingRef.current = null;
          setNavigatingTo(null);
          return;
        }
        toast.success('Diagnostic terminé');
      }
      router.push(action.href as Route);
    });
  }, [diagnosticId, flushNow, progress, router]);

  const goTo = useCallback(
    async (target: DiagnosticChapter) => {
      // Un seul déplacement à la fois. Sans ce garde, trois clics lançaient
      // trois `flushNow` et trois recalculs — et allongeaient exactement la
      // file qui faisait paraître le bouton mort.
      if (navigatingRef.current !== null) return;
      navigatingRef.current = target;
      setNavigatingTo(target);

      // On pousse la file AVANT de naviguer — mais on ne l'attend PAS
      // indéfiniment. Dépasser la borne n'abandonne rien : la file vit hors du
      // composant et continue de se vider pendant et après la navigation.
      const complete = await flushNow();
      if (!complete) toast.warning(ATTENTE_DEPASSEE);

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
                  disabled={navigatingTo !== null && navigatingTo !== c.chapter}
                  aria-busy={navigatingTo === c.chapter ? true : undefined}
                  className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors disabled:opacity-50 ${
                    active ? 'bg-primary/10 font-medium' : 'hover:bg-muted'
                  } ${navigatingTo === c.chapter ? 'bg-primary/20' : ''}`}
                  aria-current={active ? 'step' : undefined}
                >
                  {navigatingTo === c.chapter ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" aria-hidden />
                  ) : c.isComplete ? (
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
          <SaveIndicator
            state={saveState}
            error={lastError}
            syncing={syncing}
            failedCount={failed.length}
          />
        </header>

        <FailedPanel failed={failed} onRetry={() => void retryFailed()} />

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
                  aRelire={a?.aRelire ?? false}
                  quote={a?.quote ?? null}
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
              disabled={navigatingTo !== null && navigatingTo !== previous.chapter}
              aria-busy={navigatingTo === previous.chapter ? true : undefined}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm hover:bg-muted disabled:opacity-50"
            >
              {navigatingTo === previous.chapter ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <ArrowLeft className="h-4 w-4" />
              )}
              {previous.chapter}. {previous.title}
            </button>
          ) : (
            <Link
              href={recapHref(diagnosticId) as Route}
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
              disabled={navigatingTo !== null && navigatingTo !== next.chapter}
              aria-busy={navigatingTo === next.chapter ? true : undefined}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-primary bg-primary/10 text-sm font-medium hover:bg-primary/20 disabled:opacity-50"
            >
              {next.chapter}. {next.title}
              {navigatingTo === next.chapter ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={finish}
              disabled={readOnly || syncing || navigatingTo !== null}
              aria-busy={navigatingTo === 'finish' ? true : undefined}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-primary bg-primary/10 text-sm font-medium hover:bg-primary/20 disabled:opacity-50"
            >
              {syncing || navigatingTo === 'finish' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              Terminer
              <Check className="h-4 w-4" />
            </button>
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

/**
 * L'état d'enregistrement, TOUJOURS affiché.
 *
 * Défaut du 14/09 : l'indicateur rendait `null` en état `idle`. L'écran ne
 * disait donc jamais « tout est enregistré » — il ne parlait que quand ça allait
 * mal, et il se taisait quand ça allait COMME quand ça bloquait. Sur un écran
 * qu'un commercial remplit devant un dirigeant avec les chiffres de son agence,
 * le silence n'est pas neutre : il inquiète, et il rend un blocage
 * indiscernable d'un calme plat.
 */
function SaveIndicator({
  state,
  error,
  syncing,
  failedCount,
}: {
  state: ReturnType<typeof useAutosave>['state'];
  error: string | null;
  syncing: boolean;
  failedCount: number;
}) {
  const base = 'shrink-0 inline-flex items-center gap-1.5 text-xs';

  if (state === 'error' || failedCount > 0) {
    return (
      <span className={`${base} text-red-600`} role="status">
        <CloudOff className="h-3.5 w-3.5" aria-hidden />
        {error ?? 'Non enregistré'}
      </span>
    );
  }
  if (state === 'retrying') {
    return (
      <span className={`${base} text-amber-600`} role="status">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Nouvel essai…
      </span>
    );
  }
  if (state === 'saving' || syncing) {
    return (
      <span className={`${base} text-muted-foreground`} role="status">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Enregistrement…
      </span>
    );
  }
  // `idle` comme `saved` : on le DIT. Rien en attente, rien en échec.
  return (
    <span className={`${base} text-emerald-600`} role="status">
      <Check className="h-3.5 w-3.5" aria-hidden />
      {state === 'saved' ? 'Enregistré' : 'À jour'}
    </span>
  );
}

/**
 * Ce qui n'est PAS parti, nommé.
 *
 * La contrepartie de la borne : on cesse d'attendre, donc on doit dire. Une
 * navigation silencieuse sur un enregistrement raté serait pire que le blocage
 * qu'on corrige — le commercial repartirait en croyant sa saisie en base.
 */
function FailedPanel({ failed, onRetry }: { failed: FailedWrite[]; onRetry: () => void }) {
  if (failed.length === 0) return null;
  const rejouables = failed.some((f) => f.retryable);
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 p-3 space-y-2"
    >
      <p className="text-sm font-medium text-red-700 dark:text-red-400">
        {failed.length} réponse(s) non enregistrée(s)
      </p>
      <ul className="text-xs text-red-700 dark:text-red-300 space-y-1">
        {failed.map((f) => (
          <li key={f.key}>
            <span className="font-medium">{f.label}</span> — {f.error}
          </li>
        ))}
      </ul>
      {rejouables && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-red-400 text-xs font-medium text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40"
        >
          <RotateCw className="h-3.5 w-3.5" aria-hidden />
          Réessayer
        </button>
      )}
    </div>
  );
}
