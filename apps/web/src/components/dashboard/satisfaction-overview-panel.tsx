/**
 * Panel satisfaction global pour le dashboard.
 * Calcule la moyenne globale + liste les sessions récentes avec leur taux.
 */

import Link from 'next/link';
import { prisma } from '@qualiof/db';
import { Smile, ChevronRight, AlertTriangle } from 'lucide-react';
import { aggregateSatisfactions } from '@/lib/closure/satisfaction-session-template';
import type { SatisfactionChaudContent } from '@/lib/closure/satisfaction-chaud-template';

function scoreColor(score: number): string {
  if (score >= 90) return 'text-emerald-600';
  if (score >= 75) return 'text-blue-600';
  if (score >= 60) return 'text-amber-600';
  return 'text-red-600';
}

export async function SatisfactionOverviewPanel({ tenantId }: { tenantId: string }) {
  // Toutes les satisfactions chaud du tenant
  const assets = await prisma.pedagogicalAsset.findMany({
    where: { tenantId, kind: 'SATISFACTION_CHAUD' },
    select: { rawJson: true, sessionId: true, session: { select: { code: true, name: true, startDate: true, product: { select: { title: true } } } } },
    orderBy: { generatedAt: 'desc' },
  });

  if (assets.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-border bg-muted/20 p-5">
        <div className="flex items-center gap-2 mb-1">
          <Smile className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Satisfaction</h2>
        </div>
        <p className="text-xs text-muted-foreground italic">Aucune évaluation collectée encore.</p>
      </section>
    );
  }

  // Parse + agrégat global
  const globalContents: SatisfactionChaudContent[] = [];
  const bySessionMap = new Map<string, { code: string; name: string; date: Date; contents: SatisfactionChaudContent[] }>();

  for (const a of assets) {
    const raw = a.rawJson as Record<string, unknown> | null;
    if (!raw || !a.session) continue;
    const { source: _src, ...content } = raw;
    const c = content as unknown as SatisfactionChaudContent;
    globalContents.push(c);
    const key = a.sessionId ?? 'unknown';
    const entry = bySessionMap.get(key) ?? {
      code: a.session.code,
      name: a.session.name ?? a.session.product.title,
      date: a.session.startDate,
      contents: [],
    };
    entry.contents.push(c);
    bySessionMap.set(key, entry);
  }

  if (globalContents.length === 0) {
    return null;
  }

  const globalAgg = aggregateSatisfactions(globalContents);

  // Top 5 sessions récentes
  const recentSessions = Array.from(bySessionMap.entries())
    .map(([sessionId, e]) => ({
      sessionId,
      code: e.code,
      name: e.name,
      date: e.date,
      nbEvals: e.contents.length,
      agg: aggregateSatisfactions(e.contents),
    }))
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 5);

  return (
    <section className="rounded-2xl border border-border bg-white p-5">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground inline-flex items-center gap-2">
          <Smile className="h-4 w-4 text-primary" /> Satisfaction stagiaires
        </h2>
        <span className="text-xs text-muted-foreground">{globalAgg.totalStagiaires} évaluation{globalAgg.totalStagiaires > 1 ? 's' : ''} cumulée{globalAgg.totalStagiaires > 1 ? 's' : ''}</span>
      </div>

      {/* KPIs globaux — grid-cols-3 OK même mobile : 3 KPI compacts (% + label court) */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="text-center p-2 rounded-md bg-muted/30">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Score global</div>
          <div className={`text-2xl font-bold tabular-nums ${scoreColor(globalAgg.globalScore)}`}>{globalAgg.globalScore}%</div>
        </div>
        <div className="text-center p-2 rounded-md bg-muted/30">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">% favorable</div>
          <div className={`text-2xl font-bold tabular-nums ${scoreColor(globalAgg.satisfactionFavorableRate)}`}>{globalAgg.satisfactionFavorableRate}%</div>
        </div>
        <div className="text-center p-2 rounded-md bg-muted/30">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Recommandent</div>
          <div className={`text-2xl font-bold tabular-nums ${scoreColor(globalAgg.recommandationRate)}`}>{globalAgg.recommandationRate}%</div>
        </div>
      </div>

      {globalAgg.satisfactionFavorableRate < 90 && (
        <div className="mb-3 p-2 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800 inline-flex items-start gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>Objectif Qualiopi 90% favorable non atteint — vérifie les axes d'amélioration.</span>
        </div>
      )}

      {/* Par session — 5 dernières */}
      <div>
        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Dernières sessions évaluées
        </div>
        <ul className="divide-y divide-border">
          {recentSessions.map((s) => (
            <li key={s.sessionId}>
              <Link
                href={`/app/sessions/${s.sessionId}`}
                className="flex items-center gap-3 py-2 hover:bg-muted/30 px-2 -mx-2 rounded transition-colors"
              >
                <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded shrink-0">{s.code}</span>
                <span className="text-xs truncate flex-1">{s.name}</span>
                <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{s.nbEvals} éval.</span>
                <span className={`text-sm font-bold tabular-nums tabular-nums ${scoreColor(s.agg.globalScore)}`}>{s.agg.globalScore}%</span>
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
