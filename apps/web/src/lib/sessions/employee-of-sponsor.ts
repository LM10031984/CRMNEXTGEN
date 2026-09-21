import {
  legalLinkAtSession,
  type PeriodLink,
  type SessionPeriod,
} from '@/lib/persons/legal-link-period';
import { estEmployeurDeLApprenant } from './payer-rule';

export function isEmployeeStatus(status?: string | null): boolean {
  return ['salarie', 'alternant', 'stagiaire'].includes(
    (status ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase(),
  );
}

/** Le rôle chez le commanditaire prime ; le statut déclaré supplée un lien absent. */
export function isEmployeeOfSponsor(input: {
  sponsorOrgId: string;
  participantType?: string | null;
  session?: SessionPeriod;
  person?: { legalLinks?: readonly PeriodLink[] | null } | null;
}): boolean {
  const role = legalLinkAtSession(
    input.person?.legalLinks ?? [],
    input.sponsorOrgId,
    input.session,
  )?.role;
  return role ? estEmployeurDeLApprenant(role) : isEmployeeStatus(input.participantType);
}
