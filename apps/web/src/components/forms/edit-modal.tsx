'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { toast } from 'sonner';

export interface EditField {
  name: string;
  label: string;
  type?: 'text' | 'date' | 'number' | 'textarea' | 'select';
  defaultValue?: string | number | null;
  options?: { value: string; label: string }[]; // pour type=select
  placeholder?: string;
  required?: boolean;
  rows?: number;
}

interface EditModalProps {
  buttonLabel?: string;
  title: string;
  fields: EditField[];
  onSubmit: (values: Record<string, string | number | null>) => Promise<{ ok: boolean; error?: string }>;
  onSuccess?: () => void;
}

export function EditModal({
  buttonLabel = 'Éditer',
  title,
  fields,
  onSubmit,
  onSuccess,
}: EditModalProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>(() =>
    fields.reduce((acc, f) => ({ ...acc, [f.name]: f.defaultValue?.toString() ?? '' }), {}),
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    // Convert values per field type
    const cleaned: Record<string, string | number | null> = {};
    for (const f of fields) {
      const v = values[f.name];
      if (v === '' || v == null) {
        cleaned[f.name] = null;
        continue;
      }
      if (f.type === 'number') {
        const n = parseFloat(v.replace(',', '.'));
        if (Number.isNaN(n)) {
          setError(`${f.label} doit être un nombre.`);
          setBusy(false);
          return;
        }
        cleaned[f.name] = n;
      } else {
        cleaned[f.name] = v;
      }
    }

    try {
      const r = await onSubmit(cleaned);
      if (r.ok) {
        toast.success('Modifications enregistrées');
        setOpen(false);
        onSuccess?.();
        // refresh côté serveur via revalidatePath dans l'action
        if (typeof window !== 'undefined') window.location.reload();
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
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted text-foreground"
      >
        <Pencil className="h-3.5 w-3.5" />
        {buttonLabel}
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
            <h3 className="font-semibold text-lg mb-4">{title}</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              {fields.map((f) => (
                <div key={f.name}>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    {f.label}
                    {f.required && <span className="text-red-600 ml-0.5">*</span>}
                  </label>
                  {f.type === 'textarea' ? (
                    <textarea
                      value={values[f.name] ?? ''}
                      onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                      placeholder={f.placeholder}
                      rows={f.rows ?? 3}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                    />
                  ) : f.type === 'select' ? (
                    <select
                      value={values[f.name] ?? ''}
                      onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white"
                    >
                      <option value="">— Aucun —</option>
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={f.type === 'date' ? 'date' : f.type === 'number' ? 'text' : 'text'}
                      inputMode={f.type === 'number' ? 'decimal' : undefined}
                      value={values[f.name] ?? ''}
                      onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                      placeholder={f.placeholder}
                      required={f.required}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                    />
                  )}
                </div>
              ))}
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
                  {busy ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
