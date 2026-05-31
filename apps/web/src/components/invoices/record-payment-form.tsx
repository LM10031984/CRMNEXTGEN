'use client';

import { useState, useTransition } from 'react';
import { Plus, Loader2, AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { recordInvoicePayment } from '@/server/actions/invoices';

const METHODS = [
  { value: 'virement', label: 'Virement bancaire' },
  { value: 'cheque', label: 'Chèque' },
  { value: 'cb', label: 'Carte bancaire' },
  { value: 'prelevement', label: 'Prélèvement' },
  { value: 'especes', label: 'Espèces' },
  { value: 'opco', label: 'Remboursement OPCO' },
];

export function RecordPaymentForm({
  invoiceId,
  remaining,
}: {
  invoiceId: string;
  remaining: number;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState(remaining > 0 ? remaining.toFixed(2) : '');
  const [method, setMethod] = useState('virement');
  const [receivedAt, setReceivedAt] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');

  const handle = () => {
    setError(null);
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Montant invalide');
      return;
    }
    startTransition(async () => {
      const r = await recordInvoicePayment({
        invoiceId,
        amount: amt,
        method,
        receivedAt: new Date(receivedAt).toISOString(),
        reference: reference.trim() || undefined,
      });
      if (r.ok) {
        setOpen(false);
        setReference('');
      } else {
        setError(r.error ?? 'Erreur');
      }
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={remaining <= 0}
        className={cn(
          'inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm font-medium transition-all duration-300 ease-out active:scale-[0.97]',
          remaining <= 0
            ? 'bg-emerald-100 text-emerald-700 cursor-default'
            : 'bg-emerald-600 text-white hover:bg-emerald-700',
        )}
      >
        <Plus className="h-4 w-4" /> {remaining <= 0 ? 'Soldé' : 'Enregistrer paiement'}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Nouveau paiement</h3>
        <button type="button" onClick={() => setOpen(false)} className="h-7 w-7 rounded-md hover:bg-white inline-flex items-center justify-center">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium">Montant (€)</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-white text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium">Date</label>
          <input
            type="date"
            value={receivedAt}
            onChange={(e) => setReceivedAt(e.target.value)}
            className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-white text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium">Mode de règlement</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-white text-sm">
            {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium">Référence (optionnel)</label>
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="N° chèque, libellé virement…"
            className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-white text-sm"
          />
        </div>
      </div>
      {error && (
        <div className="text-xs text-red-700 inline-flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5" /> {error}
        </div>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={() => setOpen(false)} className="h-9 px-3 rounded-md border border-input bg-white text-sm">Annuler</button>
        <button
          type="button"
          onClick={handle}
          disabled={pending}
          className={cn(
            'inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-all duration-300 ease-out active:scale-[0.97]',
            pending && 'opacity-70 cursor-wait',
          )}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}
