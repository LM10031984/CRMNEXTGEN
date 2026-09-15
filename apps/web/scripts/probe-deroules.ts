/**
 * L'état des DÉROULÉS de la bibliothèque (lot I-2, relevé du 15/09/2026).
 *
 *   pnpm --filter @qualiof/web probe:deroules:local
 *
 * 100 % lecture. Aucune écriture, aucun module retiré, aucun seuil appliqué.
 *
 * ## Pourquoi cette sonde
 *
 * Deux modules de `BIB-D014` ont été programmés dans un parcours client. Leur
 * déroulé : « - Après-midi :\n- Animer des réunions commerciales » pour l'un,
 * une puce unique sans rapport avec le titre pour l'autre. Ce ne sont pas des
 * modules — ce sont des résidus de découpage.
 *
 * Le refus d'objectif les a bien désignés, mais **par le mauvais critère** : il
 * leur reprochait leur VERBE, pas leur contenu. Un garde qui attrape le bon cas
 * pour la mauvaise raison n'attrapera pas le suivant — celui dont le titre
 * commence par « Maîtriser » passera sans bruit.
 *
 * `isAnimable` demande un déroulé NON VIDE et différent des questions
 * d'identification du besoin. Il ne demande pas un déroulé qui TIENNE DEBOUT.
 * La sonde mesure l'écart entre les deux pour que le seuil se pose sur des
 * chiffres et non sur une intuition.
 */
import { prisma } from '@qualiof/db';

import { isAnimable } from '../src/lib/proposition/module-matcher';
import { loadPropositionLibrary } from '../src/server/proposition-library';

const ref = process.argv[2] ?? 'DIAG-R001';

function ouTourne(): string {
  const url = process.env.DATABASE_URL ?? '';
  const m = /@([^/:]+)(?::\d+)?\/([^?]+)/.exec(url);
  if (!m) return 'base INCONNUE';
  const [, hote, base] = m;
  return `${/localhost|127\.0\.0\.1/.test(hote!) ? 'LOCALE' : 'DISTANTE'} — ${base} @ ${hote}`;
}

const neutraliser = (s: string): string =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

/** Les puces d'un déroulé — les lignes non vides, tiret ou non. */
function puces(contenu: string | null): string[] {
  return (contenu ?? '')
    .split('\n')
    .map((l) => l.replace(/^\s*[-*•|]\s*/, '').trim())
    .filter((l) => l.length > 0);
}

/**
 * Les marqueurs d'un fragment d'HORAIRE — pas d'un contenu pédagogique.
 *
 * Relevés sur le corpus : « Après-midi : », « Matin », « Pause déjeuner »,
 * « Jour 2 », « 9h00 - 12h30 ». Ils viennent du tableau de déroulé horaire du
 * document source, que le découpage a pris pour des unités de contenu.
 */
const MARQUEURS_HORAIRE =
  /^(matin|apres[-\s]?midi|debut de matinee|fin de matinee|pause|dejeuner|dejeune|journee|jour\s*\d|demi[-\s]journee|accueil|\d{1,2}\s*h(\s*\d{2})?)\b/;

/** Une puce qui n'est QUE l'horaire : pas de contenu derrière. */
function estHoraireSeul(puce: string): boolean {
  const n = neutraliser(puce).replace(/[:\-–—\s]+$/, '');
  return MARQUEURS_HORAIRE.test(n) && n.length <= 28;
}

// ── Population ──────────────────────────────────────────────────────────────

const d = await prisma.diagnostic.findFirst({ where: { reference: ref }, select: { tenantId: true } });
if (!d) throw new Error(`${ref} introuvable`);

const library = await loadPropositionLibrary(d.tenantId);
const usable = library.filter((m) => !m.excludedFromClientOutputs && !m.source.excludedFromClientOutputs);
const composablesAvantDeroule = usable.filter((m) => m.source.supersededBy === null);
const composables = composablesAvantDeroule.filter((m) => isAnimable(m));

console.log(`\n=== BASE : ${ouTourne()} ===`);
console.log(`=== POPULATIONS (§4 quater) ===`);
console.log(`  ${String(library.length).padStart(4)}  en bibliothèque, tous rayons`);
console.log(`  ${String(composablesAvantDeroule.length).padStart(4)}  après retrait pige / non-diffusables / doublons`);
console.log(`  ${String(composables.length).padStart(4)}  COMPOSABLES — ceux qu'\`isAnimable\` laisse passer aujourd'hui`);
console.log(`        et c'est cette population-là qu'on mesure.\n`);

// ── Les signaux ─────────────────────────────────────────────────────────────

interface Signal {
  code: string;
  titre: string;
  nbPuces: number;
  premiere: string;
  horaireSeul: boolean;
  horaireAilleurs: boolean;
  /** Toutes les puces sont des fragments d'horaire : aucune ligne de contenu. */
  toutHoraire: boolean;
  longueur: number;
}

const signaux: Signal[] = composables.map((m) => {
  const p = puces(m.contentMd);
  return {
    code: m.source.code,
    titre: m.title,
    nbPuces: p.length,
    premiere: p[0] ?? '',
    horaireSeul: p.length > 0 && estHoraireSeul(p[0]!),
    horaireAilleurs: p.some((x) => estHoraireSeul(x)),
    toutHoraire: p.length > 0 && p.every((x) => estHoraireSeul(x)),
    longueur: (m.contentMd ?? '').trim().length,
  };
});

const parPuces = new Map<number, number>();
for (const s of signaux) {
  const cle = s.nbPuces >= 6 ? 6 : s.nbPuces;
  parPuces.set(cle, (parPuces.get(cle) ?? 0) + 1);
}

console.log(`=== ① DISTRIBUTION DU NOMBRE DE PUCES (sur les ${composables.length} composables) ===`);
for (const n of [1, 2, 3, 4, 5, 6]) {
  const c = parPuces.get(n) ?? 0;
  const pct = ((c / composables.length) * 100).toFixed(1);
  console.log(`  ${n === 6 ? '6+' : ` ${n}`} puce(s) : ${String(c).padStart(3)}  ${pct.padStart(5)} %  ${'█'.repeat(Math.round(c / 3))}`);
}

const uneOuDeux = signaux.filter((s) => s.nbPuces <= 2);
const horaireEnTete = signaux.filter((s) => s.horaireSeul);
const horaireQuelquePart = signaux.filter((s) => s.horaireAilleurs);
const cumul = signaux.filter((s) => s.nbPuces <= 2 || s.horaireSeul);

/**
 * Le déroulé n'est QUE de l'horaire — aucune ligne pédagogique.
 *
 * C'est le signal le plus net du corpus, et le seul qui ne se discute pas :
 * « Après-midi » tout seul n'est pas un contenu allégé, c'est l'absence de
 * contenu déguisée en contenu. `isAnimable` le laisse passer parce qu'il ne
 * teste que le vide littéral.
 */
const creuxIntegral = signaux.filter((s) => s.nbPuces > 0 && s.toutHoraire);
const conjonction = signaux.filter((s) => s.horaireSeul && s.nbPuces <= 2);

console.log(`\n=== ② LE NOUVEAU SIGNAL, ET CE QU'IL VAUT SEUL ===`);
console.log(`  déroulé d'UNE ou DEUX puces              : ${String(uneOuDeux.length).padStart(3)}  (${((uneOuDeux.length / composables.length) * 100).toFixed(1)} %)`);
console.log(`  PREMIÈRE puce = fragment d'horaire seul  : ${String(horaireEnTete.length).padStart(3)}  ← le signal demandé`);
console.log(`  fragment d'horaire n'importe où          : ${String(horaireQuelquePart.length).padStart(3)}`);
console.log(`  ─────────────────────────────────────────────`);
console.log(`  UNION (≤ 2 puces OU horaire en tête)     : ${String(cumul.length).padStart(3)}  (${((cumul.length / composables.length) * 100).toFixed(1)} %)`);
console.log(`\n  ⚠ MAIS le signal « horaire en tête » NE DISCRIMINE PAS seul : BIB-D071`);
console.log(`    le porte quatorze fois avec 6 à 9 puces de vrai contenu, BIB-D049 avec 46.`);
console.log(`    Le refuser coûterait ${horaireEnTete.length} modules pour en viser une poignée — §4 quaterdecies.`);
console.log(`\n=== ②bis LES DEUX SIGNATURES QUI, ELLES, DISCRIMINENT ===`);
console.log(`  déroulé fait UNIQUEMENT de fragments d'horaire : ${String(creuxIntegral.length).padStart(3)}  ← aucun contenu pédagogique`);
console.log(`  horaire en tête ET ≤ 2 puces                   : ${String(conjonction.length).padStart(3)}  ← la signature de BIB-D014 / D047`);
for (const s of creuxIntegral.sort((a, b) => a.code.localeCompare(b.code))) {
  console.log(`      ${s.code.padEnd(9)} ${s.nbPuces} puce(s) — « ${s.premiere} »`);
}

console.log(`\n=== ③ LES ${horaireEnTete.length} DÉROULÉS QUI S'OUVRENT SUR UN HORAIRE ===`);
for (const s of horaireEnTete.sort((a, b) => a.code.localeCompare(b.code))) {
  console.log(`  ${s.code.padEnd(9)} ${s.nbPuces} puce(s) · « ${s.premiere} »`);
  console.log(`            titre : ${s.titre.slice(0, 82)}`);
}

console.log(`\n=== ④ LES DÉROULÉS D'UNE SEULE PUCE (${signaux.filter((s) => s.nbPuces === 1).length}) ===`);
for (const s of signaux.filter((s) => s.nbPuces === 1).sort((a, b) => a.code.localeCompare(b.code)).slice(0, 40)) {
  console.log(`  ${s.code.padEnd(9)} « ${s.premiere.slice(0, 68)} »`);
  console.log(`            titre : ${s.titre.slice(0, 82)}`);
}

// ── Ce que coûterait chaque seuil ───────────────────────────────────────────

console.log(`\n=== ⑤ CE QUE COÛTERAIT CHAQUE SEUIL — avant d'en poser un ===`);
const seuils: { nom: string; garde: (s: Signal) => boolean }[] = [
  { nom: 'aujourd’hui (déroulé non vide)', garde: () => true },
  { nom: 'A · déroulé 100 % horaire', garde: (s) => !s.toutHoraire },
  { nom: 'A + horaire en tête ET ≤ 2 puces', garde: (s) => !s.toutHoraire && !(s.horaireSeul && s.nbPuces <= 2) },
  { nom: 'A + B + refuser 1 puce', garde: (s) => !s.toutHoraire && !(s.horaireSeul && s.nbPuces <= 2) && s.nbPuces >= 2 },
  { nom: 'refuser tout horaire en tête', garde: (s) => !s.horaireSeul },
  { nom: 'refuser ≤ 2 puces', garde: (s) => s.nbPuces >= 3 },
];
for (const { nom, garde } of seuils) {
  const restants = signaux.filter(garde).length;
  console.log(`  ${nom.padEnd(34)} ${String(restants).padStart(3)} composables  (−${composables.length - restants})`);
}

await prisma.$disconnect();
