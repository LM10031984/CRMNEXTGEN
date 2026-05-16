'use client';

/**
 * Camembert SVG inline pur (Phase 9 Plan 09-03 — LEAD-02 page de charge).
 *
 * Pattern 4 RESEARCH.md (Finding #7) : SVG inline, 0 dépendance externe
 * (pas de recharts/chart.js → bundle léger + cohérent CONTEXT.md stack figée).
 *
 * A11y :
 *  - role="img" + aria-label descriptif sur le `<svg>`.
 *  - 1 `<title>` par arc, lu par les screen-readers au focus.
 *  - Légende textuelle `<ul>` à droite, indépendante du SVG.
 *
 * Fallback `total === 0` : message "Aucun lead actif" (état naturel quand
 * aucun commercial n'a de lead actif — courant en démarrage).
 */

export interface Slice {
  label: string;
  value: number;
  color: string;
}

export function LeadDistributionPie({ slices }: { slices: Slice[] }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total === 0) {
    return (
      <div className="text-sm text-muted-foreground italic">Aucun lead actif</div>
    );
  }

  let cumulative = 0;
  const cx = 80;
  const cy = 80;
  const r = 70;

  const arcs = slices
    .filter((s) => s.value > 0)
    .map((s) => {
      const startAngle = (cumulative / total) * 2 * Math.PI - Math.PI / 2;
      cumulative += s.value;
      const endAngle = (cumulative / total) * 2 * Math.PI - Math.PI / 2;
      const x1 = cx + r * Math.cos(startAngle);
      const y1 = cy + r * Math.sin(startAngle);
      const x2 = cx + r * Math.cos(endAngle);
      const y2 = cy + r * Math.sin(endAngle);
      const large = s.value / total > 0.5 ? 1 : 0;
      // Cas "une seule slice à 100%" : pas de path triangle valide → cercle plein.
      const isFull = s.value === total;
      const d = isFull
        ? `M ${cx} ${cy} m -${r} 0 a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 -${2 * r} 0 Z`
        : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
      return {
        d,
        color: s.color,
        label: `${s.label} : ${s.value}`,
      };
    });

  return (
    <div className="flex items-center gap-4">
      <svg
        viewBox="0 0 160 160"
        width={160}
        height={160}
        role="img"
        aria-label="Répartition des leads actifs par commercial"
      >
        {arcs.map((a, i) => (
          <path key={i} d={a.d} fill={a.color} stroke="white" strokeWidth={1}>
            <title>{a.label}</title>
          </path>
        ))}
      </svg>
      <ul className="text-xs space-y-1">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ background: s.color }}
              aria-hidden
            />
            <span>
              {s.label}{' '}
              <span className="text-muted-foreground">({s.value})</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
