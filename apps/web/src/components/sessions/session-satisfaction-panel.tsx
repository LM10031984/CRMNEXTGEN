/**
 * Panel récap visuel de la satisfaction agrégée d'une session.
 * Lit les satisfactions individuelles existantes (PedagogicalAsset
 * kind=SATISFACTION_CHAUD) et calcule à la volée la moyenne, le taux de
 * recommandation, les points forts/faibles.
 *
 * Pas de PDF généré — la donnée se met à jour à chaque chargement.
 */

import { prisma } from '@qualiof/db';
import { Smile, AlertTriangle, Users, ThumbsUp } from 'lucide-react';
import {
  aggregateSatisfactions,
  type SatisfactionSessionAgg,
} from '@/lib/closure/satisfaction-session-template';
import type { SatisfactionChaudContent } from '@/lib/closure/satisfaction-chaud-template';

function scoreColor(score: number): string {
  if (score >= 90) return 'text-emerald-600 border-emerald-200 bg-emerald-50';
  if (score >= 75) return 'text-blue-600 border-blue-200 bg-blue-50';
  if (score >= 60) return 'text-amber-600 border-amber-200 bg-amber-50';
  return 'text-red-600 border-red-200 bg-red-50';
}

function progressBarColor(score: number): string {
  if (score >= 90) return 'bg-emerald-500';
  if (score >= 75) return 'bg-blue-500';
  if (score >= 60) return 'bg-amber-500';
  return 'bg-red-500';
}

export async function SessionSatisfactionPanel({
  sessionId,
  tenantId,
}: {
  sessionId: string;
  tenantId: string;
}) {
  const assets = await prisma.pedagogicalAsset.findMany({
    where: { tenantId, sessionId, kind: 'SATISFACTION_CHAUD' },
    select: { rawJson: true },
  });

  if (assets.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-border bg-muted/20 p-5">
        <div className="flex items-center gap-2 mb-2">
          <Smile className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
            Satisfaction de la session
          </h2>
        </div>
        <p className="text-xs text-muted-foreground italic">
          Aucune satisfaction individuelle générée — lance le pack de fin de formation pour calculer la satisfaction globale.
        </p>
      </section>
    );
  }

  const contents: SatisfactionChaudContent[] = [];
  for (const a of assets) {
    const raw = a.rawJson as Record<string, unknown> | null;
    if (!raw) continue;
    const { source: _src, ...content } = raw;
    contents.push(content as unknown as SatisfactionChaudContent);
  }

  if (contents.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-border bg-muted/20 p-5">
        <p className="text-xs text-muted-foreground italic">
          Satisfactions présentes mais données vides — régénère le pack.
        </p>
      </section>
    );
  }

  const agg: SatisfactionSessionAgg = aggregateSatisfactions(contents);

  return (
    <section className="rounded-2xl border border-border bg-white p-5">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground inline-flex items-center gap-2">
          <Smile className="h-4 w-4 text-primary" />
          Satisfaction de la session
        </h2>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="h-3 w-3" />
          {agg.totalStagiaires} stagiaire{agg.totalStagiaires > 1 ? 's' : ''} évaluant{agg.totalStagiaires > 1 ? 's' : ''}
        </span>
      </div>

      {/* KPIs — grid-cols-3 OK même mobile : 3 cards compactes (note/% + label court) */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className={`rounded-xl border-2 p-3 text-center ${scoreColor(agg.globalScore)}`}>
          <div className="text-[10px] uppercase tracking-wide opacity-70">Score global</div>
          <div className="text-2xl font-bold tabular-nums">{agg.globalScore}%</div>
        </div>
        <div className={`rounded-xl border-2 p-3 text-center ${scoreColor(agg.satisfactionFavorableRate)}`}>
          <div className="text-[10px] uppercase tracking-wide opacity-70">% favorable</div>
          <div className="text-2xl font-bold tabular-nums">{agg.satisfactionFavorableRate}%</div>
        </div>
        <div className={`rounded-xl border-2 p-3 text-center ${scoreColor(agg.recommandationRate)}`}>
          <div className="text-[10px] uppercase tracking-wide opacity-70 inline-flex items-center gap-1">
            <ThumbsUp className="h-3 w-3" /> Recommandent
          </div>
          <div className="text-2xl font-bold tabular-nums">{agg.recommandationRate}%</div>
        </div>
      </div>

      {/* Détail critères par section, repliable */}
      <details className="mb-3">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 select-none">
          Détail par critère ({agg.byCriterion.length} critères évalués)
        </summary>
        <div className="mt-3 space-y-2">
          {Array.from(new Set(agg.byCriterion.map((c) => c.section))).map((sect) => (
            <div key={sect}>
              <div className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide mt-2 mb-1">{sect}</div>
              {agg.byCriterion
                .filter((c) => c.section === sect)
                .map((c) => (
                  <div key={c.criterionLabel} className="flex items-center gap-2 py-1 text-xs">
                    <span className="flex-1 text-foreground/80">{c.criterionLabel}</span>
                    <div className="w-28 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full ${progressBarColor(c.score)}`} style={{ width: `${c.score}%` }} />
                    </div>
                    <span className="tabular-nums font-medium w-10 text-right">{c.score}%</span>
                  </div>
                ))}
            </div>
          ))}
        </div>
      </details>

      {/* Points forts + à améliorer */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
          <div className="text-xs font-semibold text-emerald-900 inline-flex items-center gap-1 mb-1">
            ✓ Points forts
          </div>
          {agg.pointsForts.length > 0 ? (
            <ul className="text-xs space-y-0.5 ml-3 list-disc text-emerald-900/80">
              {agg.pointsForts.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : (
            <p className="text-xs italic text-emerald-700/60">—</p>
          )}
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
          <div className="text-xs font-semibold text-amber-900 inline-flex items-center gap-1 mb-1">
            <AlertTriangle className="h-3 w-3" /> Axes d'amélioration
          </div>
          {agg.pointsAAmeliorer.length > 0 ? (
            <ul className="text-xs space-y-0.5 ml-3 list-disc text-amber-900/80">
              {agg.pointsAAmeliorer.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : (
            <p className="text-xs italic text-emerald-700">Aucun point &lt; 80% — bilan exceptionnel</p>
          )}
        </div>
      </div>
    </section>
  );
}
