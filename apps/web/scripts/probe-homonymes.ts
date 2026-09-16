/**
 * Les HOMONYMES du domaine, et ce qu'ils portent (relevé du 16/09/2026).
 *
 *   pnpm --filter @qualiof/web probe:homonymes:local
 *
 * 100 % lecture. Aucun rattachement modifié, aucun arbitrage posé.
 *
 * ## Pourquoi
 *
 * Un rapprochement peut être **lexicalement parfait et sémantiquement faux**.
 * « Rédiger des compromis de vente » a été proposé sur « Transformer visites et
 * offres en actes » ; la douleur porte sur le suivi de réception des pièces,
 * pas sur la rédaction d'un avant-contrat — que le conseiller ne rédige pas.
 *
 * D-27 (deux mots pleins concordants) ne protège pas de ça : **les deux mots
 * sont bons**. C'est le sens qui diverge.
 *
 * La question de Laurent est la bonne : est-ce un cas isolé ou une famille ?
 * Cette sonde compte, pour chaque mot ambigu du domaine, **combien de
 * rapprochements ne tiennent QUE par lui**. Un rapprochement qui tient par un
 * seul mot n'a pas de second appui — si ce mot est ambigu, rien ne le rattrape.
 */
import { prisma } from '@qualiof/db';

import {
  PROGRAMME_NEEDS,
  discriminationWeights,
  isAnimable,
  scoreModule,
} from '../src/lib/proposition/module-matcher';
import { loadPropositionLibrary } from '../src/server/proposition-library';

const ref = process.argv[2] ?? 'DIAG-R001';

function ouTourne(): string {
  const url = process.env.DATABASE_URL ?? '';
  const m = /@([^/:]+)(?::\d+)?\/([^?]+)/.exec(url);
  if (!m) return 'base INCONNUE';
  const [, hote, base] = m;
  return `${/localhost|127\.0\.0\.1/.test(hote!) ? 'LOCALE' : 'DISTANTE'} — ${base} @ ${hote}`;
}

const normaliser = (s: string): string =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

/**
 * Les mots ambigus du domaine, nommés par Laurent — plus « compromis », le cas
 * fondateur. Chacun porte les deux sens qui peuvent se confondre.
 */
const HOMONYMES: { mot: string; sens: [string, string] }[] = [
  { mot: 'compromis', sens: ['terrain d’entente', 'avant-contrat de vente'] },
  { mot: 'mandat', sens: ['mandat de vente', 'mandat de recherche / de gestion'] },
  { mot: 'acte', sens: ['acte authentique', 'agir / passer à l’acte'] },
  { mot: 'offre', sens: ['offre d’achat', 'offre commerciale de l’agence'] },
  { mot: 'bien', sens: ['un bien immobilier', 'adverbe — « bien vendre »'] },
  { mot: 'exclusivite', sens: ['mandat exclusif', 'exclusivité commerciale'] },
  { mot: 'estimation', sens: ['avis de valeur vendeur', 'chiffrage d’un budget'] },
  { mot: 'dossier', sens: ['dossier de vente', 'dossier de financement'] },
  { mot: 'suivi', sens: ['suivi vendeur', 'suivi de dossier / de pièces'] },
];

// ── Population ──────────────────────────────────────────────────────────────

const d = await prisma.diagnostic.findFirst({ where: { reference: ref }, select: { tenantId: true } });
if (!d) throw new Error(`${ref} introuvable`);

const library = await loadPropositionLibrary(d.tenantId);
const composables = library
  .filter((m) => !m.excludedFromClientOutputs && !m.source.excludedFromClientOutputs)
  .filter((m) => m.source.supersededBy === null)
  .filter((m) => isAnimable(m));

const weights = discriminationWeights(composables, PROGRAMME_NEEDS);

/** Tous les rapprochements POSSIBLES, besoin par besoin — pas seulement ceux d'un dossier. */
interface Rapprochement {
  needCode: string;
  needLabel: string;
  moduleTitle: string;
  sourceRef: string | null;
  code: string;
  termes: string[];
  source: 'signaux' | 'lexique';
}
const rapprochements: Rapprochement[] = [];
for (const need of PROGRAMME_NEEDS) {
  for (const m of composables) {
    const s = scoreModule(m, need, weights);
    if (!s) continue;
    rapprochements.push({
      needCode: need.code,
      needLabel: need.label,
      moduleTitle: m.title,
      sourceRef: m.sourceRef,
      code: m.source.code,
      termes: s.terms.map(normaliser),
      source: s.source,
    });
  }
}

console.log(`\n=== BASE : ${ouTourne()} ===`);
console.log(`=== POPULATION ===`);
console.log(`  ${composables.length} modules composables × ${PROGRAMME_NEEDS.length} besoins`);
console.log(`  → ${rapprochements.length} rapprochements possibles (score non nul)\n`);

// ── ① Le mot est-il seulement un mot-clé ? ──────────────────────────────────

const motsClesConnus = new Set(
  PROGRAMME_NEEDS.flatMap((n) => n.keywords.map(normaliser)),
);

console.log(`=== ① LES HOMONYMES PEUVENT-ILS SEULEMENT RAPPROCHER ? ===`);
console.log(`    (un mot qui n'est mot-clé d'aucun besoin ne produit AUCUN rapprochement)\n`);
for (const h of HOMONYMES) {
  const estCle = motsClesConnus.has(h.mot);
  console.log(`  ${estCle ? '✔' : '✖'} ${h.mot.padEnd(12)} ${estCle ? 'mot-clé' : 'PAS un mot-clé — ne rapproche rien'}`);
}

// ── ② Combien de rapprochements ne tiennent QUE par ce mot ? ────────────────

console.log(`\n=== ② RAPPROCHEMENTS QUI NE TIENNENT QUE PAR UN MOT AMBIGU ===`);
console.log(`  ${'mot'.padEnd(12)} ${'seul appui'.padStart(10)} ${'total'.padStart(7)}   exemples\n`);
let totalSeulAppui = 0;
for (const h of HOMONYMES) {
  const parLui = rapprochements.filter((r) => r.termes.includes(h.mot));
  const seulAppui = parLui.filter((r) => r.termes.length === 1);
  totalSeulAppui += seulAppui.length;
  console.log(
    `  ${h.mot.padEnd(12)} ${String(seulAppui.length).padStart(10)} ${String(parLui.length).padStart(7)}   ` +
      `${h.sens[0]} / ${h.sens[1]}`,
  );
  for (const r of seulAppui.slice(0, 3)) {
    console.log(`      ${r.code.padEnd(9)} ${r.moduleTitle.slice(0, 52).padEnd(52)} → « ${r.needLabel.slice(0, 40)} »`);
  }
  if (seulAppui.length > 3) console.log(`      … et ${seulAppui.length - 3} autre(s)`);
}

// ── ③ La mesure qui tranche : isolé ou famille ? ────────────────────────────

const parUnSeulMot = rapprochements.filter((r) => r.termes.length === 1);
const lexiquePur = rapprochements.filter((r) => r.source === 'lexique');
const lexiqueUnMot = lexiquePur.filter((r) => r.termes.length === 1);

console.log(`\n=== ③ LA MESURE QUI TRANCHE ===`);
const pct = (n: number, d2: number): string => (d2 === 0 ? '—' : `${((n / d2) * 100).toFixed(1)} %`);
console.log(`  rapprochements ne tenant que par UN mot, quel qu'il soit : ${parUnSeulMot.length} / ${rapprochements.length} (${pct(parUnSeulMot.length, rapprochements.length)})`);
console.log(`  dont l'appui unique est un mot AMBIGU de la liste ......... ${totalSeulAppui}`);
console.log(`  rapprochements purement LEXICAUX (aucun signal catalogue) . ${lexiquePur.length} (${pct(lexiquePur.length, rapprochements.length)})`);
console.log(`  …et tenant sur un seul mot — les plus fragiles ............ ${lexiqueUnMot.length}`);

await prisma.$disconnect();
