'use client';

/**
 * Édition des lignes du devis + totaux.
 *
 * - Bouton "Ajouter une ligne" → ouvre un formulaire inline en bas du tableau
 * - Bouton "Pré-remplir depuis catalogue" → modale picker produit (description
 *   et prix unit HT auto-remplis depuis le TrainingProduct sélectionné)
 * - Chaque ligne est éditable inline (clic sur "Modifier") puis enregistrée
 *   via updateLine — le total ligne et les totaux du devis sont recalculés
 *   côté server à chaque mutation (pas optimistic).
 * - Bouton supprimer par ligne (poubelle) avec confirmation native browser.
 *
 * Désactivé entièrement si le devis est figé (ACCEPTED / REJECTED).
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X, Loader2, Trash2, Pencil, BookOpen, Search } from 'lucide-react';
import { toast } from 'sonner';
import { addLine, updateLine, deleteLine, prefillLineFromProduct } from '@/server/actions/quotes';

interface LineDto {
  id: string;
  order: number;
  description: string;
  quantity: number;
  unitPriceHT: number;
  vatRate: number;
  lineTotalHT: number;
}

interface ProductDto {
  id: string;
  code: string;
  title: string;
  durationHours: number;
  priceHT: number;
}

interface Props {
  quoteId: string;
  disabled: boolean;
  lines: LineDto[];
  products: ProductDto[];
  totals: { amountHT: number; amountVAT: number; amountTTC: number };
}

export function QuoteLinesEditor({ quoteId, disabled, lines, products, totals }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [addingLine, setAddingLine] = useState(false);
  const [productPicker, setProductPicker] = useState(false);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);

  function handleAdd(form: { description: string; quantity: number; unitPriceHT: number; vatRate: number }) {
    startTransition(async () => {
      const r = await addLine({ quoteId, ...form });
      if (r.ok) {
        toast.success('Ligne ajoutée');
        setAddingLine(false);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  function handleUpdate(lineId: string, form: { description: string; quantity: number; unitPriceHT: number; vatRate: number }) {
    startTransition(async () => {
      const r = await updateLine({ lineId, ...form });
      if (r.ok) {
        toast.success('Ligne mise à jour');
        setEditingLineId(null);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  function handleDelete(lineId: string) {
    if (!confirm('Supprimer cette ligne ?')) return;
    startTransition(async () => {
      const r = await deleteLine(lineId);
      if (r.ok) {
        toast.success('Ligne supprimée');
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  function handlePrefillFromProduct(productId: string, quantity: number) {
    startTransition(async () => {
      const r = await prefillLineFromProduct({ quoteId, productId, quantity });
      if (r.ok) {
        toast.success('Ligne ajoutée depuis catalogue');
        setProductPicker(false);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-white">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
          Lignes du devis
        </h3>
        {!disabled && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setProductPicker(true)}
              className="inline-flex items-center gap-1 h-7 px-2 rounded text-xs border border-border bg-white hover:bg-muted/40"
            >
              <BookOpen className="h-3 w-3" /> Pré-remplir catalogue
            </button>
            <button
              type="button"
              onClick={() => setAddingLine(true)}
              className="inline-flex items-center gap-1 h-7 px-2 rounded text-xs bg-primary text-white hover:bg-primary-600"
            >
              <Plus className="h-3 w-3" /> Ajouter
            </button>
          </div>
        )}
      </div>

      {lines.length === 0 && !addingLine ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          Aucune ligne. Ajoute la première via le bouton ci-dessus.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-3 py-2 font-medium text-right w-20">Qté</th>
                <th className="px-3 py-2 font-medium text-right w-28">PU HT</th>
                <th className="px-3 py-2 font-medium text-right w-16">TVA</th>
                <th className="px-3 py-2 font-medium text-right w-28">Total HT</th>
                {!disabled && <th className="px-3 py-2 font-medium w-20"></th>}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) =>
                editingLineId === l.id ? (
                  <LineEditRow
                    key={l.id}
                    initial={l}
                    pending={pending}
                    onSave={(form) => handleUpdate(l.id, form)}
                    onCancel={() => setEditingLineId(null)}
                    disabled={disabled}
                  />
                ) : (
                  <tr key={l.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">{l.description}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.quantity}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {l.unitPriceHT.toLocaleString('fr-FR', {
                        style: 'currency',
                        currency: 'EUR',
                      })}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                      {l.vatRate}%
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {l.lineTotalHT.toLocaleString('fr-FR', {
                        style: 'currency',
                        currency: 'EUR',
                      })}
                    </td>
                    {!disabled && (
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            type="button"
                            onClick={() => setEditingLineId(l.id)}
                            className="p-1 rounded hover:bg-muted/40"
                            title="Modifier"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(l.id)}
                            disabled={pending}
                            className="p-1 rounded hover:bg-red-50 text-red-600"
                            title="Supprimer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ),
              )}
              {addingLine && (
                <LineEditRow
                  initial={{
                    description: '',
                    quantity: 1,
                    unitPriceHT: 0,
                    vatRate: 0,
                  }}
                  pending={pending}
                  onSave={handleAdd}
                  onCancel={() => setAddingLine(false)}
                  disabled={disabled}
                />
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Totaux */}
      <div className="border-t border-border p-4 flex justify-end">
        <div className="w-full sm:w-72 space-y-1 text-sm">
          <Row label="Total HT" value={totals.amountHT} />
          <Row label="TVA" value={totals.amountVAT} />
          <div className="border-t border-border pt-1 mt-1">
            <Row label="Total TTC" value={totals.amountTTC} bold />
          </div>
        </div>
      </div>

      {productPicker && (
        <ProductPicker
          products={products}
          onPick={handlePrefillFromProduct}
          onClose={() => setProductPicker(false)}
          pending={pending}
        />
      )}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between ${bold ? 'font-semibold' : ''}`}>
      <span className={bold ? '' : 'text-muted-foreground'}>{label}</span>
      <span className="tabular-nums">
        {value.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
      </span>
    </div>
  );
}

interface LineFormValues {
  description: string;
  quantity: number;
  unitPriceHT: number;
  vatRate: number;
}

function LineEditRow({
  initial,
  pending,
  onSave,
  onCancel,
  disabled,
}: {
  initial: LineFormValues;
  pending: boolean;
  onSave: (form: LineFormValues) => void;
  onCancel: () => void;
  disabled?: boolean;
}) {
  const [description, setDescription] = useState(initial.description);
  const [quantity, setQuantity] = useState(String(initial.quantity));
  const [unitPriceHT, setUnitPriceHT] = useState(String(initial.unitPriceHT));
  const [vatRate, setVatRate] = useState(String(initial.vatRate));

  function commit() {
    if (!description.trim()) return;
    onSave({
      description,
      quantity: parseFloat(quantity.replace(',', '.')) || 0,
      unitPriceHT: parseFloat(unitPriceHT.replace(',', '.')) || 0,
      vatRate: parseFloat(vatRate.replace(',', '.')) || 0,
    });
  }

  return (
    <tr className="border-b border-border bg-primary/5">
      <td className="px-3 py-2">
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description"
          autoFocus
          className="w-full px-2 py-1 border border-border rounded text-sm"
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          step="0.01"
          min="0"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="w-full px-2 py-1 border border-border rounded text-sm text-right"
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          step="0.01"
          min="0"
          value={unitPriceHT}
          onChange={(e) => setUnitPriceHT(e.target.value)}
          className="w-full px-2 py-1 border border-border rounded text-sm text-right"
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          step="0.5"
          min="0"
          value={vatRate}
          onChange={(e) => setVatRate(e.target.value)}
          className="w-full px-2 py-1 border border-border rounded text-sm text-right"
        />
      </td>
      <td colSpan={disabled ? 1 : 2} className="px-3 py-2">
        <div className="flex items-center gap-1 justify-end">
          <button
            type="button"
            onClick={commit}
            disabled={pending || !description.trim()}
            className="inline-flex items-center gap-1 h-7 px-2 rounded bg-primary text-white text-xs font-medium hover:bg-primary-600 disabled:opacity-50"
          >
            {pending && <Loader2 className="h-3 w-3 animate-spin" />}
            OK
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="inline-flex items-center justify-center h-7 w-7 rounded border border-border bg-white text-xs hover:bg-muted/40"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function ProductPicker({
  products,
  onPick,
  onClose,
  pending,
}: {
  products: ProductDto[];
  onPick: (id: string, quantity: number) => void;
  onClose: () => void;
  pending: boolean;
}) {
  const [search, setSearch] = useState('');
  const [quantity, setQuantity] = useState('1');
  const filtered = search.trim()
    ? products.filter(
        (p) =>
          p.title.toLowerCase().includes(search.toLowerCase()) ||
          p.code.toLowerCase().includes(search.toLowerCase()),
      )
    : products;
  const qtyNum = parseFloat(quantity.replace(',', '.')) || 1;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Ajouter une ligne depuis le catalogue</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="col-span-2 relative">
            <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Code, titre…"
              autoFocus
              className="w-full pl-8 pr-3 py-2 border border-border rounded text-sm"
            />
          </div>
          <div>
            <input
              type="number"
              step="0.5"
              min="0.5"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Qté"
              className="w-full px-3 py-2 border border-border rounded text-sm"
              title="Quantité (nombre d'apprenants par défaut)"
            />
          </div>
        </div>

        <div className="max-h-[400px] overflow-y-auto border border-border rounded">
          {filtered.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">Aucun produit</div>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onPick(p.id, qtyNum)}
                disabled={pending}
                className="w-full text-left px-3 py-2 hover:bg-muted/40 border-b border-border last:border-0 disabled:opacity-50"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground font-mono">{p.code} · {p.durationHours}h</div>
                    <div className="text-sm font-medium truncate">{p.title}</div>
                  </div>
                  <div className="text-sm font-medium tabular-nums shrink-0">
                    {p.priceHT.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}
