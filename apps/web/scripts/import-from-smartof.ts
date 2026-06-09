/**
 * Import depuis SmartOF (Mobileo) → QualiOF.
 *
 * Source de vérité = SmartOF pour les apprenants/entreprises/formateurs/produits/sessions.
 * QualiOF ajoute le métier Qualiopi (docs, dossiers, AGEFICE, factures).
 *
 * Idempotence via ExternalIdentity(source='smartof', externalId=*Uid).
 * Matching secondaire (avant create) :
 *   - Organization : par SIRET puis legalName insensible casse
 *   - Person       : par email puis firstName+lastName insensible casse
 *   - Product      : par title insensible casse
 *   - Session      : par code (SES-XXXX) unique
 *
 * Usage :
 *   pnpm tsx scripts/import-from-smartof.ts                       # dry-run (defaut)
 *   pnpm tsx scripts/import-from-smartof.ts --apply               # écrit en BDD
 *   pnpm tsx scripts/import-from-smartof.ts --only=entreprises,formateurs
 *
 * Scopes dispos : entreprises | apprenants | formateurs | produits | sessions
 */

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { prisma, LinkRole, Modality, SessionStatus, LegalForm, Prisma } from '@qualiof/db';

const BASE = process.env.SMARTOF_BASE_URL!;
const FIREBASE_KEY = process.env.SMARTOF_FIREBASE_API_KEY!;
const EMAIL = process.env.SMARTOF_EMAIL!;
const PASSWORD = process.env.SMARTOF_PASSWORD!;

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const onlyArg = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1];
const ONLY: Set<string> | null = onlyArg
  ? new Set(onlyArg.split(',').map((s) => s.trim().toLowerCase()))
  : null;

const ALL_SCOPES = [
  'entreprises',
  'apprenants',
  'formateurs',
  'produits',
  'sessions',
  'inscriptions',
] as const;
function shouldRun(name: (typeof ALL_SCOPES)[number]): boolean {
  return !ONLY || ONLY.has(name);
}

// ── HTTP helpers ────────────────────────────────────────────────

async function getIdToken(): Promise<string> {
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
    },
  );
  const d = await r.json();
  if (!d.idToken) throw new Error(`Auth SmartOF échouée : ${JSON.stringify(d).slice(0, 200)}`);
  return d.idToken;
}

async function smartofPost<T>(token: string, p: string, body: object = {}): Promise<T> {
  const r = await fetch(`${BASE}${p}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${p} HTTP ${r.status} — ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as T;
}

// ── Types SmartOF ───────────────────────────────────────────────

interface SmartAddress {
  rue?: string;
  voie?: string; // safety : certains anciens enregistrements utilisaient `voie`
  complementAdresse?: string;
  codePostal?: string;
  ville?: string;
  pays?: string;
}
interface SmartMetaPerson {
  nom?: string;
  prenom?: string;
  email?: string;
  tel?: string;
  civilite?: string;
  adresse?: SmartAddress;
  statutBPF?: string;
  fonction?: string;
  dateNaissance?: string;
  nomUsage?: string;
}
type CustomFields = Record<string, string>;

interface SmartApprenant {
  apprenantUid: string;
  customId?: string;
  email?: string;
  meta?: SmartMetaPerson;
  entrepriseUids?: string[];
  custom_fields?: CustomFields;
  archived?: boolean;
}
interface SmartFormateur {
  formateurUid: string;
  customId?: string;
  email?: string;
  meta?: SmartMetaPerson;
  entrepriseUids?: string[];
  custom_fields?: CustomFields;
  archived?: boolean;
}
interface SmartEntreprise {
  entrepriseUid: string;
  customId?: string;
  meta?: {
    nom?: string;
    siret?: string;
    email?: string;
    tel?: string;
    adresse?: SmartAddress;
  };
  archived?: boolean;
}
interface SmartProduit {
  produitFormationUid?: string; // selon doc — fallback sur autres clés
  produitUid?: string;
  uid?: string;
  customId?: string;
  meta?: { nom?: string; status?: string };
  description?: {
    intitule?: string;
    objectifs?: string;
    dureeDeLaFormation?: string | number;
    publicVise?: string;
    contenu?: string;
    contenuDeLaFormation?: string;
  };
  custom_fields?: CustomFields;
  archived?: boolean;
}
interface SmartSession {
  sessionUid: string;
  customId?: string;
  produitFormationViseeUid?: string;
  meta?: {
    nom?: string;
    dateDebut?: string;
    dateFin?: string;
    status?: string;
  };
  custom_fields?: CustomFields;
  archived?: boolean;
}
interface SmartDemandeInscription {
  demandeInscriptionUid: string;
  customId?: string;
  sessionUid: string;
  type?: 'entreprise' | 'particulier';
  archived?: boolean;
  meta?: {
    apprenant?: {
      email?: string;
      meta?: SmartMetaPerson;
      custom_fields?: CustomFields;
    };
    entreprise?: {
      meta?: { nom?: string; siret?: string };
    };
  };
}

// ── Counters ────────────────────────────────────────────────────

interface ImportCounts {
  pulled: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  createdSamples: string[];
}
function emptyCounts(): ImportCounts {
  return { pulled: 0, created: 0, updated: 0, skipped: 0, errors: [], createdSamples: [] };
}
function logCounts(label: string, c: ImportCounts): void {
  console.log(
    `[${label}] pull=${c.pulled} create=${c.created} update=${c.updated} skip=${c.skipped} err=${c.errors.length}`,
  );
  if (c.createdSamples.length > 0) {
    console.log(`   🆕 À créer (échantillon) :`);
    for (const s of c.createdSamples.slice(0, 12)) console.log(`      • ${s}`);
    if (c.createdSamples.length > 12)
      console.log(`      … +${c.createdSamples.length - 12} autres`);
  }
  for (const e of c.errors.slice(0, 5)) console.log(`   ⚠️  ${e}`);
}

// ── Helpers communs ─────────────────────────────────────────────

function mapAddress(a: SmartAddress | undefined): Prisma.JsonObject | null {
  if (!a) return null;
  const out: Prisma.JsonObject = {};
  const street = a.rue?.trim() ?? a.voie?.trim();
  if (street) out.street = street;
  if (a.complementAdresse?.trim()) out.complement = a.complementAdresse.trim();
  if (a.codePostal?.trim()) out.postalCode = a.codePostal.trim();
  if (a.ville?.trim()) out.city = a.ville.trim();
  if (a.pays?.trim()) out.country = a.pays.trim();
  return Object.keys(out).length > 0 ? out : null;
}

function parseDate(s: string | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function personDataFromSmart(
  meta: SmartMetaPerson | undefined,
  email: string | undefined,
  custom: CustomFields | undefined,
  tenantId: string,
): {
  tenantId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  civility: string | null;
  birthDate: Date | null;
  birthName: string | null;
  personalAddress: Prisma.JsonObject | null;
  professionalStatus: string | null;
  bpfDefaultStatus: string | null;
  educationLevel: string | null;
  professionalExperience: string | null;
} | null {
  const firstName = meta?.prenom?.trim();
  const lastName = meta?.nom?.trim();
  if (!firstName && !lastName) return null;
  return {
    tenantId,
    firstName: firstName || '?',
    lastName: lastName || '?',
    email: email?.trim() || meta?.email?.trim() || null,
    phone: meta?.tel?.trim() || null,
    civility: meta?.civilite?.trim() || null,
    birthDate: parseDate(meta?.dateNaissance),
    birthName: meta?.nomUsage?.trim() || null,
    personalAddress: mapAddress(meta?.adresse),
    professionalStatus: meta?.fonction?.trim() || null,
    bpfDefaultStatus: meta?.statutBPF?.trim() || null,
    // custom_field_2 = diplôme, custom_field_3 = expérience (cf sample SmartOF)
    educationLevel: custom?.custom_field_2?.trim() || null,
    professionalExperience: custom?.custom_field_3?.trim() || null,
  };
}

// Format n° de sécurité sociale : 13 chiffres + 2 (clé), tolérant aux espaces
function extractSsn(custom: CustomFields | undefined): string | null {
  const v = custom?.custom_field_1?.replace(/\s+/g, '');
  if (!v) return null;
  return /^\d{13,15}$/.test(v) ? v : null;
}

async function resolveTenantId(): Promise<string> {
  const t = await prisma.tenant.findFirst({ select: { id: true, name: true } });
  if (!t) throw new Error('Aucun Tenant en base — créer un Tenant avant import.');
  console.log(`Tenant cible : ${t.name} (${t.id})`);
  return t.id;
}

async function ensureExternalIdentity(
  tenantId: string,
  entityType: string,
  entityId: string,
  externalId: string,
): Promise<void> {
  await prisma.externalIdentity.upsert({
    where: { source_externalId: { source: 'smartof', externalId } },
    create: { tenantId, entityType, entityId, source: 'smartof', externalId },
    update: { entityType, entityId, tenantId },
  });
}

// ── 1. Entreprises ──────────────────────────────────────────────

async function importEntreprises(token: string, tenantId: string): Promise<ImportCounts> {
  const c = emptyCounts();
  const { entreprises } = await smartofPost<{ entreprises: SmartEntreprise[] }>(
    token,
    '/api/entreprise/list',
  );
  c.pulled = entreprises.length;

  for (const e of entreprises) {
    try {
      const name = e.meta?.nom?.trim();
      if (!name) {
        c.skipped++;
        continue;
      }
      const existing = await prisma.externalIdentity.findUnique({
        where: { source_externalId: { source: 'smartof', externalId: e.entrepriseUid } },
        select: { entityId: true },
      });
      // legalForm requis Prisma mais SmartOF ne le fournit pas → AUTRE par défaut
      // à la création seulement (on ne réécrit pas la legalForm existante sur update,
      // car l'admin peut l'avoir corrigée à la main).
      const dataCommon = {
        tenantId,
        legalName: name,
        siret: e.meta?.siret?.replace(/\s+/g, '') || null,
        email: e.meta?.email || null,
        phone: e.meta?.tel || null,
        address: mapAddress(e.meta?.adresse) ?? undefined,
        archived: !!e.archived,
      };
      const data = dataCommon;

      let orgId: string | null = existing?.entityId ?? null;
      if (!orgId) {
        // matching secondaire SIRET → legalName
        const bySiret = data.siret
          ? await prisma.organization.findFirst({
              where: { tenantId, siret: data.siret },
              select: { id: true },
            })
          : null;
        const matched =
          bySiret ??
          (await prisma.organization.findFirst({
            where: { tenantId, legalName: { equals: data.legalName, mode: 'insensitive' } },
            select: { id: true },
          }));
        if (matched) orgId = matched.id;
      }

      if (orgId) {
        if (APPLY) {
          await prisma.organization.update({
            where: { id: orgId },
            data: { ...data, address: data.address ?? Prisma.JsonNull },
          });
          await ensureExternalIdentity(tenantId, 'Organization', orgId, e.entrepriseUid);
        }
        c.updated++;
      } else {
        if (APPLY) {
          const org = await prisma.organization.create({
            data: {
              ...dataCommon,
              legalForm: LegalForm.AUTRE,
              address: dataCommon.address ?? Prisma.JsonNull,
            },
          });
          await ensureExternalIdentity(tenantId, 'Organization', org.id, e.entrepriseUid);
        }
        c.created++;
        c.createdSamples.push(`${name}${data.siret ? ` — SIRET ${data.siret}` : ''}`);
      }
    } catch (err: any) {
      c.errors.push(`Entreprise ${e.entrepriseUid} (${e.meta?.nom}) : ${err.message ?? err}`);
    }
  }
  return c;
}

interface OrgInfo {
  id: string;
  legalName: string;
}
async function buildOrgIdMap(): Promise<Map<string, OrgInfo>> {
  const idents = await prisma.externalIdentity.findMany({
    where: { source: 'smartof', entityType: 'Organization' },
    select: { externalId: true, entityId: true },
  });
  if (idents.length === 0) return new Map();
  const orgs = await prisma.organization.findMany({
    where: { id: { in: idents.map((i) => i.entityId) } },
    select: { id: true, legalName: true },
  });
  const byQid = new Map(orgs.map((o) => [o.id, o]));
  return new Map(
    idents.map((i) => [
      i.externalId,
      { id: i.entityId, legalName: byQid.get(i.entityId)?.legalName ?? '' } as OrgInfo,
    ]),
  );
}

// Pattern dominant Start Academy (agent immo) : 1 Person → EI propre (= même
// nom que la person) + 1 enseigne (Orpi, Century 21…). Heuristique pour
// attribuer le bon rôle LegalLink lors de l'import depuis SmartOF qui ne
// fournit qu'un `entrepriseUids[]` non typé.
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
function isOwnEi(
  person: { firstName: string; lastName: string },
  orgName: string,
): boolean {
  if (!orgName) return false;
  const n = normalize(orgName);
  const a = normalize(`${person.firstName} ${person.lastName}`);
  const b = normalize(`${person.lastName} ${person.firstName}`);
  if (!n || !a) return false;
  // Match si nom entreprise = "DUPONT Jean" / "Jean DUPONT" ou contient l'un des deux
  return (
    n === a ||
    n === b ||
    n.includes(a) ||
    n.includes(b) ||
    a.includes(n) ||
    b.includes(n)
  );
}
function inferNonEiRole(profStatus: string | null | undefined): LinkRole {
  const n = (profStatus ?? '').toLowerCase();
  if (/salar|employ|conseill/.test(n)) return 'SALARIE';
  return 'AGENT_COMMERCIAL'; // défaut pour l'immobilier
}

async function buildProductIdMap(): Promise<Map<string, string>> {
  const rows = await prisma.externalIdentity.findMany({
    where: { source: 'smartof', entityType: 'TrainingProduct' },
    select: { externalId: true, entityId: true },
  });
  return new Map(rows.map((r) => [r.externalId, r.entityId]));
}

async function buildSessionIdMap(): Promise<Map<string, string>> {
  const rows = await prisma.externalIdentity.findMany({
    where: { source: 'smartof', entityType: 'TrainingSession' },
    select: { externalId: true, entityId: true },
  });
  return new Map(rows.map((r) => [r.externalId, r.entityId]));
}

async function findPersonByMatch(
  tenantId: string,
  data: { email: string | null; firstName: string; lastName: string },
): Promise<{ id: string } | null> {
  if (data.email) {
    const byEmail = await prisma.person.findFirst({
      where: { tenantId, email: { equals: data.email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (byEmail) return byEmail;
  }
  return prisma.person.findFirst({
    where: {
      tenantId,
      firstName: { equals: data.firstName, mode: 'insensitive' },
      lastName: { equals: data.lastName, mode: 'insensitive' },
    },
    select: { id: true },
  });
}

type LegalRoleResolver = (
  person: { firstName: string; lastName: string; professionalStatus: string | null },
  org: OrgInfo,
  i: number,
) => LinkRole;

// Upsert Person + ses dépendances (LegalLinks, SSN). Retourne le personId.
async function upsertPersonFromSmart(opts: {
  tenantId: string;
  externalUid: string;
  meta: SmartMetaPerson | undefined;
  email: string | undefined;
  customFields: CustomFields | undefined;
  entrepriseUids: string[];
  legalRole: LegalRoleResolver;
  orgIdMap: Map<string, OrgInfo>;
  counts: ImportCounts;
  label: string; // pour samples + erreurs
}): Promise<string | null> {
  const data = personDataFromSmart(opts.meta, opts.email, opts.customFields, opts.tenantId);
  if (!data) {
    opts.counts.skipped++;
    return null;
  }
  const existing = await prisma.externalIdentity.findUnique({
    where: { source_externalId: { source: 'smartof', externalId: opts.externalUid } },
    select: { entityId: true },
  });
  let personId: string | null = existing?.entityId ?? null;
  let isNew = false;
  if (!personId) {
    const matched = await findPersonByMatch(opts.tenantId, data);
    if (matched) personId = matched.id;
    else isNew = true;
  }

  if (isNew) {
    if (APPLY) {
      const p = await prisma.person.create({ data });
      personId = p.id;
      await ensureExternalIdentity(opts.tenantId, 'Person', p.id, opts.externalUid);
    }
    opts.counts.created++;
    opts.counts.createdSamples.push(
      `${data.lastName} ${data.firstName}${data.email ? ` <${data.email}>` : ''}`,
    );
  } else if (personId) {
    if (APPLY) {
      await prisma.person.update({ where: { id: personId }, data });
      await ensureExternalIdentity(opts.tenantId, 'Person', personId, opts.externalUid);
    }
    opts.counts.updated++;
  }

  // SSN → SensitiveData (PII séparée)
  if (APPLY && personId) {
    const ssn = extractSsn(opts.customFields);
    if (ssn) {
      await prisma.sensitiveData.upsert({
        where: { personId },
        create: { personId, socialSecurityNb: ssn },
        update: { socialSecurityNb: ssn },
      });
    }
  }

  // LegalLinks vers entreprises rattachées : purge ce qui pointait vers une
  // org SmartOF (le rôle pouvait être faux d'un précédent run) puis re-crée
  // selon l'heuristique fine isOwnEi / inferNonEiRole.
  if (APPLY && personId) {
    const smartofOrgIds = [...opts.orgIdMap.values()].map((v) => v.id);
    if (smartofOrgIds.length > 0) {
      await prisma.legalLink.deleteMany({
        where: { personId, organizationId: { in: smartofOrgIds } },
      });
    }
    for (const [i, entUid] of (opts.entrepriseUids ?? []).entries()) {
      const org = opts.orgIdMap.get(entUid);
      if (!org) continue;
      const role = opts.legalRole(
        {
          firstName: data.firstName,
          lastName: data.lastName,
          professionalStatus: data.professionalStatus,
        },
        org,
        i,
      );
      await prisma.legalLink.upsert({
        where: {
          personId_organizationId_role: { personId, organizationId: org.id, role },
        },
        create: {
          personId,
          organizationId: org.id,
          role,
          isPrimary: role === 'EI_SELF', // EI = relation primaire par défaut
        },
        update: {},
      });
    }
  }

  return personId;
}

// ── 2. Apprenants ──────────────────────────────────────────────

async function importApprenants(
  token: string,
  tenantId: string,
  orgIdMap: Map<string, string>,
): Promise<ImportCounts> {
  const c = emptyCounts();
  const { apprenants } = await smartofPost<{ apprenants: SmartApprenant[] }>(
    token,
    '/api/apprenant/list',
  );
  c.pulled = apprenants.length;

  for (const a of apprenants) {
    try {
      await upsertPersonFromSmart({
        tenantId,
        externalUid: a.apprenantUid,
        meta: a.meta,
        email: a.email,
        customFields: a.custom_fields,
        entrepriseUids: a.entrepriseUids ?? [],
        legalRole: (person, org) =>
          isOwnEi(person, org.legalName) ? 'EI_SELF' : inferNonEiRole(person.professionalStatus),
        orgIdMap,
        counts: c,
        label: 'Apprenant',
      });
    } catch (err: any) {
      c.errors.push(`Apprenant ${a.apprenantUid} (${a.meta?.nom}) : ${err.message ?? err}`);
    }
  }
  return c;
}

// ── 3. Formateurs ──────────────────────────────────────────────

async function importFormateurs(
  token: string,
  tenantId: string,
  orgIdMap: Map<string, string>,
): Promise<ImportCounts> {
  const c = emptyCounts();
  const { formateurs } = await smartofPost<{ formateurs: SmartFormateur[] }>(
    token,
    '/api/formateur/list',
  );
  c.pulled = formateurs.length;

  for (const f of formateurs) {
    try {
      // Force professionalStatus="Formateur" pour qu'il remonte dans
      // searchTrainerCandidates même sans LegalLink (cas où SmartOF ne donne
      // pas d'entrepriseUid). Cf audit 2026-05-23.
      const meta = f.meta ?? {};
      if (!meta.fonction?.trim()) meta.fonction = 'Formateur';
      await upsertPersonFromSmart({
        tenantId,
        externalUid: f.formateurUid,
        meta,
        email: f.email,
        customFields: f.custom_fields,
        entrepriseUids: f.entrepriseUids ?? [],
        legalRole: () => 'FORMATEUR' as LinkRole,
        orgIdMap,
        counts: c,
        label: 'Formateur',
      });
    } catch (err: any) {
      c.errors.push(`Formateur ${f.formateurUid} (${f.meta?.nom}) : ${err.message ?? err}`);
    }
  }
  return c;
}

// ── 4. Produits ─────────────────────────────────────────────────

function parseDurationHours(v: string | number | undefined): number {
  if (typeof v === 'number') return Math.max(1, Math.round(v));
  if (!v) return 7; // défaut 1 jour si manquant
  const m = String(v).match(/(\d+(\.\d+)?)/);
  return m ? Math.max(1, Math.round(parseFloat(m[1]!))) : 7;
}

async function importProduits(token: string, tenantId: string): Promise<ImportCounts> {
  const c = emptyCounts();
  const { produits } = await smartofPost<{ produits: SmartProduit[] }>(
    token,
    '/api/produit/list',
  );
  c.pulled = produits.length;

  for (const p of produits) {
    const uid = p.produitFormationUid ?? p.produitUid ?? p.uid;
    if (!uid) {
      c.skipped++;
      continue;
    }
    try {
      const title =
        p.meta?.nom?.trim() || p.description?.intitule?.trim() || p.customId || `Produit ${uid}`;
      const code = p.customId?.trim() || `PROD-${uid.slice(0, 8)}`;
      const durationHours = parseDurationHours(
        p.description?.dureeDeLaFormation ?? p.custom_fields?.custom_field_3,
      );
      const programMd =
        p.description?.contenuDeLaFormation || p.description?.contenu || '(à compléter)';
      // SmartOF expose les objectifs sous 2 clés différentes selon le produit :
      // `description.objectifsDeLaFormation` (long terme) et/ou
      // `description.objectifsPedagogiques` (par compétence). On concatène les 2.
      const rawObjs = [
        (p.description as Record<string, unknown> | undefined)?.objectifsDeLaFormation,
        (p.description as Record<string, unknown> | undefined)?.objectifsPedagogiques,
        p.description?.objectifs,
      ]
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
        .join('\n');
      const objectives: string[] = rawObjs
        ? rawObjs.split(/\n+|•|·|^-\s|^\d+[.)]\s/m).map((s) => s.trim()).filter(Boolean)
        : [];

      const data = {
        tenantId,
        code,
        title,
        durationHours,
        modality: Modality.PRESENTIEL,
        targetAudience: p.description?.publicVise?.trim() || null,
        objectives: objectives as unknown as Prisma.InputJsonValue,
        programMd,
      };

      const existing = await prisma.externalIdentity.findUnique({
        where: { source_externalId: { source: 'smartof', externalId: uid } },
        select: { entityId: true },
      });
      let productId: string | null = existing?.entityId ?? null;
      let isNew = false;
      if (!productId) {
        // matching secondaire par titre exact insensible casse
        const byTitle = await prisma.trainingProduct.findFirst({
          where: { tenantId, title: { equals: title, mode: 'insensitive' } },
          select: { id: true },
        });
        if (byTitle) productId = byTitle.id;
        else isNew = true;
      }

      if (isNew) {
        if (APPLY) {
          const prod = await prisma.trainingProduct.create({ data });
          productId = prod.id;
          await ensureExternalIdentity(tenantId, 'TrainingProduct', prod.id, uid);
        }
        c.created++;
        c.createdSamples.push(`${code} — ${title}`);
      } else if (productId) {
        if (APPLY) {
          await prisma.trainingProduct.update({ where: { id: productId }, data });
          await ensureExternalIdentity(tenantId, 'TrainingProduct', productId, uid);
        }
        c.updated++;
      }
    } catch (err: any) {
      c.errors.push(`Produit ${uid} : ${err.message ?? err}`);
    }
  }
  return c;
}

// ── 5. Sessions ─────────────────────────────────────────────────

function mapSessionStatus(s: string | undefined): SessionStatus {
  const n = (s ?? '').toLowerCase();
  if (n.includes('annul')) return SessionStatus.CANCELLED;
  if (n.includes('cours') || n.includes('progres')) return SessionStatus.IN_PROGRESS;
  if (n.includes('factur') || n.includes('terminé') || n.includes('terminee'))
    return SessionStatus.COMPLETED;
  if (n.includes('valid')) return SessionStatus.VALIDATED;
  if (n.includes('ouvert') || n.includes('open')) return SessionStatus.OPEN;
  if (n.includes('planifi') || n.includes('plan')) return SessionStatus.PLANNED;
  return SessionStatus.DRAFT;
}

// Find-or-create Location depuis les custom_fields session (1=rue, 2=CP, 3=ville).
async function resolveSessionLocation(
  tenantId: string,
  custom: CustomFields | undefined,
): Promise<string | null> {
  if (!custom) return null;
  const street = custom.custom_field_1?.trim();
  const postalCode = custom.custom_field_2?.trim();
  const city = custom.custom_field_3?.trim();
  if (!street && !city) return null;
  // Heuristique nom du lieu : "Ville — rue tronquée" sinon street seul
  const baseName = city
    ? `${city}${street ? ` — ${street.split(',')[0]?.trim()}` : ''}`
    : street!;
  const name = baseName.slice(0, 120);

  const existing = await prisma.location.findFirst({
    where: { tenantId, name: { equals: name, mode: 'insensitive' } },
    select: { id: true },
  });
  if (existing) return existing.id;
  if (!APPLY) return null;
  const loc = await prisma.location.create({
    data: {
      tenantId,
      name,
      address: {
        ...(street ? { street } : {}),
        ...(postalCode ? { postalCode } : {}),
        ...(city ? { city } : {}),
      },
    },
  });
  return loc.id;
}

async function importSessions(
  token: string,
  tenantId: string,
  productIdMap: Map<string, string>,
): Promise<ImportCounts> {
  const c = emptyCounts();
  const { sessions } = await smartofPost<{ sessions: SmartSession[] }>(
    token,
    '/api/session/list',
  );
  c.pulled = sessions.length;

  for (const s of sessions) {
    try {
      const startDate = parseDate(s.meta?.dateDebut);
      const endDate = parseDate(s.meta?.dateFin);
      if (!startDate || !endDate) {
        c.skipped++;
        continue;
      }
      const code = s.customId?.trim() || `SES-${s.sessionUid.slice(0, 8)}`;
      const name = s.meta?.nom?.trim() || null;
      const status = mapSessionStatus(s.meta?.status);

      const productId = s.produitFormationViseeUid
        ? productIdMap.get(s.produitFormationViseeUid) ?? null
        : null;
      if (!productId) {
        // Pas de produit lié → on skip plutôt que de créer une session orpheline
        c.skipped++;
        c.errors.push(`Session ${s.sessionUid} (${code}) : produit non importé, skip`);
        continue;
      }

      const locationId = await resolveSessionLocation(tenantId, s.custom_fields);

      const data: Prisma.TrainingSessionUncheckedUpdateInput = {
        tenantId,
        productId,
        code,
        name,
        status,
        startDate,
        endDate,
        modality: Modality.PRESENTIEL,
        locationId: locationId ?? null,
      };

      const existing = await prisma.externalIdentity.findUnique({
        where: { source_externalId: { source: 'smartof', externalId: s.sessionUid } },
        select: { entityId: true },
      });
      let sessionId: string | null = existing?.entityId ?? null;
      let isNew = false;
      if (!sessionId) {
        // matching secondaire par code (TrainingSession.code @unique)
        const byCode = await prisma.trainingSession.findUnique({
          where: { code },
          select: { id: true },
        });
        if (byCode) sessionId = byCode.id;
        else isNew = true;
      }

      if (isNew) {
        if (APPLY) {
          const sess = await prisma.trainingSession.create({
            data: data as Prisma.TrainingSessionUncheckedCreateInput,
          });
          sessionId = sess.id;
          await ensureExternalIdentity(tenantId, 'TrainingSession', sess.id, s.sessionUid);
        }
        c.created++;
        c.createdSamples.push(`${code} — ${name ?? '(sans nom)'}`);
      } else if (sessionId) {
        if (APPLY) {
          await prisma.trainingSession.update({ where: { id: sessionId }, data });
          await ensureExternalIdentity(tenantId, 'TrainingSession', sessionId, s.sessionUid);
        }
        c.updated++;
      }
    } catch (err: any) {
      c.errors.push(`Session ${s.sessionUid} (${s.customId}) : ${err.message ?? err}`);
    }
  }
  return c;
}

// ── 6. Inscriptions (DemandeInscription → SessionParticipant) ─────

async function importInscriptions(
  token: string,
  tenantId: string,
): Promise<ImportCounts> {
  const c = emptyCounts();
  const { demandeInscriptions } = await smartofPost<{
    demandeInscriptions: SmartDemandeInscription[];
  }>(token, '/api/demande-inscription/list');
  c.pulled = demandeInscriptions.length;

  const sessionIdMap = await buildSessionIdMap();

  for (const di of demandeInscriptions) {
    try {
      const sessionId = sessionIdMap.get(di.sessionUid);
      if (!sessionId) {
        c.skipped++;
        c.errors.push(
          `Inscription ${di.customId ?? di.demandeInscriptionUid} : session SmartOF non importée (${di.sessionUid.slice(0, 8)})`,
        );
        continue;
      }
      const am = di.meta?.apprenant?.meta;
      const aemail = di.meta?.apprenant?.email?.trim();
      const firstName = am?.prenom?.trim();
      const lastName = am?.nom?.trim();
      if (!firstName && !lastName && !aemail) {
        c.skipped++;
        continue;
      }

      // 1. Match Person : email d'abord, sinon nom+prénom
      let person: { id: string } | null = null;
      if (aemail) {
        person = await prisma.person.findFirst({
          where: { tenantId, email: { equals: aemail, mode: 'insensitive' } },
          select: { id: true },
        });
      }
      if (!person && firstName && lastName) {
        person = await prisma.person.findFirst({
          where: {
            tenantId,
            firstName: { equals: firstName, mode: 'insensitive' },
            lastName: { equals: lastName, mode: 'insensitive' },
          },
          select: { id: true },
        });
      }
      if (!person) {
        c.skipped++;
        c.errors.push(
          `Inscription ${di.customId} : apprenant introuvable (${firstName} ${lastName} <${aemail ?? '—'}>)`,
        );
        continue;
      }

      // 2. Sponsor : entreprise du DI si fournie, sinon 1ère LegalLink EI/AGENT/SALARIE de la Person
      let sponsorOrgId: string | null = null;
      const ent = di.meta?.entreprise?.meta;
      const siret = ent?.siret?.replace(/\s+/g, '');
      if (siret) {
        const o = await prisma.organization.findFirst({
          where: { tenantId, siret },
          select: { id: true },
        });
        sponsorOrgId = o?.id ?? null;
      }
      if (!sponsorOrgId && ent?.nom) {
        const o = await prisma.organization.findFirst({
          where: { tenantId, legalName: { equals: ent.nom, mode: 'insensitive' } },
          select: { id: true },
        });
        sponsorOrgId = o?.id ?? null;
      }
      if (!sponsorOrgId) {
        // Fallback : LegalLink de la Person (priorité EI_SELF)
        const linkPriority = ['EI_SELF', 'AGENT_COMMERCIAL', 'SALARIE'] as const;
        for (const role of linkPriority) {
          const ll = await prisma.legalLink.findFirst({
            where: { personId: person.id, role },
            select: { organizationId: true },
          });
          if (ll) {
            sponsorOrgId = ll.organizationId;
            break;
          }
        }
      }
      if (!sponsorOrgId) {
        c.skipped++;
        c.errors.push(
          `Inscription ${di.customId} : aucune org sponsor (entreprise vide + pas de LegalLink) — skip`,
        );
        continue;
      }

      // 3. Upsert SessionParticipant
      const existing = await prisma.externalIdentity.findUnique({
        where: {
          source_externalId: { source: 'smartof', externalId: di.demandeInscriptionUid },
        },
        select: { entityId: true },
      });
      let participantId: string | null = existing?.entityId ?? null;
      if (!participantId) {
        // Matching secondaire : SessionParticipant unique (sessionId, personId)
        const existing2 = await prisma.sessionParticipant.findFirst({
          where: { sessionId, personId: person.id },
          select: { id: true },
        });
        if (existing2) participantId = existing2.id;
      }
      if (participantId) {
        if (APPLY) {
          await prisma.sessionParticipant.update({
            where: { id: participantId },
            data: { sponsorOrgId },
          });
          await ensureExternalIdentity(
            tenantId,
            'SessionParticipant',
            participantId,
            di.demandeInscriptionUid,
          );
        }
        c.updated++;
      } else {
        if (APPLY) {
          const sp = await prisma.sessionParticipant.create({
            data: {
              sessionId,
              personId: person.id,
              sponsorOrgId,
              enrollmentStatus: 'CONFIRMED',
            },
          });
          await ensureExternalIdentity(
            tenantId,
            'SessionParticipant',
            sp.id,
            di.demandeInscriptionUid,
          );
        }
        c.created++;
        c.createdSamples.push(
          `${lastName} ${firstName} → session ${sessionId.slice(0, 8)}`,
        );
      }
    } catch (err: any) {
      c.errors.push(
        `Inscription ${di.demandeInscriptionUid} : ${err.message ?? err}`,
      );
    }
  }
  return c;
}

// ── AuditLog par run ───────────────────────────────────────────

async function logAudit(tenantId: string, summary: Record<string, ImportCounts>): Promise<void> {
  const totals: Record<string, { c: number; u: number; s: number; e: number }> = {};
  for (const [k, v] of Object.entries(summary)) {
    totals[k] = { c: v.created, u: v.updated, s: v.skipped, e: v.errors.length };
  }
  if (APPLY) {
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: null,
        action: 'smartof.sync',
        entity: 'System',
        entityId: 'import-smartof',
        diff: { mode: 'apply', totals } as Prisma.InputJsonValue,
      },
    });
  }
}

// ── Main ────────────────────────────────────────────────────────

(async () => {
  console.log(`Mode : ${APPLY ? '🟢 APPLY (écriture BDD)' : '🟡 DRY-RUN (lecture seule)'}`);
  if (ONLY) console.log(`Scope : ${[...ONLY].join(', ')}`);

  const token = await getIdToken();
  console.log('✓ Auth SmartOF OK');
  const tenantId = await resolveTenantId();
  const summary: Record<string, ImportCounts> = {};

  if (shouldRun('entreprises')) {
    summary.entreprises = await importEntreprises(token, tenantId);
    logCounts('Entreprises', summary.entreprises);
  }

  const orgIdMap = await buildOrgIdMap();
  console.log(`[orgIdMap] ${orgIdMap.size} mappings`);

  if (shouldRun('apprenants')) {
    summary.apprenants = await importApprenants(token, tenantId, orgIdMap);
    logCounts('Apprenants', summary.apprenants);
  }
  if (shouldRun('formateurs')) {
    summary.formateurs = await importFormateurs(token, tenantId, orgIdMap);
    logCounts('Formateurs', summary.formateurs);
  }
  if (shouldRun('produits')) {
    summary.produits = await importProduits(token, tenantId);
    logCounts('Produits', summary.produits);
  }

  const productIdMap = await buildProductIdMap();
  console.log(`[productIdMap] ${productIdMap.size} mappings`);

  if (shouldRun('sessions')) {
    summary.sessions = await importSessions(token, tenantId, productIdMap);
    logCounts('Sessions', summary.sessions);
  }

  if (shouldRun('inscriptions')) {
    summary.inscriptions = await importInscriptions(token, tenantId);
    logCounts('Inscriptions', summary.inscriptions);
  }

  await logAudit(tenantId, summary);
  console.log('Done.');
  process.exit(0);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
