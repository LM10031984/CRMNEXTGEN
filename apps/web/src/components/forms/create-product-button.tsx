'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Plus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { createProduct } from '@/server/actions/crud-edits';

const MODALITIES = [
  { value: 'PRESENTIEL', label: 'Présentiel' },
  { value: 'DISTANCIEL', label: 'Distanciel' },
  { value: 'MIXTE', label: 'Mixte' },
  { value: 'ELEARNING', label: 'E-learning' },
] as const;

export function CreateProductButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [theme, setTheme] = useState('');
  const [durationHours, setDurationHours] = useState('8');
  const [modality, setModality] = useState<typeof MODALITIES[number]['value']>('PRESENTIEL');
  const HOURLY_RATE = 42; // tarif horaire Start Academy (= 42 €/h, ex: 72h × 42 = 3024 €)
  const [priceHT, setPriceHT] = useState(String(8 * HOURLY_RATE)); // 8h × 42 = 336 € initial
  const [priceTouched, setPriceTouched] = useState(false);
  const [capacityMax, setCapacityMax] = useState('12');
  const [autoFillWithAI, setAutoFillWithAI] = useState(true);

  // Auto-calcul du tarif tant que l'utilisateur n'a pas touche au champ.
  // Des qu'il modifie priceHT manuellement, on respecte sa valeur.
  function updateDuration(v: string) {
    setDurationHours(v);
    if (!priceTouched) {
      const h = parseFloat(v.replace(',', '.'));
      if (Number.isFinite(h) && h > 0) {
        setPriceHT(String(Math.round(h * HOURLY_RATE)));
      }
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const dh = parseFloat(durationHours.replace(',', '.'));
      const price = priceHT.trim() ? parseFloat(priceHT.replace(',', '.')) : null;
      const cap = parseInt(capacityMax, 10);
      const r = await createProduct({
        title,
        durationHours: dh,
        modality,
        priceHT: Number.isFinite(price ?? NaN) ? price : null,
        theme: theme.trim() || null,
        capacityMax: Number.isFinite(cap) ? cap : null,
        autoFillWithAI,
      });
      if (r.ok && r.productId) {
        if (autoFillWithAI && r.aiFilled) {
          toast.success(`Produit ${r.code} créé + auto-rempli par IA`);
        } else if (autoFillWithAI && !r.aiFilled) {
          toast.warning(`Produit ${r.code} créé. Auto-fill IA a échoué : ${r.aiError ?? 'Mistral'}. Tu peux retenter via Éditer.`);
        } else {
          toast.success(`Produit ${r.code} créé`);
        }
        setOpen(false);
        setTitle(''); setTheme(''); setDurationHours('8'); setModality('PRESENTIEL'); setPriceHT(String(8 * HOURLY_RATE)); setPriceTouched(false); setCapacityMax('12');
        router.push(`/app/produits/${r.productId}` as any);
      } else {
        setError(r.error ?? 'Erreur inconnue.');
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
        className="inline-flex items-center gap-2 h-9 px-3.5 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-4px_rgba(0,82,122,0.45),0_0_20px_rgba(0,82,122,0.25)] transition-all duration-300 ease-out active:scale-[0.97]"
      >
        <Plus className="h-4 w-4" /> Nouveau produit
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !busy && setOpen(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-4 inline-flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" /> Nouveau produit de formation
            </h3>
            <form onSubmit={onSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Titre *</label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus placeholder="Ex: Tracfin et déontologie" className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Thème</label>
                <input type="text" value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="Ex: IA, Immobilier, Management" className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Durée (h) *</label>
                  <input type="number" min="1" step="0.5" value={durationHours} onChange={(e) => updateDuration(e.target.value)} required className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Modalité *</label>
                  <select value={modality} onChange={(e) => setModality(e.target.value as any)} className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white">
                    {MODALITIES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Capacité max</label>
                  <input type="number" min="1" value={capacityMax} onChange={(e) => setCapacityMax(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Tarif HT (€) {!priceTouched && <span className="text-primary">— auto-calculé {HOURLY_RATE}€ × heures</span>}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={priceHT}
                  onChange={(e) => { setPriceHT(e.target.value); setPriceTouched(true); }}
                  placeholder={`ex: ${HOURLY_RATE * 8}`}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  {priceTouched
                    ? 'Tarif personnalisé — l\'auto-calcul est désactivé.'
                    : `Le tarif s'ajuste automatiquement (${HOURLY_RATE} €/h) tant que tu n'y touches pas. Modifiable.`}
                </p>
              </div>
              <label className="flex items-start gap-2 text-sm cursor-pointer p-3 rounded-lg border border-primary-200 bg-primary-50/40">
                <input
                  type="checkbox"
                  checked={autoFillWithAI}
                  onChange={(e) => setAutoFillWithAI(e.target.checked)}
                  className="h-4 w-4 mt-0.5"
                />
                <span className="flex-1">
                  <span className="inline-flex items-center gap-1 font-medium">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    Auto-remplir avec l'IA
                  </span>
                  <span className="block text-[11px] text-muted-foreground mt-0.5">
                    Génère automatiquement objectifs / public / pré-requis / programme détaillé via Mistral (≈ 3–10 s). Tu pourras tout éditer ensuite.
                  </span>
                </span>
              </label>
              {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</div>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)} disabled={busy} className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted">Annuler</button>
                <button type="submit" disabled={busy} className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1.5">
                  {busy && autoFillWithAI ? <Sparkles className="h-3.5 w-3.5 animate-pulse" /> : null}
                  {busy ? (autoFillWithAI ? 'Création + IA…' : 'Création…') : 'Créer le produit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
