import { type PeriodLink, type SessionPeriod } from '@/lib/persons/legal-link-period';
import { isEmployeeOfSponsor } from '@/lib/sessions/employee-of-sponsor';
export { isEmployeeStatus } from '@/lib/sessions/employee-of-sponsor';

/** Le dossier de cette inscription, pas une autre activité de la personne. */
export function isCompanyDossier(p: {
  sponsorOrgId: string;
  participantType?: string | null;
  session?: SessionPeriod;
  person?: { legalLinks?: PeriodLink[] };
}): boolean {
  if (p.session?.regime) return p.session.regime === 'ENTREPRISE';
  return isEmployeeOfSponsor(p);
}

export function controlCompanyPieces(
  pieces: readonly { kind: string; included: boolean; key?: string; signe?: boolean }[],
): string | null {
  const included = pieces.filter((p) => p.included && p.key?.trim());
  const missing = [
    !included.some((p) => p.kind === 'CONVENTION' && p.signe === true) && 'convention signée',
    !included.some((p) => p.kind === 'PROGRAMME') && 'programme de formation',
  ].filter(Boolean);
  return missing.length ? `Pièces à compléter : ${missing.join(', ')}.` : null;
}

/** Documents triés du plus récent au plus ancien ; la convention entreprise couvre le groupe. */
export function selectDossierConvention<
  T extends { participantId?: string | null; entityType?: string; entityId?: string },
>(docs: T[], participantId: string, sponsorOrgId: string, company: boolean): T | undefined {
  const group =
    docs.find((d) => d.entityType === 'organization' && d.entityId === sponsorOrgId) ??
    docs.find((d) => d.entityType === 'session' && !d.participantId);
  const individual = docs.find((d) => d.participantId === participantId);
  return company ? (group ?? individual) : (individual ?? group ?? docs[0]);
}
