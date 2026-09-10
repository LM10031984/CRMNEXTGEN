import Link from 'next/link';
import type { Route } from 'next';
import { FileSignature } from 'lucide-react';
import { prisma } from '@qualiof/db';
import { ProposalPricingSchema } from '@qualiof/shared';

import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { loadFundingRules } from '@/lib/financement/load-rules';
import { computePricing } from '@/lib/proposition/pricing';

/**
 * La liste des propositions.
 *
 * Les montants sont RECALCULÉS depuis les lignes à chaque affichage — jamais
 * lus dans un total persisté. Un total stocké finit toujours par mentir le
 * jour où quelqu'un modifie une ligne sans repasser par le même chemin.
 */
export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  BROUILLON: 'Brouillon',
  PRETE: 'Prête',
  ENVOYEE: 'Envoyée',
  ACCEPTEE: 'Acceptée',
  REFUSEE: 'Refusée',
  EXPIREE: 'Expirée',
};

const STATUS_VARIANT: Record<string, 'default' | 'success' | 'info' | 'warning' | 'danger'> = {
  BROUILLON: 'default',
  PRETE: 'info',
  ENVOYEE: 'info',
  ACCEPTEE: 'success',
  REFUSEE: 'danger',
  EXPIREE: 'warning',
};

const eur = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

export default async function PropositionsPage() {
  const { user } = await validateRequest();
  if (!user) return null;

  const [proposals, { values: rules }] = await Promise.all([
    prisma.proposal.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        reference: true,
        status: true,
        validUntil: true,
        reviewedAt: true,
        pricingJson: true,
        diagnostic: { select: { reference: true } },
        organization: { select: { legalName: true } },
        lead: { select: { firstName: true, lastName: true, notes: true } },
        _count: { select: { quotes: true } },
      },
    }),
    loadFundingRules(user.tenantId),
  ]);

  const rows = proposals.map((p) => {
    const parsed = ProposalPricingSchema.safeParse(p.pricingJson);
    const synthesis = parsed.success ? computePricing({ pricing: parsed.data, rules }) : null;
    return {
      ...p,
      agence:
        p.organization?.legalName ??
        p.lead.notes?.replace(/^Agence\s*:\s*/, '').trim() ??
        [p.lead.firstName, p.lead.lastName].filter(Boolean).join(' '),
      totalHt: synthesis?.totalHt ?? null,
      remainder: synthesis?.finalRemainder ?? null,
      offert: synthesis?.coverageState === 'offered_via_discount',
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Propositions"
        subtitle="Le chiffrage remis en R2 — issu du diagnostic, et générateur des devis."
      />

      {rows.length === 0 ? (
        <section className="rounded-lg border border-dashed border-border p-8 text-center">
          <FileSignature className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="mt-3 text-sm font-medium">Aucune proposition pour l’instant.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Une proposition se crée depuis un diagnostic : c’est lui qui porte les constats, le
            volume et les droits mobilisables.
          </p>
          <Link
            href={'/app/diagnostics' as Route}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-primary bg-primary/10 px-3 py-2 text-sm font-medium hover:bg-primary/20"
          >
            Voir les diagnostics
          </Link>
        </section>
      ) : (
        <section className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Référence</th>
                <th className="px-4 py-2.5 font-medium">Agence</th>
                <th className="px-4 py-2.5 font-medium">Statut</th>
                <th className="px-4 py-2.5 text-right font-medium">Coût pédagogique</th>
                <th className="px-4 py-2.5 text-right font-medium">Reste à charge</th>
                <th className="px-4 py-2.5 text-right font-medium">Devis</th>
                <th className="px-4 py-2.5 font-medium">Validité</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((p) => (
                <tr key={p.id} className="hover:bg-muted/40">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/app/propositions/${p.id}` as Route}
                      className="font-mono text-primary hover:underline"
                    >
                      {p.reference}
                    </Link>
                    <div className="text-[11px] text-muted-foreground">
                      depuis {p.diagnostic.reference}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">{p.agence || '—'}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant={STATUS_VARIANT[p.status] ?? 'default'}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </Badge>
                    {!p.reviewedAt && p.status === 'BROUILLON' && (
                      <span className="ml-2 text-[11px] text-amber-700 dark:text-amber-400">
                        non relue
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {p.totalHt === null ? '—' : eur.format(p.totalHt)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {p.remainder === null ? (
                      '—'
                    ) : p.offert ? (
                      <span className="font-medium text-emerald-700 dark:text-emerald-400">
                        offert
                      </span>
                    ) : (
                      eur.format(p.remainder)
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{p._count.quotes || '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {p.validUntil
                      ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' }).format(
                          p.validUntil,
                        )
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
