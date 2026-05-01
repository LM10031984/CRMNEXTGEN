'use client';

/**
 * Bouton "Ajouter une personne rattachée" sur la fiche organisation.
 * Symétrique du LegalLinkEditor côté apprenant — picker Person existant
 * + sélection du rôle (LegalLink role).
 */

import { useState, useTransition } from 'react';
import { Plus, X, Search, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { searchPersons } from '@/server/actions/persons';
import { createLegalLink } from '@/server/actions/legal-links';

const ROLE_OPTIONS = [
  { value: 'DIRIGEANT', label: 'Dirigeant' },
  { value: 'SALARIE', label: 'Salarié' },
  { value: 'EI_SELF', label: 'Auto-entrepreneur (EI)' },
  { value: 'AGENT_COMMERCIAL', label: 'Agent commercial' },
  { value: 'ALTERNANT', label: 'Alternant' },
  { value: 'STAGIAIRE', label: 'Stagiaire' },
  { value: 'CONTACT', label: 'Contact' },
] as const;

interface PersonHit {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
}

export function AddPersonToOrgButton({
  organizationId,
  excludePersonIds = [],
}: {
  organizationId: string;
  excludePersonIds?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PersonHit[]>([]);
  const [selected, setSelected] = useState<PersonHit | null>(null);
  const [role, setRole] = useState<string>('SALARIE');
  const [searching, setSearching] = useState(false);

  async function handleSearch(q: string) {
    setQuery(q);
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const list = await searchPersons(q, 12);
      setResults(list.filter((p) => !excludePersonIds.includes(p.id)));
    } finally {
      setSearching(false);
    }
  }

  function handleSubmit() {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      const r = await createLegalLink({
        personId: selected.id,
        organizationId,
        role: role as Parameters<typeof createLegalLink>[0]['role'],
      });
      if (r.ok) {
        toast.success(`${selected?.firstName} ${selected?.lastName.toUpperCase()} rattaché·e`);
        setOpen(false);
        setSelected(null);
        setQuery('');
        setResults([]);
        setRole('SALARIE');
        if (typeof window !== 'undefined') window.location.reload();
      } else {
        setError(r.error ?? 'Erreur inconnue.');
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted"
      >
        <Plus className="h-3.5 w-3.5" />
        Ajouter une personne rattachée
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">Ajouter une personne rattachée</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {!selected ? (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => handleSearch(e.target.value)}
                    placeholder="Chercher un apprenant existant (nom, prénom, email…)"
                    autoFocus
                    className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm"
                  />
                </div>

                {searching && <div className="text-xs text-muted-foreground italic">Recherche…</div>}

                {results.length > 0 && (
                  <ul className="border border-border rounded-lg divide-y divide-border max-h-64 overflow-y-auto">
                    {results.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => setSelected(p)}
                          className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
                        >
                          <div className="font-medium">
                            {p.firstName} {p.lastName.toUpperCase()}
                          </div>
                          {p.email && (
                            <div className="text-xs text-muted-foreground">{p.email}</div>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {query.length >= 2 && results.length === 0 && !searching && (
                  <div className="text-xs text-muted-foreground italic">
                    Aucun résultat. Crée d'abord la personne depuis /app/apprenants.
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg border border-primary-200 bg-primary-50 p-3 inline-flex items-center gap-2 text-sm w-full">
                  <UserCheck className="h-4 w-4 text-primary" />
                  <span className="font-medium">
                    {selected.firstName} {selected.lastName.toUpperCase()}
                  </span>
                  {selected.email && (
                    <span className="text-xs text-muted-foreground">· {selected.email}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="ml-auto text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Rôle / Casquette dans cette organisation
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                {error && (
                  <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                    {error}
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    disabled={pending}
                    className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={pending}
                    className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
                  >
                    {pending ? 'Ajout…' : 'Rattacher'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
