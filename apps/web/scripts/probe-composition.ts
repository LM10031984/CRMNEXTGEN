/**
 * La chaîne de composition jouée sur un diagnostic RÉEL (lot I-2).
 *
 *   pnpm --filter @qualiof/web probe:composition            # DIAG-0001
 *   pnpm --filter @qualiof/web probe:composition:local DIAG-0002
 *
 * 100 % lecture. Aucune écriture, aucun document généré, aucun produit créé.
 *
 * Ce qu'elle vérifie, et qu'aucun test unitaire ne peut vérifier : que sur les
 * VRAIES données, le parcours composé tient debout — plusieurs programmes
 * sources, chaque module rattaché à une réponse du dirigeant, un volume en
 * multiple du bloc de 8 h, et un total de devis égal au total de la proposition
 * au centime.
 *
 * Le programme Qualiopi produit est écrit à côté, en Markdown, pour être relu.
 */
import { writeFileSync } from 'node:fs';
import * as path from 'node:path';

import { prisma } from '@qualiof/db';

import { buildAuditData } from '../src/lib/diagnostic-r1/audit-builder';
import { loadFundingRules } from '../src/lib/financement/load-rules';
import { seedContent, seedPricing, conventionedHoursOf } from '../src/lib/proposition/builder';
import { buildComposedProgramme } from '../src/lib/proposition/composed-programme';
import { computePricing } from '../src/lib/proposition/pricing';
import { buildQuoteDrafts } from '../src/lib/proposition/quotes';
import type { LibraryModule } from '../src/lib/proposition/module-matcher';

const ref = process.argv[2] ?? 'DIAG-0001';

const d = await prisma.diagnostic.findFirst({
  where: { reference: ref },
  select: {
    id: true, reference: true, variant: true, tenantId: true,
    organization: { select: { legalName: true } },
    answers: { select: { questionId: true, value: true, isSkipped: true } },
    participants: { orderBy: { createdAt: 'asc' }, select: { id: true, displayName: true, statut: true, caN1: true, objectiveCa: true, strengths: true, priorityNeed: true, opcoEligible: true, trainings24mFunded: true, includedInProposal: true } },
  },
});
if (!d) throw new Error(`${ref} introuvable`);

const { values: rules } = await loadFundingRules(d.tenantId);
const tenant = await prisma.tenant.findFirst({ where: { id: d.tenantId }, select: { name: true } });

const products = await prisma.trainingProduct.findMany({
  where: { tenantId: d.tenantId },
  select: {
    id: true, code: true, title: true, theme: true, isActive: true, fundingType: true,
    supersededByProductId: true,
    prerequisites: true, targetAudience: true, pedagogicalMethods: true,
    evaluationMethods: true, accessibility: true, trainerProfile: true,
    pedagogicalSupport: true, accessConditions: true,
    modules: {
      orderBy: { order: 'asc' },
      select: {
        id: true, title: true, contentMd: true, family: true, targetProfile: true,
        durationMin: true, diagnosticSignals: true, needIdentification: true,
        isFoundation: true, excludedFromClientOutputs: true,
      },
    },
  },
});
const codeById = new Map(products.map((p) => [p.id, p.code]));

const library: LibraryModule[] = products.flatMap((p) =>
  p.modules.map((m) => ({
    moduleId: m.id,
    title: m.title,
    family: m.family,
    targetProfile: m.targetProfile,
    signals: Array.isArray(m.diagnosticSignals) ? (m.diagnosticSignals as unknown[]).map(String) : [],
    needIdentification: m.needIdentification,
    isFoundation: m.isFoundation,
    durationMin: m.durationMin,
    excludedFromClientOutputs: m.excludedFromClientOutputs,
    source: {
      productId: p.id, code: p.code, title: p.title, theme: p.theme,
      fundingType: p.fundingType, isActive: p.isActive,
      supersededBy: p.supersededByProductId
        ? (codeById.get(p.supersededByProductId) ?? p.supersededByProductId)
        : null,
    },
  })),
);

const participants = d.participants.map((p) => ({
  ...p,
  caN1: p.caN1 === null ? null : Number(p.caN1),
  objectiveCa: p.objectiveCa === null ? null : Number(p.objectiveCa),
  trainings24mFunded: p.trainings24mFunded === null ? null : Number(p.trainings24mFunded),
}));
const retenus = participants.filter((p) => p.includedInProposal);
const agencyName = d.organization?.legalName ?? 'Agence';

const audit = buildAuditData({
  reference: d.reference, agencyName, generatedAt: new Date(), variant: d.variant,
  answers: d.answers.map((a) => ({ questionId: a.questionId, value: a.value, isSkipped: a.isSkipped })),
  participants,
  rules,
  of: { name: tenant?.name ?? 'OF', siret: null, numDA: null, address: null, email: null, phone: null },
  valueEuros: 3000,
});

const { content, composition, match } = seedContent({
  audit, rules, library, agencyName,
  diagnosticReference: d.reference,
  meetingAt: null,
  ofName: tenant?.name ?? 'OF',
  participantCount: retenus.length,
});

// ── Le parcours ──────────────────────────────────────────────────────────────
console.log(`\n=== ${ref} — ${agencyName} · bibliothèque de ${match.libraryModuleCount} modules ===\n`);
console.log(`Enveloppe dimensionnée par le moteur budget : ${audit.funding.halfDays} demi-journées`);
console.log(`Parcours COMPOSÉ                            : ${composition.totalHalfDays} demi-journées`);
console.log(`  → ${composition.totalOnSiteHours} h sur site · ${composition.totalConventionedHours} h CONVENTIONNÉES`);
console.log(`  → surplus d'enveloppe non facturé : ${composition.spareHalfDays} demi-journée(s)\n`);

for (const block of composition.blocks) {
  const remplissage = Math.round((block.onSiteMinutes / block.onSiteCapacityMinutes) * 100);
  console.log(`● Demi-journée ${block.index} — ${block.onSiteMinutes}/${block.onSiteCapacityMinutes} min sur site (${remplissage} %) · ${block.conventionedHours} h conventionnées`);
  for (const m of block.modules) {
    console.log(`    ${m.title.slice(0, 56).padEnd(56)} ${String(m.durationMin).padStart(3)}min  ← ${m.source.code}`);
    console.log(`      besoin  : ${m.need.label}`);
    const citation = m.evidence.flatMap((e) =>
      e.kind === 'alerte' ? e.answers.map((a) => `${a.label} = ${a.value}`) : [`${e.label} = ${e.value}`],
    )[0];
    console.log(`      réponse : ${citation ?? '⚠ AUCUNE — ce module ne devrait pas être là'}`);
  }
  console.log();
}

console.log(`--- ${composition.sourceProgrammes.length} programmes sources : ${composition.sourceProgrammes.map((s) => s.code).join(', ')}`);
for (const u of composition.uncovered) console.log(`--- non couvert : ${u.label} (${u.reason})`);

// ── Le chiffrage, et l'égalité au centime ────────────────────────────────────
const pricing = seedPricing({
  funding: audit.funding, rules, agencyName,
  organizationSiret: null, organizationAddress: null,
  participants: retenus.map((p) => ({ id: p.id, displayName: p.displayName, statut: p.statut })),
  halfDaysSold: composition.totalHalfDays,
});
const synthesis = computePricing({ pricing, rules });
const quotes = buildQuoteDrafts({ pricing, synthesis, rules, validUntil: null });
const sommeDevis = quotes.reduce((s, q) => s + q.lines.reduce((n, l) => n + l.quantity * l.unitPriceHt, 0), 0);

console.log('\n=== Chiffrage ===');
console.log(`  volume vendu        : ${synthesis.halfDaysMax} demi-journées`);
console.log(`  heures conv. (dérivées) : ${conventionedHoursOf(synthesis.halfDaysMax, rules)} h`);
console.log(`  coût pédagogique    : ${synthesis.totalHt.toFixed(2)} € HT`);
console.log(`  prise en charge     : ${synthesis.totalCoverage.toFixed(2)} €`);
console.log(`  reste à charge      : ${synthesis.finalRemainder.toFixed(2)} €`);
console.log(`  Σ devis (${quotes.length})        : ${sommeDevis.toFixed(2)} €`);
console.log(`  Σ devis = Σ proposition ? ${Math.abs(sommeDevis - synthesis.totalHt) < 0.005 ? '✅ au centime' : `❌ écart de ${(sommeDevis - synthesis.totalHt).toFixed(2)} €`}`);

const axesHalfDays = content.axes.reduce((s, a) => s + a.halfDays, 0);
console.log(`  le parcours détaille ${axesHalfDays} demi-journées pour ${synthesis.halfDaysMax} vendues ${axesHalfDays === synthesis.halfDaysMax ? '✅' : '❌'}`);

// ── Le programme Qualiopi ────────────────────────────────────────────────────
const usedCodes = new Set(composition.blocks.flatMap((b) => b.modules.map((m) => m.source.code)));
const programme = buildComposedProgramme({
  composition, rules, agencyName, diagnosticReference: d.reference,
  sources: products.filter((p) => usedCodes.has(p.code)).map((p) => ({
    code: p.code, title: p.title, prerequisites: p.prerequisites,
    targetAudience: p.targetAudience, pedagogicalMethods: p.pedagogicalMethods,
    evaluationMethods: p.evaluationMethods, accessibility: p.accessibility,
    trainerProfile: p.trainerProfile, pedagogicalSupport: p.pedagogicalSupport,
    accessConditions: p.accessConditions,
  })),
  fallback: {
    prerequisites: null, targetAudience: null, pedagogicalMethods: null,
    evaluationMethods: null, accessibility: null, trainerProfile: null,
    pedagogicalSupport: null, accessConditions: null,
  },
  moduleContent: new Map(products.flatMap((p) => p.modules.map((m) => [m.id, m.contentMd] as const))),
  moduleNeedIdentification: new Map(
    products.flatMap((p) =>
      p.modules.map((m) => [m.id, m.needIdentification ?? ''] as const),
    ),
  ),
});

console.log('\n=== Programme Qualiopi du produit composé ===');
console.log(`  titre        : ${programme.title}`);
console.log(`  durationHours: ${programme.durationHours} h CONVENTIONNÉES (${programme.onSiteHours} h sur site)`);
console.log(`  objectifs    : ${programme.objectives.length}`);
for (const o of programme.objectives) console.log(`    - ${o}`);
for (const w of programme.warnings) console.log(`  ⚠ ${w}`);

const out = path.resolve(process.cwd(), `../../.planning/${ref}-programme-compose.md`);
writeFileSync(out, `${programme.programMd}\n`, 'utf8');
console.log(`\n  Programme écrit pour relecture : ${path.relative(process.cwd(), out)}\n`);

console.log('--- notices de composition ---');
for (const n of [...match.notices, ...composition.notices]) console.log('  ·', n);

await prisma.$disconnect();
