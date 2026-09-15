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
 * ## Le texte libre s'arrête, il ne se caviarde pas
 *
 * Les champs structurés sont sûrs par construction ; le texte libre est
 * exactement l'endroit où un nom de personne se glisse sans avoir été demandé.
 * Le script BALAYE toutes les réponses avant d'écrire et s'ARRÊTE sur ce qui
 * ressemble à un nom, une adresse, un téléphone ou un e-mail — il rend ce qu'il
 * a trouvé et attend un arbitrage, réponse par réponse
 * (`--textes-libres-arbitres=`). Il ne caviarde jamais seul : ces réponses
 * pilotent les douleurs, donc la composition.
 *
 * ## Le dossier dit ce qu'il est
 *
 * `DIAG-R001` porte la mention « COPIE PSEUDONYMISÉE — ne pas remettre » dans
 * son LIBELLÉ d'agence, celui que `nomAgence()` rend à toutes les pièces. Il
 * entre aux `deferred-items` pour suppression une fois le programme relu : une
 * base de travail n'est pas un endroit où les dossiers clients s'accumulent,
 * même pseudonymisés.
 *
 * Dry-run par défaut. `--apply` pour écrire, en local uniquement.
 */

import { PrismaClient } from '@prisma/client';

// Module PUR (aucun accès base, réseau ni fichier) : import statique sans risque.
import { balayerTextesLibres, MOTIFS, textesDe } from './lib/balayage-donnees-personnelles.js';

const APPLY = process.argv.includes('--apply');

/**
 * Les réponses dont Laurent a confirmé qu'elles sont du texte d'ENTREPRISE.
 *
 * L'arbitrage se donne réponse par réponse, et sur la ligne de commande — comme
 * `PROD_READ_URL`, pour la même raison : c'est une décision, pas un défaut. Une
 * liste écrite en dur dans le fichier se périmerait au dossier suivant en
 * gardant l'air d'être à jour.
 */
const ARBITREES = new Set(
  (process.argv.find((a) => a.startsWith('--textes-libres-arbitres='))?.slice(25) ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);
const REF_SOURCE = process.argv.find((a) => a.startsWith('--ref='))?.slice(6) ?? 'DIAG-0001';
/** Référence DISTINCTE : la locale porte déjà un DIAG-0001, qui est un autre dossier. */
const REF_CIBLE = process.argv.find((a) => a.startsWith('--ref-cible='))?.slice(12) ?? 'DIAG-R001';
const TENANT_PROD = 'db191440-a144-48d1-93c1-767e6f647f2c';

/**
 * Le dossier porte dans son LIBELLÉ ce qu'il est.
 *
 * Pas dans un champ technique, pas dans une note de bas de page : dans le nom
 * d'agence lui-même, parce que c'est `nomAgence()` — résolution UNIQUE, celle
 * de la production (§4 bis) — qui titre la proposition, le programme composé et
 * toute pièce qui sortirait d'ici. Une mention posée ailleurs ne suivrait pas
 * le document ; celle-ci ne peut pas s'en détacher.
 *
 * C'est la leçon du 14/09 (§4 terdecies) poussée d'un cran : un programme
 * composé en local s'est relu comme celui de la production. L'en-tête de
 * provenance de la sonde coiffe le FICHIER ; ceci marque la DONNÉE. Un dossier
 * pseudonymisé qui ressemble à un vrai dossier finit par être traité comme un
 * vrai dossier.
 */
const LIBELLE_AGENCE = 'Agence A (COPIE PSEUDONYMISÉE — ne pas remettre)';

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
/**
 * §4 quater — un compte sans sa POPULATION n'est pas un relevé.
 *
 * « 490 modules » et « 402 modules » se sont contredits le 15/09/2026. Aucun
 * des deux n'était faux : la BASE porte tout ce qui y a jamais été importé,
 * la BIBLIOTHÈQUE DU DRIVE n'en est qu'une origine parmi d'autres. C'est le cas
 * d'école du tableau de §4 quater — « 41 publiés contre 51 en base, les deux
 * justes » — et il a coûté le même quart d'heure de doute.
 *
 * Et la garde comptait la MAUVAISE population : 490 modules dont aucun ne
 * viendrait du Drive passeraient le seuil sans qu'aucun ne soit composable.
 * Elle porte désormais sur la bibliothèque elle-même.
 */
const modulesTotal = await cible.trainingModule.count();
const parOrigine = async (prefixe: string): Promise<number> =>
  cible.trainingModule.count({ where: { sourceRef: { startsWith: prefixe } } });
const [modulesDrive, modulesFaros, modulesDiag] = await Promise.all([
  parOrigine('drive:'),
  parOrigine('faros:'),
  parOrigine('diag:'),
]);
const modulesBibliotheque = modulesDrive + modulesFaros;
if (modulesBibliotheque < 300) {
  console.error(
    `\n⛔ La CIBLE porte ${modulesTotal} modules, mais seulement ${modulesBibliotheque} issus de la\n` +
      `   bibliothèque (Drive + Faros). Sans elle, composer n'a aucun sens.\n` +
      `   Lancer d'abord : pnpm --filter @qualiof/db run import:drive-catalog:local -- --apply\n`,
  );
  process.exit(1);
}

console.log(`\n🛡  SOURCE (lecture seule) : ${baseDe(URL_SOURCE)} @ ${hoteDe(URL_SOURCE)}`);
console.log(`    tenant « ${tenantSource.name} » · ${produitsSource} produits`);
console.log(`🛡  CIBLE  (écriture)      : ${baseDe(URL_CIBLE)} @ ${hoteCible}`);
console.log(`    ${modulesTotal} modules — POPULATION : TOUS les TrainingModule de la base,`);
console.log(`      toutes origines confondues. Ce n'est PAS le compte de la bibliothèque :`);
console.log(`        ${String(modulesDrive).padStart(4)} instantané Drive     (sourceRef « drive:… »)`);
console.log(`        ${String(modulesFaros).padStart(4)} Faros                (« faros:… »)`);
console.log(`        ${String(modulesDiag).padStart(4)} catalogue diagnostic (« diag:… »)`);
console.log(
  `        ${String(modulesTotal - modulesBibliotheque - modulesDiag).padStart(4)} hors import          (sourceRef nul)`,
);

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
  (a) => LIBRE.has(a.questionId) || textesDe(a.value).some((t) => t.trim().length > 25),
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
console.log(`  Agence     → « ${LIBELLE_AGENCE} »`);
console.log(`               (Lead.notes — donc nomAgence(), donc TOUT titre issu de ce dossier)`);
console.log(`  Contact    → aucun nom, aucun email, aucun téléphone`);
for (const [i] of d.participants.entries()) console.log(`  Fiche #${i + 1}   → « Personne ${i + 1} »`);

console.log(`\n=== RÉPONSES EN TEXTE LIBRE — à relire, elles descendent VERBATIM ===`);
if (libres.length === 0) console.log('  (aucune)');
for (const a of libres) {
  console.log(`  • ${a.questionId}\n      ${JSON.stringify(a.value)}`);
}

// ── Le balayage, et il s'arrête ─────────────────────────────────────────────
//
// Les champs STRUCTURÉS sont sûrs par construction — un enum, un nombre, un
// booléen ne portent pas le nom de quelqu'un. Le texte libre, si : c'est là
// qu'un « j'en ai parlé à Sophie » se glisse sans que le formulaire l'ait
// demandé. Sur CE dossier il n'y en a aucun ; le garde s'écrit quand même
// maintenant, parce qu'au deuxième import personne ne relira trois réponses.
//
// Il balaye TOUTES les réponses, pas seulement les trois longues : un prénom
// tient en six lettres et passerait sous le seuil des 25 caractères.
const trouvailles = balayerTextesLibres(
  d.answers.map((a) => ({ questionId: a.questionId, valeur: a.value })),
);
const nonArbitrees = trouvailles.filter((t) => !ARBITREES.has(t.questionId));

console.log(`\n=== BALAYAGE — ce qui a été CHERCHÉ, pas seulement trouvé (§4 quater) ===`);
for (const m of MOTIFS) console.log(`  · ${m.genre.padEnd(9)} ${m.libelle}`);
console.log(
  `  ${d.answers.length} réponses balayées jusqu'aux feuilles JSON · ${trouvailles.length} trouvaille(s)` +
    (ARBITREES.size > 0 ? ` · ${ARBITREES.size} réponse(s) arbitrée(s)` : ''),
);

if (trouvailles.length > 0) {
  console.log(`\n=== TROUVAILLES ===`);
  for (const t of trouvailles) {
    const etat = ARBITREES.has(t.questionId) ? '✓ arbitrée' : '⛔ À ARBITRER';
    console.log(
      `  ${etat.padEnd(13)} ${t.questionId.padEnd(24)} ${t.genre.padEnd(9)} « ${t.extrait} »  ← ${t.motif}`,
    );
  }
}

if (nonArbitrees.length > 0) {
  const aArbitrer = [...new Set(nonArbitrees.map((t) => t.questionId))];
  console.error(
    `\n⛔ ${nonArbitrees.length} trouvaille(s) NON ARBITRÉE(S). Rien ne sera écrit.\n\n` +
      `   Le script ne caviarde pas tout seul : un caviardage automatique sur du texte\n` +
      `   métier en abîmerait le sens, et ces réponses pilotent les douleurs, donc la\n` +
      `   composition. Une ambiguïté tranchée au hasard est une écriture qu'on ne peut\n` +
      `   plus relire.\n\n` +
      `   Relire les extraits ci-dessus. Pour celles qui sont bien du texte d'entreprise :\n` +
      `     --textes-libres-arbitres=${aArbitrer.join(',')}\n`,
  );
  if (APPLY) {
    await source.$disconnect();
    await cible.$disconnect();
    process.exit(1);
  }
  console.error(`   (dry-run : le rapport continue, mais --apply refusera en l'état.)\n`);
}

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
  // Le code de sortie porte le refus : un dry-run vert alors que l'apply
  // refuserait serait exactement le genre de rapport rassurant et faux que
  // §4 quater décrit.
  process.exit(nonArbitrees.length > 0 ? 1 : 0);
}

// ── Écriture ────────────────────────────────────────────────────────────────

await cible.$transaction(async (tx) => {
  if (dejaLa) await tx.diagnostic.delete({ where: { id: dejaLa.id } });
  const lead = await tx.lead.create({
    data: {
      tenantId: tenantCible.id,
      source: 'Import pseudonymisé depuis la production — prévisualisation interne',
      notes: `Agence : ${LIBELLE_AGENCE}`,
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
        libelle: LIBELLE_AGENCE,
        // Ce que le balayage a trouvé, et ce que Laurent a arbitré. Sans ça,
        // « 0 trouvaille » en base ne dit pas si on a cherché.
        balayageTrouvailles: trouvailles.length,
        textesLibresArbitres: [...ARBITREES],
      },
    },
  });
  console.log(`\n✅ APPLIQUÉ — ${REF_CIBLE} (${diag.id}) créé en local.`);
});

await source.$disconnect();
await cible.$disconnect();
