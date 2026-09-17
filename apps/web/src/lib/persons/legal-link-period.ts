/** Périodes inclusives, comparées au calendrier de la session, jamais à aujourd'hui. */
export type PeriodLink = {
  id?: string;
  organizationId: string;
  role: string;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  function?: string | null;
  isPrimary?: boolean;
};
export type SessionPeriod = {
  startDate: Date | string;
  endDate: Date | string;
  regime?: 'ENTREPRISE' | 'INDIVIDUEL' | null;
};

export function calendarDay(value: Date | string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Date de rattachement invalide.');
  const day = date.toISOString().slice(0, 10);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value !== day) {
    throw new Error('Date de rattachement invalide.');
  }
  return day;
}

export function legalLinkAtSession<T extends PeriodLink>(
  links: readonly T[],
  organizationId: string,
  session: SessionPeriod | undefined,
): T | null {
  if (!session?.startDate || !session.endDate) {
    // Compatibilité des anciens appelants sans contexte ; ne pas choisir entre périodes datées.
    if (links.some((l) => l.organizationId === organizationId && (l.startDate || l.endDate)))
      throw new Error('Dates de session requises pour résoudre ce rattachement.');
    return links.find((l) => l.organizationId === organizationId) ?? null;
  }
  const start = calendarDay(session.startDate);
  const end = calendarDay(session.endDate);
  if (end < start) throw new Error('La fin de session précède son début.');
  const overlaps = links.filter(
    (l) =>
      l.organizationId === organizationId &&
      (!l.startDate || calendarDay(l.startDate) <= end) &&
      (!l.endDate || calendarDay(l.endDate) >= start),
  );
  // Les sessions historiques ne reçoivent pas le nouveau refus strict.
  // Les périodes explicites restent lues au début de session ; à défaut, repli
  // sur le premier lien, comme avant cette évolution.
  if (session.regime === null)
    return (
      overlaps.find((l) => !l.startDate || calendarDay(l.startDate) <= start) ??
      links.find((l) => l.organizationId === organizationId) ??
      null
    );
  if (
    overlaps.some(
      (l) =>
        (l.startDate && calendarDay(l.startDate) > start) ||
        (l.endDate && calendarDay(l.endDate) < end),
    )
  ) {
    throw new Error(
      'Le rattachement change pendant la session. Corrigez ses dates dans la fiche apprenant ou scindez la session.',
    );
  }
  if (overlaps.length > 1) {
    throw new Error(
      'Plusieurs rattachements sont actifs dans cette organisation aux dates de la session. Corrigez leurs périodes dans la fiche apprenant.',
    );
  }
  return overlaps[0] ?? null;
}

export function planLegalLinkChange(
  link: PeriodLink,
  input: { role: string; effectiveDate: string },
): { previous: PeriodLink; next: PeriodLink } {
  const start = calendarDay(input.effectiveDate);
  if (link.startDate && start <= calendarDay(link.startDate)) {
    throw new Error('La date de changement doit suivre le début du rattachement.');
  }
  if (link.endDate && start > calendarDay(link.endDate)) {
    throw new Error(
      'Ce rattachement est déjà terminé à cette date. Créez une nouvelle période depuis la fiche apprenant.',
    );
  }
  if (input.role === link.role) throw new Error('Choisissez un rôle différent.');
  const previousEnd = new Date(`${start}T00:00:00Z`);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  return {
    previous: { ...link, endDate: calendarDay(previousEnd), isPrimary: false },
    next: {
      organizationId: link.organizationId,
      role: input.role,
      function: link.function ?? null,
      startDate: start,
      endDate: link.endDate ? calendarDay(link.endDate) : null,
      isPrimary: link.isPrimary ?? false,
    },
  };
}

/** Toutes les casquettes actives, une par organisation, sans préférence juridique. */
export function activeLegalLinksAtSession<T extends PeriodLink>(
  links: readonly T[],
  session: SessionPeriod | undefined,
): T[] {
  return [...new Set(links.map((l) => l.organizationId))]
    .map((id) => legalLinkAtSession(links, id, session))
    .filter((l): l is T => l !== null);
}
