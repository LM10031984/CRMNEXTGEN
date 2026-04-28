/**
 * Importeur Référentiel des Points d'Accueil AGEFICE → QualiOF.
 *
 * Source : agefice_points_accueil.xlsx (438 PA AGEFICE de France, fourni par le user).
 *
 * Deux phases :
 *
 *   Phase 1 — Import du référentiel (toujours appliquée, table AgeficePointAccueil)
 *     Upsert idempotent sur (postalCode, name).
 *
 *   Phase 2 — Auto-rattachement des AgeficeProfile au PA le plus proche
 *     Matching = département (CP[0..2]) puis proximité ville (exact, préfixe, fallback 1er).
 *     Mode --dry-run par défaut : affiche un diff "avant → après" sans écrire.
 *     Mode --apply : écrit pointAccueilId sur les AgeficeProfile non verrouillés
 *     (pointAccueilLockedManually = false).
 *
 * Lancement :
 *   pnpm --filter @qualiof/db import:agefice-pa            # dry-run
 *   pnpm --filter @qualiof/db import:agefice-pa --apply    # applique l'écrasement
 */

import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env') });

import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const FILE = path.join(ROOT, 'agefice_points_accueil.xlsx');

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');

interface RawRow {
  'Département (code)': number | string | null;
  'Nom Département': string | null;
  "Nom Point d'Accueil": string | null;
  Adresse: string | null;
  'Adresse (suite)': string | null;
  'Code Postal': number | string | null;
  Ville: string | null;
  Téléphone: number | string | null;
  Email: string | null;
  'Site Web': string | null;
}

interface PARecord {
  name: string;
  address1: string | null;
  address2: string | null;
  postalCode: string;
  city: string;
  department: string;
  departmentName: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
}

function padPostalCode(raw: number | string | null): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // DOM-TOM : codes à 5 ou 6 chiffres déjà corrects
  return s.padStart(5, '0').slice(0, 5);
}

function deptFromPostalCode(cp: string): string {
  // 97XXX / 98XXX → DOM-TOM, code département à 3 chars
  if (cp.startsWith('97') || cp.startsWith('98')) return cp.slice(0, 3);
  // 20XXX = Corse 2A (Sud) ou 2B (Nord). On prend "20" générique pour le matching.
  return cp.slice(0, 2);
}

function formatPhone(raw: number | string | null): string | null {
  if (raw == null) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;
  // Le fichier source stocke souvent les téléphones FR en number, ce qui élide le 0 initial.
  // 9 chiffres → réinjecter le 0 ; 10 chiffres → tels quels ; reste → on laisse brut.
  let normalized = digits;
  if (digits.length === 9) normalized = '0' + digits;
  if (normalized.length !== 10) return normalized;
  return normalized.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
}

function normalizeName(s: string | null): string {
  return (s ?? '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function readRows(): PARecord[] {
  // Le bundle xlsx CDN bloque l'accès direct au fs : on lit le buffer manuellement.
  const buffer = fs.readFileSync(FILE);
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raws = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: null });

  const records: PARecord[] = [];
  for (const r of raws) {
    const name = (r["Nom Point d'Accueil"] ?? '').toString().trim();
    const cp = padPostalCode(r['Code Postal']);
    const city = (r['Ville'] ?? '').toString().trim();
    if (!name || !cp || !city) continue; // ligne incomplète ignorée
    records.push({
      name,
      address1: (r['Adresse'] ?? '')?.toString().trim() || null,
      address2: (r['Adresse (suite)'] ?? '')?.toString().trim() || null,
      postalCode: cp,
      city,
      department: deptFromPostalCode(cp),
      departmentName: (r['Nom Département'] ?? '')?.toString().trim() || null,
      phone: formatPhone(r['Téléphone']),
      email: (r['Email'] ?? '')?.toString().trim() || null,
      website: (r['Site Web'] ?? '')?.toString().trim() || null,
    });
  }
  return records;
}

interface PALite {
  id: string;
  name: string;
  postalCode: string;
  city: string;
  department: string;
  address1: string | null;
  phone: string | null;
}

function pickClosestPA(orgPostalCode: string | null | undefined, orgCity: string | null | undefined, pas: PALite[]): PALite | null {
  if (!orgPostalCode || orgPostalCode.length < 2) return null;
  const dept = deptFromPostalCode(orgPostalCode);
  const candidates = pas.filter((p) => p.department === dept);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  if (orgCity) {
    const oCity = normalizeName(orgCity);
    const exact = candidates.find((p) => normalizeName(p.city) === oCity);
    if (exact) return exact;
    const prefix = candidates.find((p) => {
      const c = normalizeName(p.city);
      return c.startsWith(oCity) || oCity.startsWith(c);
    });
    if (prefix) return prefix;
  }
  // Fallback : 1er PA du département (ordre alpha de l'import)
  return [...candidates].sort((a, b) => a.name.localeCompare(b.name))[0];
}

async function phase1ImportRefentiel(records: PARecord[]) {
  console.log(`\n📥 Phase 1 — Import du référentiel (${records.length} lignes)`);
  let created = 0;
  let updated = 0;
  for (const r of records) {
    const existing = await prisma.ageficePointAccueil.findUnique({
      where: { postalCode_name: { postalCode: r.postalCode, name: r.name } },
    });
    if (!existing) {
      await prisma.ageficePointAccueil.create({ data: r });
      created++;
    } else {
      // Update tous les champs, sauf id/createdAt
      await prisma.ageficePointAccueil.update({
        where: { id: existing.id },
        data: {
          address1: r.address1,
          address2: r.address2,
          city: r.city,
          department: r.department,
          departmentName: r.departmentName,
          phone: r.phone,
          email: r.email,
          website: r.website,
        },
      });
      updated++;
    }
  }
  console.log(`   ✅ ${created} créés, ${updated} mis à jour, total en base : ${await prisma.ageficePointAccueil.count()}`);
}

interface DiffRow {
  orgName: string;
  orgPostalCode: string | null;
  orgCity: string | null;
  before: string;
  after: string;
  changed: boolean;
  willSkip: boolean;
  reason?: string;
}

async function phase2RattacherProfiles() {
  console.log(`\n🔗 Phase 2 — Auto-rattachement (${APPLY ? 'APPLY' : 'DRY-RUN'})`);

  const profiles = await prisma.ageficeProfile.findMany({
    include: {
      organization: { select: { id: true, legalName: true, address: true } },
      pointAccueil: { select: { id: true, name: true, city: true, postalCode: true } },
    },
  });

  const allPAs = await prisma.ageficePointAccueil.findMany({
    select: { id: true, name: true, postalCode: true, city: true, department: true, address1: true, phone: true },
  });

  const diffs: DiffRow[] = [];
  let willChange = 0;
  let alreadyOk = 0;
  let noMatch = 0;
  let locked = 0;

  for (const profile of profiles) {
    const addr = (profile.organization.address ?? {}) as { postalCode?: string; city?: string };
    const orgPostalCode = addr.postalCode ?? null;
    const orgCity = addr.city ?? null;

    const before =
      profile.pointAccueil
        ? `[ref] ${profile.pointAccueil.name} (${profile.pointAccueil.postalCode} ${profile.pointAccueil.city})`
        : profile.paName
        ? `[texte SmartOF] ${profile.paName}`
        : '— (vide)';

    const matched = pickClosestPA(orgPostalCode, orgCity, allPAs);

    if (!matched) {
      diffs.push({
        orgName: profile.organization.legalName,
        orgPostalCode,
        orgCity,
        before,
        after: '— (aucun PA trouvé pour ce département)',
        changed: false,
        willSkip: true,
        reason: orgPostalCode ? 'aucun PA dans le département' : 'pas de code postal sur l\'org',
      });
      noMatch++;
      continue;
    }

    const after = `[ref] ${matched.name} (${matched.postalCode} ${matched.city})`;
    const changed = profile.pointAccueilId !== matched.id;
    const willSkip = profile.pointAccueilLockedManually;

    diffs.push({
      orgName: profile.organization.legalName,
      orgPostalCode,
      orgCity,
      before,
      after,
      changed,
      willSkip,
      reason: willSkip ? 'verrouillé manuellement' : undefined,
    });

    if (willSkip) locked++;
    else if (changed) willChange++;
    else alreadyOk++;
  }

  // Affiche le diff
  console.log('');
  const showSample = diffs.filter((d) => d.changed && !d.willSkip).slice(0, 30);
  if (showSample.length > 0) {
    console.log(`📋 Aperçu des ${showSample.length} premier(s) changement(s) :\n`);
    for (const d of showSample) {
      console.log(`  • ${d.orgName} (${d.orgPostalCode ?? '???'} ${d.orgCity ?? '???'})`);
      console.log(`      avant : ${d.before}`);
      console.log(`      après : ${d.after}`);
    }
    if (willChange > showSample.length) {
      console.log(`\n  … et ${willChange - showSample.length} autre(s) changement(s).`);
    }
  }

  console.log(`\n📊 Bilan :`);
  console.log(`   • ${profiles.length} AgeficeProfile au total`);
  console.log(`   • ${willChange} ${APPLY ? 'à modifier' : 'qui seraient modifiés'}`);
  console.log(`   • ${alreadyOk} déjà OK (rattaché au bon PA)`);
  console.log(`   • ${locked} verrouillés manuellement (ignorés)`);
  console.log(`   • ${noMatch} sans matching possible (pas de CP / aucun PA dans le département)`);

  if (!APPLY) {
    console.log(`\n💡 Mode dry-run. Pour appliquer : pnpm --filter @qualiof/db import:agefice-pa --apply`);
    return;
  }

  // APPLY
  console.log(`\n✍️  Application des changements…`);
  let applied = 0;
  for (const profile of profiles) {
    if (profile.pointAccueilLockedManually) continue;
    const addr = (profile.organization.address ?? {}) as { postalCode?: string; city?: string };
    const matched = pickClosestPA(addr.postalCode ?? null, addr.city ?? null, allPAs);
    if (!matched) continue;
    if (profile.pointAccueilId === matched.id) continue;
    await prisma.ageficeProfile.update({
      where: { id: profile.id },
      data: { pointAccueilId: matched.id },
    });
    applied++;
  }
  console.log(`   ✅ ${applied} profile(s) mis à jour`);
}

async function main() {
  console.log(`\n🏛️  Import Référentiel AGEFICE — Points d'Accueil`);
  console.log(`    Source : ${FILE}`);
  console.log(`    Mode   : ${APPLY ? '🔥 APPLY (écrit en base)' : '👁️  DRY-RUN (lecture seule sur AgeficeProfile)'}`);

  const records = readRows();
  if (records.length === 0) {
    console.error('❌ Fichier vide ou format inattendu.');
    process.exit(1);
  }

  await phase1ImportRefentiel(records);
  await phase2RattacherProfiles();

  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Erreur :', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
