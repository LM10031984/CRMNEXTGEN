import { describe, expect, it } from 'vitest';
import {
  classerLeads,
  classementOrganisation,
  lireClassementParams,
  NON_RENSEIGNE,
  type LeadClassable,
  type OrganisationClassement,
} from '../classement';

const org = (overrides: Partial<OrganisationClassement> = {}): OrganisationClassement => ({
  id: 'agence-1',
  legalName: 'Agence Azur',
  representative: 'Alice Martin',
  contacts: [],
  address: { street: '12 rue de la Paix', postalCode: '06000', city: 'Nice' },
  ...overrides,
});
const lead = (id: string, overrides: Partial<LeadClassable> = {}): LeadClassable => ({
  id,
  firstName: 'Paul',
  lastName: id,
  email: `${id}@example.test`,
  phone: null,
  source: 'MLS_COTE_D_AZUR',
  status: 'NEW',
  createdAt: new Date('2026-09-20'),
  ownerUserId: null,
  owner: null,
  person: null,
  organization: org(),
  ...overrides,
});

describe('classement des agences et points de vente', () => {
  it('sépare deux adresses de la même agence, même dans la même ville et avec le même responsable', () => {
    const result = classerLeads(
      [
        lead('1'),
        lead('2', {
          organization: org({
            id: 'agence-2',
            address: { street: '14 rue de la Paix', city: 'Nice', postalCode: '06000' },
          }),
        }),
      ],
      {},
    );
    expect(result.agences).toBe(1);
    expect(result.pointsDeVente).toBe(2);
    expect(new Set(result.rows.map((r) => r.classement.pointDeVenteKey)).size).toBe(2);
  });
  it('regroupe les variantes de casse, accents et espaces sans modifier les fiches', () => {
    const records = [
      lead('1', {
        organization: org({
          legalName: ' Agence   Étoile ',
          address: { street: '12 RUE DU MARCHÉ', city: 'NICE', country: 'FR' },
        }),
      }),
      lead('2', {
        organization: org({
          id: 'autre-fiche',
          legalName: 'AGENCE ETOILE',
          address: { street: '12 rue du marche', city: ' Nice ', country: 'France' },
        }),
      }),
    ];
    const before = structuredClone(records);
    const result = classerLeads(records, {});
    expect(result.agences).toBe(1);
    expect(result.pointsDeVente).toBe(1);
    expect(result.total).toBe(2);
    expect(records).toEqual(before);
  });
  it('conserve les numéros bis, compléments, villes et codes postaux distincts', () => {
    const base = { street: '12 rue de la Paix', city: 'Nice', postalCode: '06000' };
    const addresses = [
      base,
      { ...base, street: '12 bis rue de la Paix' },
      { ...base, street2: 'Bâtiment B' },
      { ...base, city: 'Cannes' },
      { ...base, postalCode: '06100' },
    ];
    expect(
      classerLeads(
        addresses.map((address, i) => lead(String(i), { organization: org({ address }) })),
        {},
      ).pointsDeVente,
    ).toBe(5);
  });
  it('ne confond pas deux agences à la même adresse', () => {
    const result = classerLeads(
      [lead('1'), lead('2', { organization: org({ legalName: 'Autre agence' }) })],
      {},
    );
    expect(result.agences).toBe(2);
    expect(result.pointsDeVente).toBe(2);
  });
  it.each([
    null,
    {},
    { city: 'Antibes / Golfe Juan' },
    { street: '12 rue inconnue' },
    'Nice',
    ['Nice'],
  ])('ne crée aucun point de vente avec une adresse incomplète %j', (address) => {
    const result = classerLeads([lead('1', { organization: org({ address }) })], {});
    expect(result.pointsDeVente).toBe(0);
    expect(result.sansAdresse).toBe(1);
    expect(result.rows[0]!.classement.pointDeVenteKey).toBe(NON_RENSEIGNE);
  });
  it('garde les contacts sans agence visibles et filtrables', () => {
    const result = classerLeads([lead('1'), lead('2', { organization: null })], {
      agence: NON_RENSEIGNE,
    });
    expect(result.rows.map((l) => l.id)).toEqual(['2']);
    expect(result.agences).toBe(0);
    expect(result.rows[0]!.classement.responsable).toBe('Responsable à renseigner');
  });
  it('réutilise le responsable explicite puis le contact principal, indépendamment du commercial', () => {
    const organization = org({
      contacts: [{ firstName: 'Jean', lastName: 'Dupont', isPrimary: true }],
    });
    expect(classementOrganisation(organization).responsable).toBe('Alice Martin');
    expect(classementOrganisation({ ...organization, representative: null }).responsable).toBe(
      'Jean DUPONT',
    );
    expect(
      classementOrganisation({
        ...organization,
        representative: null,
        contacts: [{ firstName: 'Paul', lastName: 'Durand', isPrimary: false }],
      }).responsableKey,
    ).toBe(NON_RENSEIGNE);
  });
  it('combine agence, responsable, point de vente, commercial, source, statut et recherche sans accents', () => {
    const records = [
      lead('1', {
        firstName: 'Élodie',
        ownerUserId: 'commercial-1',
        owner: { firstName: 'Bob', lastName: 'Dupont' },
      }),
      lead('2'),
    ];
    const c = classementOrganisation(org());
    const result = classerLeads(records, {
      agence: c.agenceKey,
      responsable: c.responsableKey,
      pointDeVente: c.pointDeVenteKey,
      commercial: 'commercial-1',
      source: 'MLS_COTE_D_AZUR',
      statut: 'NEW',
      q: 'elodie',
    });
    expect(result.rows.map((l) => l.id)).toEqual(['1']);
    expect(classerLeads(records, { agence: 'agence-inconnue' }).total).toBe(0);
  });
  it('un même email ou téléphone ne fusionne pas des contacts ni des établissements', () => {
    const records = [
      lead('1'),
      lead('2', {
        email: '1@example.test',
        phone: '+33601020304',
        organization: org({ address: { street: '99 rue A', city: 'Nice' } }),
      }),
    ];
    expect(classerLeads(records, {}).total).toBe(2);
    expect(classerLeads(records, {}).pointsDeVente).toBe(2);
  });
  it('filtre toute la base avant pagination, au-delà des 200 premières lignes', () => {
    const records = Array.from({ length: 251 }, (_, i) =>
      lead(String(i), { firstName: i === 250 ? 'Cible' : 'Paul' }),
    );
    expect(classerLeads(records, { q: 'cible' }).rows[0]!.id).toBe('250');
    expect(classerLeads(records, { page: '6' }).rows).toHaveLength(1);
    expect(classerLeads(records, { page: '99999' }).page).toBe(6);
    for (const page of ['-1', '0', 'NaN', '1.5', 'Infinity'])
      expect(classerLeads(records, { page }).page).toBe(1);
  });
  it('offre un tri stable par agence, responsable, adresse, commercial ou date', () => {
    const records = [
      lead('b', {
        organization: org({ legalName: 'Zèbre', representative: 'Albert' }),
        createdAt: new Date('2026-01-01'),
      }),
      lead('a', {
        organization: org({ legalName: 'Azur', representative: 'Zoé' }),
        createdAt: new Date('2026-02-01'),
      }),
    ];
    expect(classerLeads(records, {}).rows.map((l) => l.id)).toEqual(['a', 'b']);
    expect(classerLeads(records, { tri: 'responsable' }).rows.map((l) => l.id)).toEqual(['b', 'a']);
    expect(classerLeads(records, { tri: 'recent' }).rows.map((l) => l.id)).toEqual(['a', 'b']);
    expect(classerLeads(records, { tri: 'inconnu' }).tri).toBe('agence');
  });
  it('ignore les paramètres répétés ou inconnus', () => {
    expect(lireClassementParams({ agence: ['A', 'B'], q: ' Nice ', inconnu: 'x' })).toEqual({
      q: 'Nice',
    });
  });
});
