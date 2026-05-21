'use client';

/**
 * <PersonOrOrgPicker> ⭐ — pièce maîtresse du cas EI / multi-casquettes.
 *
 * UX :
 * 1. L'utilisateur tape un nom dans la combobox → liste filtrée d'apprenants
 * 2. Au choix d'un apprenant, le picker affiche ses LegalLinks (organisations rattachées)
 * 3. Si l'apprenant a >= 2 LegalLinks, l'utilisateur DOIT choisir une casquette
 * 4. Si 1 seul, sélectionné par défaut
 * 5. Renvoie { personId, sponsorOrgId, role } via onChange
 */

import { useEffect, useRef, useState } from 'react';
import { Search, X, ChevronDown, Briefcase, Check, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { searchPersons, type PersonSearchResult } from '@/server/actions/persons';
import { formatFunderCode } from '@/lib/funder-codes';

const SOLO_FORMS = ['EI', 'EIRL', 'AUTO_ENTREPRENEUR'];

const ROLE_LABELS: Record<string, string> = {
  DIRIGEANT: 'Dirigeant',
  SALARIE: 'Salarié',
  EI_SELF: 'Auto-entrepreneur',
  AGENT_COMMERCIAL: 'Agent commercial',
  ALTERNANT: 'Alternant',
  STAGIAIRE: 'Stagiaire',
  CONTACT: 'Contact',
  FINANCEUR_CONTACT: 'Contact financeur',
  FORMATEUR: 'Formateur',
};

export interface PickerSelection {
  personId: string;
  sponsorOrgId: string;
  role: string;
  // Champs auxiliaires pour affichage
  personLabel: string;
  sponsorLabel: string;
  isEi: boolean;
}

interface Props {
  value?: PickerSelection | null;
  onChange: (selection: PickerSelection | null) => void;
  excludePersonIds?: string[];
  placeholder?: string;
  autoFocus?: boolean;
  /**
   * Pré-remplit la recherche au mount (utilisé par BUG-7 après quick-create
   * d'un apprenant — on pré-rempit avec son nom pour qu'il apparaisse direct
   * dans les résultats).
   */
  defaultQuery?: string;
}

export function PersonOrOrgPicker({
  value,
  onChange,
  excludePersonIds = [],
  placeholder = 'Rechercher un apprenant…',
  autoFocus,
  defaultQuery,
}: Props) {
  const [query, setQuery] = useState(defaultQuery ?? '');
  const [results, setResults] = useState<PersonSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  // État intermédiaire : apprenant choisi mais pas encore de casquette
  const [pickedPerson, setPickedPerson] = useState<PersonSearchResult | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounce search 200ms
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(async () => {
      setLoading(true);
      const list = await searchPersons(query);
      setResults(list.filter((p) => !excludePersonIds.includes(p.id)));
      setLoading(false);
    }, 200);
    return () => clearTimeout(id);
  }, [query, open, excludePersonIds]);

  // Click outside → close
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setPickedPerson(null);
      }
    };
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  function handlePersonClick(person: PersonSearchResult) {
    if (person.legalLinks.length === 0) {
      // Pas de LegalLink → on demande une création (TODO palier 2.2bis)
      toast.warning(
        `${person.firstName} ${person.lastName} n'a aucune organisation rattachée. Crée d'abord un LegalLink depuis sa fiche.`,
      );
      return;
    }
    if (person.legalLinks.length === 1) {
      // 1 seule casquette → sélection auto
      const link = person.legalLinks[0]!;
      finalizeSelection(person, link);
      return;
    }
    // >= 2 casquettes → ouvre l'écran de choix
    setPickedPerson(person);
  }

  function finalizeSelection(person: PersonSearchResult, link: PersonSearchResult['legalLinks'][number]) {
    const isEi = SOLO_FORMS.includes(link.organization.legalForm);
    onChange({
      personId: person.id,
      sponsorOrgId: link.organization.id,
      role: link.role,
      personLabel: `${person.firstName} ${person.lastName}`,
      sponsorLabel: link.organization.legalName,
      isEi,
    });
    setOpen(false);
    setPickedPerson(null);
    setQuery('');
  }

  function clear() {
    onChange(null);
    setQuery('');
    setPickedPerson(null);
  }

  // ---- AFFICHAGE ----

  // Cas 1 : sélection complète → on affiche le résumé
  if (value && !open) {
    return (
      <div ref={containerRef} className="space-y-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full flex items-center gap-3 p-3 rounded-md border border-border bg-white hover:bg-muted/30 transition-colors text-left"
        >
          <div className="h-9 w-9 rounded-full bg-primary-100 text-primary-700 inline-flex items-center justify-center font-semibold text-xs shrink-0">
            {value.personLabel.split(' ').map((s) => s.charAt(0)).slice(0, 2).join('')}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm">{value.personLabel}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <Briefcase className="h-3 w-3" />
              <span className="truncate">{value.sponsorLabel}</span>
              <Badge variant={value.isEi ? 'primary' : 'muted'} className="ml-1">
                {value.isEi ? 'EI' : ROLE_LABELS[value.role] ?? value.role}
              </Badge>
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); clear(); }}
            className="h-7 w-7 inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label="Retirer"
          >
            <X className="h-4 w-4" />
          </button>
        </button>
      </div>
    );
  }

  // Cas 2 : panneau de choix de casquette pour personne avec >= 2 LegalLinks
  if (pickedPerson) {
    return (
      <div ref={containerRef} className="border border-primary/30 bg-primary-50/30 rounded-md p-4 space-y-3">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="font-medium text-sm">
              {pickedPerson.firstName} {pickedPerson.lastName} a {pickedPerson.legalLinks.length} casquettes.
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Choisis quelle organisation paye pour cette inscription :
            </div>
          </div>
          <button
            type="button"
            onClick={() => setPickedPerson(null)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Annuler
          </button>
        </div>
        <div className="space-y-1.5">
          {pickedPerson.legalLinks.map((link) => {
            const isEi = SOLO_FORMS.includes(link.organization.legalForm);
            return (
              <button
                key={link.id}
                type="button"
                onClick={() => finalizeSelection(pickedPerson, link)}
                className="w-full flex items-center gap-3 p-3 rounded-md border border-border bg-white hover:border-primary hover:shadow-sm transition-all text-left"
              >
                <Briefcase className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{link.organization.legalName}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    <Badge variant={isEi ? 'primary' : 'muted'}>
                      {isEi ? '💼 EI / Auto-entr.' : ROLE_LABELS[link.role] ?? link.role}
                    </Badge>
                    {link.organization.opcoCode && (
                      <Badge variant="info">{formatFunderCode(link.organization.opcoCode)}</Badge>
                    )}
                    {link.isPrimary && <Badge variant="success">Principal</Badge>}
                  </div>
                </div>
                <Check className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100" />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Cas 3 : combobox de recherche ouverte
  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full h-10 pl-9 pr-9 rounded-md border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      </div>

      {open && (
        <div className="absolute z-30 mt-1 w-full max-h-96 overflow-auto rounded-md border border-border bg-white shadow-lg">
          {loading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Recherche…</div>
          ) : results.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {query.length < 2 ? 'Tape au moins 2 caractères.' : 'Aucun apprenant trouvé.'}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => handlePersonClick(p)}
                    className={cn(
                      'w-full flex items-center gap-3 p-2.5 hover:bg-primary-50/50 transition-colors text-left',
                    )}
                  >
                    <div className="h-8 w-8 rounded-full bg-primary-100 text-primary-700 inline-flex items-center justify-center font-semibold text-[10px] shrink-0">
                      {p.firstName.charAt(0)}{p.lastName.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {p.firstName} {p.lastName.toUpperCase()}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {p.email ?? <span className="italic">email manquant</span>}
                        {p.legalLinks.length > 0 && (
                          <> · {p.legalLinks.length} casquette{p.legalLinks.length > 1 ? 's' : ''}</>
                        )}
                      </div>
                    </div>
                    {p.legalLinks.length >= 2 && (
                      <Badge variant="primary">multi</Badge>
                    )}
                    {p.legalLinks.length === 1 && SOLO_FORMS.includes(p.legalLinks[0]!.organization.legalForm) && (
                      <Badge variant="primary">EI</Badge>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
