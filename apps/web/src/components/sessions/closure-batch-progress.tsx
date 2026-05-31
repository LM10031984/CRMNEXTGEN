'use client';

/**
 * Progression d'un batch de pack fin de formation.
 *
 * Polling toutes les 2s tant que le batch est PENDING/RUNNING. Ensuite
 * un seul refresh quand on clique "Actualiser". Affiche :
 *   - Barre de progression globale
 *   - Liste participants × kinds avec statut + temps + lien vers le PDF
 *   - Boutons "Télécharger zip", "Régénérer les erreurs"
 */

import { useEffect, useState, useTransition } from 'react';
import { Download, RefreshCw, Loader2, CheckCircle2, AlertCircle, AlertTriangle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import {
  getClosureBatchStatus,
  retryClosureBatchErrors,
  type ClosureBatchStatusPayload,
  type ClosureBatchStatusJob,
} from '@/server/actions/closure-pack';
import { regenerateParticipantDoc } from '@/server/actions/qualiopi-matrix';

// BUG-10 — map ClosureDocKind (worker) → MatrixDocType (regenerateParticipantDoc).
// Inverse de DOC_TYPE_TO_CLOSURE_KIND dans lib/doc-scope.ts.
const CLOSURE_KIND_TO_MATRIX_DOC_TYPE: Record<string, string> = {
  CERTIFICAT: 'CERTIFICAT_REALISATION',
  ATTESTATION: 'ATTESTATION_FIN',
  QCM: 'EVALUATION_ACQUIS',
  EMARGEMENT: 'EMARGEMENT',
  ANALYSE_BESOIN: 'ANALYSE_BESOIN',
  POSITIONNEMENT: 'POSITIONNEMENT',
  SATISFACTION_CHAUD: 'SATISFACTION_CHAUD',
  SATISFACTION_FROID: 'SATISFACTION_FROID',
  GRILLE_OBS: 'GRILLE_OBS_SESSION',
  DEROULE_PEDA: 'DEROULE_PEDAGOGIQUE',
};

interface Props {
  batchId: string;
  sessionId: string;
}

const STATUS_BADGE: Record<
  ClosureBatchStatusPayload['status'],
  { label: string; variant: 'success' | 'info' | 'warning' | 'muted' | 'danger' | 'primary' }
> = {
  PENDING: { label: 'En attente', variant: 'muted' },
  RUNNING: { label: 'En cours', variant: 'primary' },
  COMPLETED: { label: 'Terminé', variant: 'success' },
  PARTIAL: { label: 'Partiel', variant: 'warning' },
  FAILED: { label: 'Échec', variant: 'danger' },
};

function jobIcon(status: ClosureBatchStatusJob['status']) {
  switch (status) {
    case 'DONE':
      return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    case 'ERROR':
      return <AlertCircle className="h-4 w-4 text-red-600" />;
    case 'PROCESSING':
      return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
    case 'QUEUED':
      return <Clock className="h-4 w-4 text-slate-400" />;
  }
}

export function ClosureBatchProgress({ batchId, sessionId: _sessionId }: Props) {
  const [batch, setBatch] = useState<ClosureBatchStatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, startRetry] = useTransition();

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      const r = await getClosureBatchStatus(batchId);
      if (!active) return;
      if (!r.ok || !r.batch) {
        setError(r.error ?? 'Statut indisponible');
        return;
      }
      setBatch(r.batch);
      setError(null);
      if (r.batch.status === 'PENDING' || r.batch.status === 'RUNNING') {
        timer = setTimeout(tick, 2000);
      }
    }
    tick();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [batchId]);

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <AlertCircle className="inline-block h-4 w-4 mr-2" />
        {error}
      </div>
    );
  }
  if (!batch) {
    return (
      <div className="rounded-lg border border-border bg-white p-6 text-sm text-muted-foreground">
        <Loader2 className="inline-block h-4 w-4 mr-2 animate-spin" /> Chargement…
      </div>
    );
  }

  const statusInfo = STATUS_BADGE[batch.status];
  const pct = batch.totalDocs === 0 ? 0 : Math.round(((batch.doneDocs + batch.errorDocs) / batch.totalDocs) * 100);

  // Group jobs par participant pour la liste
  const groups = new Map<string, { name: string; jobs: ClosureBatchStatusJob[] }>();
  for (const j of batch.jobs) {
    const g = groups.get(j.participantId) ?? { name: j.participantName, jobs: [] };
    g.jobs.push(j);
    groups.set(j.participantId, g);
  }

  function handleRetry(includeStubs = false) {
    startRetry(async () => {
      const r = await retryClosureBatchErrors(batchId, { includeStubs });
      if (r.ok) {
        toast.success(`${r.relaunched ?? 0} job(s) relancé(s)`);
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  }

  // BUG-10 — régénération CIBLÉE d'un seul job stub (sans relancer tous les
  // stubs du batch via handleRetry(true)). Click sur le label "À régénérer".
  function handleRegenSingle(j: ClosureBatchStatusJob) {
    const docKind = CLOSURE_KIND_TO_MATRIX_DOC_TYPE[j.kind];
    if (!docKind) {
      toast.error(`Type de doc non reconnu : ${j.kind}`);
      return;
    }
    startRetry(async () => {
      const r = await regenerateParticipantDoc({
        participantId: j.participantId,
        docKind,
      });
      if (r.ok) {
        toast.success(`Régénération lancée : ${j.kindLabel} pour ${j.participantName}`);
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  }

  const canDownload = batch.doneDocs > 0;
  const hasErrors = batch.errorDocs > 0;
  const stubCount = batch.jobs.filter((j) => j.status === 'DONE' && j.usedStub).length;
  const isFinal = batch.status === 'COMPLETED' || batch.status === 'PARTIAL' || batch.status === 'FAILED';

  return (
    <div className="space-y-5">
      {/* Header status + actions */}
      <div className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
            <span className="text-sm text-muted-foreground">
              {batch.doneDocs} / {batch.totalDocs} documents générés
              {batch.errorDocs > 0 && <span className="text-red-600"> · {batch.errorDocs} erreur(s)</span>}
              {stubCount > 0 && <span className="text-amber-600"> · {stubCount} doc(s) à régénérer (IA)</span>}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {hasErrors && isFinal && (
              <button
                type="button"
                onClick={() => handleRetry(false)}
                disabled={retrying}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-white text-sm font-medium hover:bg-muted/40 disabled:opacity-60"
              >
                {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Régénérer les erreurs
              </button>
            )}
            {stubCount > 0 && isFinal && (
              <button
                type="button"
                onClick={() => handleRetry(true)}
                disabled={retrying}
                title="Relance la génération IA pour les docs où Mistral avait échoué (contenu générique). Indispensable avant un audit Qualiopi."
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-amber-200 bg-amber-50 text-amber-800 text-sm font-medium hover:bg-amber-100 disabled:opacity-60"
              >
                {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                Régénérer les {stubCount} doc{stubCount > 1 ? 's' : ''} génériques
              </button>
            )}
            {canDownload && (
              <a
                href={`/api/closure/${batchId}/zip`}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600"
              >
                <Download className="h-4 w-4" /> Télécharger le zip
              </a>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4 h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${batch.errorDocs > 0 ? 'bg-amber-500' : 'bg-primary'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1 text-right text-xs text-muted-foreground tabular-nums">{pct}%</div>
      </div>

      {/* Liste des participants */}
      <div className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/30">
          <h2 className="font-semibold text-sm">{groups.size} apprenant(s)</h2>
        </div>
        <ul className="divide-y divide-border">
          {Array.from(groups.values()).map((g) => (
            <li key={g.name} className="p-4">
              <div className="font-medium text-sm mb-2">{g.name}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {g.jobs.map((j) => (
                  <div
                    key={j.id}
                    className={`flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-md border ${
                      j.status === 'DONE' && j.usedStub
                        ? 'border-amber-200 bg-amber-50/60'
                        : 'border-border bg-muted/20'
                    }`}
                    title={j.errorMessage ?? undefined}
                  >
                    {jobIcon(j.status)}
                    <span className="flex-1 truncate">{j.kindLabel}</span>
                    {j.status === 'DONE' && j.usedStub && (
                      <button
                        type="button"
                        onClick={() => handleRegenSingle(j)}
                        disabled={retrying}
                        className="shrink-0 inline-flex items-center gap-1 text-amber-700 text-[10px] font-semibold uppercase tracking-wide hover:bg-amber-100 hover:text-amber-900 rounded px-1.5 py-0.5 transition-colors disabled:opacity-50 disabled:cursor-wait"
                        title="Ce document a été généré avec un contenu de remplacement (l'IA Mistral a échoué ou répondu invalide). Cliquez pour relancer la génération IA. À faire avant tout audit Qualiopi."
                      >
                        <AlertTriangle className="h-3 w-3" aria-hidden="true" /> À régénérer
                      </button>
                    )}
                    {j.status === 'DONE' && (j.documentId || j.pedagogicalAssetId) && (
                      <a
                        href={
                          j.documentId
                            ? `/api/documents/${j.documentId}`
                            : `/api/pedagogical-assets/${j.pedagogicalAssetId}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline shrink-0"
                      >
                        Voir
                      </a>
                    )}
                    {j.status === 'ERROR' && (
                      <span className="text-red-600 shrink-0 truncate max-w-[120px]" title={j.errorMessage ?? ''}>
                        Erreur
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
