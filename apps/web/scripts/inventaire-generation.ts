/**
 * Inventaire de génération pré-audit Qualiopi (BCI 03/07/2026) — RÉUTILISABLE.
 *
 * BUT MÉTIER
 * ----------
 * Dimensionner la génération de MASSE des docs Qualiopi avant l'audit de
 * renouvellement RNQ V9. Périmètre = sessions TERMINÉES de la période certifiée
 * (borne basse 2023-06-26 = date de l'audit initial) × docs manquants (`missing`)
 * ou à régénérer (`stub`) par session/apprenant. La sortie EST la worklist de
 * génération. Tout est généré (pack closure) — pas d'intrant réel à croiser.
 *
 * GOUVERNANCE PAR LOT (structurant — ne PAS tout mettre dans la même benne)
 * ------------------------------------------------------------------------
 * Chaque doc porte une `famille` (DOC_FAMILY, doc-scope.ts, source unique) qui
 * le range dans un LOT :
 *   - Lot A = descriptif + analyse   → génération de masse possible.
 *   - Lot B = resultat   + presence  → NE PAS générer sans aval métier
 *     (régénérer un RÉSULTAT — scoring QCM 2024 — ou une PREUVE SIGNÉE
 *      — émargement, assiduité — = fausse affirmation devant l'AGEFICE/l'auditeur).
 *
 * RÉUTILISATION (pas de duplication de logique)
 * ---------------------------------------------
 *   - `deriveCellState` (derive-cell-state.ts) : present/missing par cellule,
 *     APPELÉ EXACTEMENT comme la matrice de la fiche session (page.tsx).
 *   - `DOC_FAMILY` / `docFamilyOf` / `docLotOf` (doc-scope.ts) : famille + lot.
 *   - `DOC_INDICATORS` (doc-scope.ts) : indicateur Qualiopi.
 *   - Stub : règle `rawJson.source === 'stub'` (identique à resolveDocs:pedSource).
 *
 * CONTRAT
 * -------
 *   - READ-ONLY (aucune écriture DB). Idempotent, relançable après chaque vague.
 *   - NE GÉNÈRE AUCUN doc — il LISTE.
 *   - Param borne basse : `--since=YYYY-MM-DD` (défaut 2023-06-26).
 *
 * CHOIX CONSIGNÉS (schema ambigu — tranchés au plus proche)
 * ---------------------------------------------------------
 *   - « Terminée » = SessionStatus.COMPLETED (enum schema : `COMPLETED // "Terminée"`).
 *   - Date pertinente = `endDate` (fin de formation = jalon de clôture/génération) ;
 *     filtre `endDate >= since`.
 *
 * Sorties : .planning/audit/INVENTAIRE-GENERATION.md + inventaire-generation.csv
 *
 * Usage :
 *   cd apps/web && npx dotenv -e ../../.env -- tsx scripts/inventaire-generation.ts
 *   ... -- tsx scripts/inventaire-generation.ts --since=2023-06-26
 */

import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { prisma, SessionStatus } from '@qualiof/db';
import { deriveCellState } from '@/lib/derive-cell-state';
import {
  MATRIX_DOC_TYPES,
  SESSION_ONLY_DOC_TYPES,
  DOC_TYPE_LABELS,
  DOC_INDICATORS,
  docFamilyOf,
  docLotOf,
  type DocFamily,
} from '@/lib/doc-scope';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// apps/web/scripts → racine monorepo (../../../) → .planning/audit
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT_DIR = path.join(ROOT, '.planning', 'audit');
const MD_PATH = path.join(OUT_DIR, 'INVENTAIRE-GENERATION.md');
const CSV_PATH = path.join(OUT_DIR, 'inventaire-generation.csv');

const DEFAULT_SINCE = '2023-06-26'; // date de l'audit initial Qualiopi (borne basse certifiée)

// ─── Args ────────────────────────────────────────────────────────────────
function parseSince(): { iso: string; date: Date } {
  const arg = process.argv.find((a) => a.startsWith('--since='));
  const raw = arg ? arg.slice('--since='.length) : DEFAULT_SINCE;
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    console.error(`✗ --since invalide : "${raw}" (attendu YYYY-MM-DD)`);
    process.exit(1);
  }
  return { iso: raw, date };
}

// ─── Types worklist ────────────────────────────────────────────────────────
type WorkStatus = 'missing' | 'stub';

interface WorkItem {
  sessionCode: string;
  sessionStart: Date;
  sessionEnd: Date;
  trainer: string | null;
  /** Nom apprenant, ou null pour un doc session-level. */
  learner: string | null;
  docType: string;
  docLabel: string;
  status: WorkStatus;
  family: DocFamily;
  lot: 'A' | 'B';
  indicator: string | null;
}

/** Stub detection — règle identique à resolveDocs:pedSource (rawJson.source==='stub'). */
function isStub(rawJson: unknown): boolean {
  if (rawJson && typeof rawJson === 'object' && 'source' in rawJson) {
    const s = (rawJson as { source?: unknown }).source;
    return s === 'stub';
  }
  return false;
}

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC' }).format(d);
}

function pushItem(items: WorkItem[], partial: Omit<WorkItem, 'family' | 'lot' | 'indicator' | 'docLabel'>): void {
  const family = docFamilyOf(partial.docType);
  items.push({
    ...partial,
    docLabel: DOC_TYPE_LABELS[partial.docType]?.long ?? partial.docType,
    family,
    lot: docLotOf(partial.docType),
    indicator: DOC_INDICATORS[partial.docType] ?? null,
  });
}

async function main(): Promise<void> {
  const { iso: sinceIso, date: sinceDate } = parseSince();

  console.log(`\n── Inventaire de génération pré-audit ──`);
  console.log(`Borne basse (--since) : ${sinceIso}`);
  console.log(`Critère « terminée »   : SessionStatus.COMPLETED, endDate >= ${sinceIso}\n`);

  // READ-ONLY : sessions terminées de la période certifiée.
  const sessions = await prisma.trainingSession.findMany({
    where: { status: SessionStatus.COMPLETED, endDate: { gte: sinceDate } },
    orderBy: { endDate: 'asc' },
    select: {
      id: true,
      code: true,
      startDate: true,
      endDate: true,
      productId: true,
      trainers: {
        orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }],
        select: { person: { select: { firstName: true, lastName: true } } },
      },
      participants: {
        orderBy: [{ person: { lastName: 'asc' } }, { person: { firstName: 'asc' } }],
        select: {
          id: true,
          docStatus: true,
          person: { select: { firstName: true, lastName: true } },
          sponsorOrg: { select: { opcoCode: true } },
        },
      },
    },
  } as never);

  const items: WorkItem[] = [];
  let sessionsWithGaps = 0;

  for (const s of sessions as Array<{
    id: string;
    code: string;
    startDate: Date;
    endDate: Date;
    productId: string | null;
    trainers: Array<{ person: { firstName: string; lastName: string } | null }>;
    participants: Array<{
      id: string;
      docStatus: unknown;
      person: { firstName: string; lastName: string };
      sponsorOrg: { opcoCode: string | null } | null;
    }>;
  }>) {
    const participantIds = s.participants.map((p) => p.id);

    // Charge les sources documentaires EXACTEMENT comme la fiche session (page.tsx)
    // pour que `deriveCellState` renvoie le MÊME present/missing que l'UI.
    const [participantDocsRaw, productDocsRaw, sessionDocsRaw, pedAssetsRaw] = participantIds.length
      ? await Promise.all([
          prisma.document.findMany({
            where: { entityType: 'participant', entityId: { in: participantIds } },
            select: { id: true, type: true, entityId: true },
          }),
          prisma.document.findMany({
            where: { entityType: 'product', entityId: s.productId ?? '' },
            select: { id: true, type: true },
          }),
          prisma.document.findMany({
            where: { entityType: 'session', entityId: s.id },
            select: { id: true, type: true },
          }),
          prisma.pedagogicalAsset.findMany({
            where: { sessionId: s.id },
            select: { id: true, participantId: true, kind: true, rawJson: true, pdfUrl: true },
          }),
        ])
      : [[], [], [], []];

    const productDocsMap = new Map<string, { id: string }>(
      (productDocsRaw as Array<{ id: string; type: string }>).map((d) => [d.type, { id: d.id }]),
    );
    const sessionDocsMap = new Map<string, { id: string }>(
      (sessionDocsRaw as Array<{ id: string; type: string }>).map((d) => [d.type, { id: d.id }]),
    );

    const participantDocsByPid = new Map<string, Map<string, { id: string }>>();
    for (const d of participantDocsRaw as Array<{ id: string; type: string; entityId: string }>) {
      if (!d.entityId) continue;
      const inner = participantDocsByPid.get(d.entityId) ?? new Map<string, { id: string }>();
      inner.set(d.type, { id: d.id });
      participantDocsByPid.set(d.entityId, inner);
    }

    // Assets par participant : la map d'id (pour deriveCellState) ET le flag stub.
    const pedAssetsByPid = new Map<string, Map<string, { id: string }>>();
    const stubAssetByPid = new Map<string, Set<string>>(); // pid → kinds en stub OU sans pdf
    for (const a of pedAssetsRaw as Array<{
      id: string;
      participantId: string | null;
      kind: string;
      rawJson: unknown;
      pdfUrl: string | null;
    }>) {
      if (!a.participantId) continue;
      const inner = pedAssetsByPid.get(a.participantId) ?? new Map<string, { id: string }>();
      inner.set(a.kind, { id: a.id });
      pedAssetsByPid.set(a.participantId, inner);
      if (isStub(a.rawJson) || !a.pdfUrl) {
        const set = stubAssetByPid.get(a.participantId) ?? new Set<string>();
        set.add(a.kind);
        stubAssetByPid.set(a.participantId, set);
      }
    }

    const trainer =
      s.trainers
        .map((t) => (t.person ? `${t.person.firstName} ${t.person.lastName.toUpperCase()}` : null))
        .find((n) => !!n) ?? null;

    let sessionHadGap = false;

    // ── (participant × MATRIX_DOC_TYPES) ────────────────────────────────────
    for (const p of s.participants) {
      const learner = `${p.person.firstName} ${p.person.lastName.toUpperCase()}`;
      const isAgefice = p.sponsorOrg?.opcoCode === 'AGEFICE';
      const cols: readonly string[] = isAgefice ? [...MATRIX_DOC_TYPES, 'AGEFICE'] : MATRIX_DOC_TYPES;
      const partDocs = participantDocsByPid.get(p.id) ?? new Map<string, { id: string }>();
      const partAssets = pedAssetsByPid.get(p.id) ?? new Map<string, { id: string }>();
      const stubKinds = stubAssetByPid.get(p.id) ?? new Set<string>();

      for (const docType of cols) {
        const cell = deriveCellState(
          docType,
          { docStatus: p.docStatus as never },
          partDocs,
          productDocsMap,
          sessionDocsMap,
          partAssets,
        );

        // stub overlay : l'asset existe mais source==='stub' (ou pdf manquant)
        // → à RÉGÉNÉRER. deriveCellState le voit GENERATED ; on le re-qualifie.
        const backingKind = partAssets.has(docType) ? docType : null;
        const stub = backingKind ? stubKinds.has(backingKind) : false;

        if (cell.state === 'MISSING') {
          sessionHadGap = true;
          pushItem(items, {
            sessionCode: s.code,
            sessionStart: s.startDate,
            sessionEnd: s.endDate,
            trainer,
            learner,
            docType,
            status: 'missing',
          });
        } else if (stub) {
          sessionHadGap = true;
          pushItem(items, {
            sessionCode: s.code,
            sessionStart: s.startDate,
            sessionEnd: s.endDate,
            trainer,
            learner,
            docType,
            status: 'stub',
          });
        }
      }
    }

    // ── (session × SESSION_ONLY_DOC_TYPES) ─────────────────────────────────
    for (const docType of SESSION_ONLY_DOC_TYPES) {
      // Pour les docs session-level : present si dans sessionDocsMap/productDocsMap.
      // On réutilise deriveCellState avec un participant vide (docStatus null).
      const cell = deriveCellState(
        docType,
        { docStatus: null },
        new Map(),
        productDocsMap,
        sessionDocsMap,
        new Map(),
      );
      if (cell.state === 'MISSING') {
        sessionHadGap = true;
        pushItem(items, {
          sessionCode: s.code,
          sessionStart: s.startDate,
          sessionEnd: s.endDate,
          trainer,
          learner: null,
          docType,
          status: 'missing',
        });
      }
    }

    if (sessionHadGap) sessionsWithGaps += 1;
  }

  // ─── Agrégats par lot ────────────────────────────────────────────────────
  const lotA = items.filter((i) => i.lot === 'A');
  const lotB = items.filter((i) => i.lot === 'B');
  const sessionsConcerned = new Set(items.map((i) => i.sessionCode));

  const byFamily = (fam: DocFamily) => items.filter((i) => i.family === fam).length;
  const signedFrozen = items.filter(
    (i) => i.family === 'presence' && (i.docType === 'EMARGEMENT' || i.docType === 'ASSIDUITE'),
  ).length;

  // ─── Rendu Markdown ──────────────────────────────────────────────────────
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const now = new Date();
  const md: string[] = [];

  md.push(`# Inventaire de génération pré-audit Qualiopi (BCI 03/07/2026)`);
  md.push('');
  md.push(`> Généré le ${fmtDate(now)} · borne basse \`--since=${sinceIso}\` · **read-only**, relançable.`);
  md.push(`> Critère « terminée » : \`SessionStatus.COMPLETED\` · date pertinente : \`endDate >= ${sinceIso}\`.`);
  md.push('');
  md.push(`## ⚠ Gouvernance — NE PAS tout générer dans la même benne`);
  md.push('');
  md.push(`- **Lot A = génération de masse possible** (descriptifs + analyses). Relire les analyses avant envoi.`);
  md.push(`- **Lot B = EN ATTENTE réponse Kaïna (16/06)** — résultats + preuves signées. **NE PAS** générer`);
  md.push(`  rétroactivement un RÉSULTAT (scoring QCM inventé) ni une PREUVE SIGNÉE (émargement/assiduité) :`);
  md.push(`  ce serait une fausse affirmation devant l'AGEFICE / l'auditeur.`);
  md.push('');
  md.push(`## Récapitulatif par LOT`);
  md.push('');
  md.push(`| Lot | Familles | Docs à produire | Action |`);
  md.push(`| --- | --- | ---: | --- |`);
  md.push(`| **A** | descriptif + analyse | **${lotA.length}** | Génération de masse OK (relire analyses) |`);
  md.push(`| **B** | resultat + presence | **${lotB.length}** | GELÉ — attente aval métier |`);
  md.push('');
  md.push(`- Sessions terminées depuis ${sinceIso} : **${sessions.length}** · avec docs manquants/stub : **${sessionsWithGaps}**.`);
  md.push(`- Sessions concernées par la worklist : **${sessionsConcerned.size}**.`);
  md.push(`- Total items worklist : **${items.length}** (Lot A ${lotA.length} · Lot B ${lotB.length}).`);
  md.push(`- Dont preuves SIGNÉES non régénérables (émargement + assiduité) : **${signedFrozen}**.`);
  md.push('');
  md.push(`### Ventilation par famille`);
  md.push('');
  md.push(`| Famille | Lot | Items |`);
  md.push(`| --- | --- | ---: |`);
  md.push(`| descriptif | A | ${byFamily('descriptif')} |`);
  md.push(`| analyse | A | ${byFamily('analyse')} |`);
  md.push(`| resultat | B | ${byFamily('resultat')} |`);
  md.push(`| presence | B | ${byFamily('presence')} |`);
  md.push('');
  md.push(`## Classification \`famille\` utilisée (À VALIDER par Laurent — bordures)`);
  md.push('');
  md.push(`Bordures sensibles soulignées : émargement, assiduité (signés → \`presence\`, Lot B gelé),`);
  md.push(`certificat & attestation (preuves de réalisation → \`presence\`), QCM/évaluation (→ \`resultat\`).`);
  md.push('');
  md.push(`| Famille | Lot | DocTypes |`);
  md.push(`| --- | --- | --- |`);
  const familiesOrder: DocFamily[] = ['descriptif', 'analyse', 'resultat', 'presence'];
  // On liste depuis le catalogue les types réellement rencontrés + les attendus matrice/session.
  const allKnown = Array.from(
    new Set([...MATRIX_DOC_TYPES, ...SESSION_ONLY_DOC_TYPES, 'AGEFICE', ...items.map((i) => i.docType)]),
  );
  for (const fam of familiesOrder) {
    const types = allKnown.filter((t) => docFamilyOf(t) === fam).sort();
    md.push(`| ${fam} | ${fam === 'descriptif' || fam === 'analyse' ? 'A' : 'B'} | ${types.join(', ') || '—'} |`);
  }
  md.push('');
  md.push(`## Worklist détaillée par session`);
  md.push('');

  if (items.length === 0) {
    md.push(`_Aucun document manquant ou stub sur le périmètre. Rien à générer._`);
  } else {
    const bySession = new Map<string, WorkItem[]>();
    for (const it of items) {
      const arr = bySession.get(it.sessionCode) ?? [];
      arr.push(it);
      bySession.set(it.sessionCode, arr);
    }
    const sortedCodes = Array.from(bySession.keys()).sort();
    for (const code of sortedCodes) {
      const arr = bySession.get(code)!;
      const head = arr[0]!;
      md.push(`### ${code} — ${fmtDate(head.sessionStart)} → ${fmtDate(head.sessionEnd)}${head.trainer ? ` · ${head.trainer}` : ''}`);
      md.push('');
      const a = arr.filter((i) => i.lot === 'A').length;
      const b = arr.filter((i) => i.lot === 'B').length;
      md.push(`Lot A : ${a} · Lot B : ${b}`);
      md.push('');
      md.push(`| Apprenant | Document | Statut | Famille | Lot | Indicateur |`);
      md.push(`| --- | --- | --- | --- | --- | --- |`);
      // par apprenant puis doc
      const sorted = [...arr].sort(
        (x, y) =>
          (x.learner ?? '—').localeCompare(y.learner ?? '—') || x.docType.localeCompare(y.docType),
      );
      for (const it of sorted) {
        md.push(
          `| ${it.learner ?? '_(session)_'} | ${it.docLabel} | ${it.status} | ${it.family} | ${it.lot} | ${it.indicator ?? '—'} |`,
        );
      }
      md.push('');
    }
  }

  fs.writeFileSync(MD_PATH, md.join('\n'), 'utf8');

  // ─── Rendu CSV ───────────────────────────────────────────────────────────
  const csv: string[] = [];
  csv.push('session,date_debut,date_fin,formateur,apprenant,docType,statut,famille,lot,indicateur');
  const esc = (v: string | null): string => {
    const s = v ?? '';
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  for (const it of items) {
    csv.push(
      [
        esc(it.sessionCode),
        fmtDate(it.sessionStart),
        fmtDate(it.sessionEnd),
        esc(it.trainer),
        esc(it.learner),
        esc(it.docType),
        esc(it.status),
        esc(it.family),
        esc(it.lot),
        esc(it.indicator),
      ].join(','),
    );
  }
  fs.writeFileSync(CSV_PATH, csv.join('\n'), 'utf8');

  // ─── Console summary ─────────────────────────────────────────────────────
  console.log(`Sessions terminées (>= ${sinceIso}) : ${sessions.length}`);
  console.log(`Sessions avec manquants/stub        : ${sessionsWithGaps}`);
  console.log(`Items worklist                      : ${items.length}`);
  console.log(`  Lot A (masse OK)                  : ${lotA.length}`);
  console.log(`  Lot B (gelé)                      : ${lotB.length}`);
  console.log(`  dont signés non régénérables      : ${signedFrozen}`);
  console.log(`\n✓ ${path.relative(ROOT, MD_PATH)}`);
  console.log(`✓ ${path.relative(ROOT, CSV_PATH)}\n`);
}

main()
  .catch((e) => {
    console.error('✗ Inventaire échoué :', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
