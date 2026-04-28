/**
 * Mini bar chart server-rendered (pas de lib, juste du SVG).
 * Affiche le nombre de sessions par mois et le CA correspondant.
 */

interface Props {
  data: Array<{ month: string; sessions: number; revenue: number }>;
}

export function MonthlyChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic">Pas encore de sessions à afficher.</div>
    );
  }
  const fmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  const maxRevenue = Math.max(...data.map((d) => d.revenue), 1);

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2 h-32">
        {data.map((d, i) => {
          const h = Math.max(4, Math.round((d.revenue / maxRevenue) * 100));
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
              <div
                className="w-full bg-primary/20 hover:bg-primary/40 transition-colors rounded-t-sm relative"
                style={{ height: `${h}%` }}
                title={`${d.month} : ${d.sessions} sessions · ${fmt.format(d.revenue)} €`}
              >
                <div className="opacity-0 group-hover:opacity-100 absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] whitespace-nowrap bg-foreground text-white px-1.5 py-0.5 rounded">
                  {fmt.format(d.revenue)}€
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 text-[10px] text-muted-foreground">
        {data.map((d, i) => (
          <div key={i} className="flex-1 text-center">{d.month}</div>
        ))}
      </div>
    </div>
  );
}
