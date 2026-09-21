/** Calendar days in Paris: DST must not shift the J-21 boundary. */
export function formationAlertsStartDate(): string {
  const value = process.env.FORMATION_ALERTS_START_DATE ?? '2026-10-01';
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw new Error('FORMATION_ALERTS_START_DATE doit être une date valide YYYY-MM-DD.');
  return value;
}

/** Une borne commune aux deux contrôles, explicite et configurable au déploiement. */
export function afterFormationAlertStart(date: Date): boolean {
  return parisDay(date) >= formationAlertsStartDate();
}

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

export function formationDaysAfter(end: Date, now: Date): number {
  return Math.round((Date.parse(parisDay(now)) - Date.parse(parisDay(end))) / 86_400_000);
}

export function missingFormationDocuments(input: {
  cni: boolean;
  rib: boolean;
  cfp: boolean;
  convention: boolean;
  company?: boolean;
  programme?: boolean;
  ageficeForm?: boolean;
}): string[] {
  if (input.company)
    return [
      !input.convention && 'convention signée',
      !input.programme && 'programme de formation',
    ].filter((s): s is string => Boolean(s));
  return [
    !input.cni && 'CNI',
    !input.rib && 'RIB',
    !input.cfp && 'attestation CFP',
    !input.convention && 'convention signée',
    !input.ageficeForm && 'formulaire AGEFICE signé',
    !input.programme && 'programme de formation',
  ].filter((s): s is string => Boolean(s));
}

export function missingReimbursementDocuments(input: {
  rib: boolean;
  attendance: boolean;
  assiduity: boolean;
  paidInvoice: boolean;
}): string[] {
  return [
    !input.rib && 'RIB',
    !input.attendance && 'émargement signé',
    !input.assiduity && 'assiduité signée',
    !input.paidInvoice && 'facture payée permettant l’édition acquittée',
  ].filter((piece): piece is string => Boolean(piece));
}

export function shouldAlertFormation(
  start: Date,
  status: string,
  now: Date,
  lastSentAt?: Date | null,
): boolean {
  const days = formationDaysUntil(start, now);
  return (
    afterFormationAlertStart(start) &&
    !['CANCELLED', 'COMPLETED'].includes(status) &&
    days >= 0 &&
    days <= 21 &&
    (!lastSentAt || formationDaysAfter(lastSentAt, now) >= 1)
  );
}

export function shouldAlertReimbursement(end: Date, now: Date, lastSentAt?: Date | null): boolean {
  return (
    afterFormationAlertStart(end) &&
    formationDaysAfter(end, now) >= 1 &&
    (!lastSentAt || formationDaysAfter(lastSentAt, now) >= 1)
  );
}

export function reimbursementReminderClosed(participant: {
  financingStatus?: string;
  opcoApproved?: boolean;
  opcoReimbursed?: boolean;
  validationOpco?: boolean;
  remboursementOpco?: boolean;
  opcoSubmissions: readonly { status: string }[];
}): boolean {
  const closed = ['APPROVED', 'REIMBURSED'];
  return (
    participant.opcoApproved === true ||
    participant.opcoReimbursed === true ||
    participant.validationOpco === true ||
    participant.remboursementOpco === true ||
    closed.includes(participant.financingStatus ?? '') ||
    participant.opcoSubmissions.some((s) => closed.includes(s.status))
  );
}
