/**
 * Importeur Tréso AGEFICE → QualiOF (suivi facturation/encaissement).
 *
 * Source : Tréso Agefice (2).xlsx (3 onglets AGEFICE 2024, 2025, 2026 — 358 lignes au total).
 *
 * Chaque ligne = 1 dossier OPCO pour un groupe d'apprenants sur une session de formation.
 * Met à jour les 4 booléens d'encaissement sur SessionParticipant déjà en base :
 *   - Facture envoyée → invoiceSent
 *   - Validation Organisme → opcoApproved
 *   - Remboursement OPCO → opcoReimbursed
 *   - Paiement Client → paymentReceived
 *
 * Stratégie de matching :
 *   1. Trouve la session via date + nom formation (matching flou ±10j)
 *   2. Trouve les SessionParticipants concernés via "Nom des stagiaires" (texte libre)
 *      - "Mathieu AMRAM" → 1 participant
 *      - "Groupe Bianco" → tous les participants dont sponsorOrg.legalName contient "Bianco"
 *   3. Met à jour les 4 booleans (--apply uniquement)
 *   4. Log les lignes non matchées pour rapprochement manuel ultérieur
 *
 * Lancement :
 *   pnpm --filter @qualiof/db import:treso             # dry-run
 *   pnpm --filter @qualiof/db import:treso -- --apply  # applique
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
const FILE = path.join(ROOT, 'Tréso Agefice (2).xlsx');
const APPLY = process.argv.includes('--apply');

const prisma = new PrismaClient();

interface TresoRow {
  year: 2024 | 2025 | 2026;
  rowNum: number;
  dateDepot: Date | null;
  dateFormation: string | null;
  rawDateFormation: unknown;
  startDate: Date | null;
  endDate: Date | null;
  nbStagiaires: number | null;
  stagiaires: string;
  groupe: string | null;
  commercial: string | null;
  formation: string | null;
  formateur: string | null;
  lieu: string | null;
  opco: string | null;
  montant: number | null;
  factureEnvoyee: boolean;
  validationOrganisme: boolean;
  remboursementOpco: boolean;
  paiementClient: boolean;
}

function isOui(v: unknown): boolean {
  return typeof v === 'string' && v.trim().toUpperCase() === 'OUI';
}

// Excel serial → JS Date (le 1900-01-01 = serial 1, avec bug du 29/02/1900 fictif)
function excelSerialToDate(n: number): Date | null {
  if (!Number.isFinite(n)) return null;
  const ms = (n - 25569) * 86400 * 1000;
  const d = new Date(ms);
  return isNaN(d.getTime()) ? null : d;
}

function parseFRDate(s: string): Date | null {
  // "DD/MM/YYYY" ou "D/M/YYYY"
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  let year = parseInt(m[3], 10);
  if (year < 100) year += 2000;
  const d = new Date(Date.UTC(year, month - 1, day));
  return isNaN(d.getTime()) ? null : d;
}

function parseFormationRange(
  rawValue: unknown,
  fallbackYear?: number,
): { start: Date | null; end: Date | null; raw: string | null } {
  if (rawValue == null || rawValue === '') return { start: null, end: null, raw: null };
  if (typeof rawValue === 'number') {
    const d = excelSerialToDate(rawValue);
    return { start: d, end: d, raw: rawValue.toString() };
  }
  const str = String(rawValue).trim();
  // Cas "13 au 23/10/2025" / "10/12 au 12/12/2025" / "30 au 31/12/2025"
  const rangeFull = str.match(/(\d{1,2})(?:\/(\d{1,2}))?\s*au\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i);
  if (rangeFull) {
    const dStart = parseInt(rangeFull[1], 10);
    const mStart = parseInt(rangeFull[2] ?? rangeFull[4], 10);
    const dEnd = parseInt(rangeFull[3], 10);
    const mEnd = parseInt(rangeFull[4], 10);
    let year = parseInt(rangeFull[5], 10);
    if (year < 100) year += 2000;
    const start = new Date(Date.UTC(year, mStart - 1, dStart));
    const end = new Date(Date.UTC(year, mEnd - 1, dEnd));
    return { start, end, raw: str };
  }
  // Cas "1/09 au 5/09" (sans année) → utilise l'année de l'onglet
  if (fallbackYear) {
    const rangeNoYear = str.match(/(\d{1,2})(?:\/(\d{1,2}))?\s*au\s*(\d{1,2})\/(\d{1,2})\b/i);
    if (rangeNoYear) {
      const dStart = parseInt(rangeNoYear[1], 10);
      const mStart = parseInt(rangeNoYear[2] ?? rangeNoYear[4], 10);
      const dEnd = parseInt(rangeNoYear[3], 10);
      const mEnd = parseInt(rangeNoYear[4], 10);
      const start = new Date(Date.UTC(fallbackYear, mStart - 1, dStart));
      const end = new Date(Date.UTC(fallbackYear, mEnd - 1, dEnd));
      return { start, end, raw: str };
    }
    // Cas "17 et 18/03" → 2 dates rapprochées
    const conjMatch = str.match(/(\d{1,2})\s*(?:et|,)\s*(\d{1,2})\/(\d{1,2})\b/i);
    if (conjMatch) {
      const dStart = parseInt(conjMatch[1], 10);
      const dEnd = parseInt(conjMatch[2], 10);
      const month = parseInt(conjMatch[3], 10);
      const start = new Date(Date.UTC(fallbackYear, month - 1, dStart));
      const end = new Date(Date.UTC(fallbackYear, month - 1, dEnd));
      return { start, end, raw: str };
    }
    // Cas "03 au 14/03" déjà géré par rangeNoYear ci-dessus
  }
  // Cas "DD/MM/YYYY"
  const single = parseFRDate(str);
  if (single) return { start: single, end: single, raw: str };
  return { start: null, end: null, raw: str };
}

function readSheet(wb: XLSX.WorkBook, sheetName: string, year: 2024 | 2025 | 2026): TresoRow[] {
  const sh = wb.Sheets[sheetName];
  if (!sh) return [];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sh, { header: 1, defval: null });
  // Détection en-tête : ligne 0
  const headers = (aoa[0] ?? []).map((h) => (typeof h === 'string' ? h.replace(/\n+/g, ' ').trim() : h));
  const idx = (label: string) => headers.findIndex((h) => h === label);

  const cDateDepot = idx('Date de dépôt  de la demande') !== -1 ? idx('Date de dépôt  de la demande') : idx('Date de dépot');
  const cDateFormation = idx('Date de la formation');
  const cNbStag = idx('Nbe de stagiaires');
  const cStagiaires = idx('Nom des stagiaires');
  const cGroupe = idx('Groupe');
  const cCommercial = idx('Commercial');
  const cFormation = idx('Nom de la formation');
  const cFormateur = idx('Nom du formateur');
  const cLieu = idx('Lieu de la formation');
  const cOpco = idx('Organisme de prise en charge');
  // Le tableau a 2 colonnes "Montant Total de la formation" : la 1ère contient le montant
  const cMontant = headers.findIndex((h) => h === 'Montant Total de la formation');
  // 4 statuts : trouvés depuis l'en-tête
  const cFactureEnvoyee = idx('Facture envoyée');
  const cValidationOrg = idx('Validation Organisme');
  const cRemboursement = idx('Remboursement OPCO');
  const cPaiementClient = idx('Paiement Client');

  const rows: TresoRow[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const r = aoa[i] ?? [];
    if (r.every((v) => v == null || v === '')) continue;
    const stagiaires = String(r[cStagiaires] ?? '').trim();
    if (!stagiaires) continue; // ligne vide réelle
    const rawDateFormation = r[cDateFormation];
    const { start, end, raw } = parseFormationRange(rawDateFormation, year);
    rows.push({
      year,
      rowNum: i + 1,
      dateDepot: typeof r[cDateDepot] === 'number' ? excelSerialToDate(r[cDateDepot] as number) : null,
      dateFormation: raw,
      rawDateFormation,
      startDate: start,
      endDate: end,
      nbStagiaires: typeof r[cNbStag] === 'number' ? (r[cNbStag] as number) : null,
      stagiaires,
      groupe: cGroupe !== -1 ? (r[cGroupe] as string | null)?.toString().trim() ?? null : null,
      commercial: cCommercial !== -1 ? (r[cCommercial] as string | null)?.toString().trim() ?? null : null,
      formation: cFormation !== -1 ? (r[cFormation] as string | null)?.toString().trim() ?? null : null,
      formateur: cFormateur !== -1 ? (r[cFormateur] as string | null)?.toString().trim() ?? null : null,
      lieu: cLieu !== -1 ? (r[cLieu] as string | null)?.toString().trim() ?? null : null,
      opco: (r[cOpco] as string | null)?.toString().trim() ?? null,
      montant: typeof r[cMontant] === 'number' ? (r[cMontant] as number) : null,
      factureEnvoyee: isOui(r[cFactureEnvoyee]),
      validationOrganisme: isOui(r[cValidationOrg]),
      remboursementOpco: isOui(r[cRemboursement]),
      paiementClient: isOui(r[cPaiementClient]),
    });
  }
  return rows;
}

interface MatchResult {
  treso: TresoRow;
  participantIds: string[];
  reason: 'matched' | 'no-session' | 'no-participant';
}

function normalizeName(s: string): string {
  return s
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function findParticipantsForRow(row: TresoRow, tenantId: string): Promise<string[]> {
  if (!row.startDate) return [];

  // 1) Match Sessions par date (±10 jours autour de startDate)
  const minStart = new Date(row.startDate);
  minStart.setUTCDate(minStart.getUTCDate() - 5);
  const maxStart = new Date(row.startDate);
  maxStart.setUTCDate(maxStart.getUTCDate() + 5);
  const sessions = await prisma.trainingSession.findMany({
    where: {
      tenantId,
      startDate: { gte: minStart, lte: maxStart },
    },
    select: {
      id: true,
      name: true,
      participants: {
        select: {
          id: true,
          person: { select: { firstName: true, lastName: true } },
          sponsorOrg: { select: { legalName: true } },
        },
      },
    },
  });
  if (sessions.length === 0) return [];

  // 2) Match participants par nom (le "Nom des stagiaires" peut être singulier ou "Groupe X")
  const stagiairesNorm = normalizeName(row.stagiaires);
  const matchedIds: string[] = [];
  for (const s of sessions) {
    for (const p of s.participants) {
      const fullName = normalizeName(p.person.firstName + ' ' + p.person.lastName);
      const lastName = normalizeName(p.person.lastName);
      const sponsorNorm = p.sponsorOrg ? normalizeName(p.sponsorOrg.legalName) : '';

      if (
        stagiairesNorm.includes(lastName) ||
        stagiairesNorm.includes(fullName) ||
        // "Groupe X" : on prend tous les participants dont sponsorOrg contient X
        (stagiairesNorm.startsWith('GROUPE ') && sponsorNorm.includes(stagiairesNorm.replace('GROUPE ', ''))) ||
        // "Bianco (salarié)" → match sponsor
        (sponsorNorm && stagiairesNorm.includes(sponsorNorm))
      ) {
        matchedIds.push(p.id);
      }
    }
  }
  return Array.from(new Set(matchedIds));
}

async function applyUpdates(participantIds: string[], row: TresoRow): Promise<void> {
  const data = {
    invoiceSent: row.factureEnvoyee,
    opcoApproved: row.validationOrganisme,
    opcoReimbursed: row.remboursementOpco,
    paymentReceived: row.paiementClient,
  };
  await prisma.sessionParticipant.updateMany({
    where: { id: { in: participantIds } },
    data,
  });
}

async function main() {
  console.log(`\n💰 Import Tréso AGEFICE — suivi facturation/encaissement`);
  console.log(`    Source : ${FILE}`);
  console.log(`    Mode   : ${APPLY ? '🔥 APPLY (écrit en base)' : '👁️  DRY-RUN (lecture seule)'}`);

  const tenant = await prisma.tenant.findFirst({ where: { name: 'Start Academy' } });
  if (!tenant) {
    console.error('❌ Tenant introuvable');
    process.exit(1);
  }

  const wb = XLSX.read(fs.readFileSync(FILE), { type: 'buffer', cellDates: false });
  const rows2024 = readSheet(wb, 'AGEFICE 2024', 2024);
  const rows2025 = readSheet(wb, 'AGEFICE 2025', 2025);
  const rows2026 = readSheet(wb, 'AGEFICE 2026', 2026);
  const allRows = [...rows2024, ...rows2025, ...rows2026];

  console.log(`\n📊 Lignes parsées : 2024=${rows2024.length} · 2025=${rows2025.length} · 2026=${rows2026.length} · total=${allRows.length}`);

  const results: MatchResult[] = [];
  let participantsTouched = 0;
  for (const row of allRows) {
    const participantIds = await findParticipantsForRow(row, tenant.id);
    const reason: MatchResult['reason'] =
      !row.startDate ? 'no-session' : participantIds.length === 0 ? 'no-participant' : 'matched';
    results.push({ treso: row, participantIds, reason });
    if (reason === 'matched') {
      participantsTouched += participantIds.length;
      if (APPLY) await applyUpdates(participantIds, row);
    }
  }

  const matched = results.filter((r) => r.reason === 'matched');
  const noSession = results.filter((r) => r.reason === 'no-session');
  const noParticipant = results.filter((r) => r.reason === 'no-participant');

  console.log(`\n📊 Résultat du matching :`);
  console.log(`   ✅ ${matched.length} lignes Tréso matchées avec ${participantsTouched} SessionParticipant(s) en base`);
  console.log(`   ⚠️  ${noSession.length} lignes sans session correspondante (date introuvable ±5j)`);
  console.log(`   ⚠️  ${noParticipant.length} lignes session OK mais aucun participant matché par nom`);

  // Aperçu des lignes non matchées (max 15)
  const unmatched = [...noSession, ...noParticipant].slice(0, 15);
  if (unmatched.length > 0) {
    console.log(`\n📋 Aperçu non matché (${unmatched.length} premier(s)) :`);
    for (const r of unmatched) {
      console.log(`   • ${r.treso.year} L${r.treso.rowNum} | ${r.treso.stagiaires} | ${r.treso.dateFormation ?? '?'} | OPCO ${r.treso.opco ?? '?'} | ${r.reason}`);
    }
  }

  // Statuts agrégés
  const ouiCount = (k: keyof TresoRow) => allRows.filter((r) => r[k] === true).length;
  console.log(`\n📊 Statuts agrégés sur les ${allRows.length} dossiers Tréso :`);
  console.log(`   Facture envoyée  : ${ouiCount('factureEnvoyee')}`);
  console.log(`   Validation OPCO  : ${ouiCount('validationOrganisme')}`);
  console.log(`   Remboursé OPCO   : ${ouiCount('remboursementOpco')}`);
  console.log(`   Payé client      : ${ouiCount('paiementClient')}`);

  if (!APPLY) {
    console.log(`\n💡 Mode dry-run. Pour appliquer : pnpm --filter @qualiof/db import:treso -- --apply`);
  }

  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Erreur :', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
