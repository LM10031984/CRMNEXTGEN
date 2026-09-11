/**
 * Ce que la recommandation propose sur un diagnostic RÉEL — au niveau MODULE.
 *
 *   pnpm --filter @qualiof/web probe:reco            # DIAG-0001
 *   pnpm --filter @qualiof/web probe:reco DIAG-0002
 *   pnpm --filter @qualiof/web probe:reco:local      # sur la base locale
 *
 * 100 % lecture. Aucune écriture, aucun document généré.
 *
 * Pourquoi cet outil existe : la recommandation dépend d'un catalogue qui vit
 * et que personne ne relit ligne à ligne. C'est en la regardant tourner sur un
 * dossier réel qu'on a vu un programme « pour activité événementielle »
 * remonter sur l'e-réputation d'une agence immobilière — pas en relisant le
 * code, et aucun test unitaire ne l'aurait attrapé, puisque le défaut était
 * dans les données. À rejouer après chaque évolution du catalogue.
 *
 * Depuis le lot I-1 (D-19), la sonde lit la BIBLIOTHÈQUE DE MODULES, et non
 * plus les produits vendus. Elle affiche pour chaque module retenu ce qui l'a
 * fait entrer — le signal du catalogue, ou les mots de son intitulé — et,
 * au-dessus de chaque axe, LA RÉPONSE du dirigeant qui l'a déclenché. C'est
 * cette chaîne réponse → besoin → module qu'un contrôle OPCO regarde.
 */
import { prisma } from '@qualiof/db';
import { buildAuditData } from '../src/lib/diagnostic-r1/audit-builder';
import { loadFundingRules } from '../src/lib/financement/load-rules';
import { recommendModules, type LibraryModule } from '../src/lib/proposition/module-matcher';
import { loadPropositionLibrary } from '../src/server/proposition-library';

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

// La bibliothèque : TOUS les modules du tenant, **quel que soit l'`isActive` de
// leur conteneur** (corollaire D-19). Filtrer ici viderait la bibliothèque de
// tout ce que l'import vient d'y mettre.
const products = await prisma.trainingProduct.findMany({
  where: { tenantId: d.tenantId },
  select: {
    id: true, code: true, title: true, theme: true, isActive: true, fundingType: true,
    supersededByProductId: true,
    modules: {
      orderBy: { order: 'asc' },
      select: {
        id: true, title: true, family: true, targetProfile: true, durationMin: true,
        diagnosticSignals: true, needIdentification: true, isFoundation: true,
        excludedFromClientOutputs: true,
      },
    },
  },
});

const codeById = new Map(products.map((p) => [p.id, p.code]));

// Le mapping vivait ici en double (puis en quadruple) : il vit désormais
// dans `server/proposition-library.ts`, sous le regard de tsc — ce
// dossier `scripts/` n'est PAS couvert par tsconfig, donc une
// divergence y reste muette jusqu'à ce qu'un dossier réel la révèle.
const library: LibraryModule[] = await loadPropositionLibrary(d.tenantId);

const audit = buildAuditData({
  reference: d.reference, agencyName: 'sonde', generatedAt: new Date(), variant: d.variant,
  answers: d.answers.map((a) => ({ questionId: a.questionId, value: a.value, isSkipped: a.isSkipped })),
  participants: d.participants.map((p) => ({ ...p, caN1: p.caN1 === null ? null : Number(p.caN1), objectiveCa: p.objectiveCa === null ? null : Number(p.objectiveCa), trainings24mFunded: p.trainings24mFunded === null ? null : Number(p.trainings24mFunded) })),
  rules, of: { name: 'x', siret: null, numDA: null, address: null, email: null, phone: null }, valueEuros: 3000,
});

const out = recommendModules({
  chapterScores: audit.chapterScores.map((c) => ({ chapter: c.chapter, score: c.score, breakdown: c.breakdown })),
  alerts: audit.chapters.flatMap((c) => c.alerts),
  answers: audit.chapters.flatMap((c) => c.answers),
  library,
});

const conteneurs = new Set(library.map((m) => m.source.productId));
const actifs = new Set(library.filter((m) => m.source.isActive).map((m) => m.source.productId));
const avecSignaux = library.filter((m) => m.signals.length > 0).length;

console.log(`\n=== ${ref} — bibliothèque : ${out.libraryModuleCount} modules dans ${conteneurs.size} rayons ===`);
console.log(`    ${avecSignaux} modules porteurs de signaux · ${actifs.size} rayons actifs, ${conteneurs.size - actifs.size} inactifs`);
console.log(`    (D-19 : l'état actif du rayon n'est PAS un critère — un rayon inactif reste lisible)\n`);

for (const r of out.recommendations) {
  console.log(`● ${r.need.code} [${r.need.families.join('>')}] — ${r.need.label}`);
  console.log(`  déclencheur : ${r.trigger.slice(0, 110)}`);

  if (r.evidence.length === 0) {
    console.log('  ⚠  aucune réponse ne documente ce besoin');
  }
  for (const e of r.evidence) {
    if (e.kind === 'alerte') {
      const cites = e.answers.map((a) => `${a.label} = ${a.value}`).join(' · ');
      console.log(`  ↳ alerte ${e.code}${cites ? ` ← ${cites}` : ' (sans réponse citable)'}`);
    } else {
      console.log(`  ↳ réponse « ${e.label} » = « ${e.value} » (${e.earned}/100 sur « ${e.note} »)`);
    }
  }

  if (r.candidates.length === 0) console.log('    (aucun module candidat)');
  for (const c of r.candidates) {
    console.log(
      `    ${c.matchSource.padEnd(8)} ${c.confidence.padEnd(7)} score=${String(c.score).padStart(2)} ${String(c.durationMin).padStart(3)}min  ${c.title.slice(0, 52).padEnd(52)} ← ${c.source.code}${c.source.isActive ? '' : ' (rayon inactif)'}`,
    );
    if (c.matchedSignals.length > 0) {
      console.log(`             signal : « ${c.matchedSignals[0]!.slice(0, 88)} »`);
    } else {
      console.log(`             mots retenus : ${c.matchedTerms.join(', ')}`);
    }
  }
  console.log();
}

const sources = new Set(out.recommendations.flatMap((r) => r.candidates.map((c) => c.source.code)));
console.log(`--- ${out.sourceProgrammeCount} programmes sources représentés : ${[...sources].join(', ')}`);
console.log('\n--- notices ---');
for (const n of out.notices) console.log('  ·', n);
await prisma.$disconnect();
