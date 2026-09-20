import {
  resoudreRepresentantEntreprise,
  type OrganisationRepresentee,
} from '@/lib/signature/representant';

export const NON_RENSEIGNE = '__missing__';
export const LEADS_PAGE_SIZE = 50;

/** Clé de présentation uniquement : ne fusionne jamais les fiches en base. */
export function normaliserClassement(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const texte = (value: unknown): string =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
const comparer = new Intl.Collator('fr', { sensitivity: 'base', numeric: true }).compare;

export type OrganisationClassement = OrganisationRepresentee & {
  address: unknown;
  brandName?: string | null;
};

export function classementOrganisation(org: OrganisationClassement | null) {
  const address =
    org?.address && typeof org.address === 'object' && !Array.isArray(org.address)
      ? (org.address as Record<string, unknown>)
      : {};
  const street = texte(address.street);
  const street2 = texte(address.street2);
  const city = texte(address.city);
  const postalCode = texte(address.postalCode);
  const country = texte(address.country);
  const countryKey = normaliserClassement(country);
  const agence = texte(org?.legalName) || 'Agence à rattacher';
  const agenceKey = org ? normaliserClassement(agence) || org.id : NON_RENSEIGNE;
  const responsable = org ? resoudreRepresentantEntreprise(org) : null;
  const responsableNom = responsable?.ok ? texte(responsable.nom) : '';
  // Une ville ou un secteur MLS seul ne prouve pas l'existence d'un établissement.
  const adresseRenseignee = Boolean(street && (city || postalCode));
  const adresse = [street, street2, [postalCode, city].filter(Boolean).join(' '), country]
    .filter(Boolean)
    .join(', ');
  const pointDeVenteKey = adresseRenseignee
    ? JSON.stringify([
        agenceKey,
        ...[street, street2, postalCode, city].map(normaliserClassement),
        ['fr', 'france', ''].includes(countryKey) ? 'france' : countryKey,
      ])
    : NON_RENSEIGNE;
  return {
    agence,
    agenceKey,
    city,
    adresse,
    responsable: responsableNom || 'Responsable à renseigner',
    responsableKey: responsableNom ? normaliserClassement(responsableNom) : NON_RENSEIGNE,
    pointDeVenteKey,
    adresseRenseignee,
    pointDeVente: adresseRenseignee ? adresse : `Adresse à compléter${city ? ` · ${city}` : ''}`,
  };
}

export interface LeadClassable {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: string;
  createdAt: Date;
  ownerUserId: string | null;
  person: { firstName: string; lastName: string } | null;
  owner: { firstName: string; lastName: string } | null;
  organization: OrganisationClassement | null;
}

export type ClassementParams = Partial<
  Record<
    | 'q'
    | 'agence'
    | 'responsable'
    | 'pointDeVente'
    | 'commercial'
    | 'source'
    | 'statut'
    | 'tri'
    | 'page',
    string
  >
>;

export function lireClassementParams(
  raw: Record<string, string | string[] | undefined>,
): ClassementParams {
  const keys = [
    'q',
    'agence',
    'responsable',
    'pointDeVente',
    'commercial',
    'source',
    'statut',
    'tri',
    'page',
  ] as const;
  return Object.fromEntries(
    keys.flatMap((key) => {
      const value = raw[key];
      return typeof value === 'string' && value.trim() ? [[key, value.trim().slice(0, 1500)]] : [];
    }),
  );
}

export function classerLeads<T extends LeadClassable>(leads: T[], params: ClassementParams) {
  const rows = leads.map((lead) => ({
    ...lead,
    classement: classementOrganisation(lead.organization),
    contactName: lead.person
      ? `${lead.person.firstName} ${lead.person.lastName}`.trim()
      : `${lead.firstName ?? ''} ${lead.lastName ?? ''}`.trim() || 'Contact à renseigner',
  }));
  const query = normaliserClassement(params.q ?? '');
  const filtered = rows.filter((lead) => {
    const c = lead.classement;
    return (
      (!params.agence || params.agence === c.agenceKey) &&
      (!params.responsable || params.responsable === c.responsableKey) &&
      (!params.pointDeVente || params.pointDeVente === c.pointDeVenteKey) &&
      (!params.commercial || params.commercial === (lead.ownerUserId ?? NON_RENSEIGNE)) &&
      (!params.source || params.source === (texte(lead.source) || NON_RENSEIGNE)) &&
      (!params.statut || params.statut === lead.status) &&
      (!query ||
        normaliserClassement(
          [
            lead.contactName,
            lead.email,
            lead.phone,
            c.agence,
            c.responsable,
            c.adresse,
            lead.organization?.brandName,
          ]
            .filter(Boolean)
            .join(' '),
        ).includes(query))
    );
  });
  const tri = ['agence', 'responsable', 'pointDeVente', 'commercial', 'recent'].includes(
    params.tri ?? '',
  )
    ? params.tri!
    : 'agence';
  filtered.sort((a, b) => {
    const ca = a.classement;
    const cb = b.classement;
    let order = 0;
    if (tri === 'recent') order = b.createdAt.getTime() - a.createdAt.getTime();
    if (tri === 'responsable') order = comparer(ca.responsable, cb.responsable);
    if (tri === 'pointDeVente') order = comparer(ca.pointDeVente, cb.pointDeVente);
    if (tri === 'commercial')
      order = comparer(
        a.owner ? `${a.owner.firstName} ${a.owner.lastName}` : 'Non assigné',
        b.owner ? `${b.owner.firstName} ${b.owner.lastName}` : 'Non assigné',
      );
    return (
      order ||
      comparer(ca.agence, cb.agence) ||
      comparer(ca.pointDeVente, cb.pointDeVente) ||
      comparer(ca.responsable, cb.responsable) ||
      comparer(a.contactName, b.contactName) ||
      comparer(a.id, b.id)
    );
  });
  const requestedPage = Number(params.page);
  const page = Math.min(
    Math.max(1, Math.ceil(filtered.length / LEADS_PAGE_SIZE)),
    Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
  );

  const options = (entries: Array<[string, string]>) =>
    [...new Map(entries)]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => comparer(a.label, b.label));
  return {
    rows: filtered.slice((page - 1) * LEADS_PAGE_SIZE, page * LEADS_PAGE_SIZE),
    filtered,
    page,
    tri,
    total: filtered.length,
    agences: new Set(filtered.map((l) => l.classement.agenceKey).filter((k) => k !== NON_RENSEIGNE))
      .size,
    pointsDeVente: new Set(
      filtered.map((l) => l.classement.pointDeVenteKey).filter((k) => k !== NON_RENSEIGNE),
    ).size,
    sansAdresse: filtered.filter((l) => !l.classement.adresseRenseignee).length,
    options: {
      agences: options(rows.map((l) => [l.classement.agenceKey, l.classement.agence])),
      responsables: options(
        rows.map((l) => [l.classement.responsableKey, l.classement.responsable]),
      ),
      pointsDeVente: options(
        rows.map((l) => [
          l.classement.pointDeVenteKey,
          l.classement.adresseRenseignee
            ? `${l.classement.agence} — ${l.classement.pointDeVente}`
            : 'Adresse à compléter',
        ]),
      ),
      commercials: options(
        rows.map((l) => [
          l.ownerUserId ?? NON_RENSEIGNE,
          l.owner ? `${l.owner.firstName} ${l.owner.lastName}` : 'Non assigné',
        ]),
      ),
      sources: options(
        rows.map((l) => [
          texte(l.source) || NON_RENSEIGNE,
          texte(l.source) || 'Source à renseigner',
        ]),
      ),
    },
  };
}
