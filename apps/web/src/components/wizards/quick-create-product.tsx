'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { createTrainingProduct } from '@/server/actions/crud-edits';

type Modality = 'PRESENTIEL' | 'DISTANCIEL' | 'MIXTE' | 'ELEARNING';

// Aligné sur Product du session-wizard.tsx (priceHT en number|string pour
// supporter Decimal Prisma sérialisé)
interface NewProduct {
  id: string;
  code: string;
  title: string;
  durationHours: number;
  modality: 'PRESENTIEL' | 'DISTANCIEL' | 'MIXTE';
  priceHT: number | string;
  groupFlatPrice: number | string | null;
  theme: string | null;
  capacityMax: number;
}

/**
 * Bouton + modale "Créer un produit à la volée" pour le wizard nouvelle
 * session : permet de créer le produit sans quitter le tunnel. Une fois
 * créé, on appelle onCreated() avec le produit pour qu'il soit ajouté
 * à la liste et auto-sélectionné.
 */
export function QuickCreateProductButton({
  onCreated,
}: {
  onCreated: (p: NewProduct) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [durationHours, setDurationHours] = useState('');
  const [priceHT, setPriceHT] = useState('');
  const [modality, setModality] = useState<Modality>('PRESENTIEL');
  const [theme, setTheme] = useState('');
  const [capacityMax, setCapacityMax] = useState('12');

  const reset = () => {
    setTitle('');
    setDurationHours('');
    setPriceHT('');
    setModality('PRESENTIEL');
    setTheme('');
    setCapacityMax('12');
    setError(null);
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const dh = parseInt(durationHours, 10);
    const price = parseFloat(priceHT.replace(',', '.')) || 0;
    const cap = parseInt(capacityMax, 10) || 12;
    if (!title.trim() || !dh || dh <= 0) {
      setError('Intitulé et durée (heures) sont obligatoires.');
      return;
    }
    setBusy(true);
    try {
      const r = await createTrainingProduct({
        title: title.trim(),
        durationHours: dh,
        priceHT: price,
        modality,
        theme: theme.trim() || null,
        capacityMax: cap,
      });
      if (r.ok && r.productId && r.code) {
        toast.success(`Produit ${r.code} créé`);
        // ELEARNING accepté côté DB mais le wizard ne propose que les 3
        // modalités principales — on retombe sur PRESENTIEL si besoin
        const m = modality === 'ELEARNING' ? 'DISTANCIEL' : modality;
        onCreated({
          id: r.productId,
          code: r.code,
          title: title.trim(),
          durationHours: dh,
          modality: m,
          priceHT: price,
          groupFlatPrice: null,
          theme: theme.trim() || null,
          capacityMax: cap,
        });
        setOpen(false);
        reset();
      } else {
        setError(r.error ?? 'Erreur lors de la création.');
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 h-10 px-3 rounded-md border border-input text-sm font-medium hover:bg-muted/50 transition-colors"
      >
        <Plus className="h-4 w-4" /> Nouveau produit
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">Créer un produit de formation</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Crée un produit minimal utilisable tout de suite. Tu pourras compléter les
              objectifs, prérequis, méthodes pédago et programme depuis la fiche produit.
            </p>
            <form onSubmit={onSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Intitulé *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                  placeholder="ex: L'IA au service des conseillers immobiliers"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Durée (heures) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={durationHours}
                    onChange={(e) => setDurationHours(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                    placeholder="72"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Prix HT par stagiaire (€)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={priceHT}
                    onChange={(e) => setPriceHT(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                    placeholder="3024"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Modalité
                  </label>
                  <select
                    value={modality}
                    onChange={(e) => setModality(e.target.value as Modality)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white"
                  >
                    <option value="PRESENTIEL">Présentiel</option>
                    <option value="DISTANCIEL">Distanciel</option>
                    <option value="MIXTE">Mixte</option>
                    <option value="ELEARNING">E-learning</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Capacité max
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={capacityMax}
                    onChange={(e) => setCapacityMax(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Thème
                </label>
                <input
                  type="text"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                  placeholder="IA, Immobilier, Management…"
                />
              </div>
              {error && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                  {error}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={busy}
                  className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
                >
                  {busy ? 'Création…' : 'Créer le produit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
