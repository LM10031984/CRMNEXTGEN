import Link from 'next/link';
import { Megaphone, User, AlertCircle, CheckCircle2, Plus, Phone } from 'lucide-react';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { AutoAssignLeadsButton } from '@/components/leads/auto-assign-button';
import { ProgrammesEnAttenteButton } from '@/components/diagnostic/programmes-en-attente-button';
import { compterDiagnosticsEnAttente } from '@/lib/diagnostic/file-attente';
import { RappelsDuJour } from '@/components/diagnostic/rappels-du-jour';

export const dynamic = 'force-dynamic';
/**
 * Vercel Pro — le bouton « Envoyer les programmes en attente » est une server
 * action de cette page, et chaque programme demande ~30 s de génération.
 */
export const maxDuration = 300;

const fmtDate = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const STATUS_VARIANT: Record<
  string,
  'muted' | 'info' | 'warning' | 'success' | 'danger' | 'primary'
> = {
  NEW: 'muted',
  CONTACTED: 'info',
  QUALIFIED: 'info',
  PROPOSAL_SENT: 'warning',
  NEGOTIATION: 'primary',
  WON: 'success',
  LOST: 'danger',
  ON_HOLD: 'muted',
  TO_FOLLOWUP: 'warning',
};

const STATUS_LABEL: Record<string, string> = {
  NEW: 'Nouveau',
  CONTACTED: 'Contacté',
  QUALIFIED: 'Qualifié',
  PROPOSAL_SENT: 'Proposition',
  NEGOTIATION: 'Négo',
  WON: 'Gagné',
  LOST: 'Perdu',
  ON_HOLD: 'En attente',
  TO_FOLLOWUP: 'À relancer',
};

export default async function LeadsPage() {
  const { user } = await validateRequest();
  if (!user) return null;

  const [leads, commercials, statusCounts, diagnosticsEnAttente] = await Promise.all([
    prisma.lead.findMany({
      where: { tenantId: user.tenantId },
      include: {
        owner: { select: { firstName: true, lastName: true } },
        person: { select: { firstName: true, lastName: true } },
        interestedProduct: { select: { title: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    }),
    prisma.user.findMany({
      where: { tenantId: user.tenantId, role: 'COMMERCIAL' },
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.lead.groupBy({
      by: ['status'],
      where: { tenantId: user.tenantId },
      _count: { _all: true },
    }),
    compterDiagnosticsEnAttente(user.tenantId),
  ]);

  const counter = (status: string) =>
    statusCounts.find((c) => c.status === status)?._count._all ?? 0;

  const unassignedCount = leads.filter(
    (l) => !l.ownerUserId && l.status !== 'WON' && l.status !== 'LOST',
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        subtitle="Pipeline commercial · auto-assignation aux commerciaux disponibles."
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={'/app/leads/new' as any}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium"
            >
              <Plus className="h-4 w-4" />
              Nouveau lead
            </Link>
            <ProgrammesEnAttenteButton enAttente={diagnosticsEnAttente} />
            <AutoAssignLeadsButton unassignedCount={unassignedCount} />
          </div>
        }
      />

      {/* J+1 du stand — en TÊTE, avant le pipeline : c'est ce qu'on ouvre à 9 h. */}
      <RappelsDuJour leads={leads} />

      {commercials.length === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 inline-flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Aucun utilisateur n'a le rôle <strong>COMMERCIAL</strong>. L'auto-assignation
          ne pourra pas fonctionner — modifie les rôles dans les paramètres.
        </div>
      )}

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Nouveaux" value={counter('NEW')} variant="muted" />
        <Kpi
          label="En cours"
          value={
            counter('CONTACTED') +
            counter('QUALIFIED') +
            counter('PROPOSAL_SENT') +
            counter('NEGOTIATION')
          }
          variant="info"
        />
        <Kpi label="Gagnés" value={counter('WON')} variant="success" />
        <Kpi
          label="Non assignés"
          value={unassignedCount}
          variant={unassignedCount > 0 ? 'warning' : 'muted'}
        />
      </section>

      <section className="rounded-2xl border border-border bg-white overflow-hidden">
        {leads.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Megaphone className="h-10 w-10 text-muted-foreground mx-auto" />
            <h3 className="font-semibold">Aucun lead pour l'instant</h3>
            <p className="text-sm text-muted-foreground">
              Les leads apparaîtront ici (formulaire public, salon, recommandation, LinkedIn).
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  <Th>Statut</Th>
                  <Th>Contact</Th>
                  <Th>Dernière action</Th>
                  <Th>Source</Th>
                  <Th>Intérêt</Th>
                  <Th>Commercial</Th>
                  <Th>Créé le</Th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => {
                  const contactName = l.person
                    ? `${l.person.firstName} ${l.person.lastName}`.trim()
                    : `${l.firstName ?? ''} ${l.lastName ?? ''}`.trim() || '—';
                  return (
                    <tr
                      key={l.id}
                      className="border-b border-border last:border-0 hover:bg-muted/20"
                    >
                      <Td>
                        <Badge variant={STATUS_VARIANT[l.status] ?? 'muted'}>
                          {STATUS_LABEL[l.status] ?? l.status}
                        </Badge>
                      </Td>
                      <Td>
                        <Link
                          href={`/app/leads/${l.id}` as any}
                          className="font-medium text-primary hover:underline"
                        >
                          {contactName}
                        </Link>
                        {l.email && (
                          <div className="text-xs text-muted-foreground">{l.email}</div>
                        )}
                        {/* Le jeudi matin, cette liste est ouverte DEPUIS un
                            téléphone : l'appel doit partir en un tap. */}
                        {l.phone && (
                          <a
                            href={`tel:${l.phone.replace(/[^\d+]/g, '')}`}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-0.5"
                          >
                            <Phone className="h-3 w-3" />
                            {l.phone}
                          </a>
                        )}
                      </Td>
                      <Td>
                        <DerniereAction texte={l.lastAction} />
                      </Td>
                      <Td>{l.source ?? <span className="text-muted-foreground">—</span>}</Td>
                      <Td>
                        {l.interestedProduct?.title ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </Td>
                      <Td>
                        {l.owner ? (
                          <span className="inline-flex items-center gap-1.5 text-xs">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            {l.owner.firstName} {l.owner.lastName}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs text-amber-700">
                            <User className="h-3.5 w-3.5" />
                            Non assigné
                          </span>
                        )}
                      </Td>
                      <Td className="text-xs text-muted-foreground">
                        {fmtDate.format(l.createdAt)}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Colonne « Dernière action ».
 *
 * Les leads du diagnostic du stand y arrivent préfixés du niveau de priorité —
 * `[A] Diagnostic — … — rappel cette semaine` (cf. `lib/diagnostic/priorite.ts`).
 * On sort le niveau en pastille pour que le tri des rappels se fasse en balayant
 * la colonne, sans lire une ligne entière.
 */
function DerniereAction({ texte }: { texte: string | null }) {
  if (!texte) return <span className="text-muted-foreground">—</span>;

  const m = /^\[([ABC])\]\s*(.*)$/.exec(texte);
  if (!m) return <span className="text-xs">{texte}</span>;

  const niveau = m[1] as 'A' | 'B' | 'C';
  const couleur = {
    A: 'bg-red-100 text-red-800 border-red-200',
    B: 'bg-amber-100 text-amber-800 border-amber-200',
    C: 'bg-slate-100 text-slate-600 border-slate-200',
  }[niveau];

  return (
    <div className="flex items-start gap-1.5">
      <span
        title={
          niveau === 'A'
            ? 'À rappeler dès J+1'
            : niveau === 'B'
              ? 'À rappeler sous 2 à 3 jours'
              : 'Email seulement'
        }
        className={`shrink-0 h-5 w-5 rounded border inline-flex items-center justify-center text-[11px] font-bold ${couleur}`}
      >
        {niveau}
      </span>
      <span className="text-xs text-muted-foreground">{m[2]}</span>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2 text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-2.5 ${className ?? ''}`}>{children}</td>;
}

function Kpi({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant: 'muted' | 'info' | 'success' | 'warning';
}) {
  const cls: Record<string, string> = {
    muted: 'border-border bg-muted/30',
    info: 'border-blue-200 bg-blue-50',
    success: 'border-emerald-200 bg-emerald-50',
    warning: 'border-amber-200 bg-amber-50',
  };
  return (
    <div className={`rounded-xl border p-4 ${cls[variant]}`}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1 tabular-nums">{value}</div>
    </div>
  );
}
