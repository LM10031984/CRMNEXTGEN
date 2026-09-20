import { createHash } from 'node:crypto';
import * as XLSX from 'xlsx';

export const MLS_SOURCE = 'MLS_COTE_D_AZUR';
export const mlsText = (v: unknown) =>
  String(v ?? '')
    .trim()
    .replace(/\s+/g, ' ');
export const mlsKey = (v: unknown) =>
  mlsText(v)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
export const mlsEmail = (v: unknown) => mlsText(v).toLowerCase();
export function mlsPhone(v: unknown) {
  let p = mlsText(v).replace(/[^\d+]/g, '');
  if (p.startsWith('00')) p = '+' + p.slice(2);
  if (/^0\d{9}$/.test(p)) p = '+33' + p.slice(1);
  if (/^33\d{9}$/.test(p)) p = '+' + p;
  return p;
}
export const hash = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
export interface MlsRow {
  agency: string;
  agencyKey: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  jobTitle: string;
  segments: string[];
  refs: Array<{ sheet: string; row: number }>;
  key: string;
}
export type ImportIssue = { refs: Array<{ sheet: string; row: number }>; reason: string };
export function parseMls(buffer: Buffer) {
  if (buffer.length > 5 * 1024 * 1024) throw new Error('Le fichier dépasse 5 Mo.');
  const book = XLSX.read(buffer, { type: 'buffer', sheetRows: 10002 });
  const sheets: Record<string, string> = {
    'Users MLS Côte dAzur': 'agent',
    Dirigeant: 'dirigeant',
    Collaborateurs: 'collaborateur',
  };
  if (!Object.keys(sheets).every((s) => book.SheetNames.includes(s)))
    throw new Error('Les trois onglets MLS attendus sont manquants.');
  const groups = new Map<string, MlsRow[]>();
  const issues: ImportIssue[] = [];
  let rowsRead = 0;
  let withoutChannels = 0;
  for (const [sheet, segment] of Object.entries(sheets)) {
    const sheetRef = book.Sheets[sheet]?.['!fullref'] ?? book.Sheets[sheet]?.['!ref'];
    if (sheetRef && XLSX.utils.decode_range(sheetRef).e.r > 10000)
      throw new Error('Trop de lignes dans un onglet (maximum 10 000).');
    const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[sheet]!, {
      header: 1,
      defval: '',
      blankrows: false,
    });
    // __rowNum__ n’est pas disponible en mode tableau : garder les rangs Excel exacts.
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[sheet]!, {
      header: 1,
      defval: '',
      blankrows: true,
    });
    if (rows.length > 10000) throw new Error('Trop de lignes dans un onglet (maximum 10 000).');
    const headers = (matrix[0] ?? []).map(mlsKey);
    const idx = [
      headers.findIndex((h) => h.startsWith('nom de l agence')),
      headers.findIndex((h) => h.startsWith('prenom')),
      headers.findIndex((h) => h === 'nom' || h.startsWith('nom de l agent')),
      headers.indexOf('email'),
      headers.indexOf('mobile'),
      headers.indexOf('ville'),
      headers.indexOf('titre'),
    ];
    if (idx.some((i) => i < 0)) throw new Error(`Colonnes attendues absentes : ${sheet}.`);
    matrix.slice(1).forEach((raw, i) => {
      const cells = idx.map((j) => mlsText(raw[j]));
      if (!cells.some(Boolean)) return;
      rowsRead++;
      const [agency, firstName, lastName, emailRaw, phoneRaw, city, jobTitle] = cells as [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ];
      const email = mlsEmail(emailRaw),
        phone = mlsPhone(phoneRaw),
        refs = [{ sheet, row: i + 2 }];
      if (!email && !phone) withoutChannels++;
      if (
        !agency ||
        !firstName ||
        !lastName ||
        agency.length > 300 ||
        firstName.length > 80 ||
        lastName.length > 80
      ) {
        issues.push({ refs, reason: 'Agence, prénom ou nom manquant / trop long' });
        return;
      }
      if (
        (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ||
        (phone && !/^\+?\d{7,15}$/.test(phone))
      ) {
        issues.push({ refs, reason: 'Email ou téléphone invalide' });
        return;
      }
      const agencyKey = mlsKey(agency),
        key = hash(JSON.stringify([agencyKey, mlsKey(firstName), mlsKey(lastName)]));
      const row: MlsRow = {
        agency,
        agencyKey,
        firstName,
        lastName,
        email,
        phone,
        city,
        jobTitle,
        segments: [segment],
        refs,
        key,
      };
      groups.set(key, [...(groups.get(key) ?? []), row]);
    });
  }
  const contacts: MlsRow[] = [];
  let duplicates = 0;
  for (const rows of groups.values()) {
    // Même nom dans la même agence avec des coordonnées divergentes : examen humain.
    const differing = ['email', 'phone', 'city', 'jobTitle'].filter(
      (k) =>
        new Set(
          rows
            .map((r) => (k === 'email' || k === 'phone' ? r[k] : mlsKey(r[k as keyof MlsRow])))
            .filter(Boolean),
        ).size > 1,
    );
    if (differing.length) {
      issues.push({
        refs: rows.flatMap((r) => r.refs),
        reason: `Même identité, informations divergentes : ${differing.join(', ')}`,
      });
      continue;
    }
    const r = {
      ...rows[0]!,
      email: rows.find((r) => r.email)?.email ?? '',
      phone: rows.find((r) => r.phone)?.phone ?? '',
      city: rows.find((r) => r.city)?.city ?? '',
      jobTitle: rows.find((r) => r.jobTitle)?.jobTitle ?? '',
      segments: [...new Set(rows.flatMap((r) => r.segments))],
      refs: rows.flatMap((r) => r.refs),
    };
    contacts.push(r);
    duplicates += rows.length - 1;
  }
  return { fileHash: hash(buffer), rowsRead, withoutChannels, duplicates, issues, contacts };
}

export interface ExistingLead {
  id: string;
  importKey: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
}
export interface ExistingAgency {
  id: string;
  legalName: string;
  address: unknown;
  archived?: boolean;
}
export function planMls(
  parsed: ReturnType<typeof parseMls>,
  leads: ExistingLead[],
  agencies: ExistingAgency[],
) {
  const ignored: Array<{ key: string; reason: string; refs: MlsRow['refs'] }> = [];
  const create: Array<{ contact: MlsRow; organizationId: string | null }> = [];
  const emails = new Set(leads.map((l) => mlsEmail(l.email)).filter(Boolean)),
    phones = new Set(leads.map((l) => mlsPhone(l.phone)).filter(Boolean)),
    keys = new Set(leads.map((l) => l.importKey));
  const channels = new Map<string, Set<string>>();
  const cities = new Map<string, Set<string>>();
  for (const c of parsed.contacts) {
    const values = cities.get(c.agencyKey) ?? new Set<string>();
    if (c.city) values.add(mlsKey(c.city));
    cities.set(c.agencyKey, values);
  }
  for (const c of parsed.contacts)
    for (const channel of [c.email && 'e:' + c.email, c.phone && 'p:' + c.phone].filter(Boolean)) {
      const identities = channels.get(channel) || new Set<string>();
      identities.add(c.key);
      channels.set(channel, identities);
    }
  for (const c of parsed.contacts) {
    let reason = '';
    let org: ExistingAgency | undefined;
    if (keys.has(c.key)) reason = 'Déjà importé (fiche conservée)';
    else if ((cities.get(c.agencyKey)?.size ?? 0) > 1)
      reason = 'Plusieurs villes pour la même agence : points de vente à préciser';
    else if ((c.email && emails.has(c.email)) || (c.phone && phones.has(c.phone)))
      reason = 'Coordonnées déjà présentes dans le CRM : rapprochement à vérifier';
    else if (
      [c.email && 'e:' + c.email, c.phone && 'p:' + c.phone].some(
        (ch) => ch && (channels.get(ch)?.size ?? 0) > 1,
      )
    )
      reason =
        'Coordonnées partagées par plusieurs identités du fichier : rapprochement à vérifier';
    else {
      const sameName = agencies.filter((a) => mlsKey(a.legalName) === c.agencyKey);
      const matching = sameName.filter(
        (a) =>
          !a.archived &&
          (!c.city ||
            !mlsKey((a.address as Record<string, unknown> | null)?.city) ||
            mlsKey((a.address as Record<string, unknown> | null)?.city) === mlsKey(c.city)),
      );
      if (sameName.length && matching.length !== 1)
        reason = 'Agence existante ambiguë (ville, archive ou plusieurs points de vente)';
      else org = matching[0];
    }
    if (reason) ignored.push({ key: c.key, reason, refs: c.refs });
    else create.push({ contact: c, organizationId: org?.id ?? null });
  }
  const newAgencies = [
    ...new Set(create.filter((c) => !c.organizationId).map((c) => c.contact.agencyKey)),
  ];
  const digest = hash(
    JSON.stringify({
      fileHash: parsed.fileHash,
      create: create.map((c) => [c.contact.key, c.organizationId]),
      ignored,
    }),
  );
  return { create, ignored, newAgencies, digest };
}
