/**
 * PilotageBarChart (quick 260620-d42 Plan 02 Task 2).
 *
 * Graphe à barres 100 % CSS/Tailwind — AUCUNE chart lib (contrainte plan).
 * Server Component pur (pas d'état, pas d'I/O). 12 colonnes mensuelles :
 *  - barre empilée réalisé (emerald plein) + prévisionnel (sky clair) ;
 *  - marqueur cible mensuelle (objectifMensuel[i]) en overlay (trait slate) ;
 *  - sous le graphe : mini-vue cumul réalisé vs objectif cumulé (barre de
 *    progression), calculée inline (reduce).
 *
 * a11y : chaque colonne porte un aria-label décrivant réalisé / prévisionnel /
 * cible du mois ; le conteneur est role="img" avec un libellé global. Palette
 * Tailwind existante (emerald / sky / slate) — pas de hex random.
 */

const fmtEUR = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

const MOIS_COURTS = [
  'Janv',
  'Févr',
  'Mars',
  'Avr',
  'Mai',
  'Juin',
  'Juil',
  'Août',
  'Sept',
  'Oct',
  'Nov',
  'Déc',
];

interface Props {
  realiseMonthly: number[];
  previsionnelMonthly: number[];
  objectifMensuel: number[];
}

export function PilotageBarChart({
  realiseMonthly,
  previsionnelMonthly,
  objectifMensuel,
}: Props) {
  // Échelle commune : max sur (réalisé + prévisionnel empilés) ET cible, afin que
  // le marqueur cible reste dans le cadre. Minimum 1 pour éviter une div/0.
  const stackTotals = realiseMonthly.map(
    (r, i) => r + (previsionnelMonthly[i] ?? 0),
  );
  const max = Math.max(1, ...stackTotals, ...objectifMensuel);

  // Cumuls pour la mini-vue de bas de graphe.
  const totalRealise = realiseMonthly.reduce((acc, m) => acc + m, 0);
  const totalObjectif = objectifMensuel.reduce((acc, m) => acc + m, 0);
  const cumulPct =
    totalObjectif > 0
      ? Math.min(100, Math.round((totalRealise / totalObjectif) * 100))
      : 0;

  return (
    <section className="rounded-2xl border border-border bg-white p-5 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
          CA mensuel — réalisé, prévisionnel et cible
        </h2>
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Réalisé
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-sky-300" /> Prévisionnel
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3 bg-slate-500" /> Cible
          </span>
        </div>
      </div>

      {/* Graphe : 12 colonnes empilées + marqueur cible */}
      <div
        role="img"
        aria-label="Graphe à barres du chiffre d'affaires mensuel : réalisé et prévisionnel empilés, avec marqueur de cible mensuelle"
        className="flex items-end gap-1.5 sm:gap-2 h-56"
      >
        {MOIS_COURTS.map((mois, i) => {
          const realise = realiseMonthly[i] ?? 0;
          const previsionnel = previsionnelMonthly[i] ?? 0;
          const cible = objectifMensuel[i] ?? 0;
          const realisePct = (realise / max) * 100;
          const previsionnelPct = (previsionnel / max) * 100;
          const ciblePct = (cible / max) * 100;
          return (
            <div
              key={mois}
              className="flex-1 flex flex-col items-center gap-1 h-full justify-end min-w-0"
              aria-label={`${mois} : réalisé ${fmtEUR.format(realise)}, prévisionnel ${fmtEUR.format(previsionnel)}, cible ${fmtEUR.format(cible)}`}
            >
              {/* Conteneur de barre (hauteur 100% pour positionner la cible en overlay) */}
              <div className="relative w-full flex-1 flex flex-col justify-end">
                {/* Marqueur cible mensuelle : trait horizontal en overlay */}
                {cible > 0 && (
                  <div
                    className="absolute inset-x-0 border-t-2 border-slate-500 border-dashed z-10"
                    style={{ bottom: `${ciblePct}%` }}
                  />
                )}
                {/* Prévisionnel (au-dessus du réalisé dans l'empilement) */}
                {previsionnel > 0 && (
                  <div
                    className="w-full bg-sky-300 rounded-t-sm"
                    style={{ height: `${previsionnelPct}%` }}
                  />
                )}
                {/* Réalisé (base de l'empilement) */}
                <div
                  className="w-full bg-emerald-500"
                  style={{
                    height: `${realisePct}%`,
                    borderTopLeftRadius: previsionnel > 0 ? 0 : '0.125rem',
                    borderTopRightRadius: previsionnel > 0 ? 0 : '0.125rem',
                  }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {mois}
              </span>
            </div>
          );
        })}
      </div>

      {/* Mini-vue cumul : réalisé cumulé vs objectif cumulé */}
      <div className="space-y-2 pt-2 border-t border-border">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            Cumul réalisé vs objectif annuel
          </span>
          <span className="font-medium tabular-nums">
            {fmtEUR.format(totalRealise)} / {fmtEUR.format(totalObjectif)} (
            {cumulPct}%)
          </span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${cumulPct}%` }}
            role="progressbar"
            aria-valuenow={cumulPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progression du cumul réalisé vers l'objectif annuel"
          />
        </div>
      </div>
    </section>
  );
}
