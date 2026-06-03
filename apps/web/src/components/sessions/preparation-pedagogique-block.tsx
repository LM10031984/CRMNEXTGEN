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

import { useEffect, useState, useTransition } from 'react';
import {
  AlertCircle,
  Check,
  ClipboardList,
  Loader2,
  Minus,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getSessionPreparationStatus,
  prepareSession,
  type SessionPreparationStatus,
} from '@/server/actions/prepare-training';

interface Props {
  sessionId: string;
  initialStatus: SessionPreparationStatus;
  canWrite: boolean;
}

function countMissing(s: SessionPreparationStatus): number {
  const N = s.participantsCount;
  const sharedMissing = (s.programme ? 0 : 1) + (s.deroule ? 0 : 1) + (s.checklist ? 0 : 1);
  const conv = Math.max(0, N - s.conventionsCount);
  const convoc = Math.max(0, N - s.convocationsCount);
  const ab = Math.max(0, N - s.analyseBesoinDone);
  // AGEFICE compté sur les éligibles uniquement (TNS), pas tous les participants.
  const agefice = Math.max(0, s.ageficeEligibleCount - s.ageficeCount);
  return sharedMissing + conv + convoc + ab + agefice;
}

function isComplete(s: SessionPreparationStatus): boolean {
  const N = s.participantsCount;
  if (N === 0) return s.programme && s.deroule && s.checklist;
  return (
    s.programme &&
    s.deroule &&
    s.checklist &&
    s.conventionsCount >= N &&
    s.convocationsCount >= N &&
    s.analyseBesoinDone >= N &&
    s.ageficeCount >= s.ageficeEligibleCount
  );
}

function isEmpty(s: SessionPreparationStatus): boolean {
  const N = s.participantsCount;
  const sharedDone = (s.programme ? 1 : 0) + (s.deroule ? 1 : 0) + (s.checklist ? 1 : 0);
  return (
    sharedDone === 0 &&
    s.conventionsCount === 0 &&
    s.convocationsCount === 0 &&
    s.analyseBesoinDone === 0 &&
    s.analyseBesoinInProgress === 0 &&
    s.analyseBesoinPending === 0 &&
    s.ageficeCount === 0 &&
    N >= 0
  );
}

function SharedDocRow({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {done ? (
        <Check className="h-4 w-4 text-emerald-600 shrink-0" />
      ) : (
        <Minus className="h-4 w-4 text-slate-400 shrink-0" />
      )}
      <span className={done ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
    </li>
  );
}

function ParticipantDocRow({
  doneCount,
  total,
  label,
  spinning = false,
}: {
  doneCount: number;
  total: number;
  label: string;
  spinning?: boolean;
}) {
  const allDone = total > 0 && doneCount >= total;
  return (
    <li className="flex items-center gap-2 text-sm">
      {spinning ? (
        <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
      ) : allDone ? (
        <Check className="h-4 w-4 text-emerald-600 shrink-0" />
      ) : (
        <Minus className="h-4 w-4 text-slate-400 shrink-0" />
      )}
      <span className={allDone ? 'text-foreground' : 'text-muted-foreground'}>
        {label}{' '}
        <span className="tabular-nums text-xs">
          ({doneCount}/{total})
        </span>
      </span>
    </li>
  );
}

export function PreparationPedagogiqueBlock({ sessionId, initialStatus, canWrite }: Props) {
  const [status, setStatus] = useState<SessionPreparationStatus>(initialStatus);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Auto-refresh tant qu'il reste des jobs analyse besoin in-flight.
  const analyseBesoinInflight = status.analyseBesoinInProgress + status.analyseBesoinPending;
  useEffect(() => {
    if (analyseBesoinInflight <= 0) return;
    const id = setInterval(async () => {
      const fresh = await getSessionPreparationStatus(sessionId);
      if (fresh.ok) setStatus(fresh);
    }, 5000);
    return () => clearInterval(id);
  }, [analyseBesoinInflight, sessionId]);

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
  const empty = isEmpty(status);
  const complete = isComplete(status);
  const missingCount = countMissing(status);

  return (
    <section className="rounded-2xl border border-border bg-white p-5">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-primary" />
          <h2 className="font-semibold inline-flex items-center gap-2">
            Préparation pédagogique
          </h2>
        </div>

        {/* CTA contextualisé selon l'état */}
        {!canWrite ? (
          <span className="text-xs text-muted-foreground">Lecture seule</span>
        ) : complete ? (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
              <Check className="h-3.5 w-3.5" /> Préparation complète
            </span>
            <a
              href="#section-participants"
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Voir les participants
            </a>
          </div>
        ) : empty ? (
          <button
            type="button"
            onClick={handleCompleter}
            disabled={pending || N === 0}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            title={N === 0 ? 'Aucun apprenant inscrit' : 'Génère les 6 catégories de docs pré-formation'}
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
            Compléter ({missingCount} manquant{missingCount > 1 ? 's' : ''})
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 mb-4 text-sm text-red-700 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Documents partagés
          </h3>
          <ul className="space-y-1.5">
            <SharedDocRow done={status.programme} label="Programme de formation" />
            <SharedDocRow done={status.deroule} label="Déroulé pédagogique" />
            <SharedDocRow done={status.checklist} label="Checklist formation" />
          </ul>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Documents par stagiaire ({N})
          </h3>
          <ul className="space-y-1.5">
            <ParticipantDocRow
              doneCount={status.conventionsCount}
              total={N}
              label="Convention"
            />
            <ParticipantDocRow
              doneCount={status.convocationsCount}
              total={N}
              label="Convocation"
            />
            <ParticipantDocRow
              doneCount={status.analyseBesoinDone}
              total={N}
              label="Analyse besoin"
              spinning={analyseBesoinInflight > 0}
            />
            {status.ageficeEligibleCount > 0 && (
              <ParticipantDocRow
                doneCount={status.ageficeCount}
                total={status.ageficeEligibleCount}
                label="Demande AGEFICE"
              />
            )}
          </ul>
          {status.ageficeEligibleCount > 0 && status.ageficeEligibleCount < N && (
            <p className="text-[11px] text-muted-foreground mt-1.5 italic">
              AGEFICE générée pour les {status.ageficeEligibleCount} stagiaire
              {status.ageficeEligibleCount > 1 ? 's' : ''} TNS uniquement
              (salariés OPCO ignorés).
            </p>
          )}
        </div>
      </div>

      {analyseBesoinInflight > 0 && (
        <p className="text-[11px] text-muted-foreground mt-3 italic">
          Analyse besoin générée par Ollama en arrière-plan ({analyseBesoinInflight} restant{analyseBesoinInflight > 1 ? 's' : ''}) · rafraîchissement auto toutes les 5s.
        </p>
      )}
    </section>
  );
}
