import Link from 'next/link';
import type { Route } from 'next';
import { History } from 'lucide-react';
import { prisma } from '@qualiof/db';
import { requireRole } from '@/lib/rbac';
import { buildAuditWhere } from '@/lib/build-audit-where';
import { PageHeader } from '@/components/ui/page-header';
import { AuditLogFilters } from '@/components/audit/audit-log-filters';
import { AuditDiffModal } from '@/components/audit/audit-diff-modal';

/**
 * Page Historique (AuditLog) — Phase 8 Plan 08-05 (RBAC-05 + D-09 CONTEXT.md).
 *
 * Server Component ADMIN-only avec :
 *  - Filtres URL state (qui / quand / type d'action) → URLs partageables.
 *  - Pagination par lots de 50 (suffit largement pour 1-5 users sur ~1an).
 *  - Modal détail diff côté client (AuditDiffModal).
 *
 * Sécurité :
 *  - `requireRole(['ADMIN'])` lève ForbiddenError si non-ADMIN → tombe sur
 *    `app/app/error.tsx`.
 *  - `buildAuditWhere(sp, admin.tenantId)` injecte TOUJOURS le tenantId →
 *    impossible de lire les logs d'un autre tenant via params.
 *
 * `dynamic = 'force-dynamic'` pour éviter le cache (données admin temps réel).
 */
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

interface SearchParams {
  userId?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: string;
}

export default async function HistoriquePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const admin = await requireRole(['ADMIN']);
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page ?? 0) || 0);
  const where = buildAuditWhere(sp, admin.tenantId);

  const [rows, total, users] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
      skip: page * PAGE_SIZE,
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    }),
    prisma.auditLog.count({ where }),
    prisma.user.findMany({
      where: { tenantId: admin.tenantId },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fmtDate = (d: Date): string =>
    new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(d);

  // Préserve les filtres dans les liens Prev/Next
  const baseQs = new URLSearchParams();
  if (sp.userId) baseQs.set('userId', sp.userId);
  if (sp.action) baseQs.set('action', sp.action);
  if (sp.from) baseQs.set('from', sp.from);
  if (sp.to) baseQs.set('to', sp.to);
  const prevQs = new URLSearchParams(baseQs);
  prevQs.set('page', String(Math.max(0, page - 1)));
  const nextQs = new URLSearchParams(baseQs);
  nextQs.set('page', String(page + 1));

  const hasPrev = page > 0;
  const hasNext = page + 1 < totalPages;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Historique"
          subtitle={`${total} action${total > 1 ? 's' : ''} tracée${total > 1 ? 's' : ''}`}
        />
        <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
          <History className="h-3.5 w-3.5" aria-hidden="true" />
          <span>AuditLog — ADMIN only</span>
        </div>
      </div>

      <AuditLogFilters users={users} initial={sp} />

      <div className="rounded-lg border border-border overflow-x-auto -mx-4 sm:mx-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 font-semibold">Date</th>
              <th className="px-3 py-2 font-semibold">Utilisateur</th>
              <th className="px-3 py-2 font-semibold">Action</th>
              <th className="px-3 py-2 font-semibold">Entité</th>
              <th className="px-3 py-2 font-semibold text-right">Diff</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                  {fmtDate(r.createdAt)}
                </td>
                <td className="px-3 py-2.5">
                  {r.user ? (
                    <span title={r.user.email}>
                      {r.user.firstName} {r.user.lastName}
                    </span>
                  ) : (
                    <span className="text-muted-foreground italic">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono bg-slate-100 text-slate-700">
                    {r.action}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground font-mono">
                  {r.entity}:{r.entityId.slice(0, 8)}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <AuditDiffModal diff={r.diff} action={r.action} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="p-8 text-center text-muted-foreground text-sm"
                >
                  Aucune action ne correspond aux filtres.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Page {page + 1} / {totalPages}
        </span>
        <div className="flex gap-2">
          {hasPrev ? (
            <Link
              href={
                `/app/parametres/historique?${prevQs.toString()}` as Route
              }
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              ← Précédent
            </Link>
          ) : (
            <span className="rounded-md border border-border px-3 py-1.5 text-sm opacity-50 cursor-not-allowed">
              ← Précédent
            </span>
          )}
          {hasNext ? (
            <Link
              href={
                `/app/parametres/historique?${nextQs.toString()}` as Route
              }
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              Suivant →
            </Link>
          ) : (
            <span className="rounded-md border border-border px-3 py-1.5 text-sm opacity-50 cursor-not-allowed">
              Suivant →
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
