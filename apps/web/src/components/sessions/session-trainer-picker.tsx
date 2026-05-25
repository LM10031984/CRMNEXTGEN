'use client';

/**
 * BUG-19 — Picker inline pour ajouter un formateur à une session.
 * Recherche dans les Person du tenant (priorité aux Person déjà formateurs).
 */

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Loader2, UserPlus, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { searchTrainerCandidates, addSessionTrainer } from '@/server/actions/sessions';

interface Props {
  sessionId: string;
  /** Premier formateur ? Si oui, on le marque isPrimary=true automatiquement. */
  setAsPrimary?: boolean;
}

export function SessionTrainerPicker({ sessionId, setAsPrimary = true }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<
    { id: string; firstName: string; lastName: string; email: string | null }[]
  >([]);
  const [searching, setSearching] = useState(false);
  const [pending, startTransition] = useTransition();

  // Debounce recherche 200 ms (pareil pattern que PersonOrOrgPicker)
  useEffect(() => {
    setSearching(true);
    const id = setTimeout(async () => {
      const r = await searchTrainerCandidates(query);
      setResults(r as never);
      setSearching(false);
    }, 200);
    return () => clearTimeout(id);
  }, [query]);

  function handleAdd(personId: string) {
    startTransition(async () => {
      const r = await addSessionTrainer({
        sessionId,
        personId,
        isPrimary: setAsPrimary,
      });
      if (r.ok) {
        toast.success('Formateur ajouté à la session');
        router.refresh();
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  }

  return (
    <div className="space-y-2 w-full">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filtrer par nom (optionnel — la liste s'affiche dessous)…"
          className="w-full h-9 rounded-md border border-border pl-8 pr-3 text-sm"
        />
      </div>
      {searching ? (
        <div className="text-xs text-muted-foreground">
          <Loader2 className="inline h-3 w-3 animate-spin mr-1" /> Recherche…
        </div>
      ) : results.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {query.trim().length === 0
            ? "Aucun formateur identifié dans la base. Crée-en un depuis /app/formateurs (ou attribue le rôle FORMATEUR à un Person via LegalLink)."
            : 'Aucun résultat — essaie un autre nom ou efface le filtre.'}
        </p>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-md max-h-48 overflow-y-auto">
          {results.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="font-medium truncate">{p.firstName} {p.lastName}</div>
                {p.email && <div className="text-xs text-muted-foreground truncate">{p.email}</div>}
              </div>
              <button
                type="button"
                onClick={() => handleAdd(p.id)}
                disabled={pending}
                className="inline-flex items-center gap-1 h-7 px-2 text-xs rounded-md bg-primary text-white hover:bg-primary-600 disabled:opacity-50"
              >
                <UserPlus className="h-3 w-3" /> Ajouter
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
