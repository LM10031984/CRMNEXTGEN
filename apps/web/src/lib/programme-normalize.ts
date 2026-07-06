/**
 * Normalisation déterministe du programme de formation (Laurent 2026-06-18).
 *
 * Problème résolu : aujourd'hui Programme.pdf et Convention.pdf recopient VERBATIM
 * `TrainingProduct.programMd`, qui contient les horaires SmartOF NON conformes
 * (9h-11h, 14h15…) et des intitulés nominaux sans verbe d'action. On impose ici :
 *  1. Une grille horaire FIGÉE/DÉTERMINISTE (9h00–13h00 / 14h00–18h00 = 8h pile),
 *     hardcodée (AUCUN « smart calc » sur la valeur métier — cf. feedback Laurent
 *     « pas de smart calc sur convention métier »).
 *  2. Un post-traitement de fidélité (`enforceProgrammeFidelity`) qui détecte les
 *     thèmes étrangers introduits par le LLM (décliner sans enrichir).
 *
 * Source unique horaire : on RÉUTILISE PAUSE_DEJEUNER de formation-horaires.ts et
 * on aligne les constantes matin/après-midi sur celles de l'émargement (figées
 * Start Academy). On NE réinvente PAS la règle ailleurs.
 *
 * PÉRIMÈTRE : multi-jours IMPLÉMENTÉ (quick 260618-jy1). N = ceil(h/8) journées
 * déterministes. Les (N-1) premiers jours sont pleins (8h), le DERNIER jour porte
 * le reliquat figé :
 *   reliquat = durationHours − 8·(N−1)
 *   - reliquat === 8 (multiple de 8) → dernier jour PLEIN.
 *   - reliquat ≤ 4h → matin SEUL 9h00→(9h+reliquat), pas d'après-midi, pas de déjeuner.
 *   - 4h < reliquat < 8h → matin complet 9h00–13h00 + déjeuner + après-midi partiel
 *     14h00→(14h+reliquat−4).
 * Aucun « smart calc » sur les minutes : le reliquat est un entier d'heures
 * (durationHours entier) et les labels sont concaténés sur cet entier.
 */

import { PAUSE_DEJEUNER } from '@/lib/formation-horaires';

/** Horaires matin/après-midi figés Start Academy (alignés émargement-template.ts). */
export const HORAIRE_MATIN_PROG = '9h00–13h00' as const; // matin = 4h
export const HORAIRE_APREM_PROG = '14h00–18h00' as const; // après-midi = 4h → total 8h pile

/** Pauses café internes figées (DANS les blocs, n'allongent PAS la journée). */
export const PAUSE_CAFE_MATIN_PROG = { at: '10h45', durationMin: 15 } as const;
export const PAUSE_CAFE_APREM_PROG = { at: '15h45', durationMin: 15 } as const;

/**
 * Liste blanche de verbes d'action évaluables (taxonomie de Bloom, conforme
 * Qualiopi ind. 12). Réutilisée par le prompt système (instruction au LLM) ET
 * disponible pour vérification. Source unique pour ne pas diverger entre prompt
 * et contrôle.
 */
export const VERBES_EVALUABLES = [
  'Identifier',
  'Appliquer',
  'Analyser',
  'Mettre en œuvre',
  'Construire',
  'Argumenter',
  'Élaborer',
  'Évaluer',
  'Concevoir',
  'Utiliser',
  'Distinguer',
  'Rédiger',
  'Optimiser',
  'Structurer',
] as const;

/** Bloc horaire d'une demi-journée dans l'échafaudage. */
export interface HoraireBloc {
  /** ex "9h00–13h00". Chaîne VIDE si bloc absent (ex après-midi d'un jour partiel ≤4h). */
  label: string;
  /** durée de TRAVAIL en minutes (hors pause café interne). 0 si bloc absent. */
  travailMin: number;
  /** pause café interne incluse dans le bloc (n'allonge pas la journée). durationMin=0 si absent. */
  pauseCafe: { at: string; durationMin: number };
}

/** Une journée figée de l'échafaudage. */
export interface HoraireJour {
  matin: HoraireBloc;
  /** déjeuner conservé si la journée ≥ 5h (jour plein ou partiel >4h). durationMin=0 sinon. */
  dejeuner: { start: string; end: string; durationMin: number };
  /** après-midi. travailMin=0 + label='' pour un jour partiel ≤4h (matin seul). */
  apresMidi: HoraireBloc;
  /** somme du TRAVAIL de la journée en minutes (matin + après-midi, hors pauses) */
  travailTotalMin: number;
}

/** Résultat de l'échafaudage horaire déterministe. */
export interface HoraireScaffold {
  durationHours: number;
  /** nbJours = ceil(durationHours / 8). */
  nbJours: number;
  /** Les N journées rendues : (N-1) pleines + 1 dernier jour (plein ou partiel selon reliquat). */
  jours: HoraireJour[];
  /** @deprecated multi-jours désormais IMPLÉMENTÉ — toujours false (gardé pour compat type). */
  multiDayDeferred: boolean;
}

const NO_PAUSE_CAFE = { at: '', durationMin: 0 } as const;
const NO_DEJEUNER = { start: '', end: '', durationMin: 0 } as const;

/** Jour PLEIN figé : matin 9h00–13h00 (4h) + déjeuner + après-midi 14h00–18h00 (4h) = 8h pile. */
function buildJourPlein(): HoraireJour {
  return {
    matin: {
      label: HORAIRE_MATIN_PROG,
      travailMin: 240, // 4h pile (figé)
      pauseCafe: { at: PAUSE_CAFE_MATIN_PROG.at, durationMin: PAUSE_CAFE_MATIN_PROG.durationMin },
    },
    dejeuner: {
      start: PAUSE_DEJEUNER.start,
      end: PAUSE_DEJEUNER.end,
      durationMin: PAUSE_DEJEUNER.durationMin,
    },
    apresMidi: {
      label: HORAIRE_APREM_PROG,
      travailMin: 240, // 4h pile (figé)
      pauseCafe: { at: PAUSE_CAFE_APREM_PROG.at, durationMin: PAUSE_CAFE_APREM_PROG.durationMin },
    },
    travailTotalMin: 480, // 8h pile (figé)
  };
}

/**
 * Jour PARTIEL déterministe pour le reliquat du dernier jour. `reliquatHeures`
 * est un ENTIER d'heures (1..8). Horaires HARDCODÉS par concaténation sur l'entier
 * (PAS de smart calc sur minutes).
 *  - reliquatHeures >= 8 → jour plein.
 *  - reliquatHeures <= 4 → matin SEUL 9h00→(9h+reliquat), pas d'après-midi, pas de déjeuner
 *    (cohérent getDayStartEnd : pas de pause déjeuner si journée < 5h).
 *  - 4 < reliquatHeures < 8 → matin complet 9h00–13h00 + déjeuner + après-midi partiel
 *    14h00→(14h+reliquat−4).
 */
function buildJourPartiel(reliquatHeures: number): HoraireJour {
  if (reliquatHeures >= 8) return buildJourPlein();

  if (reliquatHeures <= 4) {
    // Matin seul, journée < 5h → pas de déjeuner, pas d'après-midi.
    return {
      matin: {
        label: `9h00–${9 + reliquatHeures}h00`,
        travailMin: reliquatHeures * 60,
        pauseCafe: { at: PAUSE_CAFE_MATIN_PROG.at, durationMin: PAUSE_CAFE_MATIN_PROG.durationMin },
      },
      dejeuner: { ...NO_DEJEUNER },
      apresMidi: { label: '', travailMin: 0, pauseCafe: { ...NO_PAUSE_CAFE } },
      travailTotalMin: reliquatHeures * 60,
    };
  }

  // 4 < reliquat < 8 : matin complet + après-midi partiel.
  const apremHeures = reliquatHeures - 4; // 1..3
  return {
    matin: {
      label: HORAIRE_MATIN_PROG,
      travailMin: 240,
      pauseCafe: { at: PAUSE_CAFE_MATIN_PROG.at, durationMin: PAUSE_CAFE_MATIN_PROG.durationMin },
    },
    dejeuner: {
      start: PAUSE_DEJEUNER.start,
      end: PAUSE_DEJEUNER.end,
      durationMin: PAUSE_DEJEUNER.durationMin,
    },
    apresMidi: {
      label: `14h00–${14 + apremHeures}h00`,
      travailMin: apremHeures * 60,
      pauseCafe: { at: PAUSE_CAFE_APREM_PROG.at, durationMin: PAUSE_CAFE_APREM_PROG.durationMin },
    },
    travailTotalMin: reliquatHeures * 60,
  };
}

/**
 * Construit l'échafaudage horaire FIGÉ/DÉTERMINISTE sur N = ceil(h/8) journées.
 *
 * Les (N-1) premiers jours sont PLEINS (8h). Le dernier jour porte le reliquat
 * = durationHours − 8·(N−1) (voir buildJourPartiel). Si durationHours est multiple
 * de 8, reliquat===8 → dernier jour plein.
 *
 * Déterminisme garanti : valeurs HARDCODÉES, aucun random, aucun calcul « malin »
 * sur la valeur métier (le reliquat est un entier d'heures). Deux appels identiques
 * → résultat strictement identique.
 *
 * Défense : durationHours non entier → Math.round (cas non métier, garde-fou).
 */
export function buildHoraireScaffold(durationHours: number): HoraireScaffold {
  const h = Number.isInteger(durationHours) ? durationHours : Math.round(durationHours);
  const nbJours = Math.max(1, Math.ceil(h / 8));
  const reliquat = h - 8 * (nbJours - 1); // heures du DERNIER jour (1..8)

  const jours: HoraireJour[] = [];
  for (let i = 0; i < nbJours - 1; i++) jours.push(buildJourPlein());
  jours.push(buildJourPartiel(reliquat)); // pour nbJours===1 et h=8 → jour plein (non-régression)

  return {
    durationHours,
    nbJours,
    jours,
    multiDayDeferred: false, // multi-jours implémenté
  };
}

/** Rend une journée (interne) en lignes markdown. Omet les blocs absents. */
function renderJourLines(j: HoraireJour, k: number): string[] {
  const lines: string[] = [`### Jour ${k} — Organisation de la journée`, ``];
  lines.push(
    `- Matin : **${j.matin.label}** (${j.matin.travailMin / 60}h)` +
      (j.matin.pauseCafe.durationMin
        ? ` — pause café ~${j.matin.pauseCafe.at} (${j.matin.pauseCafe.durationMin} min, incluse).`
        : `.`),
  );
  if (j.dejeuner.durationMin) {
    lines.push(`- Pause déjeuner : ${j.dejeuner.start}–${j.dejeuner.end} (${j.dejeuner.durationMin} min).`);
  }
  if (j.apresMidi.travailMin > 0) {
    lines.push(
      `- Après-midi : **${j.apresMidi.label}** (${j.apresMidi.travailMin / 60}h)` +
        (j.apresMidi.pauseCafe.durationMin
          ? ` — pause café ~${j.apresMidi.pauseCafe.at} (${j.apresMidi.pauseCafe.durationMin} min, incluse).`
          : `.`),
    );
  }
  lines.push(`- Total travail du jour : ${j.travailTotalMin / 60}h00.`);
  lines.push(``);
  return lines;
}

/** Vrai si la journée est un jour PLEIN figé (8h, matin+après-midi standard). */
function isJourPlein(j: HoraireJour): boolean {
  return (
    j.travailTotalMin === 480 &&
    j.matin.label === HORAIRE_MATIN_PROG &&
    j.apresMidi.label === HORAIRE_APREM_PROG
  );
}

/** Résumé textuel du créneau d'un jour PARTIEL (pour la ligne dédiée du dernier jour). */
function describeJourPartiel(j: HoraireJour): string {
  const heures = j.travailTotalMin / 60;
  if (j.apresMidi.travailMin > 0) {
    // matin complet + après-midi partiel.
    return `matin ${j.matin.label} / déjeuner ${j.dejeuner.start}–${j.dejeuner.end} / après-midi ${j.apresMidi.label} — ${heures}h`;
  }
  // matin seul.
  return `matin ${j.matin.label} (matin seul) — ${heures}h`;
}

/**
 * Rend l'échafaudage horaire en bloc markdown lisible, injectable DANS le prompt
 * user comme grille IMPOSÉE (le LLM NE calcule PAS la grille, il la recopie).
 *
 * - `nbJours === 1` : comportement HISTORIQUE inchangé (PROD-0062 + slice mono-jour
 *   du déroulé). Liste un unique `### Jour 1` avec ses créneaux.
 * - `nbJours > 1` : l'horaire est affiché UNE SEULE FOIS sous « Organisation des
 *   journées » (les jours pleins sont identiques, on ne répète pas le bloc par jour).
 *   Si le dernier jour est PARTIEL, on ajoute UNE ligne dédiée à ce jour-là.
 */
export function renderHoraireScaffoldMd(scaffold: HoraireScaffold): string {
  // Cas mono-jour : strictement inchangé (déroulé slice + non-régression PROD-0062).
  if (scaffold.nbJours === 1) {
    const out: string[] = [
      `## Grille horaire imposée — 1 jour (${scaffold.durationHours}h au total)`,
      ``,
    ];
    out.push(...renderJourLines(scaffold.jours[0]!, 1));
    out.push(`NE PAS modifier ces horaires ; les recopier tels quels pour chaque jour.`);
    return out.join('\n');
  }

  // Cas multi-jours : horaire mentionné UNE SEULE FOIS.
  const lastIdx = scaffold.jours.length - 1;
  const lastJour = scaffold.jours[lastIdx]!;
  const lastIsPlein = isJourPlein(lastJour);

  const out: string[] = [
    `## Grille horaire imposée — ${scaffold.nbJours} jours (${scaffold.durationHours}h au total)`,
    ``,
    `### Organisation des journées`,
    ``,
    `Chaque journée (8h) — Matin : ${HORAIRE_MATIN_PROG} · Pause déjeuner : ${PAUSE_DEJEUNER.start}–${PAUSE_DEJEUNER.end} · Après-midi : ${HORAIRE_APREM_PROG} (pauses café ~${PAUSE_CAFE_MATIN_PROG.at} et ~${PAUSE_CAFE_APREM_PROG.at} incluses).`,
  ];

  if (!lastIsPlein) {
    out.push(
      `Dernier jour (jour ${scaffold.nbJours}) : ${describeJourPartiel(lastJour)}.`,
    );
  }

  out.push(``);
  out.push(
    `Les horaires sont identiques chaque jour ; ne les répète pas par jour. Recopie cette grille UNE SEULE FOIS.`,
  );
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Fidélité de contenu (post-traitement pur)
// ---------------------------------------------------------------------------

/**
 * Stop-words FR (liste constante, normalisée casse + accents). Retirés avant
 * tokenisation pour que la comparaison porte sur les mots porteurs de sens.
 */
const STOP_WORDS_FR = new Set<string>([
  'avec',
  'dans',
  'pour',
  'par',
  'sur',
  'aux',
  'les',
  'des',
  'une',
  'mais',
  'donc',
  'son',
  'ses',
  'leur',
  'leurs',
  'cette',
  'cet',
  'ces',
  'qui',
  'que',
  'quoi',
  'dont',
  'sous',
  'entre',
  'vers',
  'chez',
  'plus',
  'moins',
  'tres',
  'tout',
  'tous',
  'toute',
  'toutes',
  'etre',
  'avoir',
  'faire',
  'comme',
  'sans',
  'selon',
  'apres',
  'avant',
  'pendant',
  'jour',
  'jours',
  'matin',
  'midi',
  'pause',
  'dejeuner',
  'heure',
  'heures',
  'module',
  'modules',
  'partie',
  'section',
  'theme',
  'objectif',
  'objectifs',
  'contenu',
  'introduction',
  'conclusion',
  'formation',
]);

/**
 * Normalise un texte : minuscules + suppression des accents (NFD) + ne garde
 * que lettres/chiffres/espaces. Source unique pour tokenisation cohérente.
 */
function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // retire les diacritiques
    .replace(/[^a-z0-9\s]/g, ' ');
}

/**
 * HEURISTIQUE FIGÉE : tokens significatifs = mots de ≥ 4 lettres après retrait
 * des stop-words FR (insensible casse/accents). Source unique pour titres de
 * section normalisés ET modules source.
 */
export function significantTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of normalizeText(text).split(/\s+/)) {
    if (raw.length < 4) continue;
    if (STOP_WORDS_FR.has(raw)) continue;
    out.add(raw);
  }
  return out;
}

/**
 * Extrait les titres de section d'un markdown : lignes commençant par #, ##,
 * ###, #### ou items de liste de 1er niveau en gras. On vise les intitulés de
 * contenu, pas le corps. Heuristique simple et déterministe.
 */
export function extractSectionTitles(md: string): string[] {
  const titles: string[] = [];
  for (const line of md.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const heading = t.match(/^#{1,6}\s+(.*)$/);
    if (heading?.[1]) {
      titles.push(heading[1].trim());
      continue;
    }
    // item de liste en gras : "- **Titre**" ou "* **Titre** : …"
    const boldItem = t.match(/^[-*]\s+\*\*(.+?)\*\*/);
    if (boldItem?.[1]) {
      titles.push(boldItem[1].trim());
    }
  }
  return titles;
}

export interface FidelityResult {
  ok: boolean;
  /** titres des sections orphelines (aucun token commun avec la source) */
  extraneous: string[];
}

/**
 * Post-traitement PUR de fidélité (NON bloquant côté appelant).
 *
 * Pour chaque section du markdown normalisé, on extrait ses tokens significatifs
 * (≥4 lettres hors stop-words FR). Une section est « orpheline » si AUCUN de ses
 * tokens ne recoupe AUCUN token significatif des titres/contenus de modules
 * source. Retour `{ ok, extraneous }` — l'appelant ne fait que `warn`.
 *
 * Test simple de la garde : injecter un terme étranger sans token commun
 * (« architecture transformer ») doit le faire ressortir dans `extraneous`.
 */
export function enforceProgrammeFidelity(
  normalizedMd: string,
  sourceModuleTitles: string[],
): FidelityResult {
  // Vocabulaire source agrégé (tous les titres/contenus de modules).
  const sourceTokens = new Set<string>();
  for (const src of sourceModuleTitles) {
    for (const tok of significantTokens(src)) sourceTokens.add(tok);
  }

  const extraneous: string[] = [];
  for (const title of extractSectionTitles(normalizedMd)) {
    const tokens = significantTokens(title);
    if (tokens.size === 0) continue; // section sans token significatif → ignorée
    let overlaps = false;
    for (const tok of tokens) {
      if (sourceTokens.has(tok)) {
        overlaps = true;
        break;
      }
    }
    if (!overlaps) extraneous.push(title);
  }

  return { ok: extraneous.length === 0, extraneous };
}
