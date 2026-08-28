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
import { searchOrganizations, createLegalLink } from '@/server/actions/legal-links';
import { createOrganization } from '@/server/actions/crud-edits';
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

/**
 * Rôles proposés au rattachement express d'une entreprise (28/08).
 * Aucun n'est pré-sélectionné : un SALARIE par défaut pourrissait les données
 * (recommandation d'audit, reprise dans `addParticipant`).
 */
const ROLES_RATTACHEMENT = ['SALARIE', 'DIRIGEANT', 'EI_SELF', 'AGENT_COMMERCIAL'] as const;

const FORMES_JURIDIQUES = [
  'SARL',
  'SAS',
  'SASU',
  'EURL',
  'SA',
  'SCI',
  'ASSOCIATION',
  'EI',
  'AUTO_ENTREPRENEUR',
] as const;

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
  // Rattachement express d'une entreprise à un apprenant qui n'en a aucune.
  const [personSansCasquette, setPersonSansCasquette] = useState<PersonSearchResult | null>(null);
  const [orgQuery, setOrgQuery] = useState('');
  const [orgResults, setOrgResults] = useState<
    { id: string; legalName: string; legalForm: string }[]
  >([]);
  const [roleRattachement, setRoleRattachement] = useState<string>('');
  const [attaching, setAttaching] = useState(false);
  const [creerOrg, setCreerOrg] = useState(false);
  const [nouvelleOrgNom, setNouvelleOrgNom] = useState('');
  const [nouvelleOrgForme, setNouvelleOrgForme] = useState<string>('SARL');
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

  // Recherche d'organisations pour le rattachement express (debounce 200ms).
  useEffect(() => {
    if (!personSansCasquette) return;
    const id = setTimeout(async () => {
      const list = await searchOrganizations(orgQuery);
      setOrgResults(list.map((o) => ({ id: o.id, legalName: o.legalName, legalForm: o.legalForm })));
    }, 200);
    return () => clearTimeout(id);
  }, [orgQuery, personSansCasquette]);

  /** Crée le LegalLink manquant puis sélectionne l'apprenant avec cette casquette. */
  async function rattacher(org: { id: string; legalName: string; legalForm: string }) {
    if (!personSansCasquette || !roleRattachement) return;
    setAttaching(true);
    const r = await createLegalLink({
      personId: personSansCasquette.id,
      organizationId: org.id,
      role: roleRattachement as Parameters<typeof createLegalLink>[0]['role'],
      isPrimary: true,
    });
    setAttaching(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    const person = personSansCasquette;
    setPersonSansCasquette(null);
    finalizeSelection(person, {
      id: r.id,
      role: roleRattachement,
      isPrimary: true,
      organization: {
        id: org.id,
        legalName: org.legalName,
        legalForm: org.legalForm,
        opcoCode: null,
      },
    } as unknown as PersonSearchResult['legalLinks'][number]);
  }

  async function creerPuisRattacher() {
    if (!nouvelleOrgNom.trim() || !roleRattachement) return;
    setAttaching(true);
    const r = await createOrganization({
      legalName: nouvelleOrgNom.trim(),
      legalForm: nouvelleOrgForme as Parameters<typeof createOrganization>[0]['legalForm'],
    });
    setAttaching(false);
    if (!r.ok || !r.orgId) {
      toast.error(r.error ?? 'Création impossible');
      return;
    }
    await rattacher({ id: r.orgId, legalName: nouvelleOrgNom.trim(), legalForm: nouvelleOrgForme });
  }

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
      // 28/08 — friction levée : au lieu de renvoyer l'utilisateur sur la fiche
      // apprenant (« crée d'abord un LegalLink »), on rattache l'entreprise SUR
      // PLACE. Sans casquette, aucune inscription n'est possible : c'est elle
      // qui porte le payeur.
      setPersonSansCasquette(person);
      setOrgQuery('');
      setRoleRattachement('');
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

  // Cas 1bis : l'apprenant n'a AUCUNE casquette → rattachement express.
  if (personSansCasquette) {
    const nom = `${personSansCasquette.firstName} ${personSansCasquette.lastName}`;
    return (
      <div className="border border-primary/30 bg-primary-50/30 rounded-md p-4 space-y-3">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="font-medium text-sm">Rattacher une entreprise à {nom}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Aucune organisation ne lui est rattachée. C&apos;est elle qui paye
              l&apos;inscription — choisis-la ici, sans quitter la session.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setPersonSansCasquette(null)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Annuler
          </button>
        </div>

        <div>
          <label
            htmlFor="picker-role-rattachement"
            className="text-xs font-medium text-muted-foreground block mb-1"
          >
            Rôle dans l&apos;entreprise
          </label>
          <select
            id="picker-role-rattachement"
            value={roleRattachement}
            onChange={(e) => setRoleRattachement(e.target.value)}
            className="w-full h-9 px-2 rounded-md border border-border bg-white text-sm"
          >
            <option value="">— À choisir —</option>
            {ROLES_RATTACHEMENT.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r] ?? r}
              </option>
            ))}
          </select>
        </div>

        {creerOrg ? (
          <div className="space-y-2 rounded-md border border-border bg-white p-3">
            <input
              type="text"
              value={nouvelleOrgNom}
              onChange={(e) => setNouvelleOrgNom(e.target.value)}
              placeholder="Raison sociale"
              aria-label="Raison sociale"
              className="w-full h-9 px-2 rounded-md border border-border text-sm"
            />
            <select
              value={nouvelleOrgForme}
              onChange={(e) => setNouvelleOrgForme(e.target.value)}
              aria-label="Forme juridique"
              className="w-full h-9 px-2 rounded-md border border-border bg-white text-sm"
            >
              {FORMES_JURIDIQUES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={attaching || !roleRattachement || !nouvelleOrgNom.trim()}
                onClick={creerPuisRattacher}
                className="h-9 px-3 rounded-md bg-primary text-white text-sm font-medium disabled:opacity-50"
              >
                Créer et rattacher
              </button>
              <button
                type="button"
                onClick={() => setCreerOrg(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Choisir une entreprise existante
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={orgQuery}
                onChange={(e) => setOrgQuery(e.target.value)}
                placeholder="Rechercher une entreprise…"
                aria-label="Rechercher une entreprise"
                className="w-full h-9 pl-9 pr-3 rounded-md border border-border bg-white text-sm"
              />
            </div>
            <ul className="max-h-52 overflow-auto divide-y divide-border rounded-md border border-border bg-white">
              {orgResults.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    disabled={attaching}
                    onClick={() => rattacher(o)}
                    className="w-full flex items-center gap-2 p-2.5 text-left hover:bg-primary-50/50 disabled:opacity-50"
                  >
                    <Briefcase className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium truncate">{o.legalName}</span>
                    <Badge variant="muted" className="ml-auto">
                      {o.legalForm}
                    </Badge>
                  </button>
                </li>
              ))}
              {orgResults.length === 0 && (
                <li className="p-3 text-center text-xs text-muted-foreground">
                  Aucune entreprise trouvée.
                </li>
              )}
            </ul>
            <button
              type="button"
              onClick={() => {
                setCreerOrg(true);
                setNouvelleOrgNom(orgQuery);
              }}
              className="text-xs text-primary hover:underline"
            >
              + Créer une entreprise
            </button>
          </>
        )}
        {!roleRattachement && (
          <p className="text-xs text-amber-700">
            Choisis d&apos;abord le rôle : il détermine qui paye (un salarié n&apos;est
            pas un auto-entrepreneur).
          </p>
        )}
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
