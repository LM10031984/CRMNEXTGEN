'use client';

/**
 * Transitions de statut du devis : Send / Accept / Reject / Reopen.
 *
 * Workflow :
 *  DRAFT     → "Marquer envoyé" → SENT
 *  SENT      → "Marquer accepté" → ACCEPTED (fige le devis)
 *  SENT      → "Marquer refusé" → REJECTED (fige le devis)
 *  ACCEPTED  → "Rouvrir" → DRAFT (annule l'acceptation, débloque l'édition)
 *  REJECTED  → "Rouvrir" → DRAFT
 *
 * Désactive "Marquer envoyé" si aucune ligne (pas de devis vide).
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Send, CheckCircle2, XCircle, RotateCcw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  markAsSent,
  markAsAccepted,
  markAsRejected,
  reopenQuote,
} from '@/server/actions/quotes';

interface Props {
  quoteId: string;
  status: string;
  linesCount: number;
}

export function QuoteStatusActions({ quoteId, status, linesCount }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>, successMsg: string) {
    startTransition(async () => {
      const r = await action();
      if (r.ok) {
        toast.success(successMsg);
        router.refresh();
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  }

  if (status === 'DRAFT') {
    return (
      <button
        type="button"
        onClick={() => run(() => markAsSent(quoteId), 'Devis marqué envoyé')}
        disabled={pending || linesCount === 0}
        title={linesCount === 0 ? 'Ajoute au moins une ligne avant d\'envoyer' : 'Marquer le devis comme envoyé au client'}
        className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Marquer envoyé
      </button>
    );
  }

  if (status === 'SENT') {
    return (
      <>
        <button
          type="button"
          onClick={() => run(() => markAsAccepted(quoteId), 'Devis accepté')}
          disabled={pending}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Accepté
        </button>
        <button
          type="button"
          onClick={() => run(() => markAsRejected(quoteId), 'Devis refusé')}
          disabled={pending}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md border border-border bg-white text-foreground text-sm font-medium hover:bg-muted/40 disabled:opacity-60"
        >
          <XCircle className="h-4 w-4" />
          Refusé
        </button>
      </>
    );
  }

  // ACCEPTED, REJECTED, EXPIRED
  return (
    <button
      type="button"
      onClick={() => run(() => reopenQuote(quoteId), 'Devis rouvert en brouillon')}
      disabled={pending}
      className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md border border-border bg-white text-foreground text-sm font-medium hover:bg-muted/40 disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
      Rouvrir
    </button>
  );
}
