import {
  legalLinkAtSession,
  type PeriodLink,
  type SessionPeriod,
} from '@/lib/persons/legal-link-period';
import { estEmployeurDeLApprenant } from '@/lib/sessions/payer-rule';

/** Le dossier de cette inscription, pas une autre activité de la personne. */
export function isCompanyDossier(p: {
  sponsorOrgId: string;
  participantType?: string | null;
  session?: SessionPeriod;
  person?: { legalLinks?: PeriodLink[] };
}): boolean {
  if (p.session?.regime) return p.session.regime === 'ENTREPRISE';
  const role = legalLinkAtSession(p.person?.legalLinks ?? [], p.sponsorOrgId, p.session)?.role;
  if (role) return estEmployeurDeLApprenant(role);
  return isEmployeeStatus(p.participantType);
}

export function isEmployeeStatus(status?: string | null): boolean {
  return ['salarie', 'alternant', 'stagiaire'].includes(
    (status ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase(),
  );
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

export const DEPOSITORS = [
  { email: 'formation@start-academy.fr', name: 'Béatrice Blanc' },
  { email: 'laurent@start-academy.fr', name: 'Laurent' },
  { email: 'jean-guy@start-academy.fr', name: 'Jean-Guy' },
] as const;

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
