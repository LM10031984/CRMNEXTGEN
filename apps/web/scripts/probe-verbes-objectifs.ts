/**
 * Ce que changerait une reconstruction RAISONNÉE de `TITLE_VERBS` (lot I-2).
 *
 *   pnpm --filter @qualiof/web probe:verbes-objectifs:local
 *
 * 100 % lecture. Aucune écriture, aucune liste appliquée. La sonde REND le
 * relevé ; la décision d'appliquer appartient à Laurent.
 *
 * ## Pourquoi cette sonde existe
 *
 * `TITLE_VERBS` est une liste blanche élargie AU CAS PAR CAS, sur preuve. Le
 * procédé est sain une fois, discutable deux fois, et intenable trois fois :
 * `conduire`/`mener`/`repondre` ont été ajoutés le 14/09/2026 ; `appliquer` et
 * `elaborer` — deux verbes de la taxonomie de Bloom, ceux-là mêmes qu'on
 * enseigne pour RÉDIGER un objectif pédagogique — ont été refusés le 15/09.
 *
 * Une liste qu'on élargit au goutte-à-goutte à chaque refus coûte plus cher
 * qu'elle ne protège : chaque goutte est un faux négatif déjà payé par une
 * relecture humaine, et rien ne dit quand la fuite s'arrête.
 *
 * La réponse n'est pas « deux mots de plus ». C'est de donner à la liste une
 * STRUCTURE, pour que la question « faut-il ajouter ce verbe ? » ait une
 * réponse de principe et non un arbitrage de plus :
 *
 *   • bloc A — le socle TAXONOMIQUE (Bloom révisé et ses déclinaisons
 *     françaises), six niveaux, qui ne dépend pas de notre corpus ;
 *   • bloc B — les verbes de l'ACTE PROFESSIONNEL, que nulle taxonomie ne
 *     porte parce qu'ils décrivent le métier visé et pas l'opération mentale ;
 *   • bloc C — les verbes NON OBSERVABLES, conservés par compatibilité et
 *     nommés comme tels. C'est la dette, et elle est écrite.
 *
 * ## Ce que la sonde mesure, et pourquoi ce chiffre-là
 *
 * Deux nombres, et le second décide (arbitrage Laurent, 15/09/2026) :
 *
 *   ① combien de titres passent de « à rédiger » à « objectif » — le gain ;
 *   ② combien de titres DOUTEUX passeraient qui ne passaient pas — le coût.
 *
 * L'asymétrie reste entière : un faux négatif coûte une relecture, un faux
 * positif imprime une coquille sur une pièce qui part au financeur. La liste
 * doit donc continuer de pencher vers le refus — ce qui change, c'est qu'elle
 * penche pour une RAISON et non par accident de recensement.
 */
import { prisma } from '@qualiof/db';

import { TITLE_VERBS, premierMot } from '../src/lib/proposition/composed-programme';
import { isAnimable } from '../src/lib/proposition/module-matcher';
import { loadPropositionLibrary } from '../src/server/proposition-library';

const ref = process.argv[2] ?? 'DIAG-R001';

function ouTourne(): string {
  const url = process.env.DATABASE_URL ?? '';
  const m = /@([^/:]+)(?::\d+)?\/([^?]+)/.exec(url);
  if (!m) return 'base INCONNUE (DATABASE_URL illisible)';
  const [, hote, base] = m;
  return `${/localhost|127\.0\.0\.1/.test(hote!) ? 'LOCALE' : 'DISTANTE'} — ${base} @ ${hote}`;
}

// ── Le candidat, en trois blocs ─────────────────────────────────────────────

/**
 * Bloc A — socle taxonomique. Bloom révisé (Anderson & Krathwohl) et les
 * listes de verbes opérationnels de ses déclinaisons françaises. Six niveaux.
 * Il ne se déduit PAS de notre catalogue : c'est ce qui le rend stable.
 */
const BLOOM: Record<string, readonly string[]> = {
  '1 · Mémoriser': ['citer', 'decrire', 'definir', 'enumerer', 'identifier', 'lister', 'nommer', 'rappeler', 'reconnaitre', 'relever', 'reperer', 'situer'],
  '2 · Comprendre': ['associer', 'classer', 'comparer', 'comprendre', 'distinguer', 'expliquer', 'illustrer', 'interpreter', 'reformuler', 'resumer', 'synthetiser', 'traduire'],
  '3 · Appliquer': ['adapter', 'appliquer', 'calculer', 'conduire', 'demontrer', 'employer', 'executer', 'manipuler', 'mener', 'mettre', 'pratiquer', 'realiser', 'resoudre', 'simuler', 'transposer', 'utiliser'],
  '4 · Analyser': ['analyser', 'auditer', 'decomposer', 'diagnostiquer', 'differencier', 'examiner', 'explorer', 'questionner', 'tester', 'tracer'],
  '5 · Évaluer': ['apprecier', 'arbitrer', 'argumenter', 'choisir', 'controler', 'critiquer', 'evaluer', 'hierarchiser', 'juger', 'justifier', 'mesurer', 'prioriser', 'recommander', 'selectionner', 'valider', 'verifier'],
  '6 · Créer': ['assembler', 'batir', 'composer', 'concevoir', 'construire', 'creer', 'developper', 'elaborer', 'etablir', 'formaliser', 'formuler', 'generer', 'inventer', 'organiser', 'planifier', 'preparer', 'produire', 'proposer', 'rediger', 'structurer'],
};

/**
 * Bloc B — l'acte professionnel. Aucune taxonomie ne porte « prospecter » ou
 * « signer » : elles décrivent des opérations mentales, pas le geste métier
 * qu'une formation commerciale a précisément pour objet de rendre exécutable.
 * Les retirer viderait le catalogue de ses objectifs les plus concrets.
 */
const METIER: readonly string[] = [
  'accompagner', 'animer', 'automatiser', 'capter', 'conclure', 'convaincre', 'coordonner',
  'deployer', 'diffuser', 'entrainer', 'exploiter', 'fideliser', 'former', 'gerer', 'guider',
  'installer', 'integrer', 'mobiliser', 'motiver', 'negocier', 'optimiser', 'piloter',
  'presenter', 'prospecter', 'qualifier', 'recruter', 'relancer', 'renforcer', 'rentrer',
  'repondre', 'ritualiser', 'securiser', 'sensibiliser', 'signer', 'suivre', 'traiter',
  'transformer', 'valoriser', 'vendre',
];

/**
 * Bloc C — non observables, conservés PAR COMPATIBILITÉ.
 *
 * « Savoir », « maîtriser », « apprendre » ne décrivent rien qu'on puisse
 * constater en fin de formation — les référentiels les proscrivent. Ils sont
 * pourtant dans la liste actuelle et portent des objectifs rendus aujourd'hui.
 * Les retirer fabriquerait exactement le faux négatif qu'on corrige. Ils sont
 * donc gardés ET NOMMÉS : c'est la dette, et le jour où on la solde, c'est le
 * CATALOGUE qu'on réécrit, pas la liste qu'on rabote.
 */
const NON_OBSERVABLES: readonly string[] = [
  'acquerir', 'apprendre', 'decouvrir', 'faire', 'maitriser', 'savoir',
];

const SOCLE = Object.values(BLOOM).flat();
const CANDIDAT: ReadonlySet<string> = new Set([...SOCLE, ...METIER, ...NON_OBSERVABLES]);

// ── La population : exactement les modules COMPOSABLES ──────────────────────

const d = await prisma.diagnostic.findFirst({
  where: { reference: ref },
  select: { id: true, tenantId: true },
});
if (!d) throw new Error(`${ref} introuvable`);

const library = await loadPropositionLibrary(d.tenantId);
// Les mêmes quatre retraits que `recommendModules`, dans le même ordre.
const usable = library.filter((m) => !m.excludedFromClientOutputs && !m.source.excludedFromClientOutputs);
const composable = usable.filter((m) => m.source.supersededBy === null);
const population = composable.filter((m) => isAnimable(m));

console.log(`\n=== BASE : ${ouTourne()} ===`);
console.log(`=== Population : ${population.length} modules COMPOSABLES (dossier ${ref}, ${d.id})`);
console.log(`    sur ${library.length} en bibliothèque — pige, non-diffusables, rayons en doublon`);
console.log(`    et modules sans déroulé déduits. C'est la population des objectifs.\n`);

// ── Les deux listes ─────────────────────────────────────────────────────────

const ajoutes = [...CANDIDAT].filter((v) => !TITLE_VERBS.has(v)).sort();
const retires = [...TITLE_VERBS].filter((v) => !CANDIDAT.has(v)).sort();

console.log(`=== LA LISTE ===`);
console.log(`  actuelle  : ${TITLE_VERBS.size} verbes, élargie au cas par cas`);
console.log(`  candidate : ${CANDIDAT.size} verbes = ${SOCLE.length} socle Bloom + ${METIER.length} métier + ${NON_OBSERVABLES.length} non observables`);
console.log(`  ajoute ${ajoutes.length} · retire ${retires.length}\n`);
for (const [niveau, verbes] of Object.entries(BLOOM)) {
  const neufs = verbes.filter((v) => !TITLE_VERBS.has(v));
  console.log(`  ${niveau.padEnd(16)} ${String(verbes.length).padStart(2)} verbes, dont ${String(neufs.length).padStart(2)} neufs : ${neufs.join(', ') || '—'}`);
}
console.log(`\n  AJOUTÉS (${ajoutes.length}) : ${ajoutes.join(', ')}`);
console.log(`\n  RETIRÉS (${retires.length}) : ${retires.join(', ') || '— aucun : tout verbe déjà admis trouve son bloc.'}`);

// ── L'effet mesuré ──────────────────────────────────────────────────────────

const passe = (titre: string, liste: ReadonlySet<string>): boolean => liste.has(premierMot(titre));

const avant = population.filter((m) => passe(m.title, TITLE_VERBS));
const apres = population.filter((m) => passe(m.title, CANDIDAT));
const bascules = population.filter((m) => !passe(m.title, TITLE_VERBS) && passe(m.title, CANDIDAT));
const regressions = population.filter((m) => passe(m.title, TITLE_VERBS) && !passe(m.title, CANDIDAT));
const refusesApres = population.filter((m) => !passe(m.title, CANDIDAT));

console.log(`\n=== L'EFFET, SUR LES ${population.length} MODULES COMPOSABLES ===`);
const pct = (n: number): string => `${((n / population.length) * 100).toFixed(1)} %`;
console.log(`  objectif rendu tel quel   : ${avant.length} (${pct(avant.length)})  →  ${apres.length} (${pct(apres.length)})`);
console.log(`  « à rédiger »             : ${population.length - avant.length} (${pct(population.length - avant.length)})  →  ${refusesApres.length} (${pct(refusesApres.length)})`);
console.log(`  ① BASCULENT vers objectif : ${bascules.length}`);
console.log(`  ⚠ RÉGRESSENT              : ${regressions.length}`);

console.log(`\n=== ① LES ${bascules.length} TITRES QUI BASCULENT — à juger un par un ===`);
console.log(`    (c'est le chiffre ② qui décide : combien sont DOUTEUX ?)\n`);
const parVerbe = new Map<string, typeof bascules>();
for (const m of bascules) {
  const v = premierMot(m.title);
  parVerbe.set(v, [...(parVerbe.get(v) ?? []), m]);
}
for (const [verbe, mods] of [...parVerbe.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const bloc = SOCLE.includes(verbe) ? 'A/Bloom' : METIER.includes(verbe) ? 'B/métier' : 'C/non-obs';
  console.log(`  ▸ ${verbe} (${bloc}) — ${mods.length} module(s)`);
  for (const m of mods) console.log(`      ${m.source.code.padEnd(9)} ${m.title}`);
}

if (regressions.length > 0) {
  console.log(`\n=== ⚠ RÉGRESSIONS — passaient, ne passeraient plus ===`);
  for (const m of regressions) console.log(`  ${m.source.code.padEnd(9)} [${premierMot(m.title)}] ${m.title}`);
}

console.log(`\n=== CE QUI RESTE REFUSÉ APRÈS (${refusesApres.length}) — le vrai fond du catalogue ===`);
const motsRefuses = new Map<string, number>();
for (const m of refusesApres) motsRefuses.set(premierMot(m.title), (motsRefuses.get(premierMot(m.title)) ?? 0) + 1);
const tri = [...motsRefuses.entries()].sort((a, b) => b[1] - a[1]);
console.log(`  ${tri.length} premiers mots distincts. Les 25 plus fréquents :`);
for (const [mot, n] of tri.slice(0, 25)) console.log(`    ${String(n).padStart(3)} × ${mot}`);

await prisma.$disconnect();
