'use client';

import { useState, useTransition } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toggleDossierBoolean } from '@/server/actions/dossiers-opco';

type Field = 'invoiceSent' | 'opcoApproved' | 'opcoReimbursed' | 'paymentReceived';

export function ToggleCell({
  participantId,
  field,
  initial,
}: {
  participantId: string;
  field: Field;
  initial: boolean;
}) {
  const [state, setState] = useState(initial);
  const [pending, startTransition] = useTransition();

  const handle = () => {
    const next = !state;
    setState(next); // optimistic
    startTransition(async () => {
      const r = await toggleDossierBoolean(participantId, field, next);
      if (!r.ok) {
        setState(!next); // rollback
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handle}
      disabled={pending}
      className={cn(
        'inline-flex items-center justify-center h-6 w-12 rounded-full text-[10px] font-semibold transition-colors',
        state
          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
          : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
        pending && 'opacity-50 cursor-wait',
      )}
      title={state ? 'OUI — clique pour décocher' : 'NON — clique pour valider'}
    >
      {pending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : state ? (
        <span className="inline-flex items-center gap-0.5">
          <Check className="h-3 w-3" /> OUI
        </span>
      ) : (
        <span className="inline-flex items-center gap-0.5">
          <X className="h-3 w-3" /> NON
        </span>
      )}
    </button>
  );
}
