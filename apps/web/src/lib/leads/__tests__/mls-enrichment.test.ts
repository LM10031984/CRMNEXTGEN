import { describe, expect, it } from 'vitest';
import { planMlsEnrichment, type EnrichmentAgency, type EnrichmentLead } from '../mls-enrichment';
import type { MlsRow, parseMls } from '../mls-import';
const contact = (patch: Partial<MlsRow> = {}): MlsRow => ({
  key: 'alice',
  agency: 'C21 Immo d’Azur',
  agencyKey: 'c21 immo d azur',
  firstName: 'Alice',
  lastName: 'Martin',
  email: 'alice@example.test',
  phone: '+33601020304',
  city: 'Nice',
  jobTitle: 'Directrice',
  segments: ['agent', 'dirigeant'],
  refs: [{ sheet: 'Dirigeant', row: 2 }],
  ...patch,
});
const lead = (patch: Partial<EnrichmentLead> = {}): EnrichmentLead => ({
  id: 'lead',
  updatedAt: new Date('2026-01-01'),
  organizationId: null,
  firstName: 'Alice',
  lastName: 'MARTIN',
  email: 'ALICE@example.test',
  phone: '06 01 02 03 04',
  jobTitle: null,
  city: null,
  segments: [],
  ...patch,
});
const agency = (patch: Partial<EnrichmentAgency> = {}): EnrichmentAgency => ({
  id: 'org',
  updatedAt: new Date('2026-01-01'),
  legalName: 'SAS AZUR CONSEIL',
  brandName: 'Immo d’Azur',
  network: 'Century 21',
  address: { city: 'Nice', street: '1 rue A' },
  crmManagers: [],
  archived: false,
  ...patch,
});
const parsed = (contacts = [contact()]): ReturnType<typeof parseMls> => ({
  fileHash: 'file',
  rowsRead: contacts.length,
  duplicates: 0,
  issues: [],
  withoutChannels: 0,
  contacts,
});
describe('rapprochement MLS prudent', () => {
  it('rapproche le téléphone normalisé et le nom, puis complète seulement les champs manquants', () => {
    const input = lead({ email: null, jobTitle: 'Responsable existant', segments: ['salon'] });
    const result = planMlsEnrichment(parsed(), [input], [agency()]);
    expect(result.updates[0]?.after).toEqual({
      organizationId: 'org',
      city: 'Nice',
      segments: ['agent', 'dirigeant', 'salon'],
    });
    expect(result.organizations[0]?.after).toEqual({ crmManagers: ['Alice Martin'] });
    expect(result.newAgencies).toHaveLength(0);
    expect(input.organizationId).toBeNull();
  });
  it('crée seulement une agence à rattacher, avec la ville et sans adresse inventée', () => {
    const result = planMlsEnrichment(parsed(), [lead()], []);
    expect(result.newAgencies).toHaveLength(1);
    expect(result.newAgencies[0]).toMatchObject({ city: 'Nice', crmManagers: ['Alice Martin'] });
    expect(result.updates[0]?.newAgencyKey).toBeTruthy();
  });
  it('refuse coordonnées partagées et email/mobile contradictoires même si un nom ressemble', () => {
    const others = [
      contact(),
      contact({ key: 'bob', firstName: 'Bob', email: 'bob@example.test', phone: '+33701020304' }),
    ];
    const result = planMlsEnrichment(parsed(others), [lead({ phone: '+33701020304' })], []);
    expect(result.updates).toHaveLength(0);
    expect(result.ignored[0]?.reason).toContain('contradictoires');
    expect(
      planMlsEnrichment(
        parsed([contact(), contact({ key: 'bob', firstName: 'Bob' })]),
        [lead()],
        [],
      ).updates,
    ).toHaveLength(0);
  });
  it('refuse une identité différente ou incomplète et plusieurs fiches CRM correspondantes', () => {
    expect(planMlsEnrichment(parsed(), [lead({ lastName: 'Dupont' })], []).updates).toHaveLength(0);
    expect(planMlsEnrichment(parsed(), [lead({ firstName: null })], []).updates).toHaveLength(0);
    const result = planMlsEnrichment(parsed(), [lead(), lead({ id: 'doublon' })], []);
    expect(result.updates).toHaveLength(0);
    expect(result.ignored).toHaveLength(2);
  });
  it('ne choisit pas un établissement parmi deux adresses et ne fusionne pas un réseau générique', () => {
    expect(
      planMlsEnrichment(
        parsed(),
        [lead()],
        [agency(), agency({ id: 'autre', address: { city: 'Nice', street: '2 rue B' } })],
      ).updates,
    ).toHaveLength(0);
    expect(
      planMlsEnrichment(parsed([contact({ agency: 'Orpi' })]), [lead()], []).updates,
    ).toHaveLength(0);
  });
  it('conserve une enseigne déjà renseignée, et propose une enseigne liée à la raison sociale uniquement si vide', () => {
    expect(
      planMlsEnrichment(
        parsed(),
        [lead({ organizationId: 'org' })],
        [agency({ brandName: 'Autre agence' })],
      ).updates,
    ).toHaveLength(0);
    const result = planMlsEnrichment(
      parsed(),
      [lead({ organizationId: 'org' })],
      [agency({ brandName: null, crmManagers: ['Responsable connu'] })],
    );
    expect(result.organizations[0]?.after).toEqual({ brandName: 'C21 Immo d’Azur' });
  });
  it('ne renomme pas une organisation rattachée à des enseignes contradictoires', () => {
    const result = planMlsEnrichment(
      parsed([
        contact(),
        contact({
          key: 'bob',
          firstName: 'Bob',
          agency: 'Autre enseigne',
          email: 'bob@example.test',
          phone: '+33701020304',
        }),
      ]),
      [
        lead({ organizationId: 'org' }),
        lead({
          id: 'bob',
          organizationId: 'org',
          firstName: 'Bob',
          email: 'bob@example.test',
          phone: '+33701020304',
        }),
      ],
      [agency({ brandName: null })],
    );
    expect(result.organizations).toHaveLength(0);
    expect(result.updates).toHaveLength(0);
  });
  it('ne repropose aucune modification quand les informations ont déjà été reprises', () => {
    const result = planMlsEnrichment(
      parsed(),
      [
        lead({
          organizationId: 'org',
          jobTitle: 'Directrice',
          city: 'Nice',
          segments: ['agent', 'dirigeant'],
        }),
      ],
      [agency({ crmManagers: ['Alice Martin'] })],
    );
    expect(result.updates).toHaveLength(0);
    expect(result.organizations).toHaveLength(0);
    expect(result.matched).toBe(1);
  });
  it('invalide l’aperçu quand la fiche ou l’agence cible change', () => {
    const before = planMlsEnrichment(parsed(), [lead()], [agency()]).digest;
    expect(
      planMlsEnrichment(parsed(), [lead({ updatedAt: new Date('2026-01-02') })], [agency()]).digest,
    ).not.toBe(before);
    expect(
      planMlsEnrichment(parsed(), [lead()], [agency({ updatedAt: new Date('2026-01-02') })]).digest,
    ).not.toBe(before);
  });
});
