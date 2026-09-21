import type { Lead } from '@qualiof/db';
import {
  cleEnseigne,
  enseigneGenerique,
  enseigneOrganisation,
  normaliserTelephone,
} from './coordonnees';
import { hash, mlsEmail, mlsKey, MLS_SOURCE } from './mls-import';

export type DuplicateLead = Lead & {
  organization: {
    legalName: string;
    brandName: string | null;
    network: string | null;
    archived: boolean;
  } | null;
  _count: Record<string, number>;
};
export type MlsDuplicatePreview = ReturnType<typeof describePair>;
function describeLead(lead: DuplicateLead) {
  return {
    id: lead.id,
    name: [lead.firstName, lead.lastName].filter(Boolean).join(' '),
    agency: lead.organization ? enseigneOrganisation(lead.organization) : 'Non renseignée',
    email: lead.email,
    phone: lead.phone,
    city: lead.city,
    jobTitle: lead.jobTitle,
    notes: lead.notes,
    segments: lead.segments,
    nextAction: lead.nextAction,
  };
}
function describePair(keep: DuplicateLead, remove: DuplicateLead) {
  const notes = [...new Set([keep.notes, remove.notes].filter((s): s is string => !!s))].join(
    '\n\n',
  );
  return {
    keep: describeLead(keep),
    remove: describeLead(remove),
    digest: hash(JSON.stringify([keep, remove])),
    mergedNotes: notes || null,
    mergedSegments: [...new Set([...keep.segments, ...remove.segments])].sort(),
  };
}
function untouched(lead: DuplicateLead) {
  return (
    lead.source === MLS_SOURCE &&
    !!lead.importKey &&
    lead.status === 'NEW' &&
    !lead.personId &&
    !lead.ownerUserId &&
    !lead.interestedProductId &&
    !lead.desiredSessionId &&
    !lead.lastActionAt &&
    !lead.lastAction &&
    !lead.nextActionAt &&
    !lead.validatedAt &&
    !lead.wonAt &&
    !lead.staleAlertedAt &&
    !lead.lossReason &&
    !lead.reminderTemplate &&
    lead.callCount === 0 &&
    Object.values(lead._count).every((n) => n === 0)
  );
}
/** Réparation limitée aux imports non travaillés : aucun arbitrage d'historique commercial. */
export function previewMlsDuplicates(leads: DuplicateLead[]) {
  const groups = new Map<string, DuplicateLead[]>();
  for (const lead of leads) {
    const phone = normaliserTelephone(lead.phone);
    if (/^\+33[67]\d{8}$/.test(phone)) groups.set(phone, [...(groups.get(phone) ?? []), lead]);
  }
  const previews: MlsDuplicatePreview[] = [];
  for (const group of groups.values()) {
    if (group.length !== 2 || group[0]!.tenantId !== group[1]!.tenantId) continue;
    const truncated = group.filter((l) => /^[67]\d{8}$/.test((l.phone ?? '').replace(/\s/g, '')));
    if (truncated.length !== 1) continue;
    const remove = truncated[0]!;
    const keep = group.find((l) => l.id !== remove.id)!;
    if (!untouched(keep) || !untouched(remove)) continue;
    if (
      !keep.firstName ||
      !keep.lastName ||
      !remove.firstName ||
      !remove.lastName ||
      mlsKey(keep.firstName) !== mlsKey(remove.firstName) ||
      mlsKey(keep.lastName) !== mlsKey(remove.lastName)
    )
      continue;
    if (keep.email && remove.email && mlsEmail(keep.email) !== mlsEmail(remove.email)) continue;
    if (keep.city && remove.city && mlsKey(keep.city) !== mlsKey(remove.city)) continue;
    if (keep.priority !== remove.priority || keep.nextAction !== remove.nextAction) continue;
    if (
      !keep.organization ||
      !remove.organization ||
      keep.organization.archived ||
      remove.organization.archived
    )
      continue;
    const generic = enseigneOrganisation(remove.organization);
    const precise = enseigneOrganisation(keep.organization);
    if (
      !enseigneGenerique(generic) ||
      enseigneGenerique(precise) ||
      !cleEnseigne(precise).startsWith(cleEnseigne(generic) + ' ')
    )
      continue;
    const preview = describePair(keep, remove);
    if ((preview.mergedNotes?.length ?? 0) <= 10000) previews.push(preview);
  }
  return previews;
}
