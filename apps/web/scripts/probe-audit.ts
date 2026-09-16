/**
 * Le rapport d'audit RENDU, sur un dossier réel — pour être relu (lot I-2).
 *
 *   pnpm --filter @qualiof/web probe:audit:local DIAG-R001 [suffixe]
 *
 * 100 % lecture. Aucune écriture en base, aucun `Document` créé, aucun dépôt
 * MinIO. Le HTML est écrit dans `.planning/` et rien d'autre ne bouge.
 *
 * Pourquoi elle existe : l'audit est le document commercial principal de
 * Laurent, et il n'était lisible qu'en lançant l'application et en cliquant. Le
 * relire avant de toucher à une de ses pages — ce qu'a demandé l'arbitrage du
 * 16/09/2026 sur la page financement — supposait de pouvoir le sortir.
 */
import { writeFileSync } from 'node:fs';
import * as path from 'node:path';

import { prisma } from '@qualiof/db';

import { buildAuditData } from '../src/lib/diagnostic-r1/audit-builder';
import { renderAuditHtml } from '../src/lib/diagnostic-r1/templates/audit-template';
import { loadFundingRules } from '../src/lib/financement/load-rules';
import { nomAgence } from '../src/lib/nom-agence';

const ref = process.argv[2] ?? 'DIAG-R001';
const suffixe = process.argv[3] ?? '';

function ouTourne(): string {
  const url = process.env.DATABASE_URL ?? '';
  const m = /@([^/:]+)(?::\d+)?\/([^?]+)/.exec(url);
  if (!m) return 'base INCONNUE';
  const [, hote, base] = m;
  return `${/localhost|127\.0\.0\.1/.test(hote!) ? 'LOCALE' : 'DISTANTE'} — ${base} @ ${hote}`;
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

const audit = buildAuditData({
  reference: d.reference,
  agencyName: nomAgence(d),
  generatedAt: new Date(),
  variant: d.variant,
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

const f = audit.funding;
console.log(`\n=== BASE : ${ouTourne()} ===`);
console.log(`=== ${ref} (${d.id}) — ${audit.agencyName}\n`);
console.log(`Page 17 — Votre potentiel de financement, les trois tuiles :`);
console.log(`  Volume proposé ..... ${f.halfDays} demi-journées · dans vos locaux`);
console.log(`  Pris en charge ..... ${f.totalCoverage.toFixed(2)} €`);
console.log(`  Reste à charge ..... ${f.totalRemainder.toFixed(2)} € sur ${f.totalPrice.toFixed(2)} € HT`);
console.log(`  (le compte se referme : ${(f.totalCoverage + f.totalRemainder).toFixed(2)} € = prix HT)`);
// Les valeurs qui NE sont plus affichées mais qui n'ont pas bougé — la sonde
// les rappelle pour que le relecteur vérifie qu'on a retiré un mot, pas un
// nombre (ligne rouge §8.1).
console.log(`  [non affiché, intact] ${f.conventionedHours} h conventionnées · ${f.onsiteHours} h sur site`);
console.log(`  AGEFICE ............ ${f.agefice.participantCount} agent(s) · droits ${f.agefice.budget.toFixed(2)} €`);
console.log(`  OPCO EP ............ ${f.opcoEp.participantCount} salarié(s) · droits ${f.opcoEp.budget.toFixed(2)} €`);

const out = path.resolve(process.cwd(), `../../.planning/${ref}-audit${suffixe}.html`);
writeFileSync(out, renderAuditHtml(audit), 'utf8');
console.log(`\n  Rapport écrit pour relecture : ${path.relative(process.cwd(), out)}\n`);

await prisma.$disconnect();
