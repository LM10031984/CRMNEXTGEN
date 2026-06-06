'use client';

/**
 * Quick task 260525-kl5 — bloc agrégé "Préparation pédagogique".
 *
 * Affiche l'état des 6 catégories de docs pré-formation pour la session :
 *  - Col 1 (partagés) : Programme / Déroulé / Checklist
 *  - Col 2 (par stagiaire) : Convention / Convocation / Analyse besoin
 *
 * 3 états globaux :
 *  - vide      → CTA primaire "Lancer la préparation"
 *  - partiel   → CTA secondaire "Compléter (X manquants)"
 *  - complet   → badge vert + lien discret vers les participants
 *
 * Auto-refresh toutes les 5s tant que des jobs analyse besoin sont
 * PROCESSING ou QUEUED (même pattern que batch-progress-auto-refresh.tsx,
 * mais on update le state local sans router.refresh pour ne pas rerender
 * toute la page).
 */

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ClipboardList, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  getSessionPreparationStatus,
  prepareSession,
  type SessionPreparationStatus,
} from '@/server/actions/prepare-training';
import { docCompletion } from '@/lib/sessions/doc-completion';
import { buildPrepCompletionItems } from '@/lib/sessions/build-prep-completion-items';
import { TimelineStep, StepDocRow, type StepState } from './timeline-step';

interface Props {
  sessionId: string;
  initialStatus: SessionPreparationStatus;
  canWrite: boolean;
  /** Visuel : si cette étape est l'action attendue (statut DRAFT/PLANNED) */
  isActive?: boolean;
  /** Expansion initiale (dérivée de stagesState[2] === 'active'). */
  expanded?: boolean;
}

export function PreparationPedagogiqueBlock({
  sessionId,
  initialStatus,
  canWrite,
  isActive = false,
  expanded,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<SessionPreparationStatus>(initialStatus);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Auto-refresh tant qu'il reste des jobs analyse besoin in-flight.
  const analyseBesoinInflight = status.analyseBesoinInProgress + status.analyseBesoinPending;
  useEffect(() => {
    if (analyseBesoinInflight <= 0) return;
    const id = setInterval(async () => {
      const fresh = await getSessionPreparationStatus(sessionId);
      if (!fresh.ok) return;
      // Conditionne router.refresh() au CHANGEMENT réel — sinon on
      // refetch tout l'arbre RSC toutes les 5s pour rien (risque flicker).
      // Feedback Laurent ui-e1 2026-06-06.
      setStatus((prev) => {
        const changed =
          prev.analyseBesoinDone !== fresh.analyseBesoinDone ||
          prev.analyseBesoinInProgress !== fresh.analyseBesoinInProgress ||
          prev.analyseBesoinPending !== fresh.analyseBesoinPending;
        if (changed) router.refresh();
        return fresh;
      });
    }, 5000);
    return () => clearInterval(id);
  }, [analyseBesoinInflight, sessionId, router]);

  function handleCompleter() {
    setError(null);
    startTransition(async () => {
      const r = await prepareSession(sessionId);
      if (!r.ok) {
        setError(r.error ?? 'Erreur lors de la préparation');
        toast.error(r.error ?? 'Erreur lors de la préparation');
        return;
      }
      // Re-lire l'état immédiatement après l'action pour rafraîchir l'UI
      // (les generators sync auront mis à jour les Document/PedagogicalAsset).
      const fresh = await getSessionPreparationStatus(sessionId);
      if (fresh.ok) setStatus(fresh);
      // Refresh RSC : sans ça, le drawer + le badge X/Y dérivé de
      // docDockItems restent figés sur le snapshot SSR initial.
      router.refresh();
      const errorCount = r.errors.length;
      if (errorCount === 0) {
        const ageficeMsg = r.ageficeEligible > 0
          ? ` · ${r.ageficeGenerated}/${r.ageficeEligible} demande(s) AGEFICE`
          : '';
        toast.success(
          `Préparation OK : ${r.programmesGenerated} programme · ${r.derouleGenerated ? 'déroulé' : 'pas de déroulé'} · ${r.checklistGenerated ? 'checklist' : 'pas de checklist'} · ${r.conventionsGenerated}/${r.total} convention(s) · ${r.convocationsGenerated}/${r.total} convocation(s) · ${r.analyseBesoinEnqueued} analyse(s) besoin en cours${ageficeMsg}`,
        );
      } else {
        toast.warning(
          `Partiel : ${errorCount} erreur${errorCount > 1 ? 's' : ''}. Voir console serveur.`,
        );
      }
    });
  }

  const N = status.participantsCount;

  // Source UNIQUE — items dérivés du status local, comptés par `docCompletion`.
  // Garde-fou Laurent 2026-06-05 : "compteur step = état drawer = matrice".
  const completion = useMemo(
    () => docCompletion(buildPrepCompletionItems(status)),
    [status],
  );
  const totalDone = completion.ready;
  const totalExpected = completion.total;
  const missingCount = completion.missing;
  const complete = totalExpected > 0 && missingCount === 0;
  const empty = totalDone === 0 && completion.pending === 0;

  const stepState: StepState = complete
    ? 'done'
    : pending || analyseBesoinInflight > 0
      ? 'active'
      : isActive
        ? 'active'
        : totalDone > 0
          ? 'active'
          : 'todo';

  const badge = complete ? (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-medium">
      Préparation complète · {totalDone}/{totalExpected}
    </span>
  ) : analyseBesoinInflight > 0 ? (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-sky-700 text-[11px] font-medium">
      <Loader2 className="h-3 w-3 animate-spin" /> IA en cours · {analyseBesoinInflight} analyse{analyseBesoinInflight > 1 ? 's' : ''}
    </span>
  ) : totalDone > 0 ? (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-medium">
      {totalDone}/{totalExpected} · {missingCount} manquant{missingCount > 1 ? 's' : ''}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-slate-600 text-[11px] font-medium">
      Non démarrée
    </span>
  );

  const action = !canWrite ? (
    <span className="text-xs text-muted-foreground">Lecture seule</span>
  ) : complete ? null : empty ? (
    <button
      type="button"
      onClick={handleCompleter}
      disabled={pending || N === 0}
      className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
      title={N === 0 ? 'Aucun apprenant inscrit' : 'Génère les 7 catégories de docs pré-formation en parallèle'}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
      Lancer la préparation
    </button>
  ) : (
    <button
      type="button"
      onClick={handleCompleter}
      disabled={pending}
      className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md border border-border bg-white text-sm font-medium hover:bg-muted/40 transition-colors disabled:opacity-60"
      title="Régénère uniquement les docs manquants (idempotent)"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
      Compléter ({missingCount})
    </button>
  );

  return (
    <TimelineStep
      number={2}
      title="Préparation pédagogique"
      state={stepState}
      expanded={expanded}
      caption="Programme · Déroulé · Check-list · Convention · Convocation · Analyse besoin · AGEFICE"
      qualiopi="Ind 1 · 6 · 8 · 9 · 10 · 11 · 17 · 27"
      badge={badge}
      action={action}
    >
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 mb-3 text-sm text-red-700 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Partagés (produit / session)
          </h3>
          <ul className="space-y-1.5">
            <StepDocRow done={status.programme} label="Programme de formation" indic="Ind 1·6" />
            <StepDocRow done={status.deroule} label="Déroulé pédagogique (IA)" indic="Ind 10" />
            <StepDocRow done={status.checklist} label="Check-list formation" indic="Ind 17" />
          </ul>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Par stagiaire ({N})
          </h3>
          <ul className="space-y-1.5">
            <StepDocRow
              count={status.conventionsCount}
              total={N}
              label="Convention (1/payeur)"
              indic="Ind 6·8"
            />
            <StepDocRow
              count={status.convocationsCount}
              total={N}
              label="Convocation"
              indic="Ind 9"
            />
            <StepDocRow
              count={status.analyseBesoinDone}
              total={N}
              label="Analyse besoin (IA)"
              indic="Ind 11"
              pending={analyseBesoinInflight > 0}
            />
            {status.ageficeEligibleCount > 0 && (
              <StepDocRow
                count={status.ageficeCount}
                total={status.ageficeEligibleCount}
                label="Demande prise en charge AGEFICE"
                indic="Ind 27"
              />
            )}
          </ul>
          {status.ageficeEligibleCount > 0 && status.ageficeEligibleCount < N && (
            <p className="text-[11px] text-muted-foreground mt-1.5 italic">
              AGEFICE : {status.ageficeEligibleCount} TNS éligibles sur {N}.
            </p>
          )}
        </div>
      </div>

      {analyseBesoinInflight > 0 && (
        <p className="text-[11px] text-muted-foreground mt-3 italic">
          Analyse besoin générée par Ollama en arrière-plan · rafraîchissement auto 5s.
        </p>
      )}
    </TimelineStep>
  );
}
