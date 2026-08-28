'use client';

/**
 * Liste des demandes d'inscription reçues par le lien public, sur la fiche
 * session (spec 2026-08-28).
 *
 * « Valider et inscrire » enchaîne conversion en apprenant + création du
 * SessionParticipant. Si le payeur ne peut pas être déterminé sans ambiguïté
 * (salarié dont l'entreprise est inconnue), la ligne bascule sur un sélecteur
 * d'organisation au lieu de créer un doublon.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { UserCheck, Loader2, FileText, CreditCard, Building2, ExternalLink, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { enrollFromRequest } from '@/server/actions/enroll-from-request';
import { searchOrganizations } from '@/server/actions/legal-links';

export interface EnrollmentRequestRow {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  status: string;
  submittedAt: Date | null;
  companyName: string | null;
  professionalStatus: string | null;
  hasCni: boolean;
  hasCniVerso: boolean;
  hasRib: boolean;
  hasCfp: boolean;
}

const LIBELLE_STATUT: Record<string, { texte: string; classe: string }> = {
  SUBMITTED: { texte: 'Reçue', classe: 'bg-blue-50 text-blue-700' },
  EXTRACTING: { texte: 'Lecture en cours', classe: 'bg-amber-50 text-amber-700' },
  EXTRACTED: { texte: 'À valider', classe: 'bg-emerald-50 text-emerald-700' },
  VALIDATED: { texte: 'Validée', classe: 'bg-emerald-50 text-emerald-700' },
  CONVERTED: { texte: 'Inscrite', classe: 'bg-muted text-muted-foreground' },
  REJECTED: { texte: 'Rejetée', classe: 'bg-red-50 text-red-700' },
  PENDING_FORM: { texte: 'En attente', classe: 'bg-muted text-muted-foreground' },
  EXPIRED: { texte: 'Expirée', classe: 'bg-muted text-muted-foreground' },
};

export function SessionEnrollmentRequests({
  requests,
  canWrite,
}: {
  requests: EnrollmentRequestRow[];
  canWrite: boolean;
}) {
  if (requests.length === 0) return null;

  const aTraiter = requests.filter((r) => r.status !== 'CONVERTED' && r.status !== 'REJECTED');

  return (
    <section className="rounded-2xl border border-border bg-white p-5 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-semibold text-base inline-flex items-center gap-2">
          <UserCheck className="h-4 w-4 text-primary" /> Demandes d'inscription
        </h2>
        {aTraiter.length > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-50 text-amber-700">
            {aTraiter.length} à traiter
          </span>
        )}
      </div>

      <div className="divide-y divide-border">
        {requests.map((r) => (
          <LigneDemande key={r.id} demande={r} canWrite={canWrite} />
        ))}
      </div>
    </section>
  );
}

function LigneDemande({
  demande,
  canWrite,
}: {
  demande: EnrollmentRequestRow;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [besoinPayeur, setBesoinPayeur] = useState<string | null>(null);
  const [recherche, setRecherche] = useState('');
  const [resultats, setResultats] = useState<Array<{ id: string; legalName: string }>>([]);

  const statut = LIBELLE_STATUT[demande.status] ?? {
    texte: demande.status,
    classe: 'bg-muted text-muted-foreground',
  };
  const nom = [demande.firstName, demande.lastName].filter(Boolean).join(' ') || '(sans nom)';
  const dejaTraitee = demande.status === 'CONVERTED' || demande.status === 'REJECTED';

  function valider(overrideSponsorOrgId?: string) {
    startTransition(async () => {
      const r = await enrollFromRequest({ preEnrollmentId: demande.id, overrideSponsorOrgId });
      if (r.ok) {
        toast.success(`${nom} inscrit à la session`);
        setBesoinPayeur(null);
        router.refresh();
        return;
      }
      if (r.needsSponsor) {
        setBesoinPayeur(r.error);
        toast.warning('Payeur à confirmer');
        return;
      }
      toast.error(r.error);
    });
  }

  function chercher(q: string) {
    setRecherche(q);
    if (q.trim().length < 2) return void setResultats([]);
    startTransition(async () => {
      const orgs = await searchOrganizations(q.trim());
      setResultats(orgs.map((o: any) => ({ id: o.id, legalName: o.legalName })));
    });
  }

  return (
    <div className="py-3 space-y-2">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{nom}</span>
            <span className={cn('text-[11px] px-2 py-0.5 rounded-full font-medium', statut.classe)}>
              {statut.texte}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {demande.email}
            {demande.companyName && ` · ${demande.companyName}`}
            {demande.submittedAt &&
              ` · déposée le ${demande.submittedAt.toLocaleDateString('fr-FR')}`}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <Piece
              ok={demande.hasCni}
              label={demande.hasCniVerso ? 'CNI R/V' : 'CNI'}
              icon={CreditCard}
            />
            <Piece ok={demande.hasRib} label="RIB" icon={Building2} />
            <Piece ok={demande.hasCfp} label="CFP" icon={FileText} />
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <a
            href={`/app/inscriptions/${demande.id}`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Détail <ExternalLink className="h-3 w-3" />
          </a>
          {canWrite && !dejaTraitee && (
            <button
              type="button"
              onClick={() => valider()}
              disabled={pending}
              className={cn(
                'inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700',
                pending && 'opacity-70 cursor-wait',
              )}
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
              Valider et inscrire
            </button>
          )}
        </div>
      </div>

      {besoinPayeur && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
          <p className="text-xs text-amber-900 inline-flex items-start gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            {besoinPayeur} — choisis l'organisation qui paye cette formation.
          </p>
          <input
            type="text"
            value={recherche}
            onChange={(e) => chercher(e.target.value)}
            placeholder="Rechercher une entreprise (nom ou SIRET)…"
            className="w-full h-9 px-3 rounded-md border border-input text-xs"
          />
          {resultats.length > 0 && (
            <ul className="max-h-40 overflow-y-auto divide-y divide-amber-200 rounded-md border border-amber-200 bg-white">
              {resultats.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => valider(o.id)}
                    disabled={pending}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-amber-50"
                  >
                    {o.legalName}
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

function Piece({
  ok,
  label,
  icon: Icon,
}: {
  ok: boolean;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded',
        ok ? 'bg-emerald-50 text-emerald-700' : 'bg-muted text-muted-foreground line-through',
      )}
    >
      <Icon className="h-3 w-3" /> {label}
    </span>
  );
}
