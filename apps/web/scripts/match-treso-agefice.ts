/**
 * Cross-match Tréso AGEFICE.xlsx ↔ TrainingSession QualiOF.
 *
 * L'Excel ne contient pas le code SES — on déduit la session par scoring :
 *   +50 si ≥1 stagiaire matché (Person inscrit en SessionParticipant)
 *   +30 si date début ±2 j
 *   +20 si date fin ±2 j
 *   +15 si nb stagiaires Tréso == nb participants session (section 4 — remplace le montant)
 *   +10 si organisme OPCO (Organization.opcoCode) cohérent
 *
 * Le MONTANT n'est PLUS un critère d'ENTRÉE (correctif 09.2 section 4 : le montant
 * base est potentiellement faux — 336€×52 — donc un match "réussi" sur le montant
 * confortait le bug). Il ne sert qu'au DÉPARTAGE entre candidats à score d'entrée
 * ÉGAL (section 4 étape 3 ; justifié RECONCILE-RULES « Modification de script autorisée »).
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
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { prisma, Prisma } from '@qualiof/db';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const filePath = args.find((a) => !a.startsWith('--'));

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

// ── Scoring (section 4 — exporté pour testabilité) ──────────────

/** Signature minimale d'une session candidate (objet réel ou mock de test). */
export interface SigLike {
  session: {
    code?: string;
    id?: string;
    startDate: Date;
    endDate: Date;
    participants: unknown[];
  };
  stagNames: Set<string>;
  total: number;
  opcos: Set<string>;
}

/** Champs Tréso lus par le scoring (objet réel ou mock de test). */
export interface TresoLike {
  dateRange: { start: Date; end: Date } | null;
  montant: number | null;
  nbStagiaires: number | null;
  stagiairesRaw: string;
  opcoLabel: string | null;
}

/**
 * Niveau de clé utilisé pour le rapprochement (REPORTING SEUL — n'influe PAS sur
 * le matching, Plan 06 Task 1 step 3bis). Permet une revue ligne à ligne
 * PROPORTIONNÉE au checkpoint humain :
 *  - CLE_PLEINE        : noms + dates + nb stagiaires tous concordants (survol).
 *  - DEGRADE_DATES_ORG : dates+org seuls, nb stagiaires vide/divergent (à vérifier).
 *  - DEPARTAGE_MONTANT : plusieurs candidats ex æquo départagés par le montant (à vérifier 1 à 1).
 */
export type KeyLevel = 'CLE_PLEINE' | 'DEGRADE_DATES_ORG' | 'DEPARTAGE_MONTANT';

export interface MatchResult<T extends TresoLike = TresoLike> {
  treso: T;
  bestScore: number;
  bestSession: { code: string; id: string } | null;
  runnerUp: { code: string; score: number } | null;
  keyLevel: KeyLevel;
}

/**
 * Score d'ENTRÉE d'une ligne Tréso contre une session. SANS montant (section 4) :
 * noms (+50) + dates ±2j (+30/+20) + nb stagiaires égal (+15) + OPCO (+10).
 * Le montant n'entre JAMAIS ici — il ne sert qu'au départage (cf. matchTresoRows).
 * AUTO ≥ 70 reste atteignable par noms+date début (+ une autre composante).
 */
export function scoreTresoRow(t: TresoLike, sig: SigLike): number {
  let score = 0;
  const tStags = splitStagiaires(t.stagiairesRaw).map(normalize);
  const matchedNames = tStags.filter((n) =>
    [...sig.stagNames].some((s) => s.includes(n) || n.includes(s)),
  );
  if (matchedNames.length > 0) score += 50;
  if (t.dateRange && dayDiff(t.dateRange.start, sig.session.startDate) <= 2) score += 30;
  if (t.dateRange && dayDiff(t.dateRange.end, sig.session.endDate) <= 2) score += 20;
  // Nb stagiaires en ENTRÉE (remplace le montant — section 4 étape 2). Dégradation
  // explicite : pas de bonus si vide/divergent (jamais de pénalité).
  if (t.nbStagiaires != null && t.nbStagiaires === sig.session.participants.length) {
    score += 15;
  }
  if (
    t.opcoLabel &&
    [...sig.opcos].some(
      (o) => normalize(t.opcoLabel!).includes(o) || o.includes(normalize(t.opcoLabel!)),
    )
  ) {
    score += 10;
  }
  return score;
}

/**
 * Classe le niveau de clé d'un rapprochement (REPORTING SEUL — ne touche pas au
 * matching). `departageByMontant` = vrai si le bestSig a été choisi parmi des ex
 * æquo via le montant (cf. matchTresoRows). Réutilise les mêmes composantes que
 * scoreTresoRow (noms, date début ±2j, nb stagiaires égal) sans altérer le score.
 */
export function classifyKeyLevel(
  t: TresoLike,
  sig: SigLike | null,
  departageByMontant: boolean,
): KeyLevel {
  if (departageByMontant) return 'DEPARTAGE_MONTANT';
  if (!sig) return 'DEGRADE_DATES_ORG';
  const tStags = splitStagiaires(t.stagiairesRaw).map(normalize);
  const namesMatched = tStags.some((n) =>
    [...sig.stagNames].some((s) => s.includes(n) || n.includes(s)),
  );
  const dateStartMatched =
    !!t.dateRange && dayDiff(t.dateRange.start, sig.session.startDate) <= 2;
  const nbStagMatched =
    t.nbStagiaires != null && t.nbStagiaires === sig.session.participants.length;
  // Clé pleine = noms + dates + nb stagiaires tous concordants (haute confiance).
  if (namesMatched && dateStartMatched && nbStagMatched) return 'CLE_PLEINE';
  // Sinon on s'est appuyé sur dates/org sans le verrou nb stagiaires → dégradé.
  return 'DEGRADE_DATES_ORG';
}

/**
 * Pour chaque ligne Tréso : meilleur score d'ENTRÉE, puis DÉPARTAGE par montant
 * (section 4 étape 3) — entre candidats à score d'entrée ÉGAL, la session dont
 * |total - montant| est minimal gagne. Le montant ne départage QUE des candidats
 * déjà qualifiés par noms/dates ; sig.total peut être faux (336) sans fausser le
 * score d'entrée. Boost d'exclusion : un seul candidat ≥50 → monté à 70.
 */
export function matchTresoRows<T extends TresoLike>(
  tresoRows: T[],
  sigs: SigLike[],
): MatchResult<T>[] {
  const results: MatchResult<T>[] = [];
  for (const t of tresoRows) {
    const scored = sigs.map((sig) => ({ sig, score: scoreTresoRow(t, sig) }));
    let maxScore = 0;
    for (const x of scored) if (x.score > maxScore) maxScore = x.score;
    const top = scored.filter((x) => x.score === maxScore && maxScore > 0);
    // Départage par montant (le plus proche de t.montant) parmi les ex æquo.
    let bestSig: SigLike | null = top[0]?.sig ?? null;
    const departageByMontant = top.length > 1 && t.montant != null;
    if (departageByMontant) {
      bestSig = top.reduce((a, b) =>
        Math.abs(b.sig.total - t.montant!) < Math.abs(a.sig.total - t.montant!) ? b : a,
      ).sig;
    }
    // Runner-up : meilleur score parmi les sessions ≠ bestSig (boost + affichage).
    let runnerScore = 0;
    let runnerCode = '';
    for (const x of scored) {
      if (x.sig === bestSig) continue;
      if (x.score > runnerScore) {
        runnerScore = x.score;
        runnerCode = x.sig.session.code ?? '';
      }
    }
    let bestScore = maxScore;
    const bestSession = bestSig
      ? { code: bestSig.session.code ?? '', id: bestSig.session.id ?? '' }
      : null;
    // Boost exclusion : 1 seule session candidate ≥ 50 → auto-match implicite (70).
    if (bestScore === 50 && runnerScore < 50 && bestSession) {
      bestScore = 70;
    }
    results.push({
      treso: t,
      bestScore,
      bestSession,
      runnerUp: runnerScore > 0 ? { code: runnerCode, score: runnerScore } : null,
      keyLevel: classifyKeyLevel(t, bestSig, departageByMontant),
    });
  }
  return results;
}

// ── Main ────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!filePath) {
    console.error('Usage : pnpm tsx scripts/match-treso-agefice.ts <xlsx-path>');
    process.exit(1);
  }
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

  // 3. Scoring section 4 (montant en départage, nb stagiaires en entrée) — fn exportée testée.
  const results = matchTresoRows(tresoRows, sessionSignatures);

  // 4. Synthèse (le boost d'exclusion ≥50→70 est intégré à matchTresoRows).
  const auto = results.filter((r) => r.bestScore >= 70 && r.bestSession);
  const ambig = results.filter((r) => r.bestScore >= 40 && r.bestScore < 70);
  const noMatch = results.filter((r) => r.bestScore < 40);

  // 5. Écrit un CSV récap dans /tmp pour review humaine
  const csv = [
    [
      'verdict',
      'score',
      'niveau_cle',
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
        r.keyLevel,
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
}

// Garde : main() (lecture xlsx + accès BDD + APPLY) ne s'exécute que lancé
// directement, jamais à l'import (le test unitaire importe scoreTresoRow/matchTresoRows).
const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isMain) {
  main().catch((e) => {
    console.error('FATAL:', e);
    process.exit(1);
  });
}
