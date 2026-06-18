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
 * PÉRIMÈTRE : seul le cas 1 JOUR (≤ 8h, PROD-0062) est supporté/prouvé ici.
 * Le multi-jours (chunking par jour) est explicitement DIFFÉRÉ.
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
  label: string; // ex "9h00–13h00"
  /** durée de TRAVAIL en minutes (hors pause café interne) */
  travailMin: number;
  /** pause café interne incluse dans le bloc (n'allonge pas la journée) */
  pauseCafe: { at: string; durationMin: number };
}

/** Une journée figée de l'échafaudage. */
export interface HoraireJour {
  matin: HoraireBloc;
  dejeuner: { start: string; end: string; durationMin: number };
  apresMidi: HoraireBloc;
  /** somme du TRAVAIL de la journée en minutes (matin + après-midi, hors pauses) */
  travailTotalMin: number;
}

/** Résultat de l'échafaudage horaire déterministe. */
export interface HoraireScaffold {
  durationHours: number;
  /** nbJours = ceil(durationHours / 8) — calculable pour extension future. */
  nbJours: number;
  /** Journées rendues. PÉRIMÈTRE : une seule journée même si nbJours>1 (voir multiDayDeferred). */
  jours: HoraireJour[];
  /** true dès que nbJours>1 : le multi-jours n'est PAS implémenté (différé Laurent 2026-06-18). */
  multiDayDeferred: boolean;
}

/**
 * Construit l'échafaudage horaire FIGÉ/DÉTERMINISTE.
 *
 * Pour N ≤ 8 → 1 jour : matin 9h00–13h00 (4h) + déjeuner 13h00–14h00 +
 * après-midi 14h00–18h00 (4h) → 8h de travail pile. Pauses café internes
 * (~10h45 et ~15h45, 15 min) DANS les blocs (ne repoussent pas 18h00).
 *
 * Déterminisme garanti : valeurs HARDCODÉES, aucun random, aucun calcul « malin »
 * sur la valeur métier. Deux appels identiques → résultat strictement identique.
 *
 * nbJours = Math.ceil(N / 8) reste calculé (pour extension), mais une SEULE
 * journée est rendue ; multiDayDeferred=true signale que le chunking par jour
 * n'est pas implémenté.
 */
export function buildHoraireScaffold(durationHours: number): HoraireScaffold {
  const nbJours = Math.max(1, Math.ceil(durationHours / 8));
  const jour: HoraireJour = {
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
  // TODO multi-jours : chunking par jour (différé Laurent 2026-06-18)
  return {
    durationHours,
    nbJours,
    jours: [jour], // PÉRIMÈTRE : un seul jour rendu, même si nbJours>1
    multiDayDeferred: nbJours > 1,
  };
}

/**
 * Rend l'échafaudage horaire en bloc markdown lisible, injectable DANS le prompt
 * user comme grille IMPOSÉE (le LLM NE calcule PAS la grille, il la recopie).
 */
export function renderHoraireScaffoldMd(scaffold: HoraireScaffold): string {
  const j = scaffold.jours[0]!;
  return [
    `### Organisation de la journée`,
    ``,
    `- Matin : **${j.matin.label}** (4h) — pause café ~${j.matin.pauseCafe.at} (${j.matin.pauseCafe.durationMin} min, incluse).`,
    `- Pause déjeuner : ${j.dejeuner.start}–${j.dejeuner.end} (${j.dejeuner.durationMin} min).`,
    `- Après-midi : **${j.apresMidi.label}** (4h) — pause café ~${j.apresMidi.pauseCafe.at} (${j.apresMidi.pauseCafe.durationMin} min, incluse).`,
    ``,
    `Total travail : 8h00 pile. NE PAS modifier ces horaires ; les recopier tels quels.`,
  ].join('\n');
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
