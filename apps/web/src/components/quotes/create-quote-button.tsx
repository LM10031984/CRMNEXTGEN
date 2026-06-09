'use client';

/**
 * Bouton "Nouveau devis" — modale minimale : nom destinataire + titre + date validité.
 * Après création, redirige vers `/app/devis/[id]` pour l'édition complète
 * (lignes, adresse détaillée, en-tête personnalisée, etc.).
 *
 * Le minimum requis pour créer le DEV-NNNN : juste le nom du destinataire.
 * Tout le reste s'édite ensuite sur la fiche.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createQuote } from '@/server/actions/quotes';

export function CreateQuoteButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [title, setTitle] = useState('Devis de formation');
  const [validUntil, setValidUntil] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await createQuote({
        recipientName,
        recipientEmail: recipientEmail || null,
        title,
        validUntil: validUntil || null,
      });
      if (r.ok && r.data) {
        toast.success(`Devis ${r.data.number} créé`);
        setOpen(false);
        router.push(`/app/devis/${r.data.id}`);
      } else if (!r.ok) {
        setError(r.error);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 h-9 px-3.5 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 transition-colors"
      >
        <Plus className="h-4 w-4" /> Nouveau devis
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
            onClick={() => !busy && setOpen(false)}
          />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between mb-4">
              <h3 className="font-semibold text-lg">Nouveau devis</h3>
              <button
                type="button"
                onClick={() => !busy && setOpen(false)}
                disabled={busy}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              Crée un devis brouillon. Tu pourras ajouter les lignes, l'adresse complète
              et personnaliser l'entête sur la fiche.
            </p>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Nom du destinataire *
                </label>
                <input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  required
                  autoFocus
                  placeholder="Dupont SARL / Marie Dupont"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Email destinataire
                </label>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="contact@dupont.fr"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Objet du devis
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Date de validité (optionnel)
                </label>
                <input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                />
              </div>

              {error && (
                <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={busy}
                  className="h-9 px-4 rounded-md border border-border bg-white text-sm hover:bg-muted/40 disabled:opacity-60"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={busy || !recipientName.trim()}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Créer le devis
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </>
  );
}
