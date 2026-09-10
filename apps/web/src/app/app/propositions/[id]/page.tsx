import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { ArrowLeft, Stethoscope } from 'lucide-react';

import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { getProposalWorkspace } from '@/server/actions/propositions';
import { ProposalActions } from '@/components/proposition/proposal-actions';
import { ProposalContentForm } from '@/components/proposition/proposal-content-form';
import { ProposalPricingForm } from '@/components/proposition/proposal-pricing-form';
import { prisma } from '@qualiof/db';

/**
 * L'éditeur de proposition.
 *
 * Ce que l'écran doit rendre évident, dans cet ordre : où en est le document
 * (statut, portes restantes), ce qu'il raconte, ce qu'il coûte. Le budget
 * mobilisable est affiché en lecture seule : il sort des moteurs, il ne se
 * négocie pas à la main — seul le prix se négocie.
 */
export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  BROUILLON: 'Brouillon',
  PRETE: 'Prête',
  ENVOYEE: 'Remise au client',
  ACCEPTEE: 'Acceptée',
  REFUSEE: 'Refusée',
  EXPIREE: 'Expirée',
};

const eur = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

export default async function PropositionPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await validateRequest();
  if (!user) return null;
  const { id } = await params;

  const result = await getProposalWorkspace(id);
  if (!result.ok || !result.data) notFound();
  const ws = result.data;

  const document = ws.proposal.pdfKey
    ? await prisma.document.findFirst({
        where: {
          tenantId: user.tenantId,
          type: 'PROPOSITION',
          entityType: 'Proposal',
          entityId: id,
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })
    : null;

  const readOnly = !['BROUILLON', 'PRETE'].includes(ws.proposal.status);

  return (
    <div className="space-y-6">
      <PageHeader
        title={ws.data.agencyName || ws.proposal.reference}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{ws.proposal.reference}</span>
            <span>v{ws.proposal.version}</span>
            <Badge variant={ws.proposal.status === 'ACCEPTEE' ? 'success' : 'info'}>
              {STATUS_LABEL[ws.proposal.status] ?? ws.proposal.status}
            </Badge>
            {ws.proposal.validUntil && (
              <span>
                valable jusqu’au{' '}
                {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(
                  ws.proposal.validUntil,
                )}
              </span>
            )}
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href={'/app/propositions' as Route}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4" />
              Toutes les propositions
            </Link>
            <Link
              href={`/app/diagnostics/${ws.proposal.diagnosticId}?vue=recap` as Route}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              <Stethoscope className="h-4 w-4" />
              {ws.data.auditReference}
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Coût pédagogique" value={eur.format(ws.synthesis.totalHt)} />
        <Stat
          label="Financements mobilisés"
          value={eur.format(ws.synthesis.totalCoverage)}
          hint={`${ws.data.funding.rows.filter((r) => !r.isDeduction).length} financeur(s)`}
        />
        <Stat
          label="Reste à charge"
          value={
            ws.synthesis.coverageState === 'offered_via_discount'
              ? 'Offert'
              : eur.format(ws.synthesis.finalRemainder)
          }
          hint={
            ws.synthesis.coverageState === 'offered_via_discount'
              ? 'geste commercial, pas une prise en charge'
              : undefined
          }
        />
        <Stat
          label="Heures conventionnées"
          value={`${ws.data.funding.conventionedHoursPerParticipant} h`}
          hint={`${ws.data.funding.halfDays} demi-journées, par participant`}
        />
      </div>

      <ProposalActions
        proposalId={id}
        status={ws.proposal.status}
        reviewedAt={ws.proposal.reviewedAt?.toISOString() ?? null}
        blockers={ws.blockers}
        warnings={ws.warnings}
        composedProductCode={ws.composedProduct?.code ?? null}
        composedModuleCount={ws.composedModuleCount}
        freshness={ws.freshness}
        hasPdf={Boolean(ws.proposal.pdfKey)}
        documentId={document?.id ?? null}
        quoteNumbers={ws.proposal.quotes.map((q) => q.number)}
        publicLinkActive={Boolean(ws.proposal.publicTokenHash)}
        publicLinkExpiresAt={ws.proposal.publicTokenExpiresAt?.toISOString() ?? null}
        needsDiscountApproval={ws.synthesis.discountRequiresApproval}
        canApproveDiscount={['ADMIN', 'MANAGER'].includes(user.role)}
        discountApproved={Boolean(ws.proposal.discountApprovedAt)}
      />

      <section className="rounded-lg border border-border p-4">
        <h2 className="mb-2 text-sm font-semibold">Budget mobilisable</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Calculé par le moteur depuis les fiches équipe du diagnostic. Il ne se modifie pas ici —
          corrigez le diagnostic si un statut ou une production est faux.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-1.5 font-medium">Financeur</th>
                <th className="py-1.5 font-medium">Bénéficiaires</th>
                <th className="py-1.5 font-medium">Base</th>
                <th className="py-1.5 text-right font-medium">Montant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ws.data.funding.rows.map((r) => (
                <tr key={`${r.funder}-${r.beneficiaries}`}>
                  <td className="py-1.5 font-medium">{r.funder}</td>
                  <td className="py-1.5 text-muted-foreground">{r.beneficiaries}</td>
                  <td className="py-1.5 text-muted-foreground">{r.basis}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {r.isDeduction ? `− ${eur.format(r.amount)}` : eur.format(r.amount)}
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-1.5" colSpan={3}>
                  Enveloppe mobilisable estimée
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {eur.format(ws.data.funding.total)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {ws.data.funding.potentialNote && (
          <p className="mt-2 text-xs text-muted-foreground">{ws.data.funding.potentialNote}</p>
        )}
        {ws.data.funding.clientAlerts.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {ws.data.funding.clientAlerts.map((a) => (
              <li key={a}>· {a}</li>
            ))}
          </ul>
        )}
      </section>

      {/* La clé porte la version des données : après une action serveur
          (remise, arrondi offert), l'éditeur se remonte sur les valeurs
          fraîches au lieu de garder son état local — sinon l'écran affiche
          encore l'ancien reste à charge à côté du nouveau. */}
      <ProposalPricingForm
        key={`pricing-${ws.proposal.updatedAt.toISOString()}`}
        proposalId={id}
        initial={ws.pricing}
        rules={ws.rules}
        readOnly={readOnly}
      />

      <ProposalContentForm
        key={`content-${ws.proposal.updatedAt.toISOString()}`}
        proposalId={id}
        initial={ws.content}
        readOnly={readOnly}
        catalogueNotices={ws.catalogueNotices}
        composedWarnings={ws.composedWarnings}
        participantCount={ws.pricing.payers.reduce((s, p) => s + p.participantCount, 0)}
      />

      <p className="text-xs text-muted-foreground">
        Rédaction : {ws.proposal.generationSource === 'heuristique'
          ? 'heuristique (aucun modèle de langage n’a écrit ce document)'
          : ws.proposal.generationSource}
        .
      </p>
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
