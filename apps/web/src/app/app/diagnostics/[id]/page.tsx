import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { ArrowRight, FileText, Stethoscope, Users2 } from 'lucide-react';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { computeProgress } from '@/lib/diagnostic-r1/progress';
import { describeMissingRequired } from '@/lib/diagnostic-r1/finish';
import { computePipeline } from '@/lib/diagnostic-r1/pipeline';
import { computeFunding } from '@/lib/financement/funding-engine';
import { loadFundingRules } from '@/lib/financement/load-rules';
import { resolveEmployeeCount } from '@/lib/diagnostic-r1/snapshot';
import { FundingSynthesisPanel } from '@/components/diagnostic-r1/funding-synthesis';
import { PipelineSynthesisPanel } from '@/components/diagnostic-r1/pipeline-synthesis';
import { DiagnosticActions } from '@/components/diagnostic-r1/diagnostic-actions';
import { AuditPanel } from '@/components/diagnostic-r1/audit-panel';
import { getAuditFreshness } from '@/server/actions/diagnostic-audit';
import { ProposalPanel } from '@/components/proposition/proposal-panel';
import { ProposalPricingSchema } from '@qualiof/shared';
import { computePricing } from '@/lib/proposition/pricing';

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
      organizationId: true,
      organization: { select: { legalName: true } },
      // D-22 — la campagne s'ouvre depuis ici, et une seule par diagnostic
      // (`diagnosticId` est unique) : si elle existe déjà, on y renvoie.
      enrollmentBatch: { select: { id: true } },
      owner: { select: { firstName: true, lastName: true } },
      answers: {
        select: {
          questionId: true,
          value: true,
          isSkipped: true,
          origin: true,
          confirmedAt: true,
        },
      },
      participants: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          statut: true,
          caN1: true,
          opcoEligible: true,
          trainings24mFunded: true,
          includedInProposal: true,
        },
      },
      _count: { select: { participants: true } },
    },
  });
  if (!diagnostic) notFound();

  // Deux lectures des mêmes réponses, et la nuance est tout le lot C :
  //   • la PROGRESSION compte tout ce qui est servi, extraction comprise — le
  //     champ est rempli à l'écran, dire le contraire serait faux ;
  //   • les CALCULS (financement, pipeline) ne prennent que le confirmé : ce
  //     sont les chiffres qu'on montre au dirigeant en rendez-vous.
  const estConfirmee = (a: { origin: string; confirmedAt: Date | null }) =>
    a.origin === 'COMMERCIAL' || a.confirmedAt !== null;
  const reponsesConfirmees = diagnostic.answers.filter(estConfirmee);
  const aRelire = diagnostic.answers.length - reponsesConfirmees.length;

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
    // Un pré-remplissage en attente passe devant la saisie : la tâche du
    // moment n'est pas de répondre, c'est de relire (§6.4 — « on ne défile
    // plus jamais 69 écrans »). `?vue=recap` reste la porte de sortie.
    redirect(
      aRelire > 0
        ? `/app/diagnostics/${id}/transcript`
        : `/app/diagnostics/${id}/chapitre/${resume}`,
    );
  }

  // Les synthèses du récapitulatif : mêmes moteurs purs qu'en saisie, mêmes
  // chiffres. C'est ce que le commercial vient de voir à l'écran, il ne doit
  // pas découvrir autre chose en arrivant ici.
  const { values: rules } = await loadFundingRules(user.tenantId);
  const answerMap = Object.fromEntries(
    reponsesConfirmees.filter((a) => !a.isSkipped).map((a) => [a.questionId, a.value]),
  );
  const engineParticipants = diagnostic.participants.map((p) => ({
    id: p.id,
    statut: p.statut,
    caN1: p.caN1 === null ? null : Number(p.caN1),
    cfpEligibleBudget: null,
    opcoEligible: p.opcoEligible,
    consumedThisYear: null,
    trainings24mFunded: p.trainings24mFunded === null ? null : Number(p.trainings24mFunded),
    includedInProposal: p.includedInProposal,
  }));
  const funding = computeFunding({
    rules,
    participants: engineParticipants,
    employeeCount: resolveEmployeeCount(answerMap, engineParticipants),
    companyOpcoConsumed: null,
    modality: 'PRESENTIEL',
    fundingType: 'COEUR_METIER',
  });
  const pipeline = computePipeline({ answers: answerMap });

  const missingByChapter = progress.chapters.filter((c) => c.missingRequired.length > 0);
  const missingCount = missingByChapter.reduce((s, c) => s + c.missingRequired.length, 0);

  const proposals = await prisma.proposal.findMany({
    where: { tenantId: user.tenantId, diagnosticId: id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, reference: true, status: true, pricingJson: true },
  });

  const freshness = await getAuditFreshness(id);
  const audit = freshness.ok
    ? (freshness.data ?? { hasDocument: false, freshness: 'unknown' as const, documentId: null })
    : { hasDocument: false, freshness: 'unknown' as const, documentId: null };

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
          <div className="flex flex-wrap items-center gap-2">
            {/*
              Le chemin qui manquait (relecture du 10/09/2026) : rien ne menait
              du diagnostic à sa campagne, si bien que toutes naissaient sans
              client. Il ne s'affiche pas tant qu'aucune agence n'est rattachée
              au diagnostic — une campagne sans agence n'existe plus (D-22).
            */}
            {diagnostic.organizationId ? (
              <Link
                href={
                  (diagnostic.enrollmentBatch
                    ? `/app/campagnes/${diagnostic.enrollmentBatch.id}`
                    : `/app/campagnes/nouvelle?diagnostic=${id}`) as Route
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm font-medium hover:bg-slate-50"
              >
                <Users2 className="h-4 w-4" />
                {diagnostic.enrollmentBatch
                  ? 'Voir les pré-inscriptions'
                  : 'Organiser les pré-inscriptions'}
              </Link>
            ) : null}
            <Link
              href={`/app/diagnostics/${id}/transcript` as Route}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm font-medium hover:bg-slate-50"
            >
              <FileText className="h-4 w-4" />
              Compte rendu
            </Link>
            <Link
              href={`/app/diagnostics/${id}/chapitre/${resume}` as Route}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-primary bg-primary/10 text-sm font-medium hover:bg-primary/20"
            >
              {progress.answeredCount === 0 ? 'Commencer' : 'Reprendre'}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        }
      />

      {aRelire > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-800 dark:bg-amber-950/40">
          <span>
            <strong>
              {aRelire} réponse{aRelire > 1 ? 's' : ''}
            </strong>{' '}
            {aRelire > 1 ? 'sont issues' : 'est issue'} du compte rendu et {aRelire > 1 ? 'attendent' : 'attend'}{' '}
            votre relecture. Elles remplissent le questionnaire à l&apos;écran, mais{' '}
            <strong>n&apos;entrent dans aucun chiffre</strong> — ni la synthèse financement, ni
            l&apos;audit, ni la proposition — tant qu&apos;{aRelire > 1 ? 'elles ne sont pas confirmées' : "elle n'est pas confirmée"}.
          </span>
          <Link
            href={`/app/diagnostics/${id}/transcript` as Route}
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-400 px-2.5 py-1.5 text-xs font-medium hover:bg-amber-100 dark:hover:bg-amber-900/40"
          >
            Relire les réponses
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : null}

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

      {missingCount > 0 && (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40">
          <h2 className="text-sm font-semibold mb-1">
            {describeMissingRequired(
              missingCount,
              missingByChapter.map((c) => c.chapter),
            )}
          </h2>
          <p className="text-xs text-muted-foreground mb-3">
            Rien ne vous empêche de terminer : ces réponses seront simplement signalées comme
            données manquantes dans le rapport. Vous pouvez aussi les compléter maintenant.
          </p>
          <ul className="flex flex-wrap gap-2">
            {missingByChapter.map((c) => (
              <li key={c.chapter}>
                <Link
                  href={`/app/diagnostics/${id}/chapitre/${c.chapter}` as Route}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-amber-300 bg-background text-xs hover:bg-muted"
                >
                  {c.chapter}. {c.title}
                  <span className="text-muted-foreground">({c.missingRequired.length})</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <FundingSynthesisPanel
          synthesis={funding}
          participantCount={diagnostic._count.participants}
        />
        <PipelineSynthesisPanel synthesis={pipeline} />
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

      <ProposalPanel
        diagnosticId={id}
        canCreate={['ADMIN', 'MANAGER', 'COMMERCIAL'].includes(user.role)}
        proposals={proposals.map((p) => {
          const parsed = ProposalPricingSchema.safeParse(p.pricingJson);
          return {
            id: p.id,
            reference: p.reference,
            status: p.status,
            totalHt: parsed.success
              ? computePricing({ pricing: parsed.data, rules }).totalHt
              : null,
          };
        })}
      />

      <AuditPanel
        diagnosticId={id}
        hasDocument={audit.hasDocument}
        freshness={audit.freshness}
        documentId={audit.documentId}
        answersCount={diagnostic.answers.length}
        variant={diagnostic.variant}
      />

      <DiagnosticActions
        diagnosticId={id}
        variant={diagnostic.variant}
        status={diagnostic.status}
        isComplete={progress.isComplete}
        missingCount={missingCount}
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
