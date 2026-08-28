import Link from 'next/link';
import type { Route } from 'next';
import { Plus, FilePlus, Send, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { prisma, Prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { Pagination } from '@/components/ui/pagination';
import { Badge } from '@/components/ui/badge';
import { CreateQuoteButton } from '@/components/quotes/create-quote-button';
import { QuoteFromRdvButton } from '@/components/quotes/quote-from-rdv-button';

const PAGE_SIZE = 30;

const STATUS_META: Record<
  string,
  { label: string; icon: React.ElementType; variant: 'muted' | 'info' | 'success' | 'danger' }
> = {
  DRAFT: { label: 'Brouillon', icon: FilePlus, variant: 'muted' },
  SENT: { label: 'Envoyé', icon: Send, variant: 'info' },
  ACCEPTED: { label: 'Accepté', icon: CheckCircle2, variant: 'success' },
  REJECTED: { label: 'Refusé', icon: XCircle, variant: 'danger' },
  EXPIRED: { label: 'Expiré', icon: Clock, variant: 'muted' },
};

interface SP {
  q?: string;
  status?: string;
  page?: string;
}

export default async function DevisPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { user } = await validateRequest();
  if (!user) return null;

  const { q, status, page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1);

  const where: Prisma.QuoteWhereInput = { tenantId: user.tenantId };
  if (q && q.trim()) {
    where.OR = [
      { number: { contains: q, mode: 'insensitive' } },
      { recipientName: { contains: q, mode: 'insensitive' } },
      { recipientEmail: { contains: q, mode: 'insensitive' } },
      { title: { contains: q, mode: 'insensitive' } },
    ];
  }
  if (status && ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED'].includes(status)) {
    where.status = status as Prisma.EnumQuoteStatusFilter['equals'];
  }

  const [total, rows, statusCounts] = await Promise.all([
    prisma.quote.count({ where }),
    prisma.quote.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.quote.groupBy({
      by: ['status'],
      where: { tenantId: user.tenantId },
      _count: { _all: true },
    }),
  ]);

  const totalsByStatus = Object.fromEntries(
    statusCounts.map((s) => [s.status, s._count._all]),
  ) as Record<string, number>;

  const totalAcceptedAmount = await prisma.quote.aggregate({
    where: { tenantId: user.tenantId, status: 'ACCEPTED' },
    _sum: { amountTTC: true },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Devis"
        subtitle={`${total} devis${total > 1 ? '' : ''}${status ? ` (filtre ${STATUS_META[status]?.label ?? status})` : ''}`}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {/* 28/08 — au retour d'un rendez-vous, le chiffrage et le compte
                rendu suffisent : le reste du devis se déduit. */}
            <QuoteFromRdvButton />
            <CreateQuoteButton />
          </div>
        }
      />

      {/* Bandeau statuts cliquables (filtre rapide) */}
      <div className="flex flex-wrap gap-2">
        <FilterPill href="/app/devis" label="Tous" count={statusCounts.reduce((s, c) => s + c._count._all, 0)} active={!status} />
        {(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED'] as const).map((s) => (
          <FilterPill
            key={s}
            href={`/app/devis?status=${s}`}
            label={STATUS_META[s]?.label ?? s}
            count={totalsByStatus[s] ?? 0}
            active={status === s}
          />
        ))}
        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">CA devis acceptés :</span>
          <span className="font-semibold">
            {Number(totalAcceptedAmount._sum.amountTTC ?? 0).toLocaleString('fr-FR', {
              style: 'currency',
              currency: 'EUR',
              maximumFractionDigits: 0,
            })}
          </span>
        </div>
      </div>

      <SearchInput placeholder="N° devis, destinataire, email, titre…" />

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-white p-12 text-center text-sm text-muted-foreground">
          {q ? `Aucun devis ne correspond à « ${q} ».` : 'Aucun devis. Clique sur « Nouveau devis » pour commencer.'}
        </div>
      ) : (
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                <th className="px-3 py-2 font-medium">N°</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Destinataire</th>
                <th className="px-3 py-2 font-medium">Objet</th>
                <th className="px-3 py-2 font-medium text-right">Montant TTC</th>
                <th className="px-3 py-2 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((q) => {
                const meta = STATUS_META[q.status] ?? STATUS_META.DRAFT;
                if (!meta) return null;
                const Icon = meta.icon;
                return (
                  <tr key={q.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 font-mono">
                      <Link href={`/app/devis/${q.id}`} className="text-primary hover:underline">
                        {q.number}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(q.createdAt).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{q.recipientName}</div>
                      {q.recipientContact && (
                        <div className="text-xs text-muted-foreground">{q.recipientContact}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground line-clamp-1">{q.title}</td>
                    <td className="px-3 py-2 text-right font-medium">
                      {Number(q.amountTTC).toLocaleString('fr-FR', {
                        style: 'currency',
                        currency: 'EUR',
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={meta.variant} className="inline-flex items-center gap-1">
                        <Icon className="h-3 w-3" />
                        {meta.label}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        basePath="/app/devis"
        searchParams={{ q, status }}
      />
    </div>
  );
}

function FilterPill({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count: number;
  active?: boolean;
}) {
  return (
    <Link
      href={href as Route}
      className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-sm border transition-colors ${
        active
          ? 'border-primary bg-primary text-white'
          : 'border-border bg-white text-foreground hover:bg-muted/40'
      }`}
    >
      {label}
      <span
        className={`text-xs px-1.5 py-0.5 rounded ${
          active ? 'bg-white/20' : 'bg-muted text-muted-foreground'
        }`}
      >
        {count}
      </span>
    </Link>
  );
}
