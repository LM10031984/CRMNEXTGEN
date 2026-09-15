/**
 * Monter le dossier RÉEL de la production en local, PSEUDONYMISÉ.
 *
 * ## Pourquoi, et pourquoi pas l'inverse
 *
 * Le programme composé doit être relu par Laurent sur SON dossier, pas sur le
 * jeu de démo — `DIAG-0001` désigne « Agence des Oliviers » en local et une
 * autre agence en production (§4 terdecies).
 *
 * On ne peut pas faire tourner la sonde sur la production : **la bibliothèque
 * n'y est pas**. La prod porte 86 modules sur des produits inactifs ; les 402
 * modules et les 298 rattachables vivent uniquement sur `qualiof_dev`.
 * Composer sur la prod rendrait un parcours pauvre — et c'est circulaire : on
 * ne peut pas prévisualiser le résultat du versement avant d'avoir versé.
 *
 * Donc on fait descendre le DOSSIER vers la bibliothèque, pas l'inverse.
 *
 * ## Ce qui ne quitte JAMAIS la production
 *
 * La composition est pilotée par les RÉPONSES du diagnostic, pas par les noms.
 * Ne sont donc lus NI l'identité des personnes, NI celle de l'agence :
 *
 *   • `DiagnosticParticipant.displayName`  → remplacé par « Personne N »
 *   • `.personId`, `.fonction`, `.strengths`, `.objectiveCa`  → PAS LUS
 *   • `Lead.firstName / lastName / email / phone`             → PAS LUS
 *   • `Organization` (raison sociale, SIRET, adresse)         → PAS LUE
 *
 * Ce qui descend : les réponses verbatim, et les champs STRUCTURELS des fiches
 * (statut, CA N-1, éligibilité OPCO) — ceux qui pilotent le financement, donc
 * le volume, donc la composition. Sans eux le parcours ne serait pas le même.
 *
 * ## Ce script n'écrit JAMAIS en production
 *
 * Deux connexions explicites, et chacune est PROUVÉE par un marqueur de son
 * CONTENU avant tout accès (§4 sexies) : une base ne s'identifie pas par son
 * nom. La source doit porter le tenant de production ; la cible doit être
 * locale ET porter la bibliothèque, sinon composer n'aurait aucun sens.
 *
 * Dry-run par défaut. `--apply` pour écrire, en local uniquement.
 */

import { PrismaClient } from '@prisma/client';

const APPLY = process.argv.includes('--apply');
const REF_SOURCE = process.argv.find((a) => a.startsWith('--ref='))?.slice(6) ?? 'DIAG-0001';
/** Référence DISTINCTE : la locale porte déjà un DIAG-0001, qui est un autre dossier. */
const REF_CIBLE = process.argv.find((a) => a.startsWith('--ref-cible='))?.slice(12) ?? 'DIAG-R001';
const TENANT_PROD = 'db191440-a144-48d1-93c1-767e6f647f2c';

const URL_SOURCE = process.env.PROD_READ_URL ?? '';
const URL_CIBLE = process.env.DATABASE_URL ?? '';

function hoteDe(url: string): string {
  return /@([^/:]+)(?::\d+)?\//.exec(url)?.[1] ?? '(illisible)';
}
function baseDe(url: string): string {
  return /\/([^/?]+)(\?|$)/.exec(url)?.[1] ?? '(illisible)';
}

if (!URL_SOURCE) {
  console.error(
    '\n⛔ PROD_READ_URL absente. Elle se donne EXPLICITEMENT sur la ligne de commande,\n' +
      '   jamais depuis un .env : lire la production est une décision, pas un défaut.\n',
  );
  process.exit(1);
}

const source = new PrismaClient({ datasources: { db: { url: URL_SOURCE } } });
const cible = new PrismaClient({ datasources: { db: { url: URL_CIBLE } } });

// ── Preuve des deux bases, par leur CONTENU ─────────────────────────────────

const tenantSource = await source.tenant.findFirst({
  where: { id: TENANT_PROD },
  select: { id: true, name: true },
});
const produitsSource = await source.trainingProduct.count();
if (!tenantSource) {
  console.error(`\n⛔ La SOURCE ne porte pas le tenant de production ${TENANT_PROD}. Arrêt.\n`);
  process.exit(1);
}

const hoteCible = hoteDe(URL_CIBLE);
if (!/localhost|127\.0\.0\.1/.test(hoteCible)) {
  console.error(`\n⛔ La CIBLE n'est pas locale (${hoteCible}). Ce script n'écrit qu'en local.\n`);
  process.exit(1);
}
const modulesCible = await cible.trainingModule.count();
if (modulesCible < 300) {
  console.error(
    `\n⛔ La CIBLE ne porte que ${modulesCible} modules. Sans la bibliothèque, composer n'a aucun sens.\n` +
      `   Lancer d'abord : pnpm --filter @qualiof/db run import:drive-catalog:local -- --apply\n`,
  );
  process.exit(1);
}

console.log(`\n🛡  SOURCE (lecture seule) : ${baseDe(URL_SOURCE)} @ ${hoteDe(URL_SOURCE)}`);
console.log(`    tenant « ${tenantSource.name} » · ${produitsSource} produits`);
console.log(`🛡  CIBLE  (écriture)      : ${baseDe(URL_CIBLE)} @ ${hoteCible}`);
console.log(`    ${modulesCible} modules en bibliothèque`);

// ── Lecture — strictement ce qui pilote la composition ──────────────────────

const d = await source.diagnostic.findFirst({
  where: { reference: REF_SOURCE, tenantId: TENANT_PROD },
  select: {
    id: true,
    reference: true,
    variant: true,
    mode: true,
    status: true,
    referentialVersion: true,
    meetingAt: true,
    declaredGoal: true,
    expectedParticipants: true,
    answers: { select: { questionId: true, value: true, isSkipped: true } },
    participants: {
      orderBy: { createdAt: 'asc' },
      select: {
        statut: true,
        caN1: true,
        caCurrent: true,
        opcoEligible: true,
        trainings24mCount: true,
        trainings24mHours: true,
        trainings24mFunded: true,
        wantsTraining: true,
        priorityNeed: true,
        fullTime: true,
        experienceLevel: true,
      },
    },
  },
});
if (!d) {
  console.error(`\n⛔ ${REF_SOURCE} introuvable en production.\n`);
  process.exit(1);
}

const LIBRE = new Set(['mgmt-top3-priorities', 'mgmt-top3-difficulties', 'tools-metier']);
const libres = d.answers.filter(
  (a) => LIBRE.has(a.questionId) || (typeof a.value === 'string' && a.value.length > 25),
);

console.log(`\n=== CE QUI EST LU en production (lecture seule) ===`);
console.log(`  Diagnostic  ${d.reference} (${d.id}) · ${d.variant} · ${d.status}`);
console.log(`  Réponses    ${d.answers.length} — questionId, value, isSkipped, VERBATIM`);
console.log(`  Fiches      ${d.participants.length} — champs STRUCTURELS uniquement :`);
for (const [i, p] of d.participants.entries()) {
  console.log(
    `                #${i + 1} statut=${p.statut} caN1=${p.caN1 ?? '—'} opco=${p.opcoEligible ?? '—'}`,
  );
}

console.log(`\n=== CE QUI N'EST PAS LU — reste en production ===`);
for (const l of [
  'DiagnosticParticipant.displayName · personId · fonction · strengths · objectiveCa',
  'Lead.firstName · lastName · email · phone · notes',
  'Organization — raison sociale, SIRET, adresse, représentant',
  'Proposal, Quote, Document — aucune pièce contractuelle',
]) {
  console.log(`  ✗ ${l}`);
}

console.log(`\n=== PSEUDONYMISATION appliquée à l'écriture ===`);
console.log(`  Agence     → « Agence A »        (Lead.notes = « Agence : Agence A »)`);
console.log(`  Contact    → aucun nom, aucun email, aucun téléphone`);
for (const [i] of d.participants.entries()) console.log(`  Fiche #${i + 1}   → « Personne ${i + 1} »`);

console.log(`\n=== RÉPONSES EN TEXTE LIBRE — à relire, elles descendent VERBATIM ===`);
if (libres.length === 0) console.log('  (aucune)');
for (const a of libres) {
  console.log(`  • ${a.questionId}\n      ${JSON.stringify(a.value)}`);
}
console.log(
  `\n  ⚠ Ce sont les seules valeurs saisies à la main. Aucune ne contient de nom de\n` +
    `    personne — relevé le 15/09/2026 — mais c'est à Laurent de le confirmer.`,
);

// ── Cible : ce qui serait écrit ─────────────────────────────────────────────

const tenantCible = await cible.tenant.findFirst({ select: { id: true, name: true } });
const ownerCible = await cible.user.findFirst({
  where: { role: 'ADMIN' },
  select: { id: true, email: true },
});
if (!tenantCible || !ownerCible) {
  console.error('\n⛔ La cible locale n’a ni tenant ni utilisateur ADMIN. Lancer `pnpm db:seed`.\n');
  process.exit(1);
}
const dejaLa = await cible.diagnostic.findFirst({
  where: { reference: REF_CIBLE },
  select: { id: true },
});

console.log(`\n=== CE QUI SERAIT ÉCRIT — en local uniquement ===`);
console.log(`  cible tenant « ${tenantCible.name} » (${tenantCible.id}) · owner ${ownerCible.email}`);
console.log(`  Lead                    1 ligne   (pseudonymisé)`);
console.log(`  Diagnostic              1 ligne   reference = « ${REF_CIBLE} »`);
console.log(`  DiagnosticAnswer        ${String(d.answers.length).padEnd(2)} lignes  (verbatim)`);
console.log(`  DiagnosticParticipant   ${String(d.participants.length).padEnd(2)} lignes  (« Personne N »)`);
console.log(`  AuditLog                1 ligne   (trace de l'import)`);
console.log(
  `  ciblage { reference: '${REF_CIBLE}', tenantId: '${tenantCible.id}' }` +
    (dejaLa ? ` — ⚠ EXISTE DÉJÀ (${dejaLa.id}), il sera REMPLACÉ` : ' — création'),
);
console.log(`\n  Le DIAG-0001 local (« Agence des Oliviers ») n'est PAS touché.`);

if (!APPLY) {
  console.log(`\n⏸  DRY-RUN — rien n'a été écrit. Relancer avec --apply pour appliquer.\n`);
  await source.$disconnect();
  await cible.$disconnect();
  process.exit(0);
}

// ── Écriture ────────────────────────────────────────────────────────────────

await cible.$transaction(async (tx) => {
  if (dejaLa) await tx.diagnostic.delete({ where: { id: dejaLa.id } });
  const lead = await tx.lead.create({
    data: {
      tenantId: tenantCible.id,
      source: 'Import pseudonymisé depuis la production',
      notes: 'Agence : Agence A',
      ownerUserId: ownerCible.id,
    },
    select: { id: true },
  });
  const diag = await tx.diagnostic.create({
    data: {
      tenantId: tenantCible.id,
      reference: REF_CIBLE,
      leadId: lead.id,
      ownerUserId: ownerCible.id,
      variant: d.variant,
      mode: d.mode,
      status: d.status,
      referentialVersion: d.referentialVersion,
      meetingAt: d.meetingAt,
      declaredGoal: d.declaredGoal,
      expectedParticipants: d.expectedParticipants,
    },
    select: { id: true },
  });
  for (const a of d.answers) {
    await tx.diagnosticAnswer.create({
      data: {
        diagnosticId: diag.id,
        questionId: a.questionId,
        value: a.value === null ? undefined : (a.value as never),
        isSkipped: a.isSkipped,
        origin: 'COMMERCIAL',
      },
    });
  }
  for (const [i, p] of d.participants.entries()) {
    await tx.diagnosticParticipant.create({
      data: {
        diagnosticId: diag.id,
        displayName: `Personne ${i + 1}`,
        statut: p.statut,
        caN1: p.caN1,
        caCurrent: p.caCurrent,
        opcoEligible: p.opcoEligible,
        trainings24mCount: p.trainings24mCount,
        trainings24mHours: p.trainings24mHours,
        trainings24mFunded: p.trainings24mFunded,
        wantsTraining: p.wantsTraining,
        priorityNeed: p.priorityNeed,
        fullTime: p.fullTime,
        experienceLevel: p.experienceLevel,
        includedInProposal: true,
      },
    });
  }
  await tx.auditLog.create({
    data: {
      tenantId: tenantCible.id,
      userId: ownerCible.id,
      entity: 'Diagnostic',
      entityId: diag.id,
      action: 'diagnostic.import_pseudonymise',
      diff: {
        sourceReference: d.reference,
        sourceId: d.id,
        answers: d.answers.length,
        participants: d.participants.length,
        pseudonymise: true,
      },
    },
  });
  console.log(`\n✅ APPLIQUÉ — ${REF_CIBLE} (${diag.id}) créé en local.`);
});

await source.$disconnect();
await cible.$disconnect();
