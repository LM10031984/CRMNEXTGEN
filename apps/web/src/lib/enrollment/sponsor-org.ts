/**
 * Qui paye ? — règle métier figée (feedback_regle_payeur) :
 *   auto-entrepreneur / agent commercial → il paye lui-même via son EI
 *   salarié                              → sa structure paye
 *
 * Le formulaire public est ouvert sur Internet : on n'y crée JAMAIS une
 * organisation « enseigne » à partir d'un SIRET saisi librement, sous peine
 * de noyer le CRM de doublons. Un salarié dont le SIRET est inconnu part en
 * 'a-confirmer' : l'admin choisit l'organisation à la main.
 *
 * Fonction PURE : la recherche par SIRET est faite par l'appelant et passée
 * via `matchedOrganizationId`.
 */

export type SponsorDecision =
  | { kind: 'creer-ei'; siret: string | null; legalName: string }
  | { kind: 'org-existante'; organizationId: string }
  | { kind: 'a-confirmer'; raison: string };

export interface SponsorInput {
  professionalStatus: string | null;
  companyName: string | null;
  companySiret: string | null;
  firstName: string;
  lastName: string;
  matchedOrganizationId: string | null;
}

/** Un SIRET valide fait exactement 14 chiffres, séparateurs retirés. */
export function cleanSiret(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  return digits.length === 14 ? digits : null;
}

const INDEPENDANTS = new Set(['Agent commercial', 'Dirigeant']);

export function resolveSponsorOrg(input: SponsorInput): SponsorDecision {
  const statut = input.professionalStatus?.trim() ?? '';
  if (!statut) {
    return { kind: 'a-confirmer', raison: 'Statut professionnel non renseigné' };
  }

  // Une organisation déjà connue gagne toujours : pas de doublon.
  if (input.matchedOrganizationId) {
    return { kind: 'org-existante', organizationId: input.matchedOrganizationId };
  }

  if (statut === 'Salarié') {
    return {
      kind: 'a-confirmer',
      raison: "Salarié dont l'entreprise n'est pas encore dans le CRM — à rattacher à la main",
    };
  }

  if (INDEPENDANTS.has(statut)) {
    const siret = cleanSiret(input.companySiret);
    if (!siret) {
      return { kind: 'a-confirmer', raison: 'SIRET absent ou invalide' };
    }
    const legalName =
      input.companyName?.trim() ||
      `${input.firstName.trim()} ${input.lastName.trim().toUpperCase()}`;
    return { kind: 'creer-ei', siret, legalName };
  }

  return { kind: 'a-confirmer', raison: `Statut « ${statut} » non pris en charge` };
}
