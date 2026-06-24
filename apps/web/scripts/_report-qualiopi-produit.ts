/**
 * Reporting Qualiopi par PRODUIT de formation :
 *   - nb stagiaires formés (uniques, ATTENDED/CONFIRMED)
 *   - taux de satisfaction (% favorable TB+Bien) + note /5
 *   - taux de recommandation (% Oui)
 *
 * Réutilise exactement aggregateSatisfactions (même calcul que la fiche produit).
 * Sortie : tableau console + CSV dans /tmp.
 */
import fs from 'node:fs';

const { prisma } = await import('@qualiof/db');
const { aggregateSatisfactions } = await import(
  '../src/lib/closure/satisfaction-session-template'
);
type SatisfactionChaudContent = Record<string, unknown>;

const products = await prisma.trainingProduct.findMany({
  select: { id: true, title: true, code: true, tenantId: true },
  orderBy: { code: 'asc' },
});

type Row = {
  code: string;
  title: string;
  nbFormes: number;
  nbSatis: number;
  noteSur5: number | null;
  satisfPct: number | null;
  recoPct: number | null;
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

  if (contents.length === 0) {
    rows.push({
      code: p.code, title: p.title, nbFormes, nbSatis: 0,
      noteSur5: null, satisfPct: null, recoPct: null,
    });
    continue;
  }

  const agg = aggregateSatisfactions(contents as never);
  rows.push({
    code: p.code,
    title: p.title,
    nbFormes,
    nbSatis: contents.length,
    noteSur5: agg.noteSur5,
    satisfPct: agg.satisfactionFavorableRate,
    recoPct: agg.recommandationRate,
  });
}

// Filtre : produits avec au moins 1 stagiaire formé OU 1 satisfaction
const shown = rows.filter((r) => r.nbFormes > 0 || r.nbSatis > 0);

console.log('\n=== INDICATEURS QUALIOPI PAR PRODUIT DE FORMATION ===\n');
const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));
console.log(
  pad('Code', 10) + pad('Produit', 50) +
  'Formés'.padStart(7) + 'Satisf.(n)'.padStart(11) +
  'Note/5'.padStart(8) + 'Satisf.%'.padStart(10) + 'Reco.%'.padStart(8),
);
console.log('-'.repeat(104));
for (const r of shown) {
  console.log(
    pad(r.code, 10) + pad(r.title, 50) +
    String(r.nbFormes).padStart(7) +
    String(r.nbSatis).padStart(11) +
    (r.noteSur5 != null ? r.noteSur5.toFixed(1) : '—').padStart(8) +
    (r.satisfPct != null ? r.satisfPct + '%' : '—').padStart(10) +
    (r.recoPct != null ? r.recoPct + '%' : '—').padStart(8),
  );
}

const totFormes = shown.reduce((s, r) => s + r.nbFormes, 0);
console.log('-'.repeat(104));
console.log(`TOTAL : ${shown.length} produits · ${totFormes} stagiaires formés (cumul)\n`);

// CSV
const csv = [
  'Code;Produit;Stagiaires formes;Nb satisfactions;Note sur 5;Taux satisfaction %;Taux recommandation %',
  ...shown.map((r) =>
    [
      r.code,
      '"' + r.title.replace(/"/g, '""') + '"',
      r.nbFormes,
      r.nbSatis,
      r.noteSur5 != null ? String(r.noteSur5).replace('.', ',') : '',
      r.satisfPct ?? '',
      r.recoPct ?? '',
    ].join(';'),
  ),
].join('\n');
const out = '/tmp/indicateurs-qualiopi-produit.csv';
fs.writeFileSync(out, '﻿' + csv, 'utf8');
console.log(`CSV écrit : ${out}`);

await prisma.$disconnect();
