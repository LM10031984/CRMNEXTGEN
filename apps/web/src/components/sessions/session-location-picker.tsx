'use client';

/**
 * BUG-19 + audit 2026-05-22 — Picker inline pour définir/changer le lieu d'une
 * session. Deux modes :
 *  - sélectionner un Location existant (select natif)
 *  - créer un nouveau Location à la volée (saisie libre nom + adresse)
 *
 * find-or-create insensible à la casse côté server (`createLocationAndAttachToSession`)
 * pour éviter les doublons.
 */

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Loader2, MapPin, Plus, X } from 'lucide-react';
import {
  listLocations,
  updateSessionLocation,
  createLocationAndAttachToSession,
} from '@/server/actions/sessions';
import { useRouter } from 'next/navigation';

interface Props {
  sessionId: string;
}

export function SessionLocationPicker({ sessionId }: Props) {
  const router = useRouter();
  const [locations, setLocations] = useState<
    { id: string; name: string; address: unknown }[]
  >([]);
  const [selected, setSelected] = useState('');
  const [mode, setMode] = useState<'pick' | 'create'>('pick');
  const [newName, setNewName] = useState('');
  const [newLegalName, setNewLegalName] = useState('');
  const [newStreet, setNewStreet] = useState('');
  const [newPostalCode, setNewPostalCode] = useState('');
  const [newCity, setNewCity] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    listLocations()
      .then((r) => setLocations(r as never))
      .finally(() => setLoading(false));
  }, []);

  function handleSave() {
    if (!selected) return;
    startTransition(async () => {
      const r = await updateSessionLocation({ sessionId, locationId: selected });
      if (r.ok) {
        toast.success('Lieu de formation défini');
        router.refresh();
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  }

  function handleCreate() {
    if (!newName.trim()) {
      toast.error('Nom du lieu obligatoire');
      return;
    }
    startTransition(async () => {
      const r = await createLocationAndAttachToSession({
        sessionId,
        name: newName.trim(),
        legalName: newLegalName.trim() || null,
        street: newStreet.trim() || null,
        postalCode: newPostalCode.trim() || null,
        city: newCity.trim() || null,
      });
      if (r.ok) {
        toast.success('Nouveau lieu créé et défini');
        setNewName('');
        setNewLegalName('');
        setNewStreet('');
        setNewPostalCode('');
        setNewCity('');
        setMode('pick');
        router.refresh();
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  }

  if (loading) {
    return (
      <div className="text-xs text-muted-foreground">
        <Loader2 className="inline h-3 w-3 animate-spin mr-1" /> Chargement…
      </div>
    );
  }

  if (mode === 'create') {
    return (
      <div className="space-y-2 max-w-md">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-foreground">Nouveau lieu</p>
          <button
            type="button"
            onClick={() => setMode('pick')}
            disabled={pending}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <X className="h-3 w-3" /> Annuler
          </button>
        </div>
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nom du lieu (ex : Agence Nice Centre)"
          className="w-full h-9 rounded-md border border-border px-2 text-sm"
          autoFocus
        />
        <input
          type="text"
          value={newLegalName}
          onChange={(e) => setNewLegalName(e.target.value)}
          placeholder="Raison sociale (ex : SARL XYZ) — optionnel"
          className="w-full h-9 rounded-md border border-border px-2 text-sm"
        />
        <input
          type="text"
          value={newStreet}
          onChange={(e) => setNewStreet(e.target.value)}
          placeholder="Adresse (optionnel)"
          className="w-full h-9 rounded-md border border-border px-2 text-sm"
        />
        <div className="flex gap-2">
          <input
            type="text"
            value={newPostalCode}
            onChange={(e) => setNewPostalCode(e.target.value)}
            placeholder="Code postal"
            className="w-28 h-9 rounded-md border border-border px-2 text-sm"
          />
          <input
            type="text"
            value={newCity}
            onChange={(e) => setNewCity(e.target.value)}
            placeholder="Ville"
            className="flex-1 h-9 rounded-md border border-border px-2 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={handleCreate}
          disabled={pending || !newName.trim()}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Créer et définir
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {locations.length > 0 ? (
        <>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={pending}
            className="h-9 rounded-md border border-border px-2 text-sm bg-white"
          >
            <option value="">— Choisir un lieu existant —</option>
            {locations.map((l) => {
              const addr = l.address as { city?: string } | null;
              return (
                <option key={l.id} value={l.id}>
                  {l.name}
                  {addr?.city ? ` — ${addr.city}` : ''}
                </option>
              );
            })}
          </select>
          <button
            type="button"
            onClick={handleSave}
            disabled={pending || !selected}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
            Définir
          </button>
          <span className="text-xs text-muted-foreground">ou</span>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          Aucun lieu enregistré pour l'instant.
        </p>
      )}
      <button
        type="button"
        onClick={() => setMode('create')}
        disabled={pending}
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-dashed border-primary text-primary text-sm font-medium hover:bg-primary/5"
      >
        <Plus className="h-4 w-4" /> Nouveau lieu
      </button>
    </div>
  );
}
