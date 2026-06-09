'use client';

/**
 * Picker d'enseigne / réseau immobilier pour le wizard "Nouvel apprenant".
 *
 * Cas d'usage métier : la majorité des apprenants Start Academy sont des
 * agents commerciaux immobiliers, donc EI + Enseigne (2 LegalLinks). Ce
 * picker permet de choisir une enseigne existante OU de créer une nouvelle
 * à la volée — le tout sans quitter le wizard.
 *
 * Sortie : soit `selectedOrgId` (enseigne existante), soit `newName`
 * (création), exclusifs.
 */

import { useEffect, useRef, useState } from 'react';
import { Building2, Search, X, Plus } from 'lucide-react';
import { searchOrganizations } from '@/server/actions/legal-links';

interface OrgHit {
  id: string;
  legalName: string;
  legalForm: string | null;
  siret: string | null;
}

const RECENT_KEY = 'qualiof.enseigne.recent';

function loadRecent(): { id: string; legalName: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function saveRecent(item: { id: string; legalName: string }) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(RECENT_KEY, JSON.stringify(item));
}

export function EnseignePicker({
  selectedOrgId,
  selectedLabel,
  onPick,
  onCreate,
  onClear,
}: {
  selectedOrgId: string | null;
  selectedLabel: string | null;
  onPick: (id: string, legalName: string) => void;
  onCreate: (newName: string) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<OrgHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const recent = useRef<{ id: string; legalName: string } | null>(null);

  useEffect(() => {
    recent.current = loadRecent();
  }, []);

  // Si déjà sélectionné → affichage compact + bouton retirer
  if (selectedOrgId && selectedLabel) {
    return (
      <div className="rounded-lg border border-primary-200 bg-primary-50 p-2.5 inline-flex items-center gap-2 text-sm w-full">
        <Building2 className="h-4 w-4 text-primary shrink-0" />
        <span className="font-medium flex-1 truncate">{selectedLabel}</span>
        <button
          type="button"
          onClick={() => {
            onClear();
            setQuery('');
          }}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Retirer l'enseigne"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  async function handleSearch(q: string) {
    setQuery(q);
    if (q.trim().length === 0) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const list = await searchOrganizations(q, 8);
      setResults(list as OrgHit[]);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Tape le nom de l'enseigne (Akorimmo, Neyrat…)"
          className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm"
        />
      </div>

      {/* Récente — pré-remplissage 1-clic */}
      {recent.current && !query && (
        <button
          type="button"
          onClick={() => onPick(recent.current!.id, recent.current!.legalName)}
          className="w-full text-left px-3 py-1.5 rounded-md bg-amber-50 border border-amber-200 hover:bg-amber-100 text-xs flex items-center gap-2"
        >
          <span className="text-amber-700 font-semibold">Dernière utilisée :</span>
          <span className="font-medium">{recent.current.legalName}</span>
        </button>
      )}

      {searching && <div className="text-xs text-muted-foreground italic px-1">Recherche…</div>}

      {results.length > 0 && (
        <ul className="border border-border rounded-lg divide-y divide-border max-h-48 overflow-y-auto">
          {results.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => {
                  saveRecent({ id: o.id, legalName: o.legalName });
                  onPick(o.id, o.legalName);
                }}
                className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
              >
                <div className="font-medium">{o.legalName}</div>
                <div className="text-[10px] text-muted-foreground">
                  {[o.legalForm, o.siret].filter(Boolean).join(' · ') || '—'}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Création à la volée — toujours visible dès 2+ caractères. Pattern
          Notion/Linear : l'utilisateur peut toujours créer une nouvelle entité
          même si des résultats similaires existent. */}
      {query.trim().length >= 2 && !searching && (
        <button
          type="button"
          onClick={() => onCreate(query.trim())}
          className="w-full text-left px-3 py-2 rounded-md border border-dashed border-primary/50 hover:bg-primary-50 text-sm flex items-center gap-2"
        >
          <Plus className="h-3.5 w-3.5 text-primary" />
          <span>
            Créer la nouvelle enseigne <strong>« {query.trim()} »</strong>
          </span>
        </button>
      )}

      {!query && !recent.current && (
        <p className="text-[10px] text-muted-foreground italic px-1">
          Optionnel — utile pour les agents commerciaux immobiliers (2e LegalLink AGENT_COMMERCIAL créé automatiquement).
        </p>
      )}
    </div>
  );
}
