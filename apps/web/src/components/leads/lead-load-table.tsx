import type { CommercialKpis } from '@/lib/lead-load-stats';

/**
 * Tableau commercial × 4 KPI (Phase 9 Plan 09-03 — LEAD-02 page de charge).
 *
 * Server Component pur (pas de 'use client') — rend ses props directement.
 * Wrapper `overflow-x-auto -mx-4 sm:mx-0` aligné Phase 3 (RESP-04) pour
 * scroll horizontal mobile sans casser le padding.
 *
 * Colonnes :
 *  - Commercial (nom)
 *  - Leads en cours (status ∈ ACTIVE_STATUSES)
 *  - Gagnés ce mois (WON & wonAt >= startOfMonth)
 *  - Taux conversion (won / totalAttribués %)
 *  - Temps moyen lead → signature (AVG days, "—" si aucun WON)
 */
export function LeadLoadTable({ rows }: { rows: CommercialKpis[] }) {
  if (rows.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic">
        Aucun commercial actif dans ce tenant.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 px-3 font-medium">Commercial</th>
            <th className="text-right py-2 px-3 font-medium">Leads en cours</th>
            <th className="text-right py-2 px-3 font-medium">Gagnés ce mois</th>
            <th className="text-right py-2 px-3 font-medium">Taux conv.</th>
            <th className="text-right py-2 px-3 font-medium">Temps moyen (j)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.userId}
              className="border-b border-border/50 hover:bg-muted/30"
            >
              <td className="py-2 px-3">{r.name || '—'}</td>
              <td className="py-2 px-3 text-right tabular-nums">
                {r.kpis.leadsActifs}
              </td>
              <td className="py-2 px-3 text-right tabular-nums">
                {r.kpis.leadsWonThisMonth}
              </td>
              <td className="py-2 px-3 text-right tabular-nums">
                {r.kpis.conversionPct}%
              </td>
              <td className="py-2 px-3 text-right tabular-nums">
                {r.kpis.avgDaysToWin !== null ? r.kpis.avgDaysToWin : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
