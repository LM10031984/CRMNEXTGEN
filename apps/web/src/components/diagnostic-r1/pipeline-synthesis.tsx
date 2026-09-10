'use client';

import { ArrowDown, TrendingDown, Workflow } from 'lucide-react';
import type { PipelineSynthesis } from '@/lib/diagnostic-r1/pipeline';

/**
 * « Votre pipeline de transformation » — affichée à la sortie du chapitre 8.
 *
 * L'écran qu'on retourne vers le dirigeant pour lui montrer où sa chaîne fuit.
 * Il ne dit jamais qu'une étape va mal quand la donnée manque : « inconnu » est
 * une réponse acceptable, « faible » sans chiffre ne l'est pas.
 */

const eur = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

export function PipelineSynthesisPanel({ synthesis }: { synthesis: PipelineSynthesis }) {
  const s = synthesis;
  const hasAnyValue = s.stages.some((st) => st.value !== null);

  if (!hasAnyValue) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center">
        <Workflow className="h-6 w-6 mx-auto mb-2 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Renseignez les volumes mensuels des chapitres 3 à 8 pour voir le tunnel.
        </p>
      </div>
    );
  }

  return (
    <section className="rounded-lg border border-border overflow-hidden">
      <header className="px-4 py-3 bg-muted/50 border-b border-border">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Workflow className="h-4 w-4" aria-hidden />
          Votre pipeline de transformation
        </h2>
      </header>

      <div className="p-4 space-y-4">
        <ol className="space-y-1">
          {s.stages.map((stage, i) => (
            <li key={stage.key}>
              {i > 0 && (
                <div className="flex items-center gap-2 pl-3 py-0.5 text-[11px] text-muted-foreground">
                  <ArrowDown className="h-3 w-3" aria-hidden />
                  {stage.conversionPercent !== null ? (
                    <span
                      className={
                        stage.status === 'faible'
                          ? 'text-amber-700 dark:text-amber-400 font-medium'
                          : ''
                      }
                    >
                      {stage.conversionPercent} %
                      {stage.benchmark !== null && (
                        <span className="text-muted-foreground font-normal">
                          {' '}
                          (repère {stage.benchmark} %)
                        </span>
                      )}
                    </span>
                  ) : (
                    <span>taux non calculable</span>
                  )}
                </div>
              )}
              <div
                className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 ${
                  stage.status === 'faible'
                    ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40'
                    : 'border-border'
                }`}
              >
                <span className="text-sm">{stage.label}</span>
                <span className="text-sm font-semibold tabular-nums">
                  {stage.value === null ? (
                    <span className="text-muted-foreground font-normal text-xs">non renseigné</span>
                  ) : (
                    <>
                      {stage.value}
                      <span className="text-muted-foreground font-normal text-xs"> /mois</span>
                    </>
                  )}
                </span>
              </div>
            </li>
          ))}
        </ol>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-border p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Part d’exclusivité
            </p>
            <p className="text-lg font-semibold tabular-nums">
              {s.exclusivity.value === null ? '—' : `${s.exclusivity.value} %`}
            </p>
            <p className="text-[11px] text-muted-foreground">
              repère {s.exclusivity.benchmark} %
              {s.exclusivity.status === 'faible' && ' — en dessous'}
            </p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              CA moyen par vente
            </p>
            <p className="text-lg font-semibold tabular-nums">
              {s.averageRevenuePerSale === null ? '—' : eur.format(s.averageRevenuePerSale)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {s.averageRevenuePerSale === null
                ? 'CA N-1 et ventes N-1 nécessaires'
                : 'déclaré au chapitre 1'}
            </p>
          </div>
        </div>

        {s.weakestLinks.length > 0 ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
            <p className="flex items-center gap-2 text-xs font-semibold mb-2">
              <TrendingDown className="h-3.5 w-3.5" aria-hidden />
              Là où la chaîne fuit le plus
            </p>
            <ul className="space-y-2">
              {s.weakestLinks.map((stage) => (
                <li key={stage.key} className="text-xs leading-relaxed">
                  <strong>{stage.label}</strong> — {stage.conversionPercent} % contre{' '}
                  {stage.benchmark} % attendus.
                  {/* D-12 : on n'avance un montant que s'il reste tenable. */}
                  {stage.impactPresentation === 'montant' && (
                    <>
                      {' '}
                      Reprendre la moitié du chemin vaudrait de l’ordre de{' '}
                      <strong>{eur.format(stage.headlineImpactEuros!)}</strong> de chiffre
                      d’affaires supplémentaire sur un an.
                    </>
                  )}
                  {stage.impactPresentation === 'potentiel_majeur' && (
                    <>
                      {' '}
                      <strong>Potentiel majeur — à chiffrer ensemble.</strong>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-muted-foreground mt-2">
              Projection à tunnel inchangé par ailleurs, sur les volumes déclarés — un ordre de
              grandeur pour situer l’enjeu, pas un engagement.
            </p>
            {s.weakestLinks.some((st) => st.impactPresentation === 'potentiel_majeur') && (
              <details className="mt-2">
                <summary className="cursor-pointer text-[11px] text-muted-foreground">
                  Voir le calcul complet — usage interne
                </summary>
                <ul className="mt-1 space-y-1">
                  {s.weakestLinks
                    .filter((st) => st.impactPresentation === 'potentiel_majeur')
                    .map((st) => (
                      <li key={st.key} className="text-[11px] text-muted-foreground">
                        {st.label} : combler tout l’écart représenterait{' '}
                        {eur.format(st.annualImpactEuros!)} sur un an — soit plus du quart du CA
                        déclaré. Trop gros pour être annoncé tel quel en rendez-vous.
                      </li>
                    ))}
                </ul>
              </details>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Aucun maillon nettement en retard sur les repères parmi les étapes renseignées.
          </p>
        )}

        {!s.isComplete && (
          <p className="text-[11px] text-muted-foreground border-t border-border pt-3">
            {s.missingQuestionIds.length} volume(s) encore non renseigné(s) — la lecture se
            précisera au fur et à mesure.
          </p>
        )}
      </div>
    </section>
  );
}
