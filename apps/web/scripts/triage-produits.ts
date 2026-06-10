/**
 * Triage des produits de formation pré-audit Qualiopi (BCI 03/07/2026) — RÉUTILISABLE.
 *
 * BUT MÉTIER
 * ----------
 * PRÉREQUIS BLOQUANT de la génération de MASSE des docs Qualiopi (avant T2/T3).
 * Le programme (`programMd`) est PARTAGÉ par produit : une session TERMINÉE rattachée
 * à une coquille de préinscription ou à un doublon générerait un document FAUX à la
 * racine — peu importe la qualité des prompts. Ce rapport permet à Laurent de classer
 * chaque produit RÉEL / PRÉINSCRIPTION / DOUBLON, puis (étape SUIVANTE, hors de ce
 * script) de re-mapper les sessions des produits PRÉINSCRIPTION/DOUBLON vers le
 * produit RÉEL, AVANT la génération. Recoupe le risque programMd des 27 produits
 * SmartOF / PROD-0662.
 *
 * CE SCRIPT NE DÉCIDE RIEN — les heuristiques ne font que SIGNALER. Les 3 colonnes
 * de classement (RÉEL / PRÉINSCRIPTION / DOUBLON) restent VIDES, à remplir par Laurent.
 *
 * CONTRAT
 * -------
 *   - READ-ONLY (aucune écriture DB, aucune génération de doc). findMany + count.
 *   - Idempotent, relançable.
 *   - 1 ligne par TrainingProduct.
 *
 * CHOIX CONSIGNÉS (schema ambigu — tranchés au plus proche, NE fabrique aucun champ)
 * ---------------------------------------------------------------------------------
 *   - Pas de champ `source`/`origine`/`externalId` DIRECT sur TrainingProduct
 *     (vérifié schema.prisma:330). L'origine est dérivée de la table ExternalIdentity
 *     (source='smartof', entityType='TrainingProduct', entityId=produit.id) :
 *       · présent  → origine « SmartOF »
 *       · absent   → origine « manuel/? » (créé hors import — préinscription possible)
 *     On ne peut PAS distinguer un produit « préinscription » d'un produit « manuel »
 *     côté schema : c'est précisément le travail de classement de Laurent. La colonne
 *     origine indique donc « SmartOF » ou « ? (hors SmartOF) ».
 *   - `code` est NON-nullable (schema: String, @@unique [tenantId, code]) → toujours
 *     affiché (PROD-xxxx en pratique).
 *   - « Session terminée » = SessionStatus.COMPLETED (enum schema : COMPLETED // "Terminée").
 *   - `programMd` est NON-nullable (String) mais peut être '' → « vide » si trim()==''.
 *   - priceHT est Decimal → converti en Number pour le formatage € et les seuils.
 *
 * HEURISTIQUES DE SIGNAL (aide à la relecture, PAS une décision)
 * -------------------------------------------------------------
 *   - ⚠ 0 session            : aucune session rattachée → suspect d'artefact.
 *   - ⚠ programme vide        : programMd trim vide → produit incomplet/coquille.
 *   - ⚠ programme court       : programMd < SHORT_PROGRAM_CHARS car. → suspect.
 *   - ⚠ prix 0/null           : priceHT <= 0 → signal (un vrai produit a un tarif).
 *   - ⚠ quasi-doublon PROD-yyy : titre normalisé (casse/accents/espaces) quasi-identique
 *     à un autre produit (similarité Levenshtein normalisée >= TITLE_SIMILARITY_THRESHOLD).
 *
 * TRI : suspects (≥1 signal ⚠) en TÊTE, puis le reste — la relecture commence par
 * ce qui compte. Au sein des suspects, on remonte d'abord 0 session + programme vide.
 *
 * Sorties : .planning/audit/TRIAGE-PRODUITS.md + triage-produits.csv
 *
 * Usage :
 *   cd apps/web && npx dotenv -e ../../.env -- tsx scripts/triage-produits.ts
 */

import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { prisma, SessionStatus } from '@qualiof/db';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// apps/web/scripts → racine monorepo (../../../) → .planning/audit
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT_DIR = path.join(ROOT, '.planning', 'audit');
const MD_PATH = path.join(OUT_DIR, 'TRIAGE-PRODUITS.md');
const CSV_PATH = path.join(OUT_DIR, 'triage-produits.csv');

// ─── Seuils heuristiques (consignés, ajustables) ───────────────────────────
const SHORT_PROGRAM_CHARS = 200; // programMd plus court que ça = « court » (coquille probable)
const TITLE_SIMILARITY_THRESHOLD = 0.85; // similarité normalisée [0..1] pour signaler un quasi-doublon

// ─── Helpers ────────────────────────────────────────────────────────────────
function fmtEur(n: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
}

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC' }).format(d);
}

/** Id court lisible (8 premiers car. de l'uuid). */
function shortId(id: string): string {
  return id.slice(0, 8);
}

/** Normalisation pour comparer des titres : casse, accents, ponctuation, espaces. */
function normalizeTitle(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // retire les accents (combining diacritical marks)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ') // ponctuation → espace
    .trim()
    .replace(/\s+/g, ' ');
}

/** Distance de Levenshtein (itératif, O(n·m) mémoire O(min)). */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length]!;
}

/** Similarité normalisée [0..1] : 1 = identique. */
function titleSimilarity(a: string, b: string): number {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na && !nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(na, nb) / maxLen;
}

// ─── Types ────────────────────────────────────────────────────────────────
interface ProductRow {
  id: string;
  code: string;
  title: string;
  priceHT: number;
  programLen: number;
  programEmpty: boolean;
  sessionsTotal: number;
  sessionsCompleted: number;
  origin: 'SmartOF' | '? (hors SmartOF)';
  isActive: boolean;
  createdAt: Date;
  signals: string[];
  /** code du produit jugé quasi-doublon (si signal correspondant). */
  dupOf: string | null;
}

async function main(): Promise<void> {
  console.log(`\n── Triage des produits de formation pré-audit ──`);
  console.log(`Read-only · 1 ligne / TrainingProduct · heuristiques = SIGNAL, pas décision.\n`);

  // READ-ONLY : tous les produits + comptage sessions (total et terminées).
  const products = await prisma.trainingProduct.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      code: true,
      title: true,
      priceHT: true,
      programMd: true,
      isActive: true,
      createdAt: true,
      _count: { select: { trainingSessions: true } },
      trainingSessions: {
        where: { status: SessionStatus.COMPLETED },
        select: { id: true },
      },
    },
  });

  // Origine via ExternalIdentity (source=smartof) — pas de champ direct sur le produit.
  const smartofIds = await prisma.externalIdentity.findMany({
    where: { source: 'smartof', entityType: 'TrainingProduct' },
    select: { entityId: true },
  });
  const smartofSet = new Set(smartofIds.map((e) => e.entityId));

  // ─── Construction des lignes ───────────────────────────────────────────────
  const rows: ProductRow[] = products.map((p) => {
    const program = (p.programMd ?? '').trim();
    return {
      id: p.id,
      code: p.code,
      title: p.title,
      priceHT: Number(p.priceHT),
      programLen: program.length,
      programEmpty: program.length === 0,
      sessionsTotal: p._count.trainingSessions,
      sessionsCompleted: p.trainingSessions.length,
      origin: smartofSet.has(p.id) ? 'SmartOF' : '? (hors SmartOF)',
      isActive: p.isActive,
      createdAt: p.createdAt,
      signals: [],
      dupOf: null,
    };
  });

  // ─── Détection quasi-doublons (paires de titres) ───────────────────────────
  // Compare chaque produit aux autres ; on retient le meilleur match au-dessus du seuil.
  for (let i = 0; i < rows.length; i++) {
    let bestSim = 0;
    let bestCode: string | null = null;
    for (let j = 0; j < rows.length; j++) {
      if (i === j) continue;
      const sim = titleSimilarity(rows[i]!.title, rows[j]!.title);
      if (sim > bestSim) {
        bestSim = sim;
        bestCode = rows[j]!.code;
      }
    }
    if (bestSim >= TITLE_SIMILARITY_THRESHOLD && bestCode) {
      rows[i]!.dupOf = bestCode;
    }
  }

  // ─── Calcul des signaux ────────────────────────────────────────────────────
  for (const r of rows) {
    if (r.sessionsTotal === 0) r.signals.push('⚠ 0 session');
    if (r.programEmpty) r.signals.push('⚠ programme vide');
    else if (r.programLen < SHORT_PROGRAM_CHARS) r.signals.push('⚠ programme court');
    if (r.priceHT <= 0) r.signals.push('⚠ prix 0/null');
    if (r.dupOf) r.signals.push(`⚠ quasi-doublon de ${r.dupOf}`);
  }

  // ─── Tri : suspects en tête, puis poids du signal, puis code ───────────────
  // Poids : 0 session (4) + programme vide (3) + prix 0 (1) + doublon (2) — plus
  // c'est lourd, plus ça remonte. Les non-suspects (poids 0) en bas, triés par code.
  function weight(r: ProductRow): number {
    let w = 0;
    if (r.sessionsTotal === 0) w += 4;
    if (r.programEmpty) w += 3;
    else if (r.programLen < SHORT_PROGRAM_CHARS) w += 1;
    if (r.priceHT <= 0) w += 1;
    if (r.dupOf) w += 2;
    return w;
  }
  const sorted = [...rows].sort((a, b) => {
    const wa = weight(a);
    const wb = weight(b);
    if (wa !== wb) return wb - wa; // suspects (poids fort) d'abord
    return a.code.localeCompare(b.code);
  });

  // ─── Agrégats d'en-tête ────────────────────────────────────────────────────
  const total = rows.length;
  const withCompleted = rows.filter((r) => r.sessionsCompleted > 0).length;
  const zeroSession = rows.filter((r) => r.sessionsTotal === 0).length;
  const emptyProgram = rows.filter((r) => r.programEmpty).length;
  const shortProgram = rows.filter((r) => !r.programEmpty && r.programLen < SHORT_PROGRAM_CHARS).length;
  const zeroPrice = rows.filter((r) => r.priceHT <= 0).length;
  const dupCandidates = rows.filter((r) => r.dupOf).length;
  const suspects = rows.filter((r) => r.signals.length > 0).length;
  const smartofCount = rows.filter((r) => r.origin === 'SmartOF').length;
  const offSmartof = total - smartofCount;

  // ─── Rendu Markdown ──────────────────────────────────────────────────────
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const now = new Date();
  const md: string[] = [];

  md.push(`# Triage des produits de formation pré-audit Qualiopi (BCI 03/07/2026)`);
  md.push('');
  md.push(`> Généré le ${fmtDate(now)} · **read-only**, relançable · 1 ligne / produit.`);
  md.push(`> Les heuristiques **signalent**, elles ne décident pas. Colonnes RÉEL / PRÉINSCRIPTION / DOUBLON à remplir par Laurent.`);
  md.push('');
  md.push(`## ⚠ Pourquoi ce triage AVANT toute génération`);
  md.push('');
  md.push(`Le **programme (\`programMd\`) est partagé par produit**. Une session **terminée** rattachée à`);
  md.push(`une **coquille de préinscription** ou à un **doublon** produirait un document Qualiopi **FAUX**`);
  md.push(`à la racine — peu importe la conformité des prompts.`);
  md.push('');
  md.push(`**Étape suivante (PAS dans ce script)** : pour chaque produit classé PRÉINSCRIPTION ou DOUBLON,`);
  md.push(`**re-mapper ses sessions vers le produit RÉEL** correspondant, **AVANT T2/T3 et la génération de masse**.`);
  md.push('');
  md.push(`## En-tête — chiffres réels`);
  md.push('');
  md.push(`| Indicateur | Valeur |`);
  md.push(`| --- | ---: |`);
  md.push(`| **Total produits** | **${total}** |`);
  md.push(`| Réels probables (≥1 session terminée) | ${withCompleted} |`);
  md.push(`| **Suspects (≥1 signal ⚠)** | **${suspects}** |`);
  md.push(`| · dont 0 session | ${zeroSession} |`);
  md.push(`| · dont programme vide | ${emptyProgram} |`);
  md.push(`| · dont programme court (< ${SHORT_PROGRAM_CHARS} car.) | ${shortProgram} |`);
  md.push(`| · dont prix 0/null | ${zeroPrice} |`);
  md.push(`| · dont quasi-doublon de titre | ${dupCandidates} |`);
  md.push(`| Origine SmartOF (ExternalIdentity) | ${smartofCount} |`);
  md.push(`| Origine ? hors SmartOF (manuel/préinscription) | ${offSmartof} |`);
  md.push('');
  md.push(`> **Choix consignés** : pas de champ \`source\`/\`origine\` direct sur \`TrainingProduct\` (schema vérifié).`);
  md.push(`> L'origine est dérivée de \`ExternalIdentity(source='smartof')\` : « SmartOF » si présent, sinon`);
  md.push(`> « ? (hors SmartOF) » — on ne peut PAS distinguer « manuel » de « préinscription » côté schema,`);
  md.push(`> c'est l'objet du classement manuel. Seuils heuristiques : programme court < ${SHORT_PROGRAM_CHARS} car.,`);
  md.push(`> similarité de titre ≥ ${TITLE_SIMILARITY_THRESHOLD} (Levenshtein normalisé sur titre sans accents/casse/ponctuation).`);
  md.push('');
  md.push(`## Produits (suspects en tête)`);
  md.push('');
  md.push(
    `| Code · id | Titre | Prix HT | Sessions (dont term.) | Programme | Origine | Signal | RÉEL | PRÉINSCRIPTION | DOUBLON |`,
  );
  md.push(`| --- | --- | ---: | ---: | --- | --- | --- | :---: | :---: | :---: |`);
  for (const r of sorted) {
    const prog = r.programEmpty ? 'vide' : `${r.programLen} car.`;
    const sess = `${r.sessionsTotal} (${r.sessionsCompleted} term.)`;
    const signal = r.signals.length ? r.signals.join(' · ') : '';
    const title = r.title.replace(/\|/g, '\\|');
    md.push(
      `| \`${r.code}\` · ${shortId(r.id)} | ${title} | ${fmtEur(r.priceHT)} | ${sess} | ${prog} | ${r.origin} | ${signal} |  |  |  |`,
    );
  }
  md.push('');
  md.push(`## Mode d'emploi du classement`);
  md.push('');
  md.push(`1. Pour chaque ligne, cocher **une seule** des 3 colonnes (RÉEL / PRÉINSCRIPTION / DOUBLON).`);
  md.push(`2. Un produit avec **sessions terminées** + **programme renseigné** + **prix > 0** est`);
  md.push(`   très probablement RÉEL.`);
  md.push(`3. Un produit **0 session** ou **programme vide** est très probablement une coquille`);
  md.push(`   (PRÉINSCRIPTION) ou un DOUBLON.`);
  md.push(`4. Pour un **quasi-doublon**, identifier lequel des deux est le RÉEL (celui avec sessions`);
  md.push(`   terminées + programme) ; l'autre sera DOUBLON et ses sessions seront re-mappées.`);
  md.push(`5. Étape suivante (hors ce script) : re-mapper les sessions des PRÉINSCRIPTION/DOUBLON`);
  md.push(`   vers le produit RÉEL, **avant** la génération.`);
  md.push('');

  fs.writeFileSync(MD_PATH, md.join('\n'), 'utf8');

  // ─── Rendu CSV ───────────────────────────────────────────────────────────
  const csv: string[] = [];
  csv.push(
    'code,id_court,titre,prix_ht,sessions_total,sessions_terminees,programme_longueur,programme_vide,origine,actif,cree_le,signal,quasi_doublon_de,REEL,PREINSCRIPTION,DOUBLON',
  );
  const esc = (v: string | number | boolean | null): string => {
    const str = v === null || v === undefined ? '' : String(v);
    return /[",;\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  for (const r of sorted) {
    csv.push(
      [
        esc(r.code),
        esc(shortId(r.id)),
        esc(r.title),
        esc(r.priceHT),
        esc(r.sessionsTotal),
        esc(r.sessionsCompleted),
        esc(r.programLen),
        esc(r.programEmpty ? 'oui' : 'non'),
        esc(r.origin),
        esc(r.isActive ? 'oui' : 'non'),
        esc(fmtDate(r.createdAt)),
        esc(r.signals.join(' · ')),
        esc(r.dupOf),
        '', // RÉEL — à remplir
        '', // PRÉINSCRIPTION — à remplir
        '', // DOUBLON — à remplir
      ].join(','),
    );
  }
  fs.writeFileSync(CSV_PATH, csv.join('\n'), 'utf8');

  // ─── Console summary ─────────────────────────────────────────────────────
  console.log(`Total produits                      : ${total}`);
  console.log(`Réels probables (≥1 session term.)  : ${withCompleted}`);
  console.log(`Suspects (≥1 signal ⚠)              : ${suspects}`);
  console.log(`  · 0 session                       : ${zeroSession}`);
  console.log(`  · programme vide                  : ${emptyProgram}`);
  console.log(`  · programme court (<${SHORT_PROGRAM_CHARS})         : ${shortProgram}`);
  console.log(`  · prix 0/null                     : ${zeroPrice}`);
  console.log(`  · quasi-doublon de titre          : ${dupCandidates}`);
  console.log(`Origine SmartOF / hors SmartOF      : ${smartofCount} / ${offSmartof}`);
  console.log(`\n✓ ${path.relative(ROOT, MD_PATH)}`);
  console.log(`✓ ${path.relative(ROOT, CSV_PATH)}\n`);
}

main()
  .catch((e) => {
    console.error('✗ Triage échoué :', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
