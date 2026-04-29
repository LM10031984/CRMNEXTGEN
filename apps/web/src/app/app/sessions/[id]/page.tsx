import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Calendar, Clock, Euro, Users, Briefcase } from 'lucide-react';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { GenerateProgrammeButton } from '@/components/sessions/generate-programme-button';
import { GenerateAgeficeButton } from '@/components/sessions/generate-agefice-button';
import { CreateInvoiceButton } from '@/components/invoices/create-invoice-button';
import { AddParticipantDialog } from '@/components/sessions/add-participant-dialog';

const STATUS_LABELS: Record<string, { label: string; variant: 'success' | 'info' | 'warning' | 'muted' | 'danger' | 'primary' }> = {
  DRAFT: { label: 'Brouillon', variant: 'muted' },
  PLANNED: { label: 'Planifiée', variant: 'info' },
  OPEN: { label: 'Ouverte', variant: 'info' },
  VALIDATED: { label: 'Validée', variant: 'success' },
  IN_PROGRESS: { label: 'En cours', variant: 'primary' },
  COMPLETED: { label: 'Terminée', variant: 'success' },
  CANCELLED: { label: 'Annulée', variant: 'danger' },
};

const SOLO_FORMS = ['EI', 'EIRL', 'AUTO_ENTREPRENEUR'];

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await validateRequest();
  if (!user) return null;
  const { id } = await params;

  const session = await prisma.trainingSession.findFirst({
    where: { id, tenantId: user.tenantId },
    include: {
      product: true,
      participants: {
        orderBy: [{ person: { lastName: 'asc' } }, { person: { firstName: 'asc' } }],
        include: {
          person: { select: { id: true, firstName: true, lastName: true } },
          sponsorOrg: { select: { id: true, legalName: true, legalForm: true, opcoCode: true } },
        },
      },
    },
  });
  if (!session) notFound();

  const statusInfo = STATUS_LABELS[session.status] ?? { label: session.status, variant: 'muted' as const };
  const eiCount = session.participants.filter((p) => SOLO_FORMS.includes(p.sponsorOrg.legalForm)).length;
  const start = new Date(session.startDate);
  const end = new Date(session.endDate);

  return (
    <div className="space-y-6 max-w-5xl">
      <Link
        href="/app/sessions"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Retour aux sessions
      </Link>

      <PageHeader
        title={session.name ?? '(session sans nom)'}
        subtitle={
          <span className="flex flex-wrap items-center gap-2 mt-1">
            <Badge variant="muted" className="font-mono">{session.code}</Badge>
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              {start.toLocaleDateString('fr-FR')} → {end.toLocaleDateString('fr-FR')}
            </span>
            {session.product?.durationHours ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> {session.product.durationHours}h
              </span>
            ) : null}
            {Number(session.pricePerLearner ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Euro className="h-3.5 w-3.5" /> {Number(session.pricePerLearner).toFixed(0)} € / apprenant
              </span>
            )}
          </span>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="rounded-2xl border border-border bg-white overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-border gap-3">
              <h2 className="font-semibold inline-flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" /> Inscrits ({session.participants.length})
              </h2>
              <div className="flex items-center gap-2">
                {eiCount > 0 && (
                  <Badge variant="primary">
                    {eiCount} en EI / Auto-entrepreneur
                  </Badge>
                )}
                <AddParticipantDialog
                  sessionId={session.id}
                  defaultPrice={Number(session.pricePerLearner ?? 0)}
                  excludePersonIds={session.participants.map((p) => p.personId)}
                />
              </div>
            </div>
            {session.participants.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Aucun apprenant inscrit. Probablement non matché à l'import (homonymie ou nom tronqué dans l'export Excel).
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {session.participants.map((p) => {
                  const isEi = SOLO_FORMS.includes(p.sponsorOrg.legalForm);
                  return (
                    <li key={p.id} className="p-4 hover:bg-muted/30 transition-colors">
                      <div className="flex items-start gap-3">
                        <div className="h-9 w-9 rounded-full bg-primary-100 text-primary-700 inline-flex items-center justify-center font-semibold text-xs shrink-0">
                          {p.person.firstName.charAt(0)}{p.person.lastName.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <Link
                            href={`/app/apprenants/${p.person.id}`}
                            className="font-medium hover:text-primary transition-colors"
                          >
                            {p.person.firstName} {p.person.lastName.toUpperCase()}
                          </Link>
                          <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-2">
                            <Briefcase className="h-3 w-3" />
                            <span className="text-muted-foreground">Sponsor :</span>
                            <Link
                              href={`/app/organisations/${p.sponsorOrg.id}`}
                              className="text-foreground font-medium hover:text-primary"
                            >
                              {p.sponsorOrg.legalName}
                            </Link>
                            <Badge variant={isEi ? 'primary' : 'muted'}>
                              {isEi ? 'EI / Auto-entr.' : p.sponsorOrg.legalForm}
                            </Badge>
                            {p.sponsorOrg.opcoCode && (
                              <Badge variant="info">OPCO {p.sponsorOrg.opcoCode}</Badge>
                            )}
                          </div>
                        </div>
                        <div className="text-right text-sm shrink-0">
                          {Number(p.priceHT) > 0 && (
                            <div className="font-medium tabular-nums">{Number(p.priceHT).toFixed(0)} €</div>
                          )}
                          <div className="text-xs text-muted-foreground">{p.enrollmentStatus}</div>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 ml-12">
                        <GenerateProgrammeButton participantId={p.id} />
                        {(isEi || p.sponsorOrg.opcoCode === 'AGEFICE') && (
                          <GenerateAgeficeButton participantId={p.id} />
                        )}
                        <CreateInvoiceButton participantId={p.id} alreadyInvoiced={p.invoiceSent} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-white p-6">
            <h2 className="font-semibold mb-4 text-sm uppercase tracking-wide text-muted-foreground">
              Produit de formation
            </h2>
            {session.product ? (
              <Link
                href={`/app/produits/${session.product.id}`}
                className="block p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"
              >
                <div className="font-medium">{session.product.title}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  <Badge variant="muted" className="font-mono mr-2">{session.product.code}</Badge>
                  {session.product.durationHours}h · {session.product.modality}
                </div>
              </Link>
            ) : (
              <p className="text-sm text-muted-foreground italic">—</p>
            )}
          </section>

          {session.internalNotes && (
            <section className="rounded-2xl border border-border bg-white p-6">
              <h2 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">
                Notes internes
              </h2>
              <p className="text-xs text-muted-foreground whitespace-pre-line">
                {session.internalNotes}
              </p>
            </section>
          )}

          <section className="rounded-2xl border border-dashed border-border bg-muted/30 p-5 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground mb-1.5">Bientôt disponible :</p>
            <ul className="space-y-0.5 list-disc pl-4">
              <li>Wizard création/édition de session (palier 2.3)</li>
              <li>Génération en 1 clic du pack docs fin-de-formation (palier 4)</li>
              <li>Bouton AGEFICE pour les inscrits EI éligibles (palier 3)</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
