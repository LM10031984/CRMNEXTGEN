'use client';

/**
 * Édition de l'entête personnalisée du devis + notes.
 *
 * `headerCustomMd` : si non-vide, remplace l'entête par défaut (logo + raison
 * sociale + SIRET tenant) sur le PDF. Utile pour les devis en marque blanche
 * ou avec entête spécifique commanditaire.
 *
 * `notes` : bas de devis (conditions, mentions légales, paiement).
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Loader2, Layout, StickyNote } from 'lucide-react';
import { toast } from 'sonner';
import { updateQuote } from '@/server/actions/quotes';

interface Props {
  quoteId: string;
  disabled: boolean;
  initial: {
    headerCustomMd: string | null;
    notes: string | null;
  };
}

export function QuoteHeaderEditor({ quoteId, disabled, initial }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [headerCustomMd, setHeaderCustomMd] = useState(initial.headerCustomMd ?? '');
  const [notes, setNotes] = useState(initial.notes ?? '');

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await updateQuote({
        quoteId,
        headerCustomMd: headerCustomMd || null,
        notes: notes || null,
      });
      if (r.ok) {
        toast.success('Entête / notes enregistrés');
        setEditing(false);
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-white p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
          Entête + notes
        </h3>
        {!disabled && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 h-7 px-2 rounded text-xs border border-border bg-white hover:bg-muted/40"
          >
            <Pencil className="h-3 w-3" /> Modifier
          </button>
        )}
      </div>

      {!editing ? (
        <div className="text-sm space-y-3">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Layout className="h-3 w-3" />
              Entête personnalisée
            </div>
            {initial.headerCustomMd ? (
              <pre className="whitespace-pre-wrap text-xs bg-muted/30 rounded p-2 max-h-32 overflow-auto">
                {initial.headerCustomMd}
              </pre>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                Entête par défaut (logo + raison sociale + SIRET de l'OF).
              </p>
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <StickyNote className="h-3 w-3" />
              Notes / mentions
            </div>
            {initial.notes ? (
              <p className="text-xs whitespace-pre-line">{initial.notes}</p>
            ) : (
              <p className="text-xs text-muted-foreground italic">Aucune note.</p>
            )}
          </div>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground mb-1">
              Entête personnalisée (markdown — vide = entête OF par défaut)
            </label>
            <textarea
              value={headerCustomMd}
              onChange={(e) => setHeaderCustomMd(e.target.value)}
              rows={5}
              placeholder="**Start Academy**&#10;Organisme de formation Qualiopi&#10;SIRET 123 456 789 00012&#10;contact@start-academy.fr"
              className="w-full px-2 py-1.5 border border-border rounded text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground mb-1">
              Notes / mentions bas de devis
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Paiement à 30 jours fin de mois.&#10;Formation exonérée de TVA (art. 261-4-4° CGI)."
              className="w-full px-2 py-1.5 border border-border rounded text-xs"
            />
          </div>

          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={pending}
              className="h-8 px-3 rounded border border-border bg-white text-xs hover:bg-muted/40"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded bg-primary text-white text-xs font-medium hover:bg-primary-600 disabled:opacity-60"
            >
              {pending && <Loader2 className="h-3 w-3 animate-spin" />}
              Enregistrer
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
