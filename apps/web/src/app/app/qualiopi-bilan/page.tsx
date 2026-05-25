import Link from 'next/link';
import { Download, FileSpreadsheet, BarChart3, ChevronLeft } from 'lucide-react';
import { validateRequest } from '@/lib/auth';
import { getQualiopiBilan } from '@/lib/qualiopi-bilan-stats';
import { FilterChips } from '@/components/ui/filter-chips';

export const dynamic = 'force-dynamic';

const fmtEUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const fmtNb = new Intl.NumberFormat('fr-FR');

interface SP { year?: string }

export default async function QualiopiBilanPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const { user } = await validateRequest();
  if (!user) return null;
  const sp = await searchParams;
  const yearParam = sp.year ? parseInt(sp.year, 10) : null;
  const year = Number.isFinite(yearParam) ? (yearParam as number) : new Date().getFullYear();

  const bilan = await getQualiopiBilan(user.tenantId, year);

  const yearChips = bilan.availableYears.map((y) => ({
    label: String(y),
    href: `/app/qualiopi-bilan?year=${y}`,
    active: y === year,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/app"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary mb-2"
          >
            <ChevronLeft className="h-3 w-3" /> Retour au pilotage
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight inline-flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" /> Bilan Qualiopi · {year}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Indicateur C1.i2 — Indicateurs de résultats annuels (sessions, présences,
            satisfaction, recommandation).
          </p>
        </div>
        <a
          href={`/api/qualiopi-bilan/export?year=${year}`}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600"
        >
          <Download className="h-4 w-4" /> Exporter Excel
        </a>
      </div>

      <FilterChips chips={yearChips} />

      {bilan.rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center">
          <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            Aucune session pour l'année {year}.
          </p>
        </div>
      ) : (
        <section className="rounded-2xl border border-border bg-white overflow-hidden">
          <div className="p-5 border-b border-border">
            <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
              Tableau de suivi des formations animées année {year}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {bilan.total.nbSessions} session{bilan.total.nbSessions > 1 ? 's' : ''} ·{' '}
              {fmtNb.format(bilan.total.nbStagiairesPresents)}/{fmtNb.format(bilan.total.nbStagiairesPrevu)} stagiaires présents ·{' '}
              {fmtEUR.format(bilan.total.prixTTC)} TTC
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/30">
                <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Formation</th>
                  <th className="px-3 py-2 font-semibold">Formateur</th>
                  <th className="px-3 py-2 font-semibold">Dates</th>
                  <th className="px-3 py-2 font-semibold text-center">Heures</th>
                  <th className="px-3 py-2 font-semibold text-center">Prévus</th>
                  <th className="px-3 py-2 font-semibold text-center">Présents</th>
                  <th className="px-3 py-2 font-semibold text-center">Absents</th>
                  <th className="px-3 py-2 font-semibold text-center">Abandons</th>
                  <th className="px-3 py-2 font-semibold text-center">Note /5</th>
                  <th className="px-3 py-2 font-semibold text-center">Reco %</th>
                  <th className="px-3 py-2 font-semibold text-right">Prix TTC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {bilan.rows.map((r) => (
                  <tr key={r.sessionId} className="hover:bg-muted/20">
                    <td className="px-3 py-2">
                      <Link href={`/app/sessions/${r.sessionId}`} className="hover:text-primary">
                        <div className="font-medium">{r.formationTitre}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{r.sessionCode}</div>
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-[11px]">{r.formateur}</td>
                    <td className="px-3 py-2 text-[11px]">{r.datesLabel}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{r.nbHeures}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{r.nbStagiairesPrevu}</td>
                    <td className="px-3 py-2 text-center tabular-nums text-emerald-700 font-medium">
                      {r.nbStagiairesPresents}
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums text-amber-700">
                      {r.nbStagiairesAbsents || '—'}
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums text-red-700">
                      {r.nbStagiairesAbandonnes || '—'}
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums">
                      {r.noteMoyenneSatisfaction != null ? r.noteMoyenneSatisfaction.toFixed(1) : '—'}
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums">
                      {r.tauxRecommandation != null ? `${r.tauxRecommandation.toFixed(0)}%` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtEUR.format(r.prixTTC)}</td>
                  </tr>
                ))}
                <tr className="bg-primary-50/40 font-semibold">
                  <td className="px-3 py-2" colSpan={3}>
                    BILAN {year}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">{bilan.total.nbHeures}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{bilan.total.nbStagiairesPrevu}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{bilan.total.nbStagiairesPresents}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{bilan.total.nbStagiairesAbsents}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{bilan.total.nbStagiairesAbandonnes}</td>
                  <td className="px-3 py-2 text-center tabular-nums">
                    {bilan.total.noteMoyenneSatisfaction != null
                      ? bilan.total.noteMoyenneSatisfaction.toFixed(1)
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">
                    {bilan.total.tauxRecommandation != null
                      ? `${bilan.total.tauxRecommandation.toFixed(0)}%`
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtEUR.format(bilan.total.prixTTC)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="text-xs text-muted-foreground italic">
        Les colonnes "Causes d'absence" et "Causes d'abandon" sont pré-remplies dans
        l'export Excel — à compléter manuellement avant validation.
      </p>
    </div>
  );
}
