'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus } from 'lucide-react';
import { createPerson } from '@/server/actions/crud-edits';

export function CreatePersonButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [professionalStatus, setProfessionalStatus] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await createPerson({
        firstName,
        lastName,
        email: email.trim() || null,
        phone: phone.trim() || null,
        professionalStatus: professionalStatus.trim() || null,
      });
      if (r.ok && r.personId) {
        setOpen(false);
        setFirstName(''); setLastName(''); setEmail(''); setPhone(''); setProfessionalStatus('');
        router.push(`/app/apprenants/${r.personId}` as any);
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
        <UserPlus className="h-4 w-4" /> Nouvel apprenant
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !busy && setOpen(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-4">Nouvel apprenant</h3>
            <form onSubmit={onSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Prénom *</label>
                  <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} required autoFocus className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Nom *</label>
                  <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} required className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Téléphone</label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Statut professionnel</label>
                <input type="text" value={professionalStatus} onChange={(e) => setProfessionalStatus(e.target.value)} placeholder="Ex: Agent commercial" className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Tu pourras ajouter le rattachement à une organisation (auto-entreprise, enseigne) depuis la fiche après création.
              </p>
              {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</div>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)} disabled={busy} className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted">Annuler</button>
                <button type="submit" disabled={busy} className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50">{busy ? 'Création…' : 'Créer l\'apprenant'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
