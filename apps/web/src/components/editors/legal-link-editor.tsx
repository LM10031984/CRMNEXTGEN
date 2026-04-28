'use client';

/**
 * <LegalLinkEditor> — gestion des LegalLinks d'une personne (cas multi-casquettes).
 * Utilisé sur la fiche apprenant pour ajouter/retirer/marquer principal.
 */

import { useState, useTransition } from 'react';
import { Plus, X, Star, StarOff, Briefcase, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { searchOrganizations, createLegalLink, deleteLegalLink, setPrimaryLegalLink } from '@/server/actions/legal-links';

const ROLE_OPTIONS = [
  { value: 'DIRIGEANT', label: 'Dirigeant' },
  { value: 'SALARIE', label: 'Salarié' },
  { value: 'EI_SELF', label: 'Auto-entrepreneur (EI)' },
  { value: 'AGENT_COMMERCIAL', label: 'Agent commercial' },
  { value: 'ALTERNANT', label: 'Alternant' },
  { value: 'STAGIAIRE', label: 'Stagiaire' },
  { value: 'CONTACT', label: 'Contact' },
] as const;

const ROLE_LABELS: Record<string, string> = Object.fromEntries(ROLE_OPTIONS.map((r) => [r.value, r.label]));
const SOLO_FORMS = ['EI', 'EIRL', 'AUTO_ENTREPRENEUR'];

interface LegalLink {
  id: string;
  role: string;
  isPrimary: boolean;
  organization: {
    id: string;
    legalName: string;
    legalForm: string;
    siret: string | null;
    opcoCode: string | null;
  };
}

interface Props {
  personId: string;
  links: LegalLink[];
}

export function LegalLinkEditor({ personId, links }: Props) {
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Form state for adding
  const [orgQuery, setOrgQuery] = useState('');
  const [orgResults, setOrgResults] = useState<LegalLink['organization'][]>([]);
  const [selectedOrg, setSelectedOrg] = useState<LegalLink['organization'] | null>(null);
  const [role, setRole] = useState<string>('SALARIE');
  const [makePrimary, setMakePrimary] = useState(false);

  async function handleSearch(q: string) {
    setOrgQuery(q);
    if (q.length < 2) { setOrgResults([]); return; }
    const list = await searchOrganizations(q);
    setOrgResults(list.filter((o) => !links.some((l) => l.organization.id === o.id)));
  }

  function handleSubmit() {
    if (!selectedOrg) return;
    setError(null);
    startTransition(async () => {
      const res = await createLegalLink({
        personId,
        organizationId: selectedOrg.id,
        role: role as Parameters<typeof createLegalLink>[0]['role'],
        isPrimary: makePrimary,
      });
      if (res.ok) {
        setAdding(false);
        setSelectedOrg(null);
        setOrgQuery('');
        setOrgResults([]);
        setMakePrimary(false);
        setRole('SALARIE');
      } else {
        setError(res.error);
      }
    });
  }

  function handleDelete(linkId: string) {
    if (!confirm('Retirer ce lien juridique ?')) return;
    startTransition(async () => {
      await deleteLegalLink(linkId);
    });
  }

  function handleSetPrimary(linkId: string) {
    startTransition(async () => {
      await setPrimaryLegalLink(linkId);
    });
  }

  return (
    <div className="space-y-3">
      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          Aucune organisation rattachée à cet apprenant.
        </p>
      ) : (
        <ul className="space-y-2">
          {links.map((link) => {
            const isEi = SOLO_FORMS.includes(link.organization.legalForm);
            return (
              <li
                key={link.id}
                className="flex items-start gap-3 p-3 rounded-lg border border-border bg-white hover:bg-muted/30 transition-colors"
              >
                <Briefcase className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={`/app/organisations/${link.organization.id}`}
                      className="font-medium text-foreground hover:text-primary transition-colors"
                    >
                      {link.organization.legalName}
                    </a>
                    <Badge variant={isEi ? 'primary' : 'muted'}>
                      {ROLE_LABELS[link.role] ?? link.role}
                    </Badge>
                    {link.isPrimary && <Badge variant="info">Principal</Badge>}
                    {link.organization.opcoCode && (
                      <Badge variant="default">OPCO {link.organization.opcoCode}</Badge>
                    )}
                  </div>
                  {link.organization.siret && (
                    <div className="text-xs text-muted-foreground mt-1">
                      SIRET <code className="font-mono">{link.organization.siret}</code>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleSetPrimary(link.id)}
                    disabled={pending || link.isPrimary}
                    className="h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground hover:text-amber-600 hover:bg-amber-50 disabled:opacity-30"
                    title={link.isPrimary ? 'Déjà principal' : 'Marquer principal'}
                  >
                    {link.isPrimary ? <Star className="h-3.5 w-3.5 fill-current" /> : <StarOff className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(link.id)}
                    disabled={pending}
                    className="h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground hover:text-red-600 hover:bg-red-50 disabled:opacity-30"
                    title="Retirer le lien"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!adding ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary-600 transition-colors"
        >
          <Plus className="h-4 w-4" /> Ajouter un lien
        </button>
      ) : (
        <div className="rounded-lg border border-primary/30 bg-primary-50/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-medium text-sm">Nouveau lien juridique</div>
            <button
              type="button"
              onClick={() => { setAdding(false); setSelectedOrg(null); setOrgQuery(''); }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Annuler
            </button>
          </div>

          {/* Org picker */}
          {selectedOrg ? (
            <div className="flex items-center gap-2 p-2 rounded-md bg-white border border-border">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm flex-1 truncate">{selectedOrg.legalName}</span>
              <button
                type="button"
                onClick={() => setSelectedOrg(null)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Changer
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={orgQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Rechercher une organisation…"
                className="w-full h-9 pl-9 pr-3 rounded-md border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                autoFocus
              />
              {orgResults.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full max-h-60 overflow-auto rounded-md border border-border bg-white shadow-lg divide-y divide-border">
                  {orgResults.map((o) => (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => { setSelectedOrg(o); setOrgResults([]); setOrgQuery(o.legalName); }}
                        className="w-full text-left p-2.5 hover:bg-primary-50/50 transition-colors"
                      >
                        <div className="text-sm font-medium truncate">{o.legalName}</div>
                        <div className="text-xs text-muted-foreground">
                          {o.legalForm} {o.siret && `· ${o.siret}`}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Role + isPrimary */}
          {selectedOrg && (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                  Rôle
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {SOLO_FORMS.includes(selectedOrg.legalForm) && role !== 'EI_SELF' && (
                  <p className="text-xs text-amber-700 mt-1.5">
                    💡 Cette organisation est en {selectedOrg.legalForm}. Le rôle <strong>EI_SELF</strong> serait probablement plus approprié.
                  </p>
                )}
              </div>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={makePrimary}
                  onChange={(e) => setMakePrimary(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                Marquer comme lien principal
              </label>

              {error && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="h-9 px-4 rounded-md text-sm font-medium border border-border hover:bg-muted/30"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={pending}
                  className="h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 disabled:opacity-50"
                >
                  {pending ? 'Création…' : 'Créer le lien'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
