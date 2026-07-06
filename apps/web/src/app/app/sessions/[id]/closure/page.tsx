import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft, Package, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { GenerateClosurePackButton } from '@/components/sessions/generate-closure-pack-button';

/**
 * Hub des batches "Pack fin de formation" d'une session.
 *
 * Cette page existe pour 2 raisons :
 *  - Fixer le 404 sur /app/sessions/[id]/closure (BUG-1)
 *  - Centraliser l'historique des batches au lieu de l'accumuler sur la fiche
 *    session principale (BUG-4)
 *
 * Affiche : derniers batches (dernier en exergue + anciens dans un collapsible)
 * + bouton "Lancer un nouveau pack".
 */
export default async function ClosureHubPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = await validateRequest();
  if (!user) return null;
  const { id: sessionId } = await params;

  const session = await prisma.trainingSession.findFirst({
    where: { id: sessionId, tenantId: user.tenantId },
    select: {
      id: true,
      code: true,
      name: true,
      product: { select: { title: true } },
      _count: { select: { participants: true } },
    },
  });
  if (!session) notFound();

  const batches = await prisma.closureBatch.findMany({
    where: { sessionId, tenantId: user.tenantId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      totalDocs: true,
      doneDocs: true,
      errorDocs: true,
      startedAt: true,
      completedAt: true,
      createdAt: true,
    },
  });

  const [latest, ...previous] = batches;

  return (
    <div className="space-y-6 max-w-5xl">
      <Link
        href={`/app/sessions/${sessionId}` as Route}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Retour à la session {session.code}
      </Link>

      <PageHeader
        title="Pack fin de formation"
        subtitle={
          <span className="text-sm text-muted-foreground">
            {session.product?.title ?? session.name ?? '(formation)'} — {session._count.participants} apprenant{session._count.participants > 1 ? 's' : ''}
          </span>
        }
        actions={
          <GenerateClosurePackButton
            sessionId={sessionId}
            participantCount={session._count.participants}
          />
        }
      />

      {batches.length === 0 ? (
        <section className="rounded-2xl border border-border bg-white p-8 text-center">
          <Package className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-1">
            Aucun pack généré pour cette session pour l&apos;instant.
          </p>
          <p className="text-xs text-muted-foreground">
            Lancez-en un via le bouton <strong>« Pack fin de formation »</strong> en
            tête de page.
          </p>
        </section>
      ) : (
        <>
          {latest && (
            <section className="space-y-3">
              <h2 className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                Dernier pack
              </h2>
              <BatchCard batch={latest} sessionId={sessionId} highlight />
            </section>
          )}

          {previous.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                Historique ({previous.length})
              </h2>
              <div className="space-y-2">
                {previous.map((batch) => (
                  <BatchCard key={batch.id} batch={batch} sessionId={sessionId} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function BatchCard({
  batch,
  sessionId,
  highlight = false,
}: {
  batch: {
    id: string;
    status: string;
    totalDocs: number;
    doneDocs: number;
    errorDocs: number;
    createdAt: Date;
  };
  sessionId: string;
  highlight?: boolean;
}) {
  const dateFmt = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  const statusMeta = {
    PENDING: { label: 'En attente', color: 'text-muted-foreground', Icon: Loader2 },
    RUNNING: { label: 'En cours', color: 'text-blue-600', Icon: Loader2 },
    COMPLETED: { label: 'Terminé', color: 'text-green-600', Icon: CheckCircle2 },
    FAILED: { label: 'Échec', color: 'text-red-600', Icon: AlertCircle },
    PARTIAL: { label: 'Partiel', color: 'text-orange-600', Icon: AlertCircle },
  }[batch.status] ?? { label: batch.status, color: 'text-muted-foreground', Icon: Package };

  const Icon = statusMeta.Icon;
  const isRunning = batch.status === 'RUNNING' || batch.status === 'PENDING';

  return (
    <Link
      href={`/app/sessions/${sessionId}/closure/${batch.id}` as Route}
      className={`block rounded-xl border p-4 transition-colors hover:bg-muted/50 ${
        highlight ? 'border-primary/40 bg-primary-50/30' : 'border-border bg-white'
      }`}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Icon className={`h-5 w-5 ${statusMeta.color} ${isRunning ? 'animate-spin' : ''}`} />
          <div>
            <div className={`text-sm font-semibold ${statusMeta.color}`}>
              {statusMeta.label}
            </div>
            <div className="text-xs text-muted-foreground">
              {dateFmt.format(batch.createdAt)} · batch{' '}
              <code className="font-mono">{batch.id.slice(0, 8)}</code>
            </div>
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          {batch.doneDocs} / {batch.totalDocs} docs
          {batch.errorDocs > 0 && (
            <span className="ml-2 text-red-600">· {batch.errorDocs} erreur{batch.errorDocs > 1 ? 's' : ''}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
