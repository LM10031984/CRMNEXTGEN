/**
 * Sync exports SmartOF du 12/08/2026 → QualiOF (base CLOUD PRODUCTION Supabase).
 *
 * ⚠️  MODE SIMULATION PAR DÉFAUT (DRY) — AUCUNE ÉCRITURE EN BASE.
 *     L'écriture réelle exige WRITE=1 et NE DOIT être lancée qu'APRÈS validation
 *     du rapport de diff par Laurent (convention projet « destructif = étape séparée »).
 *
 * Sources (dossier parent du repo) :
 *   - Export des apprenants SmartOF - 12_08_2026.xlsx   (apprenants + rattachements entreprises)
 *   - Export des sessions SmartOF - 12_08_2026.xlsx     (sessions, commanditaires, inscriptions,
 *                                                        formateurs, créneaux — créneaux IGNORÉS)
 *   - Export des entreprises SmartOF - 12_08_2026.xlsx  (entreprises)
 *
 * Règles de fusion (héritées de import-from-smartof.ts / import-smartof.ts) :
 *   1. Clé PRIMAIRE = UID SmartOF via ExternalIdentity(source='smartof').
 *      L'EMAIL N'EST JAMAIS une clé de fusion (homonymes / boîtes partagées).
 *   2. Matching secondaire (UID inconnu) :
 *        - Organization : SIRET valide, puis legalName exact insensible casse
 *        - Person       : nom+prénom normalisés EXACTS (0 ou 1 match ; ≥2 = ambiguïté, skip)
 *        - Session      : code SES-XXXX (TrainingSession.code @unique)
 *      Tout rapprochement secondaire est listé dans le rapport pour validation.
 *   3. Une valeur VIDE côté export n'écrase JAMAIS une valeur non vide en base.
 *   4. Un montant 0 € n'écrase JAMAIS un montant non nul (priceHT). Montants non nuls
 *      divergents → CONFLIT rapporté, pas d'écrasement automatique.
 *   5. sponsorOrgId d'un participant existant n'est JAMAIS écrasé (corrections manuelles
 *      type SES-0101) — divergence rapportée pour arbitrage.
 *   6. Statut d'une session existante : PAS touché (QualiOF pilote la clôture) — diff rapporté.
 *   7. Les artefacts QualiOF (Document, ClosureBatch, PedagogicalAsset…) ne sont JAMAIS touchés.
 *   8. LegalLinks : additifs uniquement (jamais de purge). Rôle : EI_SELF si l'org porte le
 *      nom de la personne, sinon SALARIE/AGENT_COMMERCIAL selon la fonction.
 *
 * Usage (depuis apps/web) :
 *   pnpm exec dotenv -e ../../.env -- tsx scripts/sync-smartof-1208.ts            # DRY + rapport
 *   WRITE=1 pnpm exec dotenv -e ../../.env -- tsx scripts/sync-smartof-1208.ts    # écriture réelle
 *   Options : --report=/chemin/rapport.md  (défaut : .planning/phases/22-…/SMARTOF-SYNC-1208-REPORT.md)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// .env racine du monorepo (déjà chargé si lancé via dotenv-cli — inoffensif en double)
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import * as XLSX from 'xlsx';
import { prisma, LegalForm, LinkRole, Modality, SessionStatus, EnrollmentStatus, Prisma } from '@qualiof/db';
import {
  cleanSiret,
  isValidSiret,
  sirenFromSiret,
  detectOpco,
  mapLegalForm,
  buildAddress,
  organizationLooksLikePerson,
  normalizeName,
  normalizeEmail,
  normalizePhone,
} from '@qualiof/shared';

const WRITE = process.env.WRITE === '1';
const reportArg = process.argv.find((a) => a.startsWith('--report='))?.split('=')[1];

// ═══ DÉCISIONS D'ARBITRAGE — validées par Laurent le 12/08/2026 (sur rapport DRY) ═══
// ① SES-0008 « PRÉ-INSCRIPTION » : EXCLUE (fourre-tout, circuit pré-inscriptions QualiOF)
// ② Sessions ANNULÉES SmartOF absentes de la base : EXCLUES (historique reste dans SmartOF)
// ③ Montants + payeurs divergents : LA BASE GAGNE PARTOUT (déjà le comportement du script)
// ④ Produits manquants des sessions bloquées : CRÉÉS (produits simples hors pipeline IA)
const EXCLUDED_SESSION_CODES = new Set(['SES-0008']);
const EXCLUDE_CANCELLED_NEW_SESSIONS = true;
const CREATE_MISSING_PRODUCTS = true;

const REPO_ROOT = path.resolve(__dirname, '../../..'); // …/CRM Next gen/files
const EXPORT_DIR = path.resolve(REPO_ROOT, '..'); // …/CRM Next gen
const REPORT_PATH =
  reportArg ??
  path.join(
    REPO_ROOT,
    '.planning/phases/22-bascule-prod-conformit-rgpd/SMARTOF-SYNC-1208-REPORT.md',
  );

const FILES = {
  apprenants: path.join(EXPORT_DIR, 'Export des apprenants SmartOF - 12_08_2026.xlsx'),
  sessions: path.join(EXPORT_DIR, 'Export des sessions SmartOF - 12_08_2026.xlsx'),
  entreprises: path.join(EXPORT_DIR, 'Export des entreprises SmartOF - 12_08_2026.xlsx'),
};

// ───────────────────────────── Utilitaires XLSX ─────────────────────────────

type Row = Record<string, string | null>;

function loadWorkbook(filePath: string): XLSX.WorkBook {
  // Convention projet : jamais XLSX.readFile (CDN tarball) → fs.readFileSync + XLSX.read
  const buf = fs.readFileSync(filePath);
  return XLSX.read(buf, { type: 'buffer', cellDates: true });
}

function readSheet(wb: XLSX.WorkBook, sheetName: string): Row[] {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error(`Feuille introuvable : "${sheetName}"`);
  return XLSX.utils.sheet_to_json<Row>(sheet, { defval: null, raw: false });
}

/** Clé d'en-tête normalisée : minuscule, apostrophes unifiées, espaces réduits. */
function normHeader(h: string): string {
  return h.replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Lecture d'une cellule tolérante aux variantes d'apostrophes/espaces d'en-tête. */
function cell(row: Row, header: string): string | null {
  const target = normHeader(header);
  for (const [k, v] of Object.entries(row)) {
    if (normHeader(k) === target) {
      if (v === null || v === undefined) return null;
      const s = String(v).trim();
      if (s.length === 0) return null;
      // Pseudo-vides SmartOF : ne doivent jamais écraser une valeur en base
      if (s === '-' || /^non renseigné$/i.test(s)) return null;
      return s;
    }
  }
  return null;
}

function parseDateFr(v: string | null): Date | null {
  if (!v) return null;
  const m = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    let year = parseInt(m[3]!, 10);
    if (year < 100) year += 2000;
    const d = new Date(Date.UTC(year, parseInt(m[2]!, 10) - 1, parseInt(m[1]!, 10)));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function parseEuro(v: string | null): number {
  if (!v) return 0;
  return parseFloat(String(v).replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
}

/**
 * Clé de comparaison de dates en HEURE DE PARIS.
 * Les dates historiques en base sont stockées à minuit Europe/Paris (= 22h/23h UTC
 * la veille — imports SmartOF API antérieurs) alors que ce script construit ses dates
 * à minuit UTC : comparer en UTC produirait un faux « +1 jour » systématique.
 */
const parisDateFmt = new Intl.DateTimeFormat('fr-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function dateKey(d: Date | null | undefined): string {
  return d ? parisDateFmt.format(d) : ''; // YYYY-MM-DD
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '—';
  const [y, m, day] = dateKey(d).split('-');
  return `${day}/${m}/${y}`;
}

/** Comparaison "souple" : trim + espaces réduits + insensible casse. */
function softEq(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = (a ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const nb = (b ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  return na === nb;
}

/**
 * Comparaison "très souple" pour noms propres / adresses : insensible aux accents,
 * à la casse et à la ponctuation. Évite les MàJ qui DÉGRADERAIENT la donnée
 * (ex : « Stéphane » → « stephane », « Théoule-sur-Mer » → « THEOULE SUR MER »).
 */
function looseEq(a: string | null | undefined, b: string | null | undefined): boolean {
  const key = (s: string | null | undefined) =>
    normalizeName(s ?? '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  return key(a) === key(b);
}

// ─────────────────────────────── Diff collector ───────────────────────────────

interface FieldDiff {
  field: string;
  before: string;
  after: string;
}

interface EntityChange {
  label: string;
  diffs: FieldDiff[];
  note?: string;
}

/**
 * Ajoute un diff si la valeur export est NON VIDE et diffère de la base.
 * (Règle 3 : le vide n'écrase jamais.)
 */
function diffField(
  diffs: FieldDiff[],
  field: string,
  before: string | null | undefined,
  after: string | null | undefined,
  cmp: (a: string | null | undefined, b: string | null | undefined) => boolean = softEq,
): boolean {
  if (!after || !String(after).trim()) return false; // vide → jamais d'écrasement
  if (cmp(before, after)) return false;
  diffs.push({ field, before: before?.trim() || '(vide)', after: String(after).trim() });
  return true;
}

const R = {
  persons: {
    created: [] as string[],
    updated: [] as EntityChange[],
    matchedByName: [] as EntityChange[],
    ambiguous: [] as string[],
    unchanged: 0,
    archivedSkipped: [] as string[],
    ssnUpdated: [] as string[], // PII masquée : on ne liste que le nom
  },
  orgs: {
    created: [] as string[],
    updated: [] as EntityChange[],
    matchedBySiret: [] as EntityChange[],
    matchedByName: [] as EntityChange[],
    unchanged: 0,
    archivedSkipped: [] as string[],
    agefice: [] as string[],
  },
  legalLinks: {
    toCreate: [] as string[],
    onNewEntities: 0,
    existingPair: 0,
    unresolved: [] as string[],
  },
  sessions: {
    created: [] as string[],
    updated: [] as EntityChange[],
    matchedByCode: [] as string[],
    statusDiffs: [] as string[],
    productMismatch: [] as string[],
    missingProduct: [] as string[],
    inDbNotInExport: [] as string[],
    excludedByDecision: [] as string[],
    unchanged: 0,
    archivedSkipped: [] as string[],
  },
  products: {
    created: [] as string[],
  },
  participants: {
    toCreate: [] as string[],
    priceSet: [] as string[], // 0 → montant (autorisé)
    priceConflicts: [] as string[], // non nul ≠ non nul (arbitrage)
    sponsorDiffs: [] as string[], // arbitrage
    unresolved: [] as string[],
    onNewSessions: 0,
    excludedByDecision: 0, // inscriptions des sessions exclues (décision ①/②)
    unchanged: 0,
  },
  trainers: {
    toCreate: [] as string[],
    infoOnly: [] as string[],
    unresolved: [] as string[],
  },
  ignored: {
    creneaux: 0,
    charges: 0,
    slotsInDb: 0,
  },
  writeApplied: false,
};

// ─────────────────────────────── Caches base ───────────────────────────────

interface DbPerson {
  id: string;
  civility: string | null;
  firstName: string;
  lastName: string;
  birthName: string | null;
  birthDate: Date | null;
  email: string | null;
  phone: string | null;
  personalAddress: unknown;
  educationLevel: string | null;
  professionalStatus: string | null;
  professionalExperience: string | null;
  bpfDefaultStatus: string | null;
}

interface DbOrg {
  id: string;
  legalName: string;
  legalForm: LegalForm;
  siret: string | null;
  naf: string | null;
  address: unknown;
  phone: string | null;
  email: string | null;
  representative: string | null;
  rcs: string | null;
  type: string | null;
  activityDescription: string | null;
}

interface DbSession {
  id: string;
  code: string;
  name: string | null;
  status: SessionStatus;
  startDate: Date;
  endDate: Date;
  productId: string;
}

/** Résolution d'une entité export → base. `id` absent = création à venir (DRY). */
interface Resolved {
  id?: string;
  isNew: boolean;
  label: string;
  /** Création impossible (ex : produit inconnu) — rien ne sera écrit pour cette entité. */
  blocked?: boolean;
  /** Exclue par décision d'arbitrage Laurent 12/08 — rien ne sera écrit, volontairement. */
  excluded?: boolean;
}

function addrPart(addr: unknown, key: string): string | null {
  if (!addr || typeof addr !== 'object') return null;
  const v = (addr as Record<string, unknown>)[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * Fallback payeur (règle payeur : auto-entrepreneur paye lui-même, salarié = la structure).
 * Priorité EXPLICITE : EI_SELF > AGENT_COMMERCIAL > SALARIE (l'ordre enum Prisma ne la garantit pas).
 */
async function findSponsorFallback(personId: string): Promise<string | null> {
  const links = await prisma.legalLink.findMany({
    where: { personId, role: { in: [LinkRole.EI_SELF, LinkRole.AGENT_COMMERCIAL, LinkRole.SALARIE] } },
    select: { organizationId: true, role: true },
  });
  for (const role of [LinkRole.EI_SELF, LinkRole.AGENT_COMMERCIAL, LinkRole.SALARIE]) {
    const found = links.find((l) => l.role === role);
    if (found) return found.organizationId;
  }
  return null;
}

async function main() {
  console.log(`Mode : ${WRITE ? '🔴 WRITE=1 (ÉCRITURE BASE CLOUD)' : '🟡 DRY (simulation, lecture seule)'}`);
  const tenant = await prisma.tenant.findFirstOrThrow({ select: { id: true, name: true } });
  console.log(`Tenant : ${tenant.name} (${tenant.id})\n`);
  const tenantId = tenant.id;

  // ExternalIdentity smartof → entityId
  const idents = await prisma.externalIdentity.findMany({
    where: { source: 'smartof' },
    select: { externalId: true, entityId: true, entityType: true },
  });
  const extId = new Map(idents.map((i) => [i.externalId, i]));

  // Persons
  const dbPersons = await prisma.person.findMany({
    where: { tenantId },
    select: {
      id: true, civility: true, firstName: true, lastName: true, birthName: true,
      birthDate: true, email: true, phone: true, personalAddress: true,
      educationLevel: true, professionalStatus: true, professionalExperience: true,
      bpfDefaultStatus: true,
    },
  });
  const personById = new Map<string, DbPerson>(dbPersons.map((p) => [p.id, p]));
  const personsByNormKey = new Map<string, string[]>();
  for (const p of dbPersons) {
    const key = `${normalizeName(p.lastName)}|${normalizeName(p.firstName)}`;
    const arr = personsByNormKey.get(key) ?? [];
    arr.push(p.id);
    personsByNormKey.set(key, arr);
  }
  const sensitive = await prisma.sensitiveData.findMany({
    select: { personId: true, socialSecurityNb: true },
  });
  const ssnByPersonId = new Map(sensitive.map((s) => [s.personId, s.socialSecurityNb]));

  // Organizations
  const dbOrgs = await prisma.organization.findMany({
    where: { tenantId },
    select: {
      id: true, legalName: true, legalForm: true, siret: true, naf: true, address: true,
      phone: true, email: true, representative: true, rcs: true, type: true,
      activityDescription: true,
    },
  });
  const orgById = new Map<string, DbOrg>(dbOrgs.map((o) => [o.id, o]));
  const orgBySiret = new Map<string, string>();
  const orgByNormName = new Map<string, string[]>();
  for (const o of dbOrgs) {
    if (o.siret) orgBySiret.set(o.siret, o.id);
    const key = normalizeName(o.legalName);
    const arr = orgByNormName.get(key) ?? [];
    arr.push(o.id);
    orgByNormName.set(key, arr);
  }
  const ageficeProfiles = await prisma.ageficeProfile.findMany({
    select: { organizationId: true, paName: true, paNumber: true, paContact: true },
  });
  const ageficeByOrgId = new Map(ageficeProfiles.map((a) => [a.organizationId, a]));

  // Sessions
  const dbSessions = await prisma.trainingSession.findMany({
    where: { tenantId },
    select: {
      id: true, code: true, name: true, status: true, startDate: true, endDate: true,
      productId: true,
    },
  });
  const sessionById = new Map<string, DbSession>(dbSessions.map((s) => [s.id, s]));
  const sessionByCode = new Map<string, string>(dbSessions.map((s) => [s.code, s.id]));

  // Participants / formateurs / liens
  const dbParticipants = await prisma.sessionParticipant.findMany({
    select: { id: true, sessionId: true, personId: true, sponsorOrgId: true, priceHT: true },
  });
  const participantByKey = new Map(
    dbParticipants.map((p) => [`${p.sessionId}|${p.personId}`, p]),
  );
  const dbTrainers = await prisma.sessionTrainer.findMany({
    select: { sessionId: true, personId: true },
  });
  const trainerPairs = new Set(dbTrainers.map((t) => `${t.sessionId}|${t.personId}`));
  const trainersPerSession = new Map<string, number>();
  for (const t of dbTrainers) {
    trainersPerSession.set(t.sessionId, (trainersPerSession.get(t.sessionId) ?? 0) + 1);
  }
  const dbLinks = await prisma.legalLink.findMany({
    select: { personId: true, organizationId: true },
  });
  const linkPairs = new Set(dbLinks.map((l) => `${l.personId}|${l.organizationId}`));

  R.ignored.slotsInDb = await prisma.sessionSlot.count();

  console.log(
    `Base : ${dbPersons.length} persons, ${dbOrgs.length} orgs, ${dbSessions.length} sessions, ` +
      `${dbParticipants.length} inscriptions, ${idents.length} identités smartof\n`,
  );

  // ══════════════════════════ 1. ENTREPRISES ══════════════════════════

  const wbEnt = loadWorkbook(FILES.entreprises);
  const entRows = readSheet(wbEnt, wbEnt.SheetNames[0]!);
  const orgResolved = new Map<string, Resolved>(); // UID SmartOF → résolution
  const createdOrgSirets = new Map<string, string>(); // SIRET → nom (détection doublons dans l'export)

  for (const row of entRows) {
    const uid = cell(row, 'UID');
    const name = cell(row, 'Nom');
    if (!uid || !name) continue;
    if (cell(row, 'Archivé') === 'Oui') {
      R.orgs.archivedSkipped.push(name);
      continue;
    }

    const rawSiret = cell(row, 'SIRET');
    const cleanedSiret = cleanSiret(rawSiret ?? '');
    const siretValid = isValidSiret(cleanedSiret);
    const address = buildAddress({
      street: cell(row, 'Rue'),
      street2: cell(row, "Complément d'adresse"),
      postalCode: cell(row, 'Code postal'),
      city: cell(row, 'Ville'),
    });
    const paName = cell(row, 'PA AGEFICE');
    const paNumber = cell(row, '[PA AGEFICE] Numéro du PA');
    const paContact = cell(row, "[PA AGEFICE] Nom de l'interlocuteur PA");
    // paFields = pré-remplissage du PDF AGEFICE (Json REQUIS par le schéma) —
    // même structure que import-smartof.ts. Posé à la CRÉATION du profil uniquement :
    // un profil existant a pu être enrichi par l'app (agefice-generator), on ne l'écrase pas.
    const paFieldsObj = paName
      ? {
          'Nom du PTA': paName,
          'Interlocuteur PTA': paContact ?? '',
          'N° de PTA': paNumber ?? '',
          "Nom / Raison Sociale de L'entreprise (Entreprise)": name,
          'Code APE - NAF (Entreprise)': cell(row, 'Code APE (NAF)') ?? '',
          'N° SIRET (Entreprise)': siretValid ? cleanedSiret : '',
          'Activité Professionnelle (Entreprise)': cell(row, 'Activité principale exercée') ?? '',
          'Adresse Entreprise': cell(row, 'Rue') ?? '',
          'Code Postal (Entreprise)': cell(row, 'Code postal') ?? '',
          'Ville (Entreprise)': cell(row, 'Ville') ?? '',
        }
      : null;

    // Résolution : UID → SIRET → legalName
    let orgId: string | null = null;
    let matchKind: 'uid' | 'siret' | 'name' | null = null;
    const known = extId.get(uid);
    if (known?.entityType === 'Organization') {
      orgId = known.entityId;
      matchKind = 'uid';
    } else if (siretValid && orgBySiret.has(cleanedSiret)) {
      orgId = orgBySiret.get(cleanedSiret)!;
      matchKind = 'siret';
    } else {
      const candidates = orgByNormName.get(normalizeName(name)) ?? [];
      if (candidates.length === 1) {
        orgId = candidates[0]!;
        matchKind = 'name';
      }
    }

    const label = `${name}${siretValid ? ` (SIRET ${cleanedSiret})` : ''}`;

    if (!orgId) {
      // ── CRÉATION
      const dupOf = siretValid ? createdOrgSirets.get(cleanedSiret) : undefined;
      R.orgs.created.push(
        label +
          (paName ? ` — PA AGEFICE : ${paName}` : '') +
          (dupOf ? ` — ⚠ SIRET IDENTIQUE à « ${dupOf} » dans le même export (à vérifier)` : ''),
      );
      if (siretValid) createdOrgSirets.set(cleanedSiret, name);
      orgResolved.set(uid, { isNew: true, label: name });
      if (WRITE) {
        const created = await prisma.organization.create({
          data: {
            tenantId,
            legalName: name,
            legalForm: mapLegalForm(cell(row, 'Forme juridique')),
            siret: siretValid ? cleanedSiret : null,
            siren: siretValid ? sirenFromSiret(cleanedSiret) : null,
            naf: cell(row, 'Code APE (NAF)'),
            address: address as Prisma.InputJsonValue,
            phone: cell(row, 'Numéro de téléphone'),
            email: cell(row, 'E-mail'),
            opcoCode: detectOpco(paName || cell(row, 'Provenance des produits BPF par défaut')),
            representative: cell(row, 'Nom du représentant'),
            activityDescription: cell(row, 'Activité principale exercée'),
            rcs: cell(row, 'RCS (ville)'),
            type: cell(row, 'Type'),
            requiresCleanup: !!rawSiret && !siretValid,
            cleanupNotes: !!rawSiret && !siretValid ? `SIRET non valide à l'import 12/08 : "${rawSiret}"` : null,
          },
        });
        await prisma.externalIdentity.create({
          data: { tenantId, entityType: 'Organization', entityId: created.id, source: 'smartof', externalId: uid },
        });
        orgResolved.set(uid, { id: created.id, isNew: true, label: name });
        if (paName) {
          await prisma.ageficeProfile.upsert({
            where: { organizationId: created.id },
            create: {
              organizationId: created.id,
              paName,
              paNumber,
              paContact,
              paFields: paFieldsObj as Prisma.InputJsonValue,
            },
            update: { paName, paNumber, paContact },
          });
        }
      }
      continue;
    }

    // ── MISE À JOUR (diff champ à champ, vide n'écrase jamais)
    const db = orgById.get(orgId);
    orgResolved.set(uid, { id: orgId, isNew: false, label: name });
    if (!db) continue;

    const diffs: FieldDiff[] = [];
    diffField(diffs, 'Raison sociale', db.legalName, name, looseEq);
    if (siretValid) diffField(diffs, 'SIRET', db.siret, cleanedSiret);
    diffField(diffs, 'NAF', db.naf, cell(row, 'Code APE (NAF)'));
    diffField(diffs, 'Téléphone', normalizePhone(db.phone), normalizePhone(cell(row, 'Numéro de téléphone')));
    diffField(diffs, 'Email', normalizeEmail(db.email), normalizeEmail(cell(row, 'E-mail')));
    diffField(diffs, 'Adresse (rue)', addrPart(db.address, 'street'), address.street ?? null, looseEq);
    diffField(diffs, 'Adresse (CP)', addrPart(db.address, 'postalCode'), address.postalCode ?? null);
    diffField(diffs, 'Adresse (ville)', addrPart(db.address, 'city'), address.city ?? null, looseEq);
    diffField(diffs, 'Représentant', db.representative, cell(row, 'Nom du représentant'), looseEq);
    diffField(diffs, 'RCS', db.rcs, cell(row, 'RCS (ville)'), looseEq);
    diffField(diffs, 'Activité', db.activityDescription, cell(row, 'Activité principale exercée'), looseEq);
    // legalForm : jamais réécrite (corrections manuelles possibles) — signalée seulement
    const exportForm = mapLegalForm(cell(row, 'Forme juridique'));
    if (cell(row, 'Forme juridique') && exportForm !== db.legalForm) {
      diffs.push({
        field: 'Forme juridique (NON appliquée — info)',
        before: db.legalForm,
        after: `${cell(row, 'Forme juridique')} → ${exportForm}`,
      });
    }
    // AGEFICE
    const dbPa = ageficeByOrgId.get(orgId);
    const paDiffs: FieldDiff[] = [];
    if (paName) {
      diffField(paDiffs, 'PA AGEFICE', dbPa?.paName, paName);
      diffField(paDiffs, 'N° PA', dbPa?.paNumber, paNumber);
      diffField(paDiffs, 'Interlocuteur PA', dbPa?.paContact, paContact);
      if (paDiffs.length > 0) R.orgs.agefice.push(`${name} : ${paDiffs.map((d) => `${d.field} ${d.before} → ${d.after}`).join(' ; ')}`);
    }

    const entry: EntityChange = { label, diffs };
    if (diffs.length === 0 && paDiffs.length === 0) {
      R.orgs.unchanged++;
    } else if (matchKind === 'uid') {
      if (diffs.length > 0) R.orgs.updated.push(entry);
    } else if (matchKind === 'siret') {
      R.orgs.matchedBySiret.push(entry);
    } else {
      R.orgs.matchedByName.push(entry);
    }

    if (WRITE) {
      const data: Prisma.OrganizationUncheckedUpdateInput = {};
      const setIf = (cond: boolean, apply: () => void) => cond && apply();
      setIf(!!cell(row, 'Nom') && !looseEq(db.legalName, name), () => { data.legalName = name; });
      setIf(siretValid && db.siret !== cleanedSiret, () => {
        data.siret = cleanedSiret;
        data.siren = sirenFromSiret(cleanedSiret);
      });
      for (const [field, key, val, cmp] of [
        ['naf', 'naf', cell(row, 'Code APE (NAF)'), softEq],
        ['phone', 'phone', cell(row, 'Numéro de téléphone'), softEq],
        ['email', 'email', cell(row, 'E-mail'), softEq],
        ['representative', 'representative', cell(row, 'Nom du représentant'), looseEq],
        ['rcs', 'rcs', cell(row, 'RCS (ville)'), looseEq],
        ['activityDescription', 'activityDescription', cell(row, 'Activité principale exercée'), looseEq],
      ] as const) {
        if (val && !cmp((db as unknown as Record<string, string | null>)[key], val)) {
          (data as Record<string, unknown>)[field] = val;
        }
      }
      const orgAddrChanged =
        (address.street && !looseEq(addrPart(db.address, 'street'), address.street)) ||
        (address.postalCode && !softEq(addrPart(db.address, 'postalCode'), address.postalCode)) ||
        (address.city && !looseEq(addrPart(db.address, 'city'), address.city));
      if (orgAddrChanged) {
        const merged = {
          street: address.street ?? addrPart(db.address, 'street') ?? undefined,
          street2: address.street2 ?? addrPart(db.address, 'street2') ?? undefined,
          postalCode: address.postalCode ?? addrPart(db.address, 'postalCode') ?? undefined,
          city: address.city ?? addrPart(db.address, 'city') ?? undefined,
          country: 'France',
        };
        data.address = merged as Prisma.InputJsonValue;
      }
      if (Object.keys(data).length > 0) {
        await prisma.organization.update({ where: { id: orgId }, data });
      }
      if (matchKind !== 'uid') {
        await prisma.externalIdentity.upsert({
          where: { source_externalId: { source: 'smartof', externalId: uid } },
          create: { tenantId, entityType: 'Organization', entityId: orgId, source: 'smartof', externalId: uid },
          update: { entityId: orgId, entityType: 'Organization' },
        });
      }
      if (paName) {
        await prisma.ageficeProfile.upsert({
          where: { organizationId: orgId },
          create: {
            organizationId: orgId,
            paName,
            paNumber,
            paContact,
            paFields: paFieldsObj as Prisma.InputJsonValue,
          },
          update: {
            paName,
            ...(paNumber ? { paNumber } : {}),
            ...(paContact ? { paContact } : {}),
          },
        });
      }
    }
  }

  // ══════════════════════════ 2. APPRENANTS ══════════════════════════

  const wbApp = loadWorkbook(FILES.apprenants);
  const appRows = readSheet(wbApp, wbApp.SheetNames[0]!); // "Tous les apprenants"
  const personResolved = new Map<string, Resolved>();

  for (const row of appRows) {
    const uid = cell(row, 'UID');
    const firstName = cell(row, 'Prénom');
    const lastName = cell(row, 'Nom');
    if (!uid || !firstName || !lastName) continue;
    const label = `${lastName.toUpperCase()} ${firstName}`;
    if (cell(row, 'Archivé') === 'Oui') {
      R.persons.archivedSkipped.push(label);
      continue;
    }

    const email = normalizeEmail(cell(row, 'E-mail')) || null;
    const birthDate = parseDateFr(cell(row, 'Date de naissance'));
    const address = buildAddress({
      street: cell(row, 'Rue'),
      postalCode: cell(row, 'Code postal'),
      city: cell(row, 'Ville'),
    });
    const ssn = cell(row, 'N° de sécurité sociale');

    // Résolution : UID → nom+prénom exact (JAMAIS l'email)
    let personId: string | null = null;
    let matchKind: 'uid' | 'name' | null = null;
    const known = extId.get(uid);
    if (known && known.entityType.startsWith('Person')) {
      personId = known.entityId;
      matchKind = 'uid';
    } else {
      const key = `${normalizeName(lastName)}|${normalizeName(firstName)}`;
      const candidates = personsByNormKey.get(key) ?? [];
      if (candidates.length === 1) {
        personId = candidates[0]!;
        matchKind = 'name';
      } else if (candidates.length > 1) {
        R.persons.ambiguous.push(
          `${label} — UID SmartOF inconnu et ${candidates.length} homonymes en base → AUCUNE écriture, arbitrage requis`,
        );
        personResolved.set(uid, { isNew: false, label });
        continue;
      }
    }

    if (!personId) {
      // ── CRÉATION
      R.persons.created.push(`${label}${email ? ` <${email}>` : ' (sans email)'}`);
      personResolved.set(uid, { isNew: true, label });
      if (WRITE) {
        const created = await prisma.person.create({
          data: {
            tenantId,
            civility: cell(row, 'Civilité'),
            firstName,
            lastName,
            birthName: cell(row, 'Nom de naissance'),
            birthDate,
            email,
            phone: cell(row, 'Numéro de téléphone'),
            personalAddress: address as Prisma.InputJsonValue,
            educationLevel: cell(row, "Niveau d'étude"),
            bpfDefaultStatus: cell(row, 'Statut BPF par défaut'),
            professionalExperience: cell(row, "Dirigeant d'entreprise depuis"),
            professionalStatus: cell(row, 'Fonction'),
            requiresCleanup: !email,
            cleanupNotes: !email ? 'Email manquant — à compléter avant convocation.' : null,
          },
        });
        await prisma.externalIdentity.create({
          data: { tenantId, entityType: 'Person', entityId: created.id, source: 'smartof', externalId: uid },
        });
        personResolved.set(uid, { id: created.id, isNew: true, label });
        if (ssn) {
          await prisma.sensitiveData.upsert({
            where: { personId: created.id },
            create: { personId: created.id, socialSecurityNb: ssn },
            update: { socialSecurityNb: ssn },
          });
        }
      }
      continue;
    }

    // ── MISE À JOUR
    const db = personById.get(personId);
    personResolved.set(uid, { id: personId, isNew: false, label });
    if (!db) continue;

    const diffs: FieldDiff[] = [];
    diffField(diffs, 'Civilité', db.civility, cell(row, 'Civilité'));
    diffField(diffs, 'Prénom', db.firstName, firstName, looseEq);
    diffField(diffs, 'Nom', db.lastName, lastName, looseEq);
    diffField(diffs, 'Nom de naissance', db.birthName, cell(row, 'Nom de naissance'), looseEq);
    if (birthDate) diffField(diffs, 'Date de naissance', fmtDate(db.birthDate), fmtDate(birthDate));
    diffField(diffs, 'Email', normalizeEmail(db.email), email);
    diffField(diffs, 'Téléphone', normalizePhone(db.phone), normalizePhone(cell(row, 'Numéro de téléphone')));
    diffField(diffs, 'Adresse (rue)', addrPart(db.personalAddress, 'street'), address.street ?? null, looseEq);
    diffField(diffs, 'Adresse (CP)', addrPart(db.personalAddress, 'postalCode'), address.postalCode ?? null);
    diffField(diffs, 'Adresse (ville)', addrPart(db.personalAddress, 'city'), address.city ?? null, looseEq);
    diffField(diffs, "Niveau d'étude", db.educationLevel, cell(row, "Niveau d'étude"));
    diffField(diffs, 'Fonction', db.professionalStatus, cell(row, 'Fonction'), looseEq);
    diffField(diffs, 'Expérience dirigeant', db.professionalExperience, cell(row, "Dirigeant d'entreprise depuis"), looseEq);
    diffField(diffs, 'Statut BPF', db.bpfDefaultStatus, cell(row, 'Statut BPF par défaut'));

    // N° SS : PII → jamais de valeur dans le rapport, juste le signalement
    const dbSsn = ssnByPersonId.get(personId) ?? null;
    const ssnChanged = !!ssn && ssn.replace(/\s+/g, '') !== (dbSsn ?? '').replace(/\s+/g, '');
    if (ssnChanged) R.persons.ssnUpdated.push(`${label} (${dbSsn ? 'modifié' : 'nouveau'})`);

    const entry: EntityChange = { label, diffs };
    if (diffs.length === 0 && !ssnChanged) {
      R.persons.unchanged++;
    } else if (matchKind === 'uid') {
      if (diffs.length > 0) R.persons.updated.push(entry);
    } else {
      R.persons.matchedByName.push(entry);
    }

    if (WRITE) {
      const data: Prisma.PersonUncheckedUpdateInput = {};
      const put = (
        key: keyof Prisma.PersonUncheckedUpdateInput,
        dbVal: string | null,
        val: string | null,
        cmp: (a: string | null | undefined, b: string | null | undefined) => boolean = softEq,
      ) => {
        if (val && !cmp(dbVal, val)) (data as Record<string, unknown>)[key as string] = val;
      };
      put('civility', db.civility, cell(row, 'Civilité'));
      put('firstName', db.firstName, firstName, looseEq);
      put('lastName', db.lastName, lastName, looseEq);
      put('birthName', db.birthName, cell(row, 'Nom de naissance'), looseEq);
      if (birthDate && dateKey(db.birthDate) !== dateKey(birthDate)) data.birthDate = birthDate;
      put('email', db.email, email);
      put('phone', db.phone, cell(row, 'Numéro de téléphone'));
      put('educationLevel', db.educationLevel, cell(row, "Niveau d'étude"));
      put('professionalStatus', db.professionalStatus, cell(row, 'Fonction'), looseEq);
      put('professionalExperience', db.professionalExperience, cell(row, "Dirigeant d'entreprise depuis"), looseEq);
      put('bpfDefaultStatus', db.bpfDefaultStatus, cell(row, 'Statut BPF par défaut'));
      const persAddrChanged =
        (address.street && !looseEq(addrPart(db.personalAddress, 'street'), address.street)) ||
        (address.postalCode && !softEq(addrPart(db.personalAddress, 'postalCode'), address.postalCode)) ||
        (address.city && !looseEq(addrPart(db.personalAddress, 'city'), address.city));
      if (persAddrChanged) {
        data.personalAddress = {
          street: address.street ?? addrPart(db.personalAddress, 'street') ?? undefined,
          postalCode: address.postalCode ?? addrPart(db.personalAddress, 'postalCode') ?? undefined,
          city: address.city ?? addrPart(db.personalAddress, 'city') ?? undefined,
          country: 'France',
        } as Prisma.InputJsonValue;
      }
      if (Object.keys(data).length > 0) {
        await prisma.person.update({ where: { id: personId }, data });
      }
      if (matchKind !== 'uid') {
        await prisma.externalIdentity.upsert({
          where: { source_externalId: { source: 'smartof', externalId: uid } },
          create: { tenantId, entityType: 'Person', entityId: personId, source: 'smartof', externalId: uid },
          update: { entityId: personId, entityType: 'Person' },
        });
      }
      if (ssnChanged && ssn) {
        await prisma.sensitiveData.upsert({
          where: { personId },
          create: { personId, socialSecurityNb: ssn },
          update: { socialSecurityNb: ssn },
        });
      }
    }
  }

  // ══════════════════════ 3. RATTACHEMENTS (LegalLinks) ══════════════════════

  const linkRows = readSheet(wbApp, wbApp.SheetNames[1]!); // "Rattachement des apprenants aux"

  function inferNonEiRole(profStatus: string | null | undefined): LinkRole {
    const n = (profStatus ?? '').toLowerCase();
    if (/salar|employ|conseill/.test(n)) return LinkRole.SALARIE;
    return LinkRole.AGENT_COMMERCIAL; // défaut immobilier (pattern EI + Enseigne)
  }

  for (const row of linkRows) {
    const personUid = cell(row, 'Apprenant UID');
    const orgUid = cell(row, 'Entreprise UID');
    const firstName = cell(row, 'Prénom') ?? '';
    const lastName = cell(row, 'Nom') ?? '';
    const orgName = cell(row, "Nom de l'entreprise") ?? '';
    if (!personUid || !orgUid) continue;

    const pRes = personResolved.get(personUid);
    const oRes = orgResolved.get(orgUid);
    if (!pRes || !oRes) {
      R.legalLinks.unresolved.push(`${lastName} ${firstName} × ${orgName} (UID hors périmètre export)`);
      continue;
    }
    if (pRes.isNew || oRes.isNew) {
      // Lien porté par une entité à créer — compté avec la création
      R.legalLinks.onNewEntities++;
      if (WRITE && pRes.id && oRes.id) {
        const isEi = organizationLooksLikePerson(orgName, firstName, lastName);
        const role = isEi ? LinkRole.EI_SELF : inferNonEiRole(personById.get(pRes.id)?.professionalStatus ?? cell(row, 'Fonction'));
        await prisma.legalLink.upsert({
          where: { personId_organizationId_role: { personId: pRes.id, organizationId: oRes.id, role } },
          create: { personId: pRes.id, organizationId: oRes.id, role, isPrimary: role === LinkRole.EI_SELF },
          update: {},
        });
      }
      continue;
    }
    if (!pRes.id || !oRes.id) continue; // ambiguïté personne → pas de lien

    if (linkPairs.has(`${pRes.id}|${oRes.id}`)) {
      R.legalLinks.existingPair++; // couple déjà relié (peu importe le rôle) → on ne touche pas
      continue;
    }

    const isEi = organizationLooksLikePerson(orgName, firstName, lastName);
    const role = isEi ? LinkRole.EI_SELF : inferNonEiRole(personById.get(pRes.id)?.professionalStatus);
    R.legalLinks.toCreate.push(`${lastName} ${firstName} → ${orgName} [${role}]`);
    if (WRITE) {
      await prisma.legalLink.upsert({
        where: { personId_organizationId_role: { personId: pRes.id, organizationId: oRes.id, role } },
        create: { personId: pRes.id, organizationId: oRes.id, role, isPrimary: role === LinkRole.EI_SELF },
        update: {},
      });
      linkPairs.add(`${pRes.id}|${oRes.id}`);
    }
  }

  // ══════════════════════════ 4. SESSIONS ══════════════════════════

  const wbSes = loadWorkbook(FILES.sessions);
  const sesRows = readSheet(wbSes, 'Toutes les sessions');
  const sessionResolved = new Map<string, Resolved & { code: string }>();
  const exportSessionUids = new Set<string>();
  const exportSessionCodes = new Set<string>();

  // Inscriptions par session (lu tôt pour enrichir les libellés de création)
  const insRows = readSheet(wbSes, 'Apprenants dans les sessions');
  const insCountBySessionUid = new Map<string, number>();
  for (const r of insRows) {
    const su = cell(r, 'Session - UID');
    if (su) insCountBySessionUid.set(su, (insCountBySessionUid.get(su) ?? 0) + 1);
  }

  // Commanditaires (lu tôt : les colonnes « Produit - * » servent aux créations de produits ④)
  const commRows = readSheet(wbSes, 'Commanditaires');
  function findProductInfoRow(productUid: string): Row | null {
    for (const r of commRows) {
      if (cell(r, "Produit d'origine - UID") === productUid) return r;
    }
    return null;
  }

  function mapSessionStatus(v: string | null): SessionStatus {
    const n = (v ?? '').toLowerCase();
    if (n.includes('annul')) return SessionStatus.CANCELLED;
    if (n.includes('factur') || n.includes('termin')) return SessionStatus.COMPLETED;
    if (n.includes('cours')) return SessionStatus.IN_PROGRESS;
    if (n.includes('valid')) return SessionStatus.VALIDATED;
    if (n.includes('ouvert')) return SessionStatus.OPEN;
    if (n.includes('planifi')) return SessionStatus.PLANNED;
    return SessionStatus.DRAFT;
  }

  // Produits smartof connus (pour les créations de sessions)
  const productIdByUid = new Map(
    idents.filter((i) => i.entityType === 'TrainingProduct').map((i) => [i.externalId, i.entityId]),
  );
  const pendingProductUids = new Set<string>(); // dédup des créations de produits en DRY

  for (const row of sesRows) {
    const uid = cell(row, 'UID');
    const code = cell(row, 'Custom ID') ?? (uid ? `SES-${uid.slice(0, 8)}` : null);
    const name = cell(row, 'Nom');
    if (!uid || !code) continue;
    const startDate = parseDateFr(cell(row, 'Date de début'));
    const endDate = parseDateFr(cell(row, 'Date de fin')) ?? startDate;
    const label = `${code} — ${name ?? '(sans nom)'} (${fmtDate(startDate)} → ${fmtDate(endDate)})`;

    if (cell(row, 'Archivé') === 'Oui') {
      R.sessions.archivedSkipped.push(label);
      continue;
    }
    exportSessionUids.add(uid);
    exportSessionCodes.add(code);

    const statusExport = mapSessionStatus(cell(row, 'Statut'));
    const productUid = cell(row, 'Produit de formation visé UID');
    const productName = cell(row, 'Produit de formation visé - Nom');

    // Résolution : UID → code
    let sessionId: string | null = null;
    let matchKind: 'uid' | 'code' | null = null;
    const known = extId.get(uid);
    if (known?.entityType === 'TrainingSession') {
      sessionId = known.entityId;
      matchKind = 'uid';
    } else if (sessionByCode.has(code)) {
      sessionId = sessionByCode.get(code)!;
      matchKind = 'code';
    }

    if (!sessionId) {
      // ── Décision ① : sessions explicitement exclues (SES-0008 fourre-tout)
      if (EXCLUDED_SESSION_CODES.has(code)) {
        R.sessions.excludedByDecision.push(
          `${label} — EXCLUE (décision ① Laurent 12/08 : fourre-tout pré-inscriptions, circuit QualiOF dédié) — ${insCountBySessionUid.get(uid) ?? 0} inscription(s) non importées`,
        );
        sessionResolved.set(uid, { isNew: true, label: code, code, blocked: true, excluded: true });
        continue;
      }
      // ── Décision ② : sessions annulées SmartOF jamais importées → on ne les crée pas
      if (EXCLUDE_CANCELLED_NEW_SESSIONS && statusExport === SessionStatus.CANCELLED) {
        R.sessions.excludedByDecision.push(
          `${label} — EXCLUE (décision ② Laurent 12/08 : annulée SmartOF, historique conservé dans SmartOF)`,
        );
        sessionResolved.set(uid, { isNew: true, label: code, code, blocked: true, excluded: true });
        continue;
      }

      // ── CRÉATION
      let productId = productUid ? productIdByUid.get(productUid) ?? null : null;

      // Décision ④ : produit SmartOF absent de la base → création d'un produit simple
      // (hors pipeline de génération Qualiopi — données réelles des colonnes « Produit - * »)
      if (!productId && CREATE_MISSING_PRODUCTS && productUid) {
        const info = findProductInfoRow(productUid);
        const prodTitle = productName ?? cell(info ?? {}, 'Produit - Intitulé de la formation') ?? `Produit ${productUid.slice(0, 8)}`;
        const prodCode = `PROD-${productUid.slice(0, 8)}`;
        const durationHours =
          Math.round(parseFloat(cell(info ?? {}, 'Produit - Durée de formation (en heures)') ?? '0')) || 0;
        if (!pendingProductUids.has(productUid)) {
          pendingProductUids.add(productUid);
          R.products.created.push(
            `${prodCode} — « ${prodTitle} » (${durationHours} h${info ? ', fiche SmartOF via commanditaires' : ', fiche minimale — aucun commanditaire source'}) → débloque ${code}`,
          );
        }
        if (WRITE) {
          const objectivesText = cell(info ?? {}, 'Produit - Objectifs de la formation') ?? '';
          const objectives = objectivesText
            .split(/\n|•|- /)
            .map((o) => o.trim())
            .filter(Boolean);
          const created = await prisma.trainingProduct.create({
            data: {
              tenantId,
              code: prodCode,
              title: prodTitle,
              durationHours,
              modality: Modality.PRESENTIEL,
              targetAudience: cell(info ?? {}, 'Produit - Public visé'),
              prerequisites: cell(info ?? {}, 'Produit - Prérequis'),
              objectives: objectives as Prisma.InputJsonValue,
              programMd: cell(info ?? {}, 'Produit - Contenu de la formation') ?? '',
              pedagogicalMethods: cell(info ?? {}, 'Produit - Modalités pédagogiques'),
              pedagogicalSupport: cell(info ?? {}, 'Produit - Moyens et supports pédagogiques'),
              evaluationMethods: cell(info ?? {}, "Produit - Modalités d'évaluation"),
              accessConditions: cell(info ?? {}, "Produit - Modalités d'accès"),
              trainerProfile: cell(info ?? {}, 'Produit - Profil des formateurs'),
              capacityMin: parseInt(cell(info ?? {}, 'Produit - Effectif minimum') ?? '1', 10) || 1,
              capacityMax: parseInt(cell(info ?? {}, 'Produit - Effectif maximum') ?? '12', 10) || 12,
              isActive: true,
            },
          });
          await prisma.externalIdentity.create({
            data: { tenantId, entityType: 'TrainingProduct', entityId: created.id, source: 'smartof', externalId: productUid },
          });
          productIdByUid.set(productUid, created.id);
          productId = created.id;
        } else {
          productId = '__PENDING_PRODUCT__'; // DRY : la session est créable, le produit le sera avant elle
        }
      }

      if (!productId) {
        R.sessions.missingProduct.push(
          `${label} — produit SmartOF "${productName ?? productUid ?? '?'}" non tracé en base → création BLOQUÉE, arbitrage requis`,
        );
        sessionResolved.set(uid, { isNew: true, label: code, code, blocked: true });
        continue;
      }
      const nbIns = insCountBySessionUid.get(uid) ?? 0;
      const durationDays =
        startDate && endDate ? Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1 : 0;
      R.sessions.created.push(
        `${label} — statut SmartOF : ${cell(row, 'Statut')} — produit : ${productName} — ${nbIns} inscription(s)` +
          (durationDays > 60 ? ` — ⚠ durée inhabituelle (${durationDays} j) : confirmer avant création` : ''),
      );
      sessionResolved.set(uid, { isNew: true, label: code, code });
      if (WRITE) {
        const lieu = [cell(row, 'N° de rue et rue'), cell(row, 'Code postal'), cell(row, 'Ville')]
          .filter(Boolean)
          .join(', ');
        const created = await prisma.trainingSession.create({
          data: {
            tenantId,
            productId,
            code,
            name,
            status: statusExport,
            startDate: startDate ?? new Date(),
            endDate: endDate ?? startDate ?? new Date(),
            modality: Modality.PRESENTIEL,
            internalNotes: `Créée par sync SmartOF 12/08/2026.${lieu ? ` Lieu : ${lieu}` : ''}`,
          },
        });
        await prisma.externalIdentity.create({
          data: { tenantId, entityType: 'TrainingSession', entityId: created.id, source: 'smartof', externalId: uid },
        });
        sessionResolved.set(uid, { id: created.id, isNew: true, label: code, code });
      }
      continue;
    }

    // ── MISE À JOUR (dates + nom uniquement ; statut/produit = rapport seul)
    const db = sessionById.get(sessionId);
    sessionResolved.set(uid, { id: sessionId, isNew: false, label: code, code });
    if (!db) continue;
    if (matchKind === 'code') R.sessions.matchedByCode.push(`${code} (UID SmartOF nouvellement tracé)`);

    const diffs: FieldDiff[] = [];
    if (startDate && dateKey(db.startDate) !== dateKey(startDate)) {
      diffs.push({ field: 'Date de début', before: fmtDate(db.startDate), after: fmtDate(startDate) });
    }
    if (endDate && dateKey(db.endDate) !== dateKey(endDate)) {
      diffs.push({ field: 'Date de fin', before: fmtDate(db.endDate), after: fmtDate(endDate) });
    }
    diffField(diffs, 'Nom', db.name, name);

    if (statusExport !== db.status) {
      R.sessions.statusDiffs.push(
        `${code} : base=${db.status} / SmartOF=${cell(row, 'Statut')} (${statusExport}) — NON appliqué (QualiOF pilote la clôture)`,
      );
    }
    const productId = productUid ? productIdByUid.get(productUid) ?? null : null;
    if (productId && productId !== db.productId) {
      R.sessions.productMismatch.push(`${code} : produit base ≠ produit SmartOF (${productName}) — NON appliqué, arbitrage requis`);
    }

    if (diffs.length === 0) R.sessions.unchanged++;
    else R.sessions.updated.push({ label: code, diffs });

    if (WRITE) {
      const data: Prisma.TrainingSessionUncheckedUpdateInput = {};
      if (startDate && dateKey(db.startDate) !== dateKey(startDate)) data.startDate = startDate;
      if (endDate && dateKey(db.endDate) !== dateKey(endDate)) data.endDate = endDate;
      if (name && !softEq(db.name, name)) data.name = name;
      if (Object.keys(data).length > 0) {
        await prisma.trainingSession.update({ where: { id: sessionId }, data });
      }
      if (matchKind !== 'uid') {
        await prisma.externalIdentity.upsert({
          where: { source_externalId: { source: 'smartof', externalId: uid } },
          create: { tenantId, entityType: 'TrainingSession', entityId: sessionId, source: 'smartof', externalId: uid },
          update: { entityId: sessionId, entityType: 'TrainingSession' },
        });
      }
    }
  }

  // Sessions en base absentes de l'export (info — jamais de suppression)
  for (const s of dbSessions) {
    if (!exportSessionCodes.has(s.code)) {
      R.sessions.inDbNotInExport.push(`${s.code} — ${s.name ?? ''} (${fmtDate(s.startDate)}, ${s.status})`);
    }
  }

  // ══════════════════ 5. COMMANDITAIRES + INSCRIPTIONS ══════════════════

  // (commRows déjà lu en section 4)
  interface Comm {
    uid: string;
    customId: string | null;
    name: string | null;
    type: string | null;
    targetUid: string | null; // Entreprise UID / Apprenant UID
    sessionUid: string | null;
    budgetHT: number;
    factureHT: number;
    nbApprenants: number;
  }
  const commByUid = new Map<string, Comm>();
  for (const row of commRows) {
    const uid = cell(row, 'UID');
    if (!uid) continue;
    commByUid.set(uid, {
      uid,
      customId: cell(row, 'Custom ID'),
      name: cell(row, 'Nom'),
      type: cell(row, 'Type'),
      targetUid: cell(row, 'Entreprise UID / Apprenant UID'),
      sessionUid: cell(row, 'Session - UID'),
      budgetHT: parseEuro(cell(row, 'Budget - Total HT')),
      factureHT: parseEuro(cell(row, 'Facture - Total HT')),
      nbApprenants: parseInt(cell(row, "Nombre d'apprenants") ?? '0', 10) || 0,
    });
  }

  // (insRows déjà lu en section 4)
  // Compte réel d'apprenants par commanditaire (plus fiable que la colonne)
  const insCountByComm = new Map<string, number>();
  for (const row of insRows) {
    const cUid = cell(row, 'Commanditaire - UID');
    if (cUid) insCountByComm.set(cUid, (insCountByComm.get(cUid) ?? 0) + 1);
  }

  for (const row of insRows) {
    const aUid = cell(row, 'Apprenant - UID');
    const sUid = cell(row, 'Session - UID');
    const cUid = cell(row, 'Commanditaire - UID');
    const aName = `${(cell(row, 'Apprenant - Nom') ?? '').toUpperCase()} ${cell(row, 'Apprenant - Prénom') ?? ''}`.trim();
    if (!aUid || !sUid) continue;

    const sRes = sessionResolved.get(sUid);
    const pRes = personResolved.get(aUid);
    if (!sRes) {
      R.participants.unresolved.push(`${aName} : session SmartOF ${sUid.slice(0, 8)}… hors périmètre (archivée)`);
      continue;
    }
    if (sRes.excluded) {
      R.participants.excludedByDecision++; // session exclue par décision ①/② → inscription volontairement non importée
      continue;
    }
    if (sRes.blocked) {
      R.participants.unresolved.push(`${aName} → ${sRes.code} : session à création BLOQUÉE (produit inconnu) — inscription en attente d'arbitrage`);
      continue;
    }
    if (!pRes) {
      R.participants.unresolved.push(`${aName} : apprenant SmartOF ${aUid.slice(0, 8)}… absent de l'export apprenants`);
      continue;
    }

    // Prix HT/stagiaire : budget commanditaire / nb d'apprenants rattachés à ce commanditaire
    const comm = cUid ? commByUid.get(cUid) : undefined;
    const nb = comm ? (insCountByComm.get(comm.uid) || comm.nbApprenants || 1) : 1;
    const priceHT = comm && comm.budgetHT > 0 ? Math.round((comm.budgetHT / nb) * 100) / 100 : 0;

    // Sponsor (payeur) : commanditaire Entreprise → org ; sinon EI de l'apprenant
    let sponsorRes: Resolved | undefined;
    let sponsorNote = '';
    if (comm?.type?.toLowerCase().includes('entreprise') && comm.targetUid) {
      sponsorRes = orgResolved.get(comm.targetUid);
      if (!sponsorRes) sponsorNote = `commanditaire "${comm.name}" : entreprise hors export`;
    } else if (comm) {
      sponsorNote = `commanditaire de type "${comm.type}" (particulier/apprenant) → payeur = EI de l'apprenant à résoudre`;
    } else {
      sponsorNote = 'aucun commanditaire dans l\'export';
    }

    if (sRes.isNew || pRes.isNew) {
      // Inscription portée par une session/personne à créer
      R.participants.onNewSessions++;
      if (WRITE && sRes.id && pRes.id) {
        let sponsorOrgId = sponsorRes?.id ?? null;
        if (!sponsorOrgId) sponsorOrgId = await findSponsorFallback(pRes.id);
        if (!sponsorOrgId) {
          R.participants.unresolved.push(`${aName} → ${sRes.code ?? ''} : payeur introuvable (${sponsorNote}) — inscription NON créée`);
          continue;
        }
        const sesDb = sessionById.get(sRes.id);
        await prisma.sessionParticipant.upsert({
          where: { sessionId_personId: { sessionId: sRes.id, personId: pRes.id } },
          create: {
            sessionId: sRes.id,
            personId: pRes.id,
            sponsorOrgId,
            priceHT: new Prisma.Decimal(priceHT),
            enrollmentStatus:
              sesDb?.status === SessionStatus.COMPLETED ? EnrollmentStatus.ATTENDED : EnrollmentStatus.CONFIRMED,
          },
          update: {},
        });
      }
      continue;
    }
    if (!sRes.id || !pRes.id) continue;

    const existing = participantByKey.get(`${sRes.id}|${pRes.id}`);
    const sesCode = sRes.code ?? sessionById.get(sRes.id)?.code ?? '?';

    if (!existing) {
      // ── NOUVELLE INSCRIPTION sur session existante
      const sponsorLabel = sponsorRes?.label ?? `(${sponsorNote})`;
      R.participants.toCreate.push(
        `${aName} → ${sesCode} — payeur : ${sponsorLabel} — ${priceHT > 0 ? `${priceHT.toFixed(2)} € HT` : 'prix non renseigné'}`,
      );
      if (WRITE) {
        let sponsorOrgId = sponsorRes?.id ?? null;
        if (!sponsorOrgId) sponsorOrgId = await findSponsorFallback(pRes.id);
        if (!sponsorOrgId) {
          R.participants.unresolved.push(`${aName} → ${sesCode} : payeur introuvable — inscription NON créée`);
          continue;
        }
        const sesDb = sessionById.get(sRes.id);
        await prisma.sessionParticipant.create({
          data: {
            sessionId: sRes.id,
            personId: pRes.id,
            sponsorOrgId,
            priceHT: new Prisma.Decimal(priceHT),
            enrollmentStatus:
              sesDb?.status === SessionStatus.COMPLETED ? EnrollmentStatus.ATTENDED : EnrollmentStatus.CONFIRMED,
          },
        });
      }
      continue;
    }

    // ── INSCRIPTION EXISTANTE : prix + payeur
    const dbPrice = Number(existing.priceHT);
    let changed = false;
    if (priceHT > 0 && dbPrice === 0) {
      R.participants.priceSet.push(`${aName} → ${sesCode} : 0 € → ${priceHT.toFixed(2)} € HT`);
      changed = true;
      if (WRITE) {
        await prisma.sessionParticipant.update({
          where: { id: existing.id },
          data: { priceHT: new Prisma.Decimal(priceHT) },
        });
      }
    } else if (priceHT > 0 && dbPrice > 0 && Math.abs(priceHT - dbPrice) > 0.01) {
      R.participants.priceConflicts.push(
        `${aName} → ${sesCode} : base ${dbPrice.toFixed(2)} € HT ≠ SmartOF ${priceHT.toFixed(2)} € HT — NON appliqué, arbitrage requis`,
      );
      changed = true;
    }
    // priceHT export = 0 → jamais d'écrasement (règle 4)

    if (sponsorRes?.id && sponsorRes.id !== existing.sponsorOrgId) {
      const dbSponsor = orgById.get(existing.sponsorOrgId)?.legalName ?? existing.sponsorOrgId;
      R.participants.sponsorDiffs.push(
        `${aName} → ${sesCode} : payeur base "${dbSponsor}" ≠ SmartOF "${sponsorRes.label}" — NON appliqué (corrections manuelles protégées)`,
      );
      changed = true;
    }
    if (!changed) R.participants.unchanged++;
  }

  // ══════════════════════ 6. FORMATEURS DES SESSIONS ══════════════════════

  const trainerRows = readSheet(wbSes, 'Formateurs dans les sessions');
  for (const row of trainerRows) {
    const fUid = cell(row, 'Formateur - UID');
    const sUid = cell(row, 'Session - UID');
    const fName = `${cell(row, 'Formateur - Prénom') ?? ''} ${(cell(row, 'Formateur - Nom') ?? '').toUpperCase()}`.trim();
    if (!fUid || !sUid) continue;

    const sRes = sessionResolved.get(sUid);
    if (!sRes || sRes.blocked) continue; // session archivée ou création bloquée — déjà rapportée
    const known = extId.get(fUid);
    const trainerPersonId = known && known.entityType.startsWith('Person') ? known.entityId : null;
    if (!trainerPersonId) {
      R.trainers.unresolved.push(`${fName} (UID ${fUid.slice(0, 8)}…) sur ${sRes.code} : formateur non tracé en base — arbitrage requis`);
      continue;
    }

    if (sRes.isNew) {
      R.trainers.toCreate.push(`${fName} → ${sRes.code} (nouvelle session, formateur principal)`);
      if (WRITE && sRes.id) {
        await prisma.sessionTrainer.upsert({
          where: { sessionId_personId: { sessionId: sRes.id, personId: trainerPersonId } },
          create: { sessionId: sRes.id, personId: trainerPersonId, role: 'Formateur', isPrimary: (trainersPerSession.get(sRes.id) ?? 0) === 0 },
          update: {},
        });
        trainersPerSession.set(sRes.id, (trainersPerSession.get(sRes.id) ?? 0) + 1);
      }
      continue;
    }
    if (!sRes.id) continue;

    if (trainerPairs.has(`${sRes.id}|${trainerPersonId}`)) continue; // déjà en place
    const existingCount = trainersPerSession.get(sRes.id) ?? 0;
    if (existingCount === 0) {
      R.trainers.toCreate.push(`${fName} → ${sRes.code} (session sans formateur en base → ajout, principal)`);
      if (WRITE) {
        await prisma.sessionTrainer.create({
          data: { sessionId: sRes.id, personId: trainerPersonId, role: 'Formateur', isPrimary: true },
        });
        trainerPairs.add(`${sRes.id}|${trainerPersonId}`);
        trainersPerSession.set(sRes.id, 1);
      }
    } else {
      R.trainers.infoOnly.push(
        `${fName} sur ${sRes.code} : la session a déjà ${existingCount} formateur(s) en base — NON touché (signataires des docs protégés)`,
      );
    }
  }

  // ══════════════════════ 7. IGNORÉ VOLONTAIREMENT ══════════════════════

  R.ignored.creneaux = readSheet(wbSes, 'Créneaux de formation').length;
  try {
    R.ignored.charges = readSheet(wbSes, 'Charges des sessions').length;
  } catch {
    R.ignored.charges = 0;
  }

  // ══════════════════════════ AuditLog (WRITE) ══════════════════════════

  if (WRITE) {
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: null,
        action: 'smartof.sync',
        entity: 'System',
        entityId: 'sync-smartof-1208',
        diff: {
          mode: 'write',
          decisions: 'Laurent 2026-08-12 : SES-0008 exclue, annulées exclues, base gagne sur montants/payeurs, produits manquants créés',
          personsCreated: R.persons.created.length,
          personsUpdated: R.persons.updated.length + R.persons.matchedByName.length,
          orgsCreated: R.orgs.created.length,
          orgsUpdated: R.orgs.updated.length + R.orgs.matchedBySiret.length + R.orgs.matchedByName.length,
          productsCreated: R.products.created.length,
          sessionsCreated: R.sessions.created.length,
          sessionsUpdated: R.sessions.updated.length,
          sessionsExcluded: R.sessions.excludedByDecision.length,
          participantsCreated: R.participants.toCreate.length,
          participantsOnNewSessions: R.participants.onNewSessions,
          participantsExcluded: R.participants.excludedByDecision,
          legalLinksCreated: R.legalLinks.toCreate.length,
          trainersCreated: R.trainers.toCreate.length,
        } as Prisma.InputJsonValue,
      },
    });
    R.writeApplied = true;
  }

  // ══════════════════════════ RAPPORT ══════════════════════════

  const report = buildReport({
    counts: {
      persons: appRows.length,
      orgs: entRows.length,
      sessions: sesRows.length,
      inscriptions: insRows.length,
      commanditaires: commRows.length,
      dbPersons: dbPersons.length,
      dbOrgs: dbOrgs.length,
      dbSessions: dbSessions.length,
      dbParticipants: dbParticipants.length,
    },
  });
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, report, 'utf8');

  console.log(`\n📄 Rapport écrit : ${REPORT_PATH}`);
  console.log(`\n🎯 Synthèse ${WRITE ? '(APPLIQUÉ — écriture réelle)' : '(SIMULATION — rien n\'a été écrit)'} :
  Apprenants   : ${R.persons.created.length} créés, ${R.persons.updated.length} mis à jour, ${R.persons.matchedByName.length} rapprochés par nom, ${R.persons.ambiguous.length} ambigus, ${R.persons.unchanged} inchangés
  Entreprises  : ${R.orgs.created.length} créées, ${R.orgs.updated.length} mises à jour, ${R.orgs.matchedBySiret.length + R.orgs.matchedByName.length} rapprochées (SIRET/nom), ${R.orgs.unchanged} inchangées
  Produits     : ${R.products.created.length} créés (décision ④)
  Sessions     : ${R.sessions.created.length} créées, ${R.sessions.updated.length} mises à jour, ${R.sessions.excludedByDecision.length} exclues (décisions ①/②), ${R.sessions.missingProduct.length} bloquées (produit), ${R.sessions.unchanged} inchangées
  Inscriptions : ${R.participants.toCreate.length} créées (sessions existantes), ${R.participants.onNewSessions} sur nouvelles sessions, ${R.participants.excludedByDecision} exclues (sessions ①/②), ${R.participants.priceSet.length} prix posés (0→montant), ${R.participants.priceConflicts.length} conflits de montant (base conservée)
  Liens        : ${R.legalLinks.toCreate.length} LegalLinks créés, ${R.legalLinks.existingPair} couples déjà reliés
  Formateurs   : ${R.trainers.toCreate.length} affectations créées, ${R.trainers.unresolved.length} non résolus`);
}

// ─────────────────────────── Génération du rapport MD ───────────────────────────

function section(title: string, lines: string[], cap?: number): string {
  if (lines.length === 0) return `### ${title}\n\n_Aucun._\n`;
  const shown = cap && lines.length > cap ? lines.slice(0, cap) : lines;
  const rest = cap && lines.length > cap ? `\n- … **+ ${lines.length - cap} autres** (relancer le script pour la liste exhaustive : elles sont toutes appliquées de la même façon)` : '';
  return `### ${title} (${lines.length})\n\n${shown.map((l) => `- ${l}`).join('\n')}${rest}\n`;
}

function changesTable(title: string, entries: EntityChange[], cap = 40): string {
  if (entries.length === 0) return `### ${title}\n\n_Aucune._\n`;
  const shown = entries.slice(0, cap);
  const rows = shown
    .map((e) => e.diffs.map((d) => `| ${e.label} | ${d.field} | ${d.before} | ${d.after} |`).join('\n'))
    .filter(Boolean)
    .join('\n');
  const rest = entries.length > cap ? `\n\n… **+ ${entries.length - cap} autres fiches modifiées** (même nature de changements — échantillon représentatif ci-dessus).` : '';
  return `### ${title} (${entries.length} fiches)\n\n| Fiche | Champ | Avant (base) | Après (SmartOF 12/08) |\n| --- | --- | --- | --- |\n${rows}${rest}\n`;
}

function buildReport(ctx: {
  counts: {
    persons: number; orgs: number; sessions: number; inscriptions: number; commanditaires: number;
    dbPersons: number; dbOrgs: number; dbSessions: number; dbParticipants: number;
  };
}): string {
  const c = ctx.counts;
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  return `# Rapport de synchronisation SmartOF 12/08/2026 — ${R.writeApplied ? 'ÉCRITURE APPLIQUÉE' : 'SIMULATION (dry-run)'}

> Généré le ${now} UTC par \`apps/web/scripts/sync-smartof-1208.ts\`${R.writeApplied ? '' : ' — **AUCUNE écriture en base n\'a été faite.**'}
> Base cible : cloud production Supabase. L'écriture réelle (\`WRITE=1\`) est une **étape séparée**, à lancer uniquement après validation de ce rapport par Laurent.

## 1. Vue d'ensemble

| Source | Export 12/08 | En base (avant) |
| --- | --- | --- |
| Apprenants | ${c.persons} | ${c.dbPersons} personnes (apprenants + formateurs + contacts) |
| Entreprises | ${c.orgs} | ${c.dbOrgs} |
| Sessions | ${c.sessions} | ${c.dbSessions} |
| Inscriptions | ${c.inscriptions} | ${c.dbParticipants} |

**Clé de fusion : UID SmartOF** (jamais l'email). Rapprochements secondaires (SIRET, nom exact, code session) listés explicitement ci-dessous pour validation.

**Décisions d'arbitrage appliquées (Laurent, 12/08/2026)** :
1. SES-0008 « PRÉ-INSCRIPTION » exclue (fourre-tout — circuit pré-inscriptions QualiOF)
2. Sessions annulées SmartOF jamais importées : exclues (historique conservé dans SmartOF)
3. Montants et payeurs divergents : **la base gagne partout** (Tréso = vérité) — 0 écrasement
4. Produits manquants créés (produits simples hors pipeline de génération Qualiopi) pour débloquer SES-0098/0099/0104

**Ce qui ${R.writeApplied ? 's\'est passé au WRITE' : 'va se passer au WRITE (après validation)'}** :
- **${R.persons.created.length} apprenants créés**, ${R.persons.updated.length} mis à jour, ${R.persons.matchedByName.length} rapprochés par nom (UID nouvellement tracé)
- **${R.orgs.created.length} entreprises créées**, ${R.orgs.updated.length} mises à jour, ${R.orgs.matchedBySiret.length + R.orgs.matchedByName.length} rapprochées par SIRET/nom
- **${R.products.created.length} produits de formation créés** (décision ④)
- **${R.sessions.created.length} sessions créées**, ${R.sessions.updated.length} mises à jour (dates/nom uniquement), ${R.sessions.excludedByDecision.length} exclues par décision${R.sessions.missingProduct.length > 0 ? `, ⚠ ${R.sessions.missingProduct.length} créations bloquées (produit inconnu)` : ''}
- **${R.participants.toCreate.length} inscriptions créées sur des sessions existantes** + ${R.participants.onNewSessions} sur les nouvelles sessions (${R.participants.excludedByDecision} volontairement non importées — sessions exclues)
- ${R.participants.priceSet.length} prix HT/stagiaire posés (0 € → montant SmartOF) — un montant existant n'est JAMAIS écrasé
- ${R.legalLinks.toCreate.length} liens apprenant×entreprise créés (additifs, rôles EI_SELF/AGENT_COMMERCIAL/SALARIE)
- ${R.trainers.toCreate.length} affectations formateur créées (uniquement nouvelles sessions ou sessions sans formateur)

---

## 2. Nouveaux

${section('Nouveaux apprenants', R.persons.created)}
${section('Nouvelles entreprises', R.orgs.created)}
${section('Nouveaux produits de formation (décision ④ — hors pipeline génération Qualiopi)', R.products.created)}
${section('Nouvelles sessions', R.sessions.created)}
${section('Sessions EXCLUES par décision (①/② — volontairement non importées)', R.sessions.excludedByDecision)}
${section('Nouvelles inscriptions (sur sessions déjà en base)', R.participants.toCreate)}
${section('Nouveaux liens apprenant × entreprise', R.legalLinks.toCreate)}
${section('Nouvelles affectations formateur', R.trainers.toCreate)}
${R.participants.onNewSessions > 0 ? `> ℹ️ Les **${R.participants.onNewSessions} inscriptions des nouvelles sessions** seront créées avec elles (payeur = commanditaire SmartOF, prix HT = budget commanditaire ÷ nb d'apprenants).\n` : ''}
---

## 3. Mises à jour (champs modifiés, avant → après)

${changesTable('Apprenants mis à jour (UID connu)', R.persons.updated)}
${changesTable('Entreprises mises à jour (UID connu)', R.orgs.updated)}
${changesTable('Sessions mises à jour (dates / nom)', R.sessions.updated, 60)}
${section('Prix HT/stagiaire posés (0 € en base → montant SmartOF)', R.participants.priceSet, 60)}
${section('N° de sécurité sociale ajoutés/modifiés (valeurs masquées — RGPD)', R.persons.ssnUpdated, 40)}
${section('Profils AGEFICE (PA) mis à jour', R.orgs.agefice, 40)}

---

## 4. Rapprochements à VALIDER (UID SmartOF inconnu → fiche existante trouvée)

Ces fiches existent en base **sans UID SmartOF tracé**. Le script propose de les rapprocher (l'UID sera attaché, les champs non vides mis à jour). **Vérifier qu'il ne s'agit pas d'homonymes.**

${changesTable('Apprenants rapprochés par nom+prénom exact', R.persons.matchedByName)}
${changesTable('Entreprises rapprochées par SIRET', R.orgs.matchedBySiret)}
${changesTable('Entreprises rapprochées par raison sociale', R.orgs.matchedByName)}
${section('Sessions rapprochées par code', R.sessions.matchedByCode)}

---

## 5. Conflits / ambiguïtés — ARBITRAGE REQUIS (rien ne sera écrit sur ces points)

${section('⚠ Homonymes (UID inconnu, plusieurs candidats en base)', R.persons.ambiguous)}
${section('⚠ Montants divergents (base ≠ SmartOF, tous deux non nuls)', R.participants.priceConflicts)}
${section('⚠ Payeurs divergents (sponsor en base ≠ commanditaire SmartOF)', R.participants.sponsorDiffs)}
${section('⚠ Sessions à créer BLOQUÉES (produit SmartOF non tracé en base)', R.sessions.missingProduct)}
${section('⚠ Statuts de session divergents (info — le statut QualiOF est conservé)', R.sessions.statusDiffs)}
${section('⚠ Produits de session divergents (info — non appliqué)', R.sessions.productMismatch)}
${section('⚠ Formateurs non résolus', R.trainers.unresolved)}
${section('⚠ Inscriptions non résolues', R.participants.unresolved)}
${section('⚠ Rattachements non résolus', R.legalLinks.unresolved)}
${section('Sessions en base ABSENTES de l\'export SmartOF (aucune suppression — info)', R.sessions.inDbNotInExport)}

---

## 6. Ignoré volontairement (et pourquoi)

| Élément | Volume | Raison |
| --- | --- | --- |
| Créneaux de formation | ${R.ignored.creneaux} | L'émargement QualiOF suit la convention figée 9h-13h / 14h-18h (règle métier non négociable) ; la base n'utilise quasiment pas SessionSlot (${R.ignored.slotsInDb} en base). Importer 876 créneaux toucherait des sessions dont les documents sont déjà générés. À arbitrer séparément si besoin. |
| Charges des sessions | ${R.ignored.charges} | Coûts formateurs SmartOF — pas de modèle cible côté QualiOF (hors périmètre). |
| Statut des sessions existantes | ${R.sessions.statusDiffs.length} divergences | QualiOF pilote le cycle de clôture (packs, docs) ; écraser le statut casserait le workflow. Diff listé §5. |
| sponsorOrg des inscriptions existantes | ${R.participants.sponsorDiffs.length} divergences | Des corrections manuelles existent (ex. SES-0101 EI agent commercial) — jamais d'écrasement automatique. |
| Montants : 0 € SmartOF | — | Un 0 € n'écrase JAMAIS un montant en base (règle métier Tréso). |
| Champs vides SmartOF | — | Une cellule vide n'écrase jamais une valeur en base. |
| Documents/packs QualiOF (Document, ClosureBatch, PedagogicalAsset…) | — | Jamais touchés par la sync. |
| Adresse de facturation entreprises, liens formulaire d'inscription, champs BPF session | — | Pas de champ cible en base / donnée non exploitée. |
| Fiches archivées côté SmartOF | ${R.persons.archivedSkipped.length + R.orgs.archivedSkipped.length + R.sessions.archivedSkipped.length} | Ignorées (${R.persons.archivedSkipped.join(', ') || '—'}${R.orgs.archivedSkipped.length ? ` ; entreprises : ${R.orgs.archivedSkipped.join(', ')}` : ''}${R.sessions.archivedSkipped.length ? ` ; sessions : ${R.sessions.archivedSkipped.join(', ')}` : ''}). |
| Forme juridique des entreprises existantes | — | Jamais réécrite (corrections manuelles possibles) — divergences listées dans les tableaux §3. |

---

## 7. Étape suivante

1. **Laurent valide ce rapport** (en particulier §4 rapprochements et §5 conflits).
2. Écriture réelle (étape séparée) : \`WRITE=1 pnpm exec dotenv -e ../../.env -- tsx scripts/sync-smartof-1208.ts\` depuis \`apps/web\` — séquentiel, idempotent (re-run = 0 changement).
3. Re-jouer le script en DRY après le WRITE pour prouver l'idempotence (tout doit ressortir « inchangé »).
`;
}

main()
  .catch((err) => {
    console.error('❌ sync-smartof-1208 failed', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
