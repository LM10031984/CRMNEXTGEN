/** Calendar days in Paris: DST must not shift the J-21 boundary. */
export function parisDay(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function formationDaysUntil(start: Date, now: Date): number {
  return Math.round((Date.parse(parisDay(start)) - Date.parse(parisDay(now))) / 86_400_000);
}

export function missingFormationDocuments(input: {
  cni: boolean;
  rib: boolean;
  cfp: boolean;
  convention: boolean;
  company?: boolean;
  programme?: boolean;
}): string[] {
  if (input.company) return [
    !input.convention && 'convention signée',
    !input.programme && 'programme de formation',
  ].filter((s): s is string => Boolean(s));
  return [
    !input.cni && 'CNI',
    !input.rib && 'RIB',
    !input.cfp && 'attestation CFP',
    !input.convention && 'convention signée',
  ].filter((s): s is string => Boolean(s));
}

export function shouldAlertFormation(
  start: Date,
  status: string,
  now: Date,
  lastSentAt?: Date | null,
): boolean {
  const days = formationDaysUntil(start, now);
  return (
    !['CANCELLED', 'COMPLETED'].includes(status) &&
    days >= 0 &&
    days <= 21 &&
    (!lastSentAt || now.getTime() - lastSentAt.getTime() >= 7 * 86_400_000)
  );
}
