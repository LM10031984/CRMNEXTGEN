'use client';

import { useState, useTransition } from 'react';
import { Receipt, Loader2, Check, ExternalLink, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createInvoiceFromParticipant } from '@/server/actions/invoices';

export function CreateInvoiceButton({ participantId, alreadyInvoiced }: { participantId: string; alreadyInvoiced: boolean }) {
  const [pending, startTransition] = useTransition();
  const [docId, setDocId] = useState<string | null>(null);
  const [number, setNumber] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handle = () => {
    setError(null);
    startTransition(async () => {
      const r = await createInvoiceFromParticipant({ participantId });
      if (r.ok && r.documentId) {
        setDocId(r.documentId);
        setNumber(r.number ?? null);
      } else {
        setError(r.error ?? 'Erreur');
      }
    });
  };

  if (docId) {
    return (
      <a
        href={`/api/documents/${docId}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-emerald-100 text-emerald-800 text-xs font-medium hover:bg-emerald-200"
      >
        <Check className="h-3.5 w-3.5" /> {number ?? 'Facture'} <ExternalLink className="h-3 w-3" />
      </a>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handle}
        disabled={pending}
        className={cn(
          'inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium transition-all duration-300 ease-out active:scale-[0.97]',
          alreadyInvoiced
            ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            : 'bg-violet-600 text-white hover:bg-violet-700',
          pending && 'opacity-70 cursor-wait',
        )}
        title={alreadyInvoiced ? 'Une facture a déjà été émise — re-clique pour en créer une nouvelle' : 'Émet une facture FAC-NNNNNN avec numérotation continue + PDF conforme'}
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Receipt className="h-3.5 w-3.5" />}
        {alreadyInvoiced ? 'Re-facturer' : 'Émettre facture'}
      </button>
      {error && (
        <span className="inline-flex items-center gap-1 text-[11px] text-red-600">
          <AlertCircle className="h-3 w-3" /> {error}
        </span>
      )}
    </div>
  );
}
