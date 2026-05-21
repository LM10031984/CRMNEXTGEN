'use client';

/**
 * Modale "Nouvel apprenant" depuis le wizard session (BUG-7).
 *
 * Avant : pour ajouter un apprenant non existant, le user devait quitter
 * le wizard, aller dans /app/apprenants, créer la personne, revenir dans
 * le wizard. Friction UX inutile.
 *
 * Après : bouton "+ Créer un apprenant" inline qui ouvre une mini modale
 * (firstName + lastName + email + civilité), crée le Person via la server
 * action `createPerson` (déjà existante palier 4), et appelle `onCreated`
 * pour que le wizard l'ajoute directement aux participants.
 *
 * Champs minimum pour rester rapide. L'utilisateur peut compléter le profil
 * plus tard depuis la fiche apprenant.
 */

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { createPerson } from '@/server/actions/crud-edits';

interface CreatedPerson {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
}

interface Props {
  onCreated: (person: CreatedPerson) => void;
}

export function QuickCreatePersonButton({ onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [civility, setCivility] = useState<'MR' | 'MME' | ''>('');

  const reset = () => {
    setFirstName('');
    setLastName('');
    setEmail('');
    setCivility('');
    setError(null);
  };

  const close = () => {
    setOpen(false);
    reset();
  };

  const submit = async () => {
    setError(null);
    if (!firstName.trim() || !lastName.trim()) {
      setError('Prénom et nom obligatoires');
      return;
    }
    setBusy(true);
    try {
      const r = await createPerson({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim() || null,
        civility: civility || null,
      });
      if (!r.ok || !r.personId) {
        setError(r.error ?? 'Erreur lors de la création');
        return;
      }
      toast.success(`Apprenant ${firstName} ${lastName} créé`);
      onCreated({
        id: r.personId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim() || null,
      });
      close();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md border border-dashed border-border hover:border-primary-300 hover:bg-primary-50/30"
        title="Créer un apprenant qui n'existe pas encore en base"
      >
        <Plus className="h-3 w-3" /> Nouveau
      </button>
    );
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        onClick={() => !busy && close()}
      />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="font-semibold text-lg">Nouvel apprenant</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Création rapide — tu pourras compléter le profil plus tard
            </p>
          </div>
          <button
            type="button"
            onClick={() => !busy && close()}
            disabled={busy}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Civilité</span>
              <select
                value={civility}
                onChange={(e) => setCivility(e.target.value as 'MR' | 'MME' | '')}
                disabled={busy}
                className="mt-1 w-full h-9 rounded-md border border-border px-2 text-sm"
              >
                <option value="">—</option>
                <option value="MR">M.</option>
                <option value="MME">Mme</option>
              </select>
            </label>
            <label className="block col-span-2">
              <span className="text-xs font-medium text-muted-foreground">
                Prénom <span className="text-red-500">*</span>
              </span>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={busy}
                autoFocus
                className="mt-1 w-full h-9 rounded-md border border-border px-2 text-sm"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">
              Nom <span className="text-red-500">*</span>
            </span>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              disabled={busy}
              className="mt-1 w-full h-9 rounded-md border border-border px-2 text-sm uppercase"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              className="mt-1 w-full h-9 rounded-md border border-border px-2 text-sm"
              placeholder="prenom@exemple.fr"
            />
          </label>

          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-border">
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="h-9 px-3 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !firstName.trim() || !lastName.trim()}
            className="h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? 'Création…' : 'Créer et ajouter'}
          </button>
        </div>
      </div>
    </>
  );
}
