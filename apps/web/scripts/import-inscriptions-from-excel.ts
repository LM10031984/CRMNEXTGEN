/**
 * Import des inscriptions session × apprenant depuis l'export Excel SmartOF
 * (l'API /api/session/list n'expose pas la liste des inscrits).
 *
 * Fichier d'entrée : "Export Toutes les sessions de formation - JJ_MM_AAAA.xlsx"
 * Colonnes utilisées : ID (SES-XXXX), Apprenants (liste séparée par |),
 *                       Commanditaires (idem, optionnel)
 *
 * Usage :
 *   pnpm tsx scripts/import-inscriptions-from-excel.ts "<path xlsx>"
 *   pnpm tsx scripts/import-inscriptions-from-excel.ts "<path xlsx>" --apply
 */

import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { prisma } from '@qualiof/db';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const filePath = args.find((a) => !a.startsWith('--'));
if (!filePath) {
  console.error('Usage : pnpm tsx scripts/import-inscriptions-from-excel.ts <xlsx-path> [--apply]');
  process.exit(1);
}

interface Row {
  ID?: string;
  Statut?: string;
  Apprenants?: string | null;
  Commanditaires?: string | null;
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Décompose "Prénom NOM" ou "NOM Prénom" en {firstName, lastName} candidats.
// On retourne les 2 inversions pour matcher en BDD.
function tokenizeName(raw: string): { a: string; b: string; tokens: string[] } | null {
  const s = raw.trim();
  if (!s) return null;
  const tokens = s.split(/\s+/);
  if (tokens.length < 2) return { a: s, b: s, tokens };
  const first = tokens[0]!;
  const rest = tokens.slice(1).join(' ');
  // "Prénom NOM" et inverse "NOM Prénom"
  return { a: `${first} ${rest}`, b: `${rest} ${first}`, tokens };
}

async function buildPersonIndex(tenantId: string): Promise<{
  byFullName: Map<string, string>; // normalize("first last") → personId
  all: Array<{ id: string; first: string; last: string }>;
}> {
  const persons = await prisma.person.findMany({
    where: { tenantId },
    select: { id: true, firstName: true, lastName: true },
  });
  const byFullName = new Map<string, string>();
  for (const p of persons) {
    const k1 = normalize(`${p.firstName} ${p.lastName}`);
    const k2 = normalize(`${p.lastName} ${p.firstName}`);
    if (k1) byFullName.set(k1, p.id);
    if (k2 && !byFullName.has(k2)) byFullName.set(k2, p.id);
  }
  return {
    byFullName,
    all: persons.map((p) => ({ id: p.id, first: p.firstName, last: p.lastName })),
  };
}

function findPersonId(
  raw: string,
  idx: Awaited<ReturnType<typeof buildPersonIndex>>,
): string | null {
  const t = tokenizeName(raw);
  if (!t) return null;
  const candidates = [normalize(t.a), normalize(t.b)];
  for (const k of candidates) {
    const hit = idx.byFullName.get(k);
    if (hit) return hit;
  }
  // Fallback fuzzy : tous les tokens présents ?
  const toks = new Set(t.tokens.map(normalize));
  for (const p of idx.all) {
    const set = new Set([
      ...normalize(p.first).split(' '),
      ...normalize(p.last).split(' '),
    ]);
    let allMatch = true;
    for (const tok of toks) {
      if (!set.has(tok)) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) return p.id;
  }
  return null;
}

async function findSponsorOrgIdForPerson(personId: string): Promise<string | null> {
  for (const role of ['EI_SELF', 'AGENT_COMMERCIAL', 'SALARIE'] as const) {
    const ll = await prisma.legalLink.findFirst({
      where: { personId, role },
      select: { organizationId: true },
    });
    if (ll) return ll.organizationId;
  }
  return null;
}

(async () => {
  console.log(`Mode : ${APPLY ? '🟢 APPLY' : '🟡 DRY-RUN'}`);
  console.log(`Fichier : ${filePath}`);

  const tenant = await prisma.tenant.findFirst({ select: { id: true, name: true } });
  if (!tenant) throw new Error('Aucun Tenant');
  console.log(`Tenant cible : ${tenant.name}`);

  // La build xlsx CDN-tarball ne fait pas le fs read en interne — on lui passe le buffer
  const buf = fs.readFileSync(filePath);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]!]!;
  const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: null });
  console.log(`${rows.length} sessions dans le fichier`);

  const idx = await buildPersonIndex(tenant.id);
  console.log(`${idx.all.length} Person en BDD indexées`);

  let totalApprenants = 0;
  let created = 0;
  let updated = 0;
  let skipNoSession = 0;
  let skipNoPerson = 0;
  let skipNoSponsor = 0;
  const unmatched: string[] = [];

  for (const r of rows) {
    const code = r.ID?.trim();
    if (!code) continue;
    const session = await prisma.trainingSession.findUnique({
      where: { code },
      select: { id: true },
    });
    if (!session) {
      skipNoSession++;
      continue;
    }
    const apprenantsStr = r.Apprenants ?? '';
    const names = apprenantsStr
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.length === 0) continue;

    for (const name of names) {
      totalApprenants++;
      const personId = findPersonId(name, idx);
      if (!personId) {
        skipNoPerson++;
        unmatched.push(`${code}: ${name}`);
        continue;
      }
      const sponsorOrgId = await findSponsorOrgIdForPerson(personId);
      if (!sponsorOrgId) {
        skipNoSponsor++;
        continue;
      }
      const existing = await prisma.sessionParticipant.findFirst({
        where: { sessionId: session.id, personId },
        select: { id: true },
      });
      if (existing) {
        if (APPLY) {
          await prisma.sessionParticipant.update({
            where: { id: existing.id },
            data: { sponsorOrgId },
          });
        }
        updated++;
      } else {
        if (APPLY) {
          await prisma.sessionParticipant.create({
            data: {
              sessionId: session.id,
              personId,
              sponsorOrgId,
              enrollmentStatus: 'ATTENDED', // sessions passées (export = données validées)
            },
          });
        }
        created++;
      }
    }
  }

  console.log(`\n──── Résultat ────`);
  console.log(`Total inscriptions trouvées dans Excel : ${totalApprenants}`);
  console.log(`  ✓ Create : ${created}`);
  console.log(`  ✓ Update : ${updated}`);
  console.log(`  ⨯ Skip — session non en BDD : ${skipNoSession}`);
  console.log(`  ⨯ Skip — apprenant introuvable : ${skipNoPerson}`);
  console.log(`  ⨯ Skip — pas de sponsor org : ${skipNoSponsor}`);
  if (unmatched.length > 0) {
    console.log(`\n──── Échantillon apprenants non trouvés (max 15) ────`);
    for (const u of unmatched.slice(0, 15)) console.log(`  • ${u}`);
    if (unmatched.length > 15) console.log(`  … +${unmatched.length - 15} autres`);
  }
  process.exit(0);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
