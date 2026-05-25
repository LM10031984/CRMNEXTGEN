'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Plus } from 'lucide-react';
import { createOrganization } from '@/server/actions/crud-edits';

const FORMS = [
  { value: 'AUTO_ENTREPRENEUR', label: 'Auto-entrepreneur / EI' },
  { value: 'EIRL', label: 'EIRL' },
  { value: 'SAS', label: 'SAS' },
  { value: 'SARL', label: 'SARL' },
  { value: 'SASU', label: 'SASU' },
  { value: 'EURL', label: 'EURL' },
  { value: 'SA', label: 'SA' },
  { value: 'ASSOCIATION', label: 'Association' },
  { value: 'PARTICULIER', label: 'Particulier' },
  { value: 'AUTRE', label: 'Autre' },
] as const;

const OPCOS = ['', 'AGEFICE', 'OPCO_EP', 'ATLAS', 'CPF', 'FI-FPL', 'OPCOMMERCE'];

export function CreateOrganizationButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [legalName, setLegalName] = useState('');
  const [legalForm, setLegalForm] = useState<typeof FORMS[number]['value']>('AUTO_ENTREPRENEUR');
  const [siret, setSiret] = useState('');
  const [opcoCode, setOpcoCode] = useState<string>('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await createOrganization({
        legalName,
        legalForm,
        siret: siret.trim() || null,
        opcoCode: opcoCode || null,
      });
      if (r.ok && r.orgId) {
        setOpen(false);
        setLegalName(''); setSiret(''); setOpcoCode('');
        router.push(`/app/organisations/${r.orgId}` as any);
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
        className="inline-flex items-center gap-2 h-9 px-3.5 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 transition-colors"
      >
        <Plus className="h-4 w-4" /> Nouvelle organisation
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !busy && setOpen(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-4 inline-flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" /> Nouvelle organisation
            </h3>
            <form onSubmit={onSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Raison sociale *</label>
                <input type="text" value={legalName} onChange={(e) => setLegalName(e.target.value)} required autoFocus className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Forme juridique *</label>
                  <select value={legalForm} onChange={(e) => setLegalForm(e.target.value as any)} className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white">
                    {FORMS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">OPCO financeur</label>
                  <select value={opcoCode} onChange={(e) => setOpcoCode(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white">
                    {OPCOS.map((o) => <option key={o} value={o}>{o || '— aucun —'}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">SIRET (14 chiffres)</label>
                <input type="text" value={siret} onChange={(e) => setSiret(e.target.value)} placeholder="12345678900012" className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono" />
              </div>
              {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</div>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)} disabled={busy} className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted">Annuler</button>
                <button type="submit" disabled={busy} className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50">{busy ? 'Création…' : 'Créer l\'organisation'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
