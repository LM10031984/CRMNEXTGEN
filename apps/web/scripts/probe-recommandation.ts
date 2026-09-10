/**
 * Ce que le moteur de recommandation propose sur un diagnostic RÉEL.
 *
 *   pnpm --filter @qualiof/web probe:reco            # DIAG-0001
 *   pnpm --filter @qualiof/web probe:reco DIAG-0002
 *
 * 100 % lecture. Aucune écriture, aucun document généré.
 *
 * Pourquoi cet outil existe : la recommandation dépend d'un catalogue qui vit
 * et que personne ne relit ligne à ligne. C'est en la regardant tourner sur un
 * dossier réel qu'on a vu un programme « pour activité événementielle »
 * remonter sur l'e-réputation d'une agence immobilière — pas en relisant le
 * code, et aucun test unitaire ne l'aurait attrapé, puisque le défaut était
 * dans les données. À rejouer après chaque évolution du catalogue.
 */
import { prisma } from '@qualiof/db';
import { buildAuditData } from '../src/lib/diagnostic-r1/audit-builder';
import { loadFundingRules } from '../src/lib/financement/load-rules';
import { recommendProgrammes, type CatalogueEntry } from '../src/lib/proposition/programme-matcher';

const ref = process.argv[2] ?? 'DIAG-0001';
const d = await prisma.diagnostic.findFirst({
  where: { reference: ref },
  select: {
    id: true, reference: true, variant: true, tenantId: true,
    answers: { select: { questionId: true, value: true, isSkipped: true } },
    participants: { orderBy: { createdAt: 'asc' }, select: { id: true, displayName: true, statut: true, caN1: true, objectiveCa: true, strengths: true, priorityNeed: true, opcoEligible: true, trainings24mFunded: true, includedInProposal: true } },
  },
});
if (!d) throw new Error(`${ref} introuvable`);
const { values: rules } = await loadFundingRules(d.tenantId);

const products = await prisma.trainingProduct.findMany({
  where: { tenantId: d.tenantId },
  select: { id: true, code: true, title: true, theme: true, isActive: true, fundingType: true, durationHours: true,
    modules: { select: { diagnosticSignals: true, excludedFromClientOutputs: true } } },
});
const catalogue: CatalogueEntry[] = products.map((p) => {
  const allowed = p.modules.filter((m) => !m.excludedFromClientOutputs);
  return {
    productId: p.id, code: p.code, title: p.title, theme: p.theme, isActive: p.isActive,
    fundingType: p.fundingType, durationHours: p.durationHours,
    signals: allowed.flatMap((m) => (Array.isArray(m.diagnosticSignals) ? (m.diagnosticSignals as unknown[]).map(String) : [])),
    hasExcludedModule: p.modules.some((m) => m.excludedFromClientOutputs),
  };
});

const audit = buildAuditData({
  reference: d.reference, agencyName: 'sonde', generatedAt: new Date(), variant: d.variant,
  answers: d.answers.map((a) => ({ questionId: a.questionId, value: a.value, isSkipped: a.isSkipped })),
  participants: d.participants.map((p) => ({ ...p, caN1: p.caN1 === null ? null : Number(p.caN1), objectiveCa: p.objectiveCa === null ? null : Number(p.objectiveCa), trainings24mFunded: p.trainings24mFunded === null ? null : Number(p.trainings24mFunded) })),
  rules, of: { name: 'x', siret: null, numDA: null, address: null, email: null, phone: null }, valueEuros: 3000,
});

const out = recommendProgrammes({
  chapterScores: audit.chapterScores.map((c) => ({ chapter: c.chapter, score: c.score })),
  alerts: audit.chapters.flatMap((c) => c.alerts),
  catalogue,
});

const actifs = catalogue.filter((c) => c.isActive);
const actifsAvecSignaux = actifs.filter((c) => c.signals.length > 0);
console.log(`\n=== ${ref} — ${actifs.length} produits actifs, dont ${actifsAvecSignaux.length} porteurs de signaux ===`);
if (actifsAvecSignaux.length === 0) {
  console.log(
    "⚠  Aucun produit ACTIF ne porte de signal diagnostic : tous les rapprochements\n" +
      "   se feront par lexique, donc badgés « à vérifier ». Les signaux du catalogue\n" +
      "   diag sont rangés sous les conteneurs inactifs PROD-0675..0680 — les relier aux\n" +
      "   programmes réellement vendus est une décision de catalogue, pas de code.",
  );
}
console.log();
for (const r of out.recommendations) {
  console.log(`● ${r.need.code} [${r.need.families.join('>')}] — ${r.need.label}`);
  if (r.candidates.length === 0) console.log('    (aucun candidat)');
  for (const c of r.candidates) {
    console.log(`    ${c.code.padEnd(14)} ${c.matchSource.padEnd(8)} ${c.confidence.padEnd(7)} score=${String(c.score).padStart(2)} ${c.title.slice(0, 70)}`);
  }
}
console.log('\n--- notices ---');
for (const n of out.notices) console.log('  ·', n);
await prisma.$disconnect();
