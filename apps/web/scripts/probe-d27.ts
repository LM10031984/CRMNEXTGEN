/**
 * Ce que coûterait D-27 appliquée au MOTEUR (`recommendModules`) — simulation.
 *
 *   pnpm --filter @qualiof/web probe:d27:local [DIAG-R001]
 *
 * 100 % lecture, et **la règle n'est PAS appliquée** : la sonde post-filtre une
 * copie des recommandations pour mesurer l'effet, le moteur est intact.
 *
 * ## Deux variantes, parce que la règle littérale et la règle utile diffèrent
 *
 * D-27 dit « deux mots pleins concordants, ou rien ». Elle a été écrite pour la
 * LISTE DE RATTACHEMENT, où **tout** rapprochement est deviné lexicalement. Le
 * moteur, lui, connaît une seconde source : les `diagnosticSignals` posés sur le
 * module par le catalogue — une étiquette explicite, pas une devinette.
 *
 *   A · STRICTE  — < 2 mots tombe, signaux compris.
 *   B · CIBLÉE   — < 2 mots tombe SEULEMENT si le rapprochement est lexical ;
 *                  un signal du catalogue vaut témoin à lui seul.
 *
 * Le motif de Laurent (11/09) vise « un rapprochement DEVINÉ qu'un humain doit
 * relire ». Un signal n'est pas deviné. La sonde rend donc les deux chiffres et
 * laisse l'arbitrage.
 */
import { prisma } from '@qualiof/db';

import { buildAuditData } from '../src/lib/diagnostic-r1/audit-builder';
import { loadFundingRules } from '../src/lib/financement/load-rules';
import { composeProgramme } from '../src/lib/proposition/composer';
import {
  PROGRAMME_NEEDS,
  discriminationWeights,
  isAnimable,
  recommendModules,
  scoreModule,
  type ModuleRecommendation,
} from '../src/lib/proposition/module-matcher';
import { nomAgence } from '../src/lib/nom-agence';
import { loadPropositionLibrary } from '../src/server/proposition-library';

const ref = process.argv[2] ?? 'DIAG-R001';

function ouTourne(): string {
  const url = process.env.DATABASE_URL ?? '';
  const m = /@([^/:]+)(?::\d+)?\/([^?]+)/.exec(url);
  if (!m) return 'base INCONNUE';
  const [, hote, base] = m;
  return `${/localhost|127\.0\.0\.1/.test(hote!) ? 'LOCALE' : 'DISTANTE'} — ${base} @ ${hote}`;
}

type Variante = 'actuel' | 'A' | 'B';

/** Le candidat survit-il ? `actuel` ne filtre rien. */
function survit(c: { matchedTerms: string[]; matchSource: 'signaux' | 'lexique' }, v: Variante): boolean {
  if (v === 'actuel') return true;
  if (v === 'A') return c.matchedTerms.length >= 2;
  return c.matchSource === 'signaux' || c.matchedTerms.length >= 2;
}

const d = await prisma.diagnostic.findFirst({
  where: { reference: ref },
  select: {
    id: true, reference: true, variant: true, tenantId: true,
    organization: { select: { legalName: true } },
    lead: { select: { notes: true, firstName: true, lastName: true } },
    answers: { select: { questionId: true, value: true, isSkipped: true } },
    participants: {
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, displayName: true, statut: true, caN1: true, objectiveCa: true,
        strengths: true, priorityNeed: true, opcoEligible: true,
        trainings24mFunded: true, includedInProposal: true,
      },
    },
  },
});
if (!d) throw new Error(`${ref} introuvable`);

const { values: rules } = await loadFundingRules(d.tenantId);
const tenant = await prisma.tenant.findFirst({ where: { id: d.tenantId }, select: { name: true } });
const library = await loadPropositionLibrary(d.tenantId);

const audit = buildAuditData({
  reference: d.reference, agencyName: nomAgence(d), generatedAt: new Date(), variant: d.variant,
  answers: d.answers.map((a) => ({ questionId: a.questionId, value: a.value, isSkipped: a.isSkipped })),
  participants: d.participants.map((p) => ({
    ...p,
    caN1: p.caN1 === null ? null : Number(p.caN1),
    objectiveCa: p.objectiveCa === null ? null : Number(p.objectiveCa),
    trainings24mFunded: p.trainings24mFunded === null ? null : Number(p.trainings24mFunded),
  })),
  rules,
  of: { name: tenant?.name ?? 'OF', siret: null, numDA: null, address: null, email: null, phone: null },
  valueEuros: 3000,
});

console.log(`\n=== BASE : ${ouTourne()} ===`);
console.log(`=== ${ref} (${d.id}) — ${audit.agencyName}\n`);

// ── ① La population des rapprochements POSSIBLES (tous besoins × tous modules)

const composables = library
  .filter((m) => !m.excludedFromClientOutputs && !m.source.excludedFromClientOutputs)
  .filter((m) => m.source.supersededBy === null)
  .filter((m) => isAnimable(m));
const weights = discriminationWeights(composables, PROGRAMME_NEEDS);

const possibles: { needCode: string; terms: string[]; source: 'signaux' | 'lexique' }[] = [];
for (const need of PROGRAMME_NEEDS) {
  for (const m of composables) {
    const s = scoreModule(m, need, weights);
    if (s) possibles.push({ needCode: need.code, terms: s.terms, source: s.source });
  }
}

const pct = (n: number, t: number): string => (t === 0 ? '—' : `${((n / t) * 100).toFixed(1)} %`);

console.log(`=== ① LES RAPPROCHEMENTS POSSIBLES — ${possibles.length} sur ${composables.length} modules × ${PROGRAMME_NEEDS.length} besoins`);
console.log(`    POPULATION : besoins de COMPOSITION (${PROGRAMME_NEEDS.length}), pas les 34 douleurs du barème (§4 quater).\n`);
for (const v of ['A', 'B'] as const) {
  const restants = possibles.filter((p) => survit({ matchedTerms: p.terms, matchSource: p.source }, v));
  console.log(`  variante ${v} : ${String(restants.length).padStart(3)} / ${possibles.length} survivent (${pct(restants.length, possibles.length)}) — ${possibles.length - restants.length} tombent`);
}

// ── ② Les BESOINS qui perdent tout candidat, sur l'ensemble du référentiel ───

console.log(`\n=== ② LES BESOINS QUI N'ONT PLUS AUCUN CANDIDAT (sur les ${PROGRAMME_NEEDS.length}) ===`);
for (const v of ['actuel', 'A', 'B'] as const) {
  const vides = PROGRAMME_NEEDS.filter(
    (n) => !possibles.some((p) => p.needCode === n.code && survit({ matchedTerms: p.terms, matchSource: p.source }, v)),
  );
  console.log(`  ${v.padEnd(7)} : ${String(vides.length).padStart(2)} besoin(s) sans aucun candidat`);
  if (v !== 'actuel') {
    for (const n of vides.slice(0, 8)) console.log(`             · ${n.label}`);
    if (vides.length > 8) console.log(`             · … et ${vides.length - 8} autre(s)`);
  }
}

// ── ③ Le parcours réel de ce dossier ────────────────────────────────────────

// EXACTEMENT l'entrée de `seedContent` — une sonde qui ne calcule pas comme la
// production ne sonde rien (§4 bis, leçon du 14/09).
const base = recommendModules({
  chapterScores: audit.chapterScores.map((c) => ({
    chapter: c.chapter,
    score: c.score,
    breakdown: c.breakdown,
  })),
  alerts: audit.chapters.flatMap((c) => c.alerts),
  answers: audit.chapters.flatMap((c) => c.answers),
  library,
});

console.log(`\n=== ③ LE PARCOURS DE ${ref} ===`);
for (const v of ['actuel', 'A', 'B'] as const) {
  const filtrees: ModuleRecommendation[] = base.recommendations.map((r) => {
    const candidates = r.candidates.filter((c) => survit(c, v));
    return { ...r, candidates, unmet: candidates.length === 0 };
  });
  const composition = composeProgramme({
    recommendations: filtrees,
    rules,
    envelopeHalfDays: audit.funding.halfDays,
  });
  const servis = filtrees.filter((r) => r.candidates.length > 0).length;
  const declenches = filtrees.length;
  console.log(
    `  ${v.padEnd(7)} : ${String(composition.totalHalfDays).padStart(2)} journée(s) · ` +
      `${servis}/${declenches} besoins déclenchés servis · ` +
      `${composition.uncovered.length} non couvert(s) · ` +
      `${composition.sourceProgrammes.length} programmes sources`,
  );
  for (const u of composition.uncovered) console.log(`             ✖ ${u.label} (${u.reason})`);
}

// ── ④ Les appuis, module par module, sur le besoin en litige ────────────────

console.log(`\n=== ④ LES APPUIS DES MODULES RETENUS — « Transformer visites et offres en actes » ===`);
const litige = base.recommendations.find((r) => r.need.code === 'transformation');
if (!litige) {
  console.log(`  (besoin non déclenché sur ce dossier)`);
} else {
  for (const c of litige.candidates) {
    const appuis = c.matchedTerms.length === 1 ? `SEUL mot « ${c.matchedTerms[0]} »` : `mots « ${c.matchedTerms.join(' », « ')} »`;
    console.log(`  ${c.source.code.padEnd(9)} ${c.matchSource.padEnd(8)} ${c.confidence.padEnd(7)} ${appuis}`);
    console.log(`            ${c.title}`);
  }
}

console.log(`\n  (« journée » = un créneau, l'unité financeur — §8.1. L'enveloppe de droits`);
console.log(`   est de ${audit.funding.halfDays}, elle ne bouge pas : seul ce qu'on sait remplir change.)`);

await prisma.$disconnect();
