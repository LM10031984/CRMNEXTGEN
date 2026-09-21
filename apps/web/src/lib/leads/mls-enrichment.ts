import { cleEnseigne, enseigneGenerique, enseigneOrganisation } from './coordonnees';
import { hash, mlsEmail, mlsKey, mlsPhone, type MlsRow, type parseMls } from './mls-import';

export interface EnrichmentLead {
  id: string;
  updatedAt: Date;
  organizationId: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  city: string | null;
  segments: string[];
}
export interface EnrichmentAgency {
  network?: string | null;
  id: string;
  updatedAt: Date;
  legalName: string;
  brandName: string | null;
  address: unknown;
  crmManagers: string[];
  archived: boolean;
}
type LeadPatch = { organizationId?: string; jobTitle?: string; city?: string; segments?: string[] };
type AgencyPatch = { brandName?: string; crmManagers?: string[] };
export function planMlsEnrichment(
  parsed: ReturnType<typeof parseMls>,
  leads: EnrichmentLead[],
  agencies: EnrichmentAgency[],
) {
  const ignored: Array<{ id: string; name: string; reason: string; refs: MlsRow['refs'] }> = [];
  const proposals: Array<{ lead: EnrichmentLead; contact: MlsRow }> = [];
  const updates: Array<{
    id: string;
    updatedAt: string;
    name: string;
    agency: string;
    before: LeadPatch;
    after: LeadPatch;
    newAgencyKey?: string;
    organizationUpdatedAt?: string;
    refs: MlsRow['refs'];
  }> = [];
  const organizationUpdates = new Map<
    string,
    { id: string; updatedAt: string; name: string; before: AgencyPatch; after: AgencyPatch }
  >();
  const newAgencies = new Map<
    string,
    { key: string; legalName: string; city: string; crmManagers: string[] }
  >();
  const channels = new Map<string, MlsRow[]>();
  for (const c of parsed.contacts)
    for (const key of [c.email && `e:${c.email}`, c.phone && `p:${c.phone}`].filter(Boolean))
      channels.set(key, [...(channels.get(key) ?? []), c]);
  const skip = (lead: EnrichmentLead, reason: string, refs: MlsRow['refs'] = []) =>
    ignored.push({
      id: lead.id,
      name: [lead.firstName, lead.lastName].filter(Boolean).join(' '),
      reason,
      refs,
    });
  for (const lead of leads) {
    const byEmail = channels.get(`e:${mlsEmail(lead.email)}`) ?? [];
    const byPhone = channels.get(`p:${mlsPhone(lead.phone)}`) ?? [];
    const candidates = [...new Map([...byEmail, ...byPhone].map((c) => [c.key, c])).values()];
    if (!candidates.length) continue;
    if (candidates.length !== 1) {
      skip(
        lead,
        'Coordonnées partagées ou email/mobile contradictoires',
        candidates.flatMap((c) => c.refs),
      );
      continue;
    }
    const contact = candidates[0]!;
    if (
      (lead.firstName && mlsKey(lead.firstName) !== mlsKey(contact.firstName)) ||
      (lead.lastName && mlsKey(lead.lastName) !== mlsKey(contact.lastName))
    ) {
      skip(lead, 'Le nom CRM diffère de celui du fichier : identité à vérifier', contact.refs);
      continue;
    }
    // Pas de rattachement d’une fiche sans identité sur une boîte d’agence.
    if (!lead.firstName || !lead.lastName) {
      skip(lead, 'Identité CRM incomplète', contact.refs);
      continue;
    }
    proposals.push({ lead, contact });
  }
  const uses = new Map<string, number>();
  const agencyEvidence = new Map<string, Set<string>>();
  for (const { lead, contact } of proposals) {
    uses.set(contact.key, (uses.get(contact.key) ?? 0) + 1);
    if (lead.organizationId) {
      const set = agencyEvidence.get(lead.organizationId) ?? new Set<string>();
      set.add(cleEnseigne(contact.agency));
      agencyEvidence.set(lead.organizationId, set);
    }
  }
  const cityOf = (a: EnrichmentAgency) =>
    mlsKey((a.address as Record<string, unknown> | null)?.city);
  let matched = 0;
  for (const { lead, contact: c } of proposals) {
    if ((uses.get(c.key) ?? 0) > 1) {
      skip(lead, 'Plusieurs fiches CRM correspondent à cette identité', c.refs);
      continue;
    }
    if (enseigneGenerique(c.agency)) {
      skip(lead, 'Le réseau seul ne permet pas d’identifier une agence', c.refs);
      continue;
    }
    let agency = lead.organizationId
      ? agencies.find((a) => a.id === lead.organizationId && !a.archived)
      : undefined;
    if (lead.organizationId && !agency) {
      skip(lead, 'Agence actuelle indisponible ou archivée', c.refs);
      continue;
    }
    if (
      agency &&
      ((agencyEvidence.get(agency.id)?.size ?? 0) > 1 ||
        (agency.brandName && cleEnseigne(enseigneOrganisation(agency)) !== cleEnseigne(c.agency)))
    ) {
      skip(
        lead,
        'L’enseigne CRM diffère ou plusieurs enseignes MLS désignent la même organisation',
        c.refs,
      );
      continue;
    }
    if (!agency) {
      const candidates = agencies.filter(
        (a) =>
          !a.archived &&
          [enseigneOrganisation(a), a.legalName].some(
            (n) => n && cleEnseigne(n) === cleEnseigne(c.agency),
          ),
      );
      const compatible = candidates.filter(
        (a) => !c.city || !cityOf(a) || cityOf(a) === mlsKey(c.city),
      );
      if (candidates.length && compatible.length !== 1) {
        skip(
          lead,
          'Plusieurs points de vente possibles ou ville différente : adresse à préciser',
          c.refs,
        );
        continue;
      }
      agency = compatible[0];
    }
    const cityKey = mlsKey(c.city);
    if (agency && cityOf(agency) && cityKey && cityOf(agency) !== cityKey) {
      skip(
        lead,
        'La ville de l’agence CRM diffère du secteur MLS : point de vente à vérifier',
        c.refs,
      );
      continue;
    }
    const cities = new Set(
      parsed.contacts
        .filter((other) => cleEnseigne(other.agency) === cleEnseigne(c.agency))
        .map((other) => mlsKey(other.city))
        .filter(Boolean),
    );
    if (!agency && cities.size > 1) {
      skip(lead, 'Plusieurs secteurs pour cette enseigne : point de vente à confirmer', c.refs);
      continue;
    }
    const managers = [
      ...new Set(
        parsed.contacts
          .filter(
            (other) =>
              cleEnseigne(other.agency) === cleEnseigne(c.agency) &&
              (!cityKey || !other.city || mlsKey(other.city) === cityKey) &&
              other.segments.includes('dirigeant'),
          )
          .map((other) => `${other.firstName} ${other.lastName}`),
      ),
    ].sort();
    const before: LeadPatch = {},
      after: LeadPatch = {};
    let newAgencyKey: string | undefined;
    if (!lead.organizationId) {
      before.organizationId = '';
      if (agency) after.organizationId = agency.id;
      else {
        newAgencyKey = `${cleEnseigne(c.agency)}:${cityKey}`;
        newAgencies.set(newAgencyKey, {
          key: newAgencyKey,
          legalName: c.agency,
          city: c.city,
          crmManagers: managers,
        });
      }
    }
    if (!lead.jobTitle && c.jobTitle) {
      before.jobTitle = '';
      after.jobTitle = c.jobTitle;
    }
    if (!lead.city && c.city) {
      before.city = '';
      after.city = c.city;
    }
    const segments = [...new Set([...lead.segments, ...c.segments])].sort();
    if (JSON.stringify([...lead.segments].sort()) !== JSON.stringify(segments)) {
      before.segments = lead.segments;
      after.segments = segments;
    }
    if (agency) {
      const patch: AgencyPatch = {};
      if (!agency.brandName && cleEnseigne(agency.legalName) !== cleEnseigne(c.agency))
        patch.brandName = c.agency;
      if (!agency.crmManagers.length && managers.length) patch.crmManagers = managers;
      if (Object.keys(patch).length) {
        const previous = organizationUpdates.get(agency.id);
        if (previous?.after.crmManagers && patch.crmManagers)
          patch.crmManagers = [
            ...new Set([...previous.after.crmManagers, ...patch.crmManagers]),
          ].sort();
        organizationUpdates.set(agency.id, {
          id: agency.id,
          updatedAt: agency.updatedAt.toISOString(),
          name: agency.legalName,
          before: { brandName: agency.brandName ?? '', crmManagers: agency.crmManagers },
          after: patch,
        });
      }
    }
    matched++;
    if (newAgencyKey || Object.keys(after).length)
      updates.push({
        id: lead.id,
        updatedAt: lead.updatedAt.toISOString(),
        name: `${lead.firstName} ${lead.lastName}`,
        agency: c.agency,
        before,
        after,
        newAgencyKey,
        organizationUpdatedAt: agency?.updatedAt.toISOString(),
        refs: c.refs,
      });
  }
  const organizations = [...organizationUpdates.values()].sort((a, b) => a.id.localeCompare(b.id));
  const created = [...newAgencies.values()].sort((a, b) => a.key.localeCompare(b.key));
  updates.sort((a, b) => a.id.localeCompare(b.id));
  const digest = hash(
    JSON.stringify({ fileHash: parsed.fileHash, updates, organizations, created }),
  );
  return { updates, organizations, newAgencies: created, ignored, matched, digest };
}
