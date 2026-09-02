import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { ArrowRight, Stethoscope } from 'lucide-react';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { computeProgress } from '@/lib/diagnostic-r1/progress';
import { DiagnosticActions } from '@/components/diagnostic-r1/diagnostic-actions';
import { AuditPanel } from '@/components/diagnostic-r1/audit-panel';
import { getAuditFreshness } from '@/server/actions/diagnostic-audit';

/**
 * Fiche d'un diagnostic — le point d'entrée et de reprise.
 *
 * Un diagnostic EN_COURS ouvert depuis la liste emmène directement au premier
 * chapitre incomplet : reprendre un R1 ne doit jamais faire re-défiler ce qui
 * est déjà répondu (spec §6.3).
 */
export const dynamic = 'force-dynamic';

export default async function DiagnosticPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vue?: string }>;
}) {
  const { user } = await validateRequest();
  if (!user) return null;
  const { id } = await params;
  const { vue } = await searchParams;

  const diagnostic = await prisma.diagnostic.findFirst({
    where: { id, tenantId: user.tenantId },
    select: {
      id: true,
      reference: true,
      variant: true,
      status: true,
      meetingAt: true,
      r2PlannedAt: true,
      referentialVersion: true,
      lead: { select: { id: true, firstName: true, lastName: true, notes: true } },
      organization: { select: { legalName: true } },
      owner: { select: { firstName: true, lastName: true } },
      answers: { select: { questionId: true, value: true, isSkipped: true } },
      _count: { select: { participants: true } },
    },
  });
  if (!diagnostic) notFound();

  const progress = computeProgress(
    diagnostic.variant,
    diagnostic.answers.map((a) => ({
      questionId: a.questionId,
      value: a.value,
      isSkipped: a.isSkipped,
    })),
    diagnostic._count.participants,
  );

  // Reprise directe : on n'affiche le récapitulatif que si on le demande
  // explicitement, ou si le diagnostic est terminé.
  const resume = progress.firstIncompleteChapter ?? 1;
  if (vue !== 'recap' && diagnostic.status === 'EN_COURS') {
    redirect(`/app/diagnostics/${id}/chapitre/${resume}`);
  }

  const freshness = await getAuditFreshness(id);
  const audit = freshness.ok
    ? (freshness.data ?? { hasDocument: false, isStale: false, documentId: null })
    : { hasDocument: false, isStale: false, documentId: null };

  const agence =
    diagnostic.organization?.legalName ??
    diagnostic.lead.notes?.replace(/^Agence\s*:\s*/, '') ??
    [diagnostic.lead.firstName, diagnostic.lead.lastName].filter(Boolean).join(' ');

  return (
    <div className="space-y-6">
      <PageHeader
        title={agence || diagnostic.reference}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{diagnostic.reference}</span>
            <Badge variant={diagnostic.status === 'TERMINE' ? 'success' : 'info'}>
              {diagnostic.status === 'TERMINE' ? 'Terminé' : 'En cours'}
            </Badge>
            <span>Diagnostic {diagnostic.variant === 'LEGER' ? 'léger' : 'complet'}</span>
            <span>· référentiel {diagnostic.referentialVersion}</span>
          </span>
        }
        actions={
          <Link
            href={`/app/diagnostics/${id}/chapitre/${resume}` as Route}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-primary bg-primary/10 text-sm font-medium hover:bg-primary/20"
          >
            {progress.answeredCount === 0 ? 'Commencer' : 'Reprendre'}
            <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Progression"
          value={`${progress.percent} %`}
          hint={`${progress.answeredCount}/${progress.visibleCount} réponses`}
        />
        <Stat label="Équipe saisie" value={`${diagnostic._count.participants}`} hint="fiches" />
        <Stat
          label="Rendez-vous"
          value={
            diagnostic.meetingAt
              ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(
                  diagnostic.meetingAt,
                )
              : '—'
          }
          hint={
            diagnostic.r2PlannedAt
              ? `R2 le ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' }).format(diagnostic.r2PlannedAt)}`
              : 'R2 non planifié'
          }
        />
      </div>

      <section className="rounded-lg border border-border">
        <header className="px-4 py-3 border-b border-border bg-muted/50">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Stethoscope className="h-4 w-4" aria-hidden />
            Les chapitres
          </h2>
        </header>
        <ul className="divide-y divide-border">
          {progress.chapters.map((c) => (
            <li key={c.chapter}>
              <Link
                href={`/app/diagnostics/${id}/chapitre/${c.chapter}` as Route}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50"
              >
                <span className="text-xs text-muted-foreground w-5 tabular-nums">{c.chapter}</span>
                <span className="flex-1 min-w-0 truncate text-sm">{c.title}</span>
                {c.missingRequired.length > 0 && (
                  <span className="text-[11px] text-amber-700 dark:text-amber-400">
                    {c.missingRequired.length} obligatoire(s)
                  </span>
                )}
                <span className="text-xs text-muted-foreground tabular-nums w-14 text-right">
                  {c.answeredCount}/{c.visibleCount}
                </span>
                <span className={`h-1.5 w-16 rounded-full overflow-hidden bg-muted`} aria-hidden>
                  <span
                    className={`block h-full ${c.isComplete ? 'bg-emerald-500' : 'bg-primary'}`}
                    style={{ width: `${c.percent}%` }}
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <AuditPanel
        diagnosticId={id}
        hasDocument={audit.hasDocument}
        isStale={audit.isStale}
        documentId={audit.documentId}
        answersCount={diagnostic.answers.length}
      />

      <DiagnosticActions
        diagnosticId={id}
        variant={diagnostic.variant}
        status={diagnostic.status}
        isComplete={progress.isComplete}
      />
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
