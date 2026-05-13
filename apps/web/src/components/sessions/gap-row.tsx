'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Check, X, Briefcase, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { addParticipant } from '@/server/actions/sessions';
import { ignoreMissingParticipant, type SessionGap } from '@/server/actions/session-gaps';
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

export function GapRow({ gap }: { gap: SessionGap }) {
  const [open, setOpen] = useState(false);
  const [resolved, setResolved] = useState<Set<string>>(new Set());

  return (
    <div className="rounded-2xl border border-border bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors text-left"
      >
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        <Badge variant="muted" className="font-mono">{gap.sessionCode}</Badge>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{gap.sessionName ?? '(sans nom)'}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {new Date(gap.startDate).toLocaleDateString('fr-FR')} ·{' '}
            {gap.registeredCount}/{gap.expectedCount} inscrits
          </div>
        </div>
        <Badge variant="warning" className="shrink-0">
          {Math.max(0, gap.missing.length - resolved.size)} à compléter
        </Badge>
        <Link
          href={`/app/sessions/${gap.sessionId}`}
          onClick={(e) => e.stopPropagation()}
          className="text-xs text-primary hover:underline shrink-0"
        >
          Voir →
        </Link>
      </button>

      {open && (
        <ul className="border-t border-border divide-y divide-border bg-muted/10">
          {gap.missing.map((m) => (
            <MissingRow
              key={m.rawName}
              sessionId={gap.sessionId}
              rawName={m.rawName}
              candidates={m.candidates}
              defaultPrice={gap.unmatchedSponsorBudget}
              done={resolved.has(m.rawName)}
              onResolved={() => {
                setResolved((s) => new Set([...s, m.rawName]));
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface MissingRowProps {
  sessionId: string;
  rawName: string;
  candidates: SessionGap['missing'][number]['candidates'];
  defaultPrice: number;
  done: boolean;
  onResolved: () => void;
}

function MissingRow({ sessionId, rawName, candidates, defaultPrice, done, onResolved }: MissingRowProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Si le candidat top a >=2 LegalLinks, on doit choisir lequel
  const [pickedCandidate, setPickedCandidate] = useState<typeof candidates[number] | null>(null);

  if (done) {
    return (
      <li className="p-4 flex items-center gap-3 text-sm text-emerald-700 bg-emerald-50/50">
        <Check className="h-4 w-4" />
        <span className="font-medium">{rawName}</span>
        <span className="text-xs text-emerald-600">— inscrit ✓</span>
      </li>
    );
  }

  function inscribe(personId: string, sponsorOrgId: string) {
    setError(null);
    startTransition(async () => {
      const res = await addParticipant({
        sessionId,
        personId,
        sponsorOrgId,
        priceHT: defaultPrice,
      });
      if (res.ok) {
        onResolved();
      } else {
        setError(res.error);
      }
    });
  }

  function ignore() {
    if (!confirm(`Ignorer définitivement « ${rawName} » sur cette session ?`)) return;
    startTransition(async () => {
      await ignoreMissingParticipant({ sessionId, rawName });
      onResolved();
    });
  }

  return (
    <li className="p-4 space-y-3">
      <div className="flex items-center gap-3">
        <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
        <div className="flex-1">
          <div className="text-sm font-medium">{rawName}</div>
          <div className="text-xs text-muted-foreground">
            Apprenant cité dans l'Excel mais non inscrit en base.
          </div>
        </div>
        <button
          type="button"
          onClick={ignore}
          disabled={pending}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Ignorer
        </button>
      </div>

      {/* Si on a sélectionné un candidat avec multi-casquettes, montre le sélecteur d'org */}
      {pickedCandidate && pickedCandidate.legalLinks.length >= 2 ? (
        <div className="ml-7 space-y-1.5">
          <div className="text-xs font-medium">
            Quelle organisation paye pour {pickedCandidate.firstName} {pickedCandidate.lastName} ?
          </div>
          {pickedCandidate.legalLinks.map((link) => {
            const isEi = SOLO_FORMS.includes(link.organization.legalForm);
            return (
              <button
                key={link.id}
                type="button"
                disabled={pending}
                onClick={() => inscribe(pickedCandidate.id, link.organization.id)}
                className="w-full flex items-center gap-2 p-2.5 rounded-md border border-border bg-white hover:border-primary hover:shadow-sm transition-all text-left text-sm"
              >
                <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="flex-1 truncate">{link.organization.legalName}</span>
                <Badge variant={isEi ? 'primary' : 'muted'}>
                  {isEi ? 'EI' : ROLE_LABELS[link.role] ?? link.role}
                </Badge>
                {link.organization.opcoCode && <Badge variant="info">{formatFunderCode(link.organization.opcoCode)}</Badge>}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setPickedCandidate(null)}
            className="text-xs text-muted-foreground hover:text-foreground mt-1"
          >
            ← Choisir un autre apprenant
          </button>
        </div>
      ) : (
        <div className="ml-7 space-y-1.5">
          {candidates.length === 0 ? (
            <div className="text-xs text-muted-foreground italic">
              Aucun candidat trouvé. Vérifie qu'il existe dans la base apprenants.
            </div>
          ) : (
            candidates.map((c) => {
              const noLinks = c.legalLinks.length === 0;
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={pending || noLinks}
                  onClick={() => {
                    if (c.legalLinks.length === 1) {
                      inscribe(c.id, c.legalLinks[0]!.organization.id);
                    } else {
                      setPickedCandidate(c);
                    }
                  }}
                  className="w-full flex items-center gap-2 p-2.5 rounded-md border border-border bg-white hover:border-primary hover:shadow-sm transition-all text-left text-sm disabled:opacity-50"
                  title={noLinks ? 'Aucune organisation rattachée à cet apprenant' : ''}
                >
                  <span className="flex-1 truncate">
                    <span className="font-medium">{c.firstName} {c.lastName.toUpperCase()}</span>
                    {c.email && <span className="text-xs text-muted-foreground ml-2">{c.email}</span>}
                  </span>
                  {c.legalLinks.length === 0 && <Badge variant="warning" className="shrink-0">pas d'org</Badge>}
                  {c.legalLinks.length === 1 && (
                    <Badge variant={SOLO_FORMS.includes(c.legalLinks[0]!.organization.legalForm) ? 'primary' : 'muted'} className="shrink-0 max-w-[200px] truncate">
                      {c.legalLinks[0]!.organization.legalName.substring(0, 28)}
                    </Badge>
                  )}
                  {c.legalLinks.length >= 2 && <Badge variant="primary" className="shrink-0">multi</Badge>}
                </button>
              );
            })
          )}
        </div>
      )}

      {error && <div className="text-xs text-red-600 ml-7">{error}</div>}
    </li>
  );
}
