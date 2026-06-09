'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Calendar, Check, Loader2, Pencil, X } from 'lucide-react';
import { updateSessionDates } from '@/server/actions/sessions';

interface Props {
  sessionId: string;
  initialStart: Date | string;
  initialEnd: Date | string;
}

function toInputDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

function toFrDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Éditeur inline des dates de session (startDate / endDate).
 * Mode lecture par défaut, passage en édition via bouton crayon.
 */
export function SessionDatesEditor({ sessionId, initialStart, initialEnd }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [startStr, setStartStr] = useState(toInputDate(initialStart));
  const [endStr, setEndStr] = useState(toInputDate(initialEnd));
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const r = await updateSessionDates({
        sessionId,
        startDate: startStr,
        endDate: endStr,
      });
      if (r.ok) {
        toast.success('Dates mises à jour');
        setEditing(false);
        router.refresh();
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  }

  function cancel() {
    setStartStr(toInputDate(initialStart));
    setEndStr(toInputDate(initialEnd));
    setEditing(false);
  }

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground group">
        <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
        {toFrDate(initialStart)} → {toFrDate(initialEnd)}
        <button
          type="button"
          onClick={() => setEditing(true)}
          title="Modifier les dates"
          aria-label="Modifier les dates de la session"
          className="opacity-50 group-hover:opacity-100 hover:text-foreground transition-opacity ml-1"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <Calendar className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      <input
        type="date"
        value={startStr}
        onChange={(e) => setStartStr(e.target.value)}
        disabled={pending}
        className="h-7 px-1.5 rounded border border-border text-xs"
      />
      <span className="text-muted-foreground">→</span>
      <input
        type="date"
        value={endStr}
        onChange={(e) => setEndStr(e.target.value)}
        disabled={pending}
        className="h-7 px-1.5 rounded border border-border text-xs"
      />
      <button
        type="button"
        onClick={save}
        disabled={pending}
        title="Enregistrer"
        className="p-1 rounded text-green-700 hover:bg-green-50 disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        onClick={cancel}
        disabled={pending}
        title="Annuler"
        className="p-1 rounded text-muted-foreground hover:bg-muted disabled:opacity-50"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}
