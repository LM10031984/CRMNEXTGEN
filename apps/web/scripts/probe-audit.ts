/**
 * Le rapport d'audit RENDU, sur un dossier réel — pour être relu.
 *
 *   pnpm --filter @qualiof/web probe:audit:local            # DIAG-R001
 *   pnpm --filter @qualiof/web probe:audit:local DIAG-0001 -AVANT
 *
 * 100 % lecture. Aucune écriture en base, aucun `Document` créé, aucun dépôt
 * MinIO, aucun envoi. Le HTML est écrit dans `.planning/` et rien d'autre ne
 * bouge.
 *
 * ## Pourquoi elle existe, et pourquoi elle reste
 *
 * L'audit est le **document commercial principal** de Start Academy : 17 pages,
 * valorisé 3 000 €, remis au dirigeant en R2. Et jusqu'au 16/09/2026 il n'était
 * lisible qu'en **montant toute la pile** — base, application, navigateur,
 * clics. C'est très probablement pourquoi les défauts qu'on y a trouvés l'ont
 * été *par accident* plutôt que par relecture : personne ne relit ce qu'il faut
 * déployer pour voir.
 *
 * > Une pièce client qui ne se rend pas hors application ne se relit pas, et ce
 * > qui ne se relit pas dérive.
 *
 * Elle n'est donc pas un outil jetable : elle se range à côté de
 * `probe-composition.ts`, et elle porte la même **bannière de provenance**
 * (§4 terdecies). Un rapport d'audit sorti d'ici ressemble trait pour trait à
 * celui qu'on remet à un client — c'est exactement ce qui a fait relire à
 * Laurent, le 14/09, un programme composé qui n'était pas le sien.
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

/**
 * La bannière — VISIBLE, et en tête du document (§4 terdecies).
 *
 * Pas un commentaire HTML : un commentaire ne se lit pas, et le risque ici
 * n'est pas qu'on ignore d'où vient le fichier — c'est qu'on ne se pose PAS la
 * question, parce que le document a l'air vrai. Elle reste donc visible à
 * l'impression : une sortie de sonde ne doit jamais pouvoir passer pour la
 * pièce remise.
 */
const banniere = `<div style="background:#7f1d1d;color:#fff;padding:10px 14px;font:600 12pt/1.4 system-ui,sans-serif">
  ⚠ SORTIE DE SONDE — ne pas remettre à un client.<br>
  <span style="font-weight:400;font-size:10pt">
    Base : ${ouTourne()} · Dossier : ${ref} (${d.id}) · Agence : ${audit.agencyName}<br>
    Généré le ${new Date().toISOString()} par <code>probe:audit:local</code>.
    Une référence lisible ne désigne pas le même dossier d’une base à l’autre.
  </span>
</div>`;

const html = renderAuditHtml(audit).replace(/(<body[^>]*>)/i, `$1\n${banniere}`);
if (!html.includes('SORTIE DE SONDE')) {
  throw new Error('La bannière de provenance n’a pas pu être posée — balise <body> introuvable.');
}

const out = path.resolve(process.cwd(), `../../.planning/${ref}-audit${suffixe}.html`);
writeFileSync(out, html, 'utf8');
console.log(`\n  Rapport écrit pour relecture : ${path.relative(process.cwd(), out)}\n`);

await prisma.$disconnect();
