const parisFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
/** Les heures d'indisponibilité sont saisies et affichées en Europe/Paris. */
export function toParisInput(iso: string): string {
  const parts = parisFormatter.formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
export function parisInputToISO(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const wall = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(wall)) return null;
  let instant = wall;
  for (let i = 0; i < 3; i++) {
    const displayed = Date.parse(`${toParisInput(new Date(instant).toISOString())}:00Z`);
    instant += wall - displayed;
  }
  const iso = new Date(instant).toISOString();
  return toParisInput(iso) === value ? iso : null;
}
export function availabilityDayBounds(day: string, half: 'morning' | 'afternoon' | null = null) {
  const next = new Date(`${day}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const tomorrow = next.toISOString().slice(0, 10);
  return {
    start: Date.parse(parisInputToISO(`${day}T${half === 'afternoon' ? '12:00' : '00:00'}`)!),
    end: Date.parse(parisInputToISO(half === 'morning' ? `${day}T12:00` : `${tomorrow}T00:00`)!),
  };
}
