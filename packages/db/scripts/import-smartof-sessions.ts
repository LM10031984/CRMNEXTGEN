/**
 * Importeur sessions SmartOF → QualiOF.
 *
 * Source : Export des sessions SmartOF - 28_04_2026.xlsx (77 sessions, fusion 2025+2026)
 * Colonnes : ID | Statut | Nom | Commanditaires | Budget Total | Date de début | Date de fin | Apprenants | Montant Facturé Total
 *
 * Rapprochement par nom (pas d'UUID SmartOF dans cet export) :
 *   - Person par (firstName + lastName) normalisés, ou (lastName + firstInitial)
 *   - Organization par legalName normalisé
 *   - TrainingProduct par fuzzy match du titre
 *
 * Cas EI (Pascal BIANCO, Anthony BARRIERE, etc.) :
 *   La colonne Commanditaires liste qui paye. Pour chaque apprenant :
 *     - si une Org du Commanditaires correspond à son nom → sponsorOrg = son EI
 *     - sinon → on cherche une Org structure parmi ses LegalLinks existants
 *     - fallback : 1er LegalLink trouvé, sinon requiresCleanup=true
 */

import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env') });

import * as XLSX from 'xlsx';
import {
  PrismaClient,
  SessionStatus,
  Modality,
  LinkRole,
  EnrollmentStatus,
  Prisma,
} from '@prisma/client';
import { normalizeName, sessionCode } from '@qualiof/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const SESSIONS_XLSX = path.join(ROOT, 'Export des sessions SmartOF - 28_04_2026.xlsx');

const prisma = new PrismaClient();

interface SessionRow {
  ID: string;
  Statut: string;
  Nom: string;
  Commanditaires: string;
  'Budget Total': string;
  'Date de début': Date | string;
  'Date de fin': Date | string;
  Apprenants: string;
  'Montant Facturé Total': string;
  'Date de création': Date | string;
  'Date de modification': Date | string;
}

// ---------- Utilitaires ----------

function loadWorkbook(filePath: string): XLSX.WorkBook {
  const buf = fs.readFileSync(filePath);
  return XLSX.read(buf, { type: 'buffer', cellDates: true });
}

function readSessionsSheet(): SessionRow[] {
  const wb = loadWorkbook(SESSIONS_XLSX);
  const ws = wb.Sheets[wb.SheetNames[0]!];
  return XLSX.utils.sheet_to_json<SessionRow>(ws!, { defval: null, raw: false });
}

function parseEuro(s: string | null): number {
  if (!s) return 0;
  return parseFloat(String(s).replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
}

function mapStatus(s: string): SessionStatus {
  const norm = (s || '').toLowerCase();
  if (norm.includes('annulée')) return SessionStatus.CANCELLED;
  if (norm.includes('terminée') || norm.includes('à facturer') || norm.includes('a facturer')) return SessionStatus.COMPLETED;
  if (norm.includes('validée')) return SessionStatus.VALIDATED;
  if (norm.includes('ouverte') || norm.includes('planifiée')) return SessionStatus.PLANNED;
  return SessionStatus.DRAFT;
}

/** Split "Pierre DUPONT| Marie MARTIN | jean DURAND" → ["Pierre DUPONT", "Marie MARTIN", "jean DURAND"] */
function splitMultilineList(s: string | null): string[] {
  if (!s) return [];
  return String(s).split('|').map((x) => x.trim()).filter(Boolean);
}

/**
 * Parse un nom apprenant : essaie plusieurs formats
 *   "Pierre DUPONT" → { firstName: "Pierre", lastName: "DUPONT" }
 *   "DUPONT Pierre" → { firstName: "Pierre", lastName: "DUPONT" }
 *   "Marie de la Fontaine" → { firstName: "Marie", lastName: "de la Fontaine" }
 */
function parsePersonName(raw: string): { firstName: string; lastName: string } {
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  // Si ALL CAPS dernier mot → "Prénom NOM"
  const parts = cleaned.split(' ');
  if (parts.length < 2) return { firstName: cleaned, lastName: '' };

  // Heuristique : si premier mot est ALL CAPS → "NOM Prénom"
  if (parts[0]! === parts[0]!.toUpperCase() && parts[0]!.length > 1) {
    // Trouver où finit le NOM (séquence de mots majuscules)
    let lastNameEnd = 1;
    while (
      lastNameEnd < parts.length &&
      parts[lastNameEnd]!.length > 1 &&
      parts[lastNameEnd]! === parts[lastNameEnd]!.toUpperCase()
    ) {
      lastNameEnd++;
    }
    return {
      lastName: parts.slice(0, lastNameEnd).join(' '),
      firstName: parts.slice(lastNameEnd).join(' '),
    };
  }
  // Sinon "Prénom NOM…" → dernier mot = NOM, le reste = prénom
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1]!,
  };
}

// ---------- Caches ----------

interface PersonCache {
  id: string;
  firstName: string;
  lastName: string;
  normKey: string; // "lastname|firstname" normalisé
}

interface OrgCache {
  id: string;
  legalName: string;
  normKey: string;
}

let personCache: PersonCache[] = [];
let orgCache: OrgCache[] = [];

async function loadCaches(tenantId: string): Promise<void> {
  const persons = await prisma.person.findMany({
    where: { tenantId, archived: false },
    select: { id: true, firstName: true, lastName: true },
  });
  personCache = persons.map((p) => ({
    ...p,
    normKey: `${normalizeName(p.lastName)}|${normalizeName(p.firstName)}`,
  }));

  const orgs = await prisma.organization.findMany({
    where: { tenantId, archived: false },
    select: { id: true, legalName: true },
  });
  orgCache = orgs.map((o) => ({
    ...o,
    normKey: normalizeName(o.legalName),
  }));
  console.log(`✓ Caches : ${personCache.length} persons, ${orgCache.length} orgs`);
}

function findPerson(rawName: string): PersonCache | null {
  const { firstName, lastName } = parsePersonName(rawName);
  const fnNorm = normalizeName(firstName);
  const lnNorm = normalizeName(lastName);
  if (!fnNorm || !lnNorm) return null;
  // Match exact lastname|firstname
  const exact = personCache.find((p) => p.normKey === `${lnNorm}|${fnNorm}`);
  if (exact) return exact;
  // Match avec inversion ou first letter
  const partial = personCache.find(
    (p) =>
      (p.normKey === `${fnNorm}|${lnNorm}`) ||
      (p.normKey.startsWith(`${lnNorm}|`) && p.normKey.split('|')[1]?.startsWith(fnNorm.charAt(0))),
  );
  return partial ?? null;
}

function findOrg(rawName: string): OrgCache | null {
  const norm = normalizeName(rawName);
  if (!norm) return null;
  // Match exact
  const exact = orgCache.find((o) => o.normKey === norm);
  if (exact) return exact;
  // Match contains (org name often has accents / extra words)
  const partial = orgCache.find((o) => o.normKey.includes(norm) || norm.includes(o.normKey));
  return partial ?? null;
}

// ---------- TrainingProduct fuzzy ----------

interface ProductCache {
  id: string;
  title: string;
  normTokens: string[];
}

let productCache: ProductCache[] = [];

async function loadProductCache(tenantId: string): Promise<void> {
  const products = await prisma.trainingProduct.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, title: true },
  });
  productCache = products.map((p) => ({
    ...p,
    normTokens: normalizeName(p.title)
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 3),
  }));
}

function findProduct(title: string): ProductCache | null {
  const titleTokens = new Set(
    normalizeName(title)
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 3),
  );
  if (titleTokens.size === 0) return null;
  let best: { p: ProductCache; score: number } | null = null;
  for (const p of productCache) {
    const overlap = p.normTokens.filter((t) => titleTokens.has(t)).length;
    const denom = Math.max(p.normTokens.length, titleTokens.size);
    const score = denom === 0 ? 0 : overlap / denom;
    if (score >= 0.4 && (!best || score > best.score)) best = { p, score };
  }
  return best?.p ?? null;
}

async function ensureFallbackProduct(tenantId: string): Promise<string> {
  const code = 'PROD-IMPORT-FALLBACK';
  const existing = await prisma.trainingProduct.findFirst({
    where: { tenantId, code },
  });
  if (existing) return existing.id;
  const created = await prisma.trainingProduct.create({
    data: {
      tenantId,
      code,
      title: '(Fallback) Formation à rapprocher',
      durationHours: 0,
      modality: Modality.PRESENTIEL,
      objectives: [] as Prisma.InputJsonValue,
      programMd: '',
      isActive: true,
      excludedFromBpf: true,
    },
  });
  return created.id;
}

// ---------- LegalLink resolution pour cas EI ----------

async function resolveSponsorOrg(opts: {
  personId: string;
  personFirstName: string;
  personLastName: string;
  commanditaireOrgs: { id: string; legalName: string }[];
}): Promise<{ orgId: string; reason: string } | null> {
  const { personId, personFirstName, personLastName, commanditaireOrgs } = opts;

  // 1. LegalLinks existants pour cette personne
  const links = await prisma.legalLink.findMany({
    where: { personId },
    include: { organization: { select: { id: true, legalName: true } } },
  });
  if (commanditaireOrgs.length === 0) {
    // Pas de commanditaire → on prend le LegalLink primaire ou le premier
    const primary = links.find((l) => l.isPrimary) ?? links[0];
    return primary ? { orgId: primary.organizationId, reason: 'no-sponsor-fallback-primary' } : null;
  }

  // 2. Cherche un LegalLink dont l'org match un commanditaire
  for (const cmd of commanditaireOrgs) {
    const match = links.find((l) => l.organizationId === cmd.id);
    if (match) {
      return { orgId: cmd.id, reason: match.role === 'EI_SELF' ? 'matched-EI_SELF' : `matched-${match.role}` };
    }
  }

  // 3. Pas de match direct → si un commanditaire porte le nom de la personne, créer/trouver l'EI
  const fnNorm = normalizeName(personFirstName);
  const lnNorm = normalizeName(personLastName);
  for (const cmd of commanditaireOrgs) {
    const cmdNorm = normalizeName(cmd.legalName);
    if (cmdNorm.includes(lnNorm) && (cmdNorm.includes(fnNorm) || cmdNorm.includes(fnNorm.charAt(0)))) {
      // Crée le LegalLink EI_SELF si manquant
      await prisma.legalLink.upsert({
        where: { personId_organizationId_role: { personId, organizationId: cmd.id, role: LinkRole.EI_SELF } },
        create: { personId, organizationId: cmd.id, role: LinkRole.EI_SELF, isPrimary: true },
        update: {},
      });
      return { orgId: cmd.id, reason: 'created-EI_SELF' };
    }
  }

  // 4. Sinon, prend le 1er commanditaire et crée un LegalLink SALARIE par défaut
  const fallbackOrg = commanditaireOrgs[0]!;
  await prisma.legalLink.upsert({
    where: { personId_organizationId_role: { personId, organizationId: fallbackOrg.id, role: LinkRole.SALARIE } },
    create: { personId, organizationId: fallbackOrg.id, role: LinkRole.SALARIE, isPrimary: false },
    update: {},
  });
  return { orgId: fallbackOrg.id, reason: 'created-SALARIE-fallback' };
}

// ---------- Main import ----------

async function main() {
  console.time('import-sessions');
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) throw new Error("Aucun tenant. Lance d'abord pnpm db:seed.");

  await loadCaches(tenant.id);
  await loadProductCache(tenant.id);
  const fallbackProductId = await ensureFallbackProduct(tenant.id);

  const rows = readSessionsSheet();
  console.log(`\n📅 Sessions : ${rows.length} lignes à importer\n`);

  const stats = {
    created: 0,
    updated: 0,
    participantsCreated: 0,
    participantsSkipped: 0,
    productMatched: 0,
    productFallback: 0,
    sponsorMatched: 0,
    sponsorEI: 0,
    sponsorFallback: 0,
    sponsorMissing: 0,
  };

  for (const row of rows) {
    const sesId = String(row.ID);
    const status = mapStatus(row.Statut);
    const startDate = row['Date de début'] ? new Date(row['Date de début']) : new Date();
    const endDate = row['Date de fin'] ? new Date(row['Date de fin']) : startDate;
    const totalHT = parseEuro(row['Budget Total']);

    // --- Produit ---
    const product = findProduct(row.Nom);
    let productId: string;
    if (product) {
      productId = product.id;
      stats.productMatched++;
    } else {
      productId = fallbackProductId;
      stats.productFallback++;
    }

    // --- Commanditaires : résolution par nom ---
    const commanditaireNames = splitMultilineList(row.Commanditaires);
    const commanditaireOrgs: { id: string; legalName: string }[] = [];
    for (const cName of commanditaireNames) {
      const found = findOrg(cName);
      if (found) commanditaireOrgs.push({ id: found.id, legalName: found.legalName });
    }

    // --- Crée / update la session ---
    const existing = await prisma.trainingSession.findUnique({ where: { code: sesId } });
    const data = {
      tenantId: tenant.id,
      productId,
      code: sesId,
      name: row.Nom,
      status,
      startDate,
      endDate,
      modality: Modality.PRESENTIEL,
      pricePerLearner: totalHT > 0 ? new Prisma.Decimal(totalHT) : null,
      internalNotes: `Importé depuis SmartOF. Commanditaires bruts : ${row.Commanditaires}`.substring(0, 500),
    };

    let sessionId: string;
    if (existing) {
      await prisma.trainingSession.update({ where: { id: existing.id }, data });
      sessionId = existing.id;
      stats.updated++;
    } else {
      const created = await prisma.trainingSession.create({ data });
      sessionId = created.id;
      await prisma.externalIdentity.create({
        data: {
          tenantId: tenant.id,
          entityType: 'TrainingSession',
          entityId: sessionId,
          source: 'smartof',
          externalId: sesId,
        },
      });
      stats.created++;
    }

    // --- Inscriptions des apprenants ---
    const apprenantNames = splitMultilineList(row.Apprenants);
    for (const aName of apprenantNames) {
      const person = findPerson(aName);
      if (!person) {
        stats.participantsSkipped++;
        continue;
      }
      const sponsor = await resolveSponsorOrg({
        personId: person.id,
        personFirstName: person.firstName,
        personLastName: person.lastName,
        commanditaireOrgs,
      });
      if (!sponsor) {
        stats.sponsorMissing++;
        stats.participantsSkipped++;
        continue;
      }
      if (sponsor.reason === 'created-EI_SELF') stats.sponsorEI++;
      else if (sponsor.reason.startsWith('matched-')) stats.sponsorMatched++;
      else stats.sponsorFallback++;

      const pricePerLearner =
        apprenantNames.length > 0 && totalHT > 0 ? totalHT / apprenantNames.length : 0;

      try {
        await prisma.sessionParticipant.upsert({
          where: { sessionId_personId: { sessionId, personId: person.id } },
          create: {
            sessionId,
            personId: person.id,
            sponsorOrgId: sponsor.orgId,
            priceHT: new Prisma.Decimal(pricePerLearner),
            enrollmentStatus: status === SessionStatus.COMPLETED ? EnrollmentStatus.ATTENDED : EnrollmentStatus.CONFIRMED,
          },
          update: { sponsorOrgId: sponsor.orgId, priceHT: new Prisma.Decimal(pricePerLearner) },
        });
        stats.participantsCreated++;
      } catch (err) {
        console.warn(`   ⚠ skip ${aName} on ${sesId} : ${(err as Error).message}`);
        stats.participantsSkipped++;
      }
    }

    if ((stats.created + stats.updated) % 10 === 0) {
      console.log(`  ... ${stats.created + stats.updated}/${rows.length} sessions importées`);
    }
  }

  console.log(`
🎯 Récapitulatif final :
   Sessions :
     - ${stats.created} créées, ${stats.updated} mises à jour
     - ${stats.productMatched} matchées sur un produit existant, ${stats.productFallback} sur produit fallback
   Inscriptions (SessionParticipant) :
     - ${stats.participantsCreated} créées
     - ${stats.participantsSkipped} ignorées (apprenant introuvable ou sponsor manquant)
   Sponsoring (résolution cas EI) :
     - ${stats.sponsorMatched} matchés sur LegalLink existant
     - ${stats.sponsorEI} EI_SELF créés à la volée (cas auto-entrepreneur)
     - ${stats.sponsorFallback} fallback SALARIE
     - ${stats.sponsorMissing} sponsors manquants (à corriger)
`);
  console.timeEnd('import-sessions');
}

main()
  .catch((err) => {
    console.error('❌ import-sessions failed', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
