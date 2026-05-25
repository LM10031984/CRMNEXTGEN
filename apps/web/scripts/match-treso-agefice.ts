/**
 * Cross-match Tréso AGEFICE.xlsx ↔ TrainingSession QualiOF.
 *
 * L'Excel ne contient pas le code SES — on déduit la session par scoring :
 *   +50 si ≥1 stagiaire matché (Person inscrit en SessionParticipant)
 *   +30 si date début ±2 j
 *   +20 si date fin ±2 j
 *   +20 si montant total ±5 %
 *   +10 si organisme OPCO (Organization.opcoCode) cohérent
 *
 * Score ≥ 70  → match auto
 * Score 40-70 → AMBIGU (à présenter pour décision)
 * Score < 40  → SKIP (pas de match fiable)
 *
 * Output (dry-run) : tableau par ligne Excel avec son verdict.
 * `--apply` : reporte les 4 statuts OUI/NON (facture envoyée / validation /
 *             remboursement OPCO / paiement client) sur l'OpcoSubmission
 *             ou Invoice correspondante (TODO sur ok du matching).
 */

import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { prisma, Prisma } from '@qualiof/db';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const filePath = args.find((a) => !a.startsWith('--'));
if (!filePath) {
  console.error('Usage : pnpm tsx scripts/match-treso-agefice.ts <xlsx-path>');
  process.exit(1);
}

// ── Helpers parsing ─────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function excelSerialToDate(serial: number): Date {
  // Excel serial : jours depuis 1900-01-01 (avec bug Excel : 1900 traité comme bissextile)
  const epoch = Date.UTC(1899, 11, 30); // 30 dec 1899
  return new Date(epoch + serial * 86400 * 1000);
}

/**
 * Parse "30/12/2025", "30 au 31/12/2025", "22/12 au 30/12/2025", "28/11 au 02/12/2025"
 * Retourne {start, end} ou null si non parseable.
 */
function parseFrenchDateRange(raw: unknown): { start: Date; end: Date } | null {
  if (typeof raw === 'number') {
    const d = excelSerialToDate(raw);
    return { start: d, end: d };
  }
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;

  // Pattern : capter "JJ/MM/AAAA" en dernier (= fin de période)
  const lastDate = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (!lastDate) return null;
  const endD = +lastDate[1]!;
  const endM = +lastDate[2]!;
  const endY = +lastDate[3]!;
  const end = new Date(Date.UTC(endY, endM - 1, endD));

  // Cherche le début dans la partie avant "au …"
  const beforeAu = s.split(/\s*au\s*/i);
  if (beforeAu.length < 2) return { start: end, end };
  const startPart = beforeAu[0]!.trim();
  // 3 formats possibles : "30", "22/12", "30/12/2025"
  const m3 = startPart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m3) {
    return {
      start: new Date(Date.UTC(+m3[3]!, +m3[2]! - 1, +m3[1]!)),
      end,
    };
  }
  const m2 = startPart.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m2) {
    return {
      start: new Date(Date.UTC(endY, +m2[2]! - 1, +m2[1]!)),
      end,
    };
  }
  const m1 = startPart.match(/^(\d{1,2})$/);
  if (m1) {
    return {
      start: new Date(Date.UTC(endY, endM - 1, +m1[1]!)),
      end,
    };
  }
  return { start: end, end };
}

function dayDiff(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 86400000;
}

// Split "Eric PERRIEN, Florent QUILICHINI" / "Eric PERRIEN et Florent QUILICHINI" / "Groupe Bianco"
function splitStagiaires(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];
  return raw
    .split(/[,;\n]|\s+et\s+|\s*\|\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

interface TresoRow {
  yearSheet: string;
  rowNum: number;
  dateDepot: Date | null;
  dateRange: { start: Date; end: Date } | null;
  nbStagiaires: number | null;
  stagiairesRaw: string;
  opcoLabel: string | null;
  montant: number | null;
  factureEnvoyee: boolean;
  validationOrg: boolean;
  remboursementOpco: boolean;
  paiementClient: boolean;
}

function parseTresoRow(r: Record<string, unknown>, sheet: string, rowNum: number): TresoRow {
  const dateDepotRaw = r['Date de dépôt \nde la demande'] ?? r['Date de dépôt de la demande'];
  return {
    yearSheet: sheet,
    rowNum,
    dateDepot:
      typeof dateDepotRaw === 'number' ? excelSerialToDate(dateDepotRaw) : null,
    dateRange: parseFrenchDateRange(r['Date de la formation']),
    nbStagiaires:
      typeof r['Nbe de stagiaires'] === 'number' ? (r['Nbe de stagiaires'] as number) : null,
    stagiairesRaw: String(r['Nom des stagiaires'] ?? ''),
    opcoLabel: r['Organisme de prise en charge'] ? String(r['Organisme de prise en charge']) : null,
    montant:
      typeof r['Montant Total de la formation'] === 'number'
        ? (r['Montant Total de la formation'] as number)
        : null,
    factureEnvoyee: String(r['Facture envoyée'] ?? '').toUpperCase() === 'OUI',
    validationOrg: String(r['Validation Organisme'] ?? '').toUpperCase() === 'OUI',
    remboursementOpco: String(r['Remboursement OPCO'] ?? '').toUpperCase() === 'OUI',
    paiementClient: String(r['Paiement Client'] ?? '').toUpperCase() === 'OUI',
  };
}

// ── Main ────────────────────────────────────────────────────────

(async () => {
  console.log(`Fichier : ${filePath}`);
  const buf = fs.readFileSync(filePath);
  const wb = XLSX.read(buf, { type: 'buffer' });

  // 1. Parse Tréso AGEFICE (3 onglets)
  const tresoRows: TresoRow[] = [];
  for (const sheet of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheet]!, {
      defval: null,
    });
    rows.forEach((r, i) => {
      const parsed = parseTresoRow(r, sheet, i + 2); // +2 car header row + 0-indexed
      // Skip lignes vides
      if (
        !parsed.dateRange &&
        !parsed.stagiairesRaw &&
        !parsed.montant
      ) {
        return;
      }
      tresoRows.push(parsed);
    });
  }
  console.log(`${tresoRows.length} lignes Tréso non-vides`);

  // 2. Charge toutes les sessions QualiOF + leurs participants
  const tenant = await prisma.tenant.findFirst({ select: { id: true } });
  if (!tenant) throw new Error('No tenant');
  const sessions = await prisma.trainingSession.findMany({
    where: { tenantId: tenant.id },
    select: {
      id: true,
      code: true,
      startDate: true,
      endDate: true,
      participants: {
        select: {
          person: { select: { firstName: true, lastName: true } },
          priceHT: true,
          sponsorOrg: { select: { opcoCode: true, legalName: true } },
        },
      },
    },
  });
  console.log(`${sessions.length} sessions QualiOF`);

  // Précalcul : pour chaque session, ensemble de noms normalisés + signature
  const sessionSignatures = sessions.map((s) => {
    const stagNames = new Set<string>();
    let total = 0;
    const opcos = new Set<string>();
    for (const p of s.participants) {
      stagNames.add(normalize(`${p.person.firstName} ${p.person.lastName}`));
      stagNames.add(normalize(`${p.person.lastName} ${p.person.firstName}`));
      total += Number(p.priceHT);
      if (p.sponsorOrg?.opcoCode) opcos.add(p.sponsorOrg.opcoCode.toUpperCase());
      if (p.sponsorOrg?.legalName) opcos.add(normalize(p.sponsorOrg.legalName));
    }
    return { session: s, stagNames, total, opcos };
  });

  // 3. Pour chaque ligne Tréso, scorer chaque session
  interface MatchResult {
    treso: TresoRow;
    bestScore: number;
    bestSession: { code: string; id: string } | null;
    runnerUp: { code: string; score: number } | null;
  }
  const results: MatchResult[] = [];
  for (const t of tresoRows) {
    const tStags = splitStagiaires(t.stagiairesRaw).map(normalize);
    let best = { score: 0, sig: null as (typeof sessionSignatures)[number] | null };
    let runner = { score: 0, code: '' };
    for (const sig of sessionSignatures) {
      let score = 0;
      // Stagiaires : au moins 1 nom matché
      const matchedNames = tStags.filter((n) =>
        [...sig.stagNames].some((s) => s.includes(n) || n.includes(s)),
      );
      if (matchedNames.length > 0) score += 50;
      // Date début ±2j
      if (t.dateRange && dayDiff(t.dateRange.start, sig.session.startDate) <= 2) score += 30;
      // Date fin ±2j
      if (t.dateRange && dayDiff(t.dateRange.end, sig.session.endDate) <= 2) score += 20;
      // Montant ±5%
      if (t.montant && sig.total > 0) {
        const ratio = Math.abs(t.montant - sig.total) / sig.total;
        if (ratio < 0.05) score += 20;
      }
      // OPCO matché
      if (t.opcoLabel && [...sig.opcos].some((o) => normalize(t.opcoLabel!).includes(o) || o.includes(normalize(t.opcoLabel!)))) {
        score += 10;
      }
      if (score > best.score) {
        runner = { score: best.score, code: best.sig?.session.code ?? '' };
        best = { score, sig };
      } else if (score > runner.score) {
        runner = { score, code: sig.session.code };
      }
    }
    results.push({
      treso: t,
      bestScore: best.score,
      bestSession: best.sig ? { code: best.sig.session.code, id: best.sig.session.id } : null,
      runnerUp: runner.score > 0 ? { code: runner.code, score: runner.score } : null,
    });
  }

  // 4. Synthèse + boost : si stagiaire matché et 1 seule session candidate ≥ 50,
  //    on monte à 70 (auto-match implicite par exclusion).
  for (const r of results) {
    if (r.bestScore === 50 && r.runnerUp && r.runnerUp.score < 50 && r.bestSession) {
      r.bestScore = 70;
    }
  }
  const auto = results.filter((r) => r.bestScore >= 70 && r.bestSession);
  const ambig = results.filter((r) => r.bestScore >= 40 && r.bestScore < 70);
  const noMatch = results.filter((r) => r.bestScore < 40);

  // 5. Écrit un CSV récap dans /tmp pour review humaine
  const csv = [
    [
      'verdict',
      'score',
      'sheet',
      'session_code',
      'runner_up',
      'date_start',
      'date_end',
      'stagiaires',
      'opco',
      'montant',
      'facture_envoyee',
      'validation_org',
      'remboursement_opco',
      'paiement_client',
    ].join(','),
  ];
  for (const r of results) {
    const verdict =
      r.bestScore >= 70 ? 'AUTO' : r.bestScore >= 40 ? 'AMBIGU' : 'NO_MATCH';
    const t = r.treso;
    csv.push(
      [
        verdict,
        r.bestScore,
        t.yearSheet,
        r.bestSession?.code ?? '',
        r.runnerUp ? `${r.runnerUp.code}(${r.runnerUp.score})` : '',
        t.dateRange?.start.toISOString().slice(0, 10) ?? '',
        t.dateRange?.end.toISOString().slice(0, 10) ?? '',
        `"${t.stagiairesRaw.replace(/"/g, '""')}"`,
        t.opcoLabel ?? '',
        t.montant ?? '',
        t.factureEnvoyee ? 'OUI' : 'NON',
        t.validationOrg ? 'OUI' : 'NON',
        t.remboursementOpco ? 'OUI' : 'NON',
        t.paiementClient ? 'OUI' : 'NON',
      ].join(','),
    );
  }
  const csvPath = '/tmp/treso-matching.csv';
  fs.writeFileSync(csvPath, csv.join('\n'));
  console.log(`\n📄 CSV récap écrit : ${csvPath}`);

  // 6. APPLY : pour chaque auto-match, on update les SessionParticipant
  // correspondants (1 ligne Tréso peut concerner N stagiaires d'une session).
  if (APPLY) {
    let updatedSps = 0;
    let skippedNoPerson = 0;
    for (const r of auto) {
      if (!r.bestSession) continue;
      const stagNames = splitStagiaires(r.treso.stagiairesRaw);
      const session = sessions.find((s) => s.id === r.bestSession!.id);
      if (!session) continue;
      // Build map nom normalisé → personId via les participants de la session
      const spByName = new Map<string, { personId: string; spId: string }>();
      const sps = await prisma.sessionParticipant.findMany({
        where: { sessionId: session.id },
        select: {
          id: true,
          personId: true,
          person: { select: { firstName: true, lastName: true } },
        },
      });
      for (const sp of sps) {
        const a = normalize(`${sp.person.firstName} ${sp.person.lastName}`);
        const b = normalize(`${sp.person.lastName} ${sp.person.firstName}`);
        spByName.set(a, { personId: sp.personId, spId: sp.id });
        spByName.set(b, { personId: sp.personId, spId: sp.id });
      }
      // Si la ligne Tréso n'a aucun stagiaire identifié mais la session a 1 seul
      // SP, on l'applique dessus (cas "Groupe XYZ" ou stagiaire vide).
      const matchedSpIds = new Set<string>();
      if (stagNames.length === 0 && sps.length === 1) {
        matchedSpIds.add(sps[0]!.id);
      } else {
        for (const name of stagNames) {
          const n = normalize(name);
          let hit = spByName.get(n);
          if (!hit) {
            // fallback fuzzy : un des tokens du nom est dans le SP
            for (const [k, v] of spByName) {
              if (k.includes(n) || n.includes(k)) {
                hit = v;
                break;
              }
            }
          }
          if (hit) matchedSpIds.add(hit.spId);
        }
      }
      if (matchedSpIds.size === 0) {
        skippedNoPerson++;
        continue;
      }
      // OR-merge : si la ligne dit OUI, on set true; on ne remet PAS à false un
      // statut déjà true (au cas où une autre source l'aurait validé)
      const data: Record<string, boolean | number> = {};
      if (r.treso.factureEnvoyee) data.factureEnvoyee = true;
      if (r.treso.validationOrg) data.validationOpco = true;
      if (r.treso.remboursementOpco) data.remboursementOpco = true;
      if (r.treso.paiementClient) data.paiementClient = true;

      // Push priceHT depuis Tréso : montant / nb stagiaires matchés (Tréso =
      // source de vérité encaissement Laurent — écrase l'ancien priceHT
      // potentiellement faux issu d'import historique).
      const priceHTPerStagiaire =
        r.treso.montant && matchedSpIds.size > 0
          ? Math.round((r.treso.montant / matchedSpIds.size) * 100) / 100
          : null;
      if (priceHTPerStagiaire && priceHTPerStagiaire > 0) {
        await prisma.sessionParticipant.updateMany({
          where: { id: { in: [...matchedSpIds] } },
          data: { priceHT: priceHTPerStagiaire },
        });
      }

      if (Object.keys(data).length > 0) {
        await prisma.sessionParticipant.updateMany({
          where: { id: { in: [...matchedSpIds] } },
          data: data as Prisma.SessionParticipantUpdateManyMutationInput,
        });
      }
      updatedSps += matchedSpIds.size;
    }
    console.log(`\n🟢 APPLY : ${updatedSps} SessionParticipant mis à jour. Skipped (no person) : ${skippedNoPerson}`);
  }

  console.log(`\n──── Résultat matching ────`);
  console.log(`✅ Auto-match (score ≥ 70)  : ${auto.length}`);
  console.log(`⚠️  Ambigu (score 40-70)    : ${ambig.length}`);
  console.log(`❌ Non matché (score < 40) : ${noMatch.length}`);

  console.log(`\n──── 10 premiers auto-matches ────`);
  for (const r of auto.slice(0, 10)) {
    const t = r.treso;
    const range = t.dateRange
      ? `${t.dateRange.start.toISOString().slice(0, 10)} → ${t.dateRange.end.toISOString().slice(0, 10)}`
      : '—';
    console.log(
      `  [${r.bestScore}] ${r.bestSession!.code.padEnd(10)} | ${t.yearSheet} ${range} | ${t.stagiairesRaw.slice(0, 40).padEnd(40)} | ${t.montant ?? '—'}€`,
    );
  }
  if (ambig.length > 0) {
    console.log(`\n──── 10 premiers ambigus (à valider main) ────`);
    for (const r of ambig.slice(0, 10)) {
      const t = r.treso;
      const range = t.dateRange
        ? `${t.dateRange.start.toISOString().slice(0, 10)} → ${t.dateRange.end.toISOString().slice(0, 10)}`
        : '—';
      console.log(
        `  [${r.bestScore}] ?→ ${r.bestSession?.code ?? '—'} (runner-up ${r.runnerUp?.code ?? '—'} ${r.runnerUp?.score ?? '—'}) | ${range} | ${t.stagiairesRaw.slice(0, 40)} | ${t.montant ?? '—'}€`,
      );
    }
  }
  if (noMatch.length > 0) {
    console.log(`\n──── 10 premiers non matchés ────`);
    for (const r of noMatch.slice(0, 10)) {
      const t = r.treso;
      const range = t.dateRange
        ? `${t.dateRange.start.toISOString().slice(0, 10)} → ${t.dateRange.end.toISOString().slice(0, 10)}`
        : '—';
      console.log(
        `  [${r.bestScore}] | ${t.yearSheet} ${range} | ${t.stagiairesRaw.slice(0, 50)} | ${t.montant ?? '—'}€`,
      );
    }
  }
  process.exit(0);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
