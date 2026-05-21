'use client';

/**
 * BUG-19 — Picker inline pour définir le lieu d'une session.
 * Liste les Location existantes du tenant + bouton "Définir".
 */

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Loader2, MapPin } from 'lucide-react';
import { listLocations, updateSessionLocation } from '@/server/actions/sessions';
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

  if (loading) {
    return <div className="text-xs text-muted-foreground"><Loader2 className="inline h-3 w-3 animate-spin mr-1" /> Chargement…</div>;
  }

  if (locations.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Aucun lieu n&apos;est encore créé en base. Demande à un administrateur d&apos;ajouter un Location.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        disabled={pending}
        className="h-9 rounded-md border border-border px-2 text-sm bg-white"
      >
        <option value="">— Choisir un lieu —</option>
        {locations.map((l) => {
          const addr = l.address as { city?: string } | null;
          return (
            <option key={l.id} value={l.id}>
              {l.name}{addr?.city ? ` — ${addr.city}` : ''}
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
    </div>
  );
}
