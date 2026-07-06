/**
 * Export Excel des indicateurs Qualiopi par produit de formation.
 * Réutilise aggregateSatisfactions (même calcul que la fiche produit).
 */
import fs from 'node:fs';
import * as XLSX from 'xlsx';

const { prisma } = await import('@qualiof/db');
const { aggregateSatisfactions } = await import(
  '../src/lib/closure/satisfaction-session-template'
);
type SatisfactionChaudContent = Record<string, unknown>;

const products = await prisma.trainingProduct.findMany({
  select: { id: true, title: true, code: true, tenantId: true, durationHours: true },
  orderBy: { code: 'asc' },
});

type Row = {
  Code: string;
  Produit: string;
  'Durée (h)': number | string;
  'Stagiaires formés': number;
  'Nb répondants satisfaction': number;
  'Note /5': number | string;
  'Taux satisfaction (%)': number | string;
  'Taux recommandation (%)': number | string;
};

const rows: Row[] = [];

for (const p of products) {
  const [participants, satisfactionAssets] = await Promise.all([
    prisma.sessionParticipant.findMany({
      where: {
        session: { tenantId: p.tenantId, productId: p.id },
        enrollmentStatus: { in: ['ATTENDED', 'CONFIRMED'] },
      },
      select: { personId: true },
    }),
    prisma.pedagogicalAsset.findMany({
      where: { tenantId: p.tenantId, kind: 'SATISFACTION_CHAUD', session: { productId: p.id } },
      select: { rawJson: true },
    }),
  ]);

  const nbFormes = new Set(participants.map((x) => x.personId)).size;

  const contents: SatisfactionChaudContent[] = [];
  for (const a of satisfactionAssets) {
    const raw = a.rawJson as Record<string, unknown> | null;
    if (!raw) continue;
    const { source: _src, ...content } = raw;
    contents.push(content);
  }

  if (nbFormes === 0 && contents.length === 0) continue;

  if (contents.length === 0) {
    rows.push({
      Code: p.code, Produit: p.title, 'Durée (h)': p.durationHours ?? '',
      'Stagiaires formés': nbFormes, 'Nb répondants satisfaction': 0,
      'Note /5': '', 'Taux satisfaction (%)': '', 'Taux recommandation (%)': '',
    });
    continue;
  }

  const agg = aggregateSatisfactions(contents as never);
  rows.push({
    Code: p.code,
    Produit: p.title,
    'Durée (h)': p.durationHours ?? '',
    'Stagiaires formés': nbFormes,
    'Nb répondants satisfaction': contents.length,
    'Note /5': agg.noteSur5,
    'Taux satisfaction (%)': agg.satisfactionFavorableRate,
    'Taux recommandation (%)': agg.recommandationRate,
  });
}

// Ligne TOTAL / synthèse
const totFormes = rows.reduce((s, r) => s + r['Stagiaires formés'], 0);
const totRepond = rows.reduce((s, r) => s + r['Nb répondants satisfaction'], 0);

const wb = XLSX.utils.book_new();
const headerOrder = [
  'Code', 'Produit', 'Durée (h)', 'Stagiaires formés',
  'Nb répondants satisfaction', 'Note /5', 'Taux satisfaction (%)', 'Taux recommandation (%)',
];
const ws = XLSX.utils.json_to_sheet(rows, { header: headerOrder });

// Ligne total ajoutée à la fin
XLSX.utils.sheet_add_aoa(
  ws,
  [['TOTAL', `${rows.length} produits`, '', totFormes, totRepond, '', '', '']],
  { origin: -1 },
);

// Largeurs de colonnes
ws['!cols'] = [
  { wch: 11 }, { wch: 55 }, { wch: 9 }, { wch: 17 },
  { wch: 24 }, { wch: 9 }, { wch: 20 }, { wch: 22 },
];

XLSX.utils.book_append_sheet(wb, ws, 'Indicateurs par produit');

// Feuille méthodo
const methodo = [
  ['Indicateurs Qualiopi par produit de formation'],
  ['Source', 'Base QualiOF (sessions, participants, satisfactions chaud)'],
  ['Date export', '2026-06-23'],
  [],
  ['Définitions'],
  ['Stagiaires formés', 'Participants uniques (statut Présent ou Confirmé), dédoublonnés par personne sur toutes les sessions du produit'],
  ['Nb répondants', 'Nombre de questionnaires de satisfaction chaud collectés'],
  ['Note /5', 'Barème : Très bien=5 / Bien=4 / Moyen=3 / Mauvais=2 (colonne K du tableau de suivi)'],
  ['Taux satisfaction', '% de réponses favorables (Très bien + Bien) sur l ensemble des critères (colonne L)'],
  ['Taux recommandation', '% de réponses « Oui » à la question de recommandation (NPS)'],
  [],
  ['Point de vigilance audit'],
  ['Attention', 'Les satisfactions actuellement en base sont générées (source IA), valeurs quasi uniformes. Remplacer par les questionnaires réels avant publication (indicateurs 1 et 2).'],
];
const wsM = XLSX.utils.aoa_to_sheet(methodo);
wsM['!cols'] = [{ wch: 22 }, { wch: 90 }];
XLSX.utils.book_append_sheet(wb, wsM, 'Méthodologie');

const out = '/Users/laurentmarx/Documents/CRM Next gen/Indicateurs-Qualiopi-par-produit.xlsx';
const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
fs.writeFileSync(out, buf);
console.log(`Export écrit : ${out}`);
console.log(`${rows.length} produits · ${totFormes} stagiaires formés (cumul)`);

await prisma.$disconnect();
