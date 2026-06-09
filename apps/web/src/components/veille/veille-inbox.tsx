'use client';

/**
 * Inbox suggestions auto (Phase 13 Plan 13-03 — VEILLE-02).
 *
 * Liste de cards (1 par DRAFT/AUTO) avec :
 *  - Thème (badge couleur) + titre + URL externe + responsable suggéré
 *  - rawSnippet (extrait RSS brut) + exploitation_draft (proposée par Ollama)
 *  - 2 boutons : Valider (approveWatch) / Rejeter (rejectWatch + reason)
 *
 * D-03 (CONTEXT) — ce composant n'est rendu QUE si l'utilisateur est ADMIN/MANAGER
 * (page.tsx ne descend en branche `tab==='inbox'` que si `canSeeInbox=true`).
 *
 * Flow rejet :
 *  - Click "Rejeter" → expand inline d'un panneau avec textarea reason.
 *  - Saisir ≥ 2 chars + click "Confirmer le rejet" → rejectWatch + toast.
 *
 * D-08 (CONTEXT) — NO auto-accept : toutes les suggestions passent par cette inbox,
 * même celles à confidence ≥ 90. La validation humaine = valeur audit Qualiopi.
 */

import { useState, useTransition } from 'react';
import { Check, X, Loader2, ExternalLink, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { RegulatoryWatch } from '@qualiof/db';
import { approveWatch, rejectWatch } from '@/server/actions/veille';
import { cn } from '@/lib/utils';

const THEME_LABELS: Record<string, string> = {
  INDIC_23: '23 — Formation pro',
  INDIC_24: '24 — Secteur immobilier',
  INDIC_25: '25 — Innovations péda',
  INDIC_26: '26 — Handicap & DREETS',
};

interface VeilleInboxProps {
  suggestions: RegulatoryWatch[];
}

export function VeilleInbox({ suggestions }: VeilleInboxProps) {
  if (suggestions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
        <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-emerald-50 text-emerald-600 mb-3">
          <Check className="h-5 w-5" />
        </div>
        <p className="text-sm font-medium">Inbox vide</p>
        <p className="text-xs text-muted-foreground mt-1">
          Aucune suggestion automatique en attente de validation.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {suggestions.length} suggestion{suggestions.length > 1 ? 's' : ''} à
        valider · proposée{suggestions.length > 1 ? 's' : ''} par l&apos;IA, validation
        humaine obligatoire (audit Qualiopi).
      </p>
      {suggestions.map((s) => (
        <InboxCard key={s.id} watch={s} />
      ))}
    </div>
  );
}

function InboxCard({ watch }: { watch: RegulatoryWatch }) {
  const [pending, startTransition] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');

  const onApprove = () => {
    if (pending) return;
    startTransition(async () => {
      const r = await approveWatch(watch.id);
      if (r.ok) {
        toast.success('Suggestion validée — ajoutée aux sources actives');
      } else {
        toast.error(r.error || 'Erreur validation');
      }
    });
  };

  const onReject = () => {
    if (pending) return;
    const trimmed = reason.trim();
    if (trimmed.length < 2) {
      toast.error('Raison requise (≥ 2 caractères)');
      return;
    }
    startTransition(async () => {
      const r = await rejectWatch({ id: watch.id, reason: trimmed });
      if (r.ok) {
        toast.success('Suggestion rejetée — tracée dans l\'historique');
        setRejectOpen(false);
        setReason('');
      } else {
        toast.error(r.error || 'Erreur rejet');
      }
    });
  };

  const themeLabel = THEME_LABELS[watch.theme] ?? watch.theme;

  return (
    <article className="rounded-lg border border-border bg-amber-50/40 p-4 space-y-3">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded bg-amber-100 text-amber-800">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              {themeLabel}
            </span>
            {watch.responsable && (
              <span className="text-xs text-muted-foreground">
                Responsable suggéré : <span className="font-medium">{watch.responsable}</span>
              </span>
            )}
          </div>
          <h3 className="font-medium text-sm break-words">{watch.title}</h3>
          {watch.url && (
            <a
              href={watch.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline break-all"
            >
              <ExternalLink className="h-3 w-3" />
              {watch.url}
            </a>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={onApprove}
            disabled={pending}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            Valider
          </button>
          <button
            type="button"
            onClick={() => setRejectOpen((v) => !v)}
            disabled={pending}
            className={cn(
              'inline-flex items-center gap-1.5 h-8 px-3 rounded-md border text-xs font-medium transition-colors disabled:opacity-50',
              rejectOpen
                ? 'border-red-300 bg-red-50 text-red-700'
                : 'border-border bg-white hover:bg-muted',
            )}
          >
            <X className="h-3.5 w-3.5" />
            Rejeter
          </button>
        </div>
      </header>

      {watch.exploitation && (
        <div className="text-sm text-foreground/90">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mr-2">
            Exploitation suggérée :
          </span>
          {watch.exploitation}
        </div>
      )}

      {watch.rawSnippet && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground">
            Extrait brut RSS
          </summary>
          <p className="mt-2 p-2 bg-white border border-border rounded italic">
            {watch.rawSnippet}
          </p>
        </details>
      )}

      {rejectOpen && (
        <div className="border-t border-amber-200 pt-3 space-y-2">
          <label
            htmlFor={`reject-reason-${watch.id}`}
            className="block text-xs font-medium text-muted-foreground"
          >
            Raison du rejet (visible dans l&apos;historique audit) *
          </label>
          <textarea
            id={`reject-reason-${watch.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            disabled={pending}
            placeholder="Pourquoi cette suggestion n'est-elle pas pertinente ?"
            className="w-full text-sm border border-border rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-red-400/40 disabled:opacity-60"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setRejectOpen(false);
                setReason('');
              }}
              disabled={pending}
              className="h-8 px-3 rounded-md border border-border bg-white text-xs font-medium hover:bg-muted disabled:opacity-50 transition-colors"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={onReject}
              disabled={pending || reason.trim().length < 2}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <X className="h-3.5 w-3.5" />
              )}
              Confirmer le rejet
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
