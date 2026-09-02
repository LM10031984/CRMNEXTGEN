import Link from 'next/link';
import type { Route } from 'next';
import { Plus, Stethoscope } from 'lucide-react';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';

/**
 * Liste des diagnostics d'agence R1.
 *
 * À ne pas confondre avec `/diagnostic` (public, express 8 questions du stand
 * MLS) : ici on est dans le back-office, sur le R1 commercial complet.
 */
export const dynamic = 'force-dynamic';

const STATUS_META = {
  EN_COURS: { label: 'En cours', variant: 'info' as const },
  TERMINE: { label: 'Terminé', variant: 'success' as const },
  ARCHIVE: { label: 'Archivé', variant: 'muted' as const },
};

const VARIANT_LABEL = { LEGER: 'Léger', COMPLET: 'Complet' };

export default async function DiagnosticsPage() {
  const { user } = await validateRequest();
  if (!user) return null;

  const diagnostics = await prisma.diagnostic.findMany({
    where: { tenantId: user.tenantId },
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    select: {
      id: true,
      reference: true,
      variant: true,
      status: true,
      meetingAt: true,
      r2PlannedAt: true,
      updatedAt: true,
      lead: { select: { firstName: true, lastName: true, notes: true } },
      organization: { select: { legalName: true } },
      owner: { select: { firstName: true, lastName: true } },
      _count: { select: { answers: true, participants: true } },
    },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Diagnostics d’agence"
        subtitle="Le rendez-vous R1 : questionnaire, grille équipe, potentiel de financement."
        actions={
          <Link
            href={'/app/diagnostics/nouveau' as Route}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-primary bg-primary/10 text-sm font-medium hover:bg-primary/20"
          >
            <Plus className="h-4 w-4" />
            Nouveau diagnostic
          </Link>
        }
      />

      {diagnostics.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <Stethoscope className="h-7 w-7 mx-auto mb-3 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Aucun diagnostic pour l’instant. Le diagnostic léger se boucle en une trentaine de
            minutes et produit la synthèse de financement à montrer au dirigeant.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {diagnostics.map((d) => {
            const agence =
              d.organization?.legalName ??
              d.lead.notes?.replace(/^Agence\s*:\s*/, '') ??
              [d.lead.firstName, d.lead.lastName].filter(Boolean).join(' ') ??
              'Agence sans nom';
            const status = STATUS_META[d.status];
            return (
              <li key={d.id}>
                <Link
                  href={`/app/diagnostics/${d.id}` as Route}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-muted/50"
                >
                  <span className="font-mono text-xs text-muted-foreground w-24 shrink-0">
                    {d.reference}
                  </span>
                  <span className="font-medium min-w-0 flex-1 truncate">{agence}</span>
                  <Badge variant={status.variant}>{status.label}</Badge>
                  <span className="text-xs text-muted-foreground">{VARIANT_LABEL[d.variant]}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {d._count.answers} rép. · {d._count.participants} pers.
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {d.meetingAt
                      ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' }).format(d.meetingAt)
                      : '—'}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
