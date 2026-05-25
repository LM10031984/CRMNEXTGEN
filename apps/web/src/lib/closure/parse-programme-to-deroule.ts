/**
 * Parse le programme markdown du produit pour reconstituer un DerouleContent
 * SANS appel IA — les horaires et titres viennent directement du programme.
 *
 * Décision Laurent 05/05/2026 : "le programme et le déroulé pédagogique
 * doivent coïncider". L'IA ne doit pas inventer des horaires (14h37, 12h51…)
 * — elle doit reprendre EXACTEMENT le découpage du programme.
 *
 * Format programme reconnu (variations tolérées) :
 *   Jour 1 : Titre du jour - 9h00
 *   Matin :
 *   8h – 8h30 : Accueil...
 *   8h30 – 10h45 : Module 1
 *     - bullet 1
 *     - bullet 2
 *   10h45-11h00 : Pause
 *   11h00 – 12h30 : Module 2
 *   13h00 – 14h00 : Pause déjeuner
 *   Après-midi :
 *   14h00 – 15h30 : Module 3
 *   ...
 */

import type { DerouleContent, DerouleJour, DerouleSequence } from './deroule-template';

// Headers Jour : "Jour 1 : titre" éventuellement suivi de " - 9h00"
const JOUR_HEADER_RE = /^\s*Jour\s+(\d+)\s*[:\-–—]\s*(.+?)(?:\s*[-–—]\s*\d{1,2}h\d{0,2}.*)?\s*$/i;

// Séquence avec horaire : "8h30 – 10h45 : Titre" ou "9h00 – 10h30 | Titre"
// Tolère espaces multiples, tirets variables, formats 8h/8h00/08h30
// Le séparateur post-heure accepte : : - – — | (format ## 9h00 – 10h30 | Titre)
const SEQ_HORAIRE_RE =
  /^\s*(\d{1,2})\s*h\s*(\d{0,2})\s*[–\-—\s]+\s*(\d{1,2})\s*h\s*(\d{0,2})\s*[:\-–—|]?\s*(.*?)\s*$/;

// Section Matin/Après-midi (à ignorer comme pure structure).
// Tolère : "Matin :", "Matinée :", "Matinée (9h - 13h00) : Capter...",
// "Après-midi : Gagner...", "Après-midi :", etc.
const SECTION_RE = /^\s*(matin(ée|e)?|après[\s-]?midi|apres[\s-]?midi|fin de journée|fin de journee)\b/i;

// Mots-clés indiquant qu'une séquence est une PAUSE (pas une séquence péda)
const PAUSE_KEYWORDS = ['pause déjeuner', 'pause', 'déjeuner', 'dejeuner'];

interface RawSeq {
  startMin: number;
  endMin: number;
  durationMin: number;
  titre: string;
  bullets: string[];
  isPause: boolean;
}

function parseTimeToMin(h: string, m: string): number {
  const hh = parseInt(h, 10);
  const mm = m ? parseInt(m, 10) : 0;
  return hh * 60 + mm;
}

function fmtTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h00` : `${h}h${String(m).padStart(2, '0')}`;
}

function fmtDur(minutes: number): string {
  if (minutes <= 0) return '';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h00` : `${h}h${String(m).padStart(2, '0')}`;
}

function isPauseTitle(titre: string): boolean {
  const t = titre.toLowerCase().trim();
  if (!t) return false;
  return PAUSE_KEYWORDS.some((kw) => t.startsWith(kw)) || t === 'pause';
}

// Liste d'outils typiques rencontrés dans les programmes Start Academy
// (immobilier / IA / management). On détecte par regex word-boundary.
const OUTILS_KEYWORDS = [
  'Canva', 'WhatsApp', 'Notion', 'Airtable', 'Brevo', 'Mailchimp',
  'Google My Business', 'GMB', 'Instagram', 'TikTok', 'Facebook',
  'LinkedIn', 'YouTube', 'Reels', 'Slides', 'PowerPoint', 'Paperboard',
  'Excel', 'Slack', 'Zapier', 'Make', 'ChatGPT', 'Midjourney', 'IA',
  'Trello', 'Loom', 'CRM', 'SMS', 'Email', 'e-mail', 'mail',
  'Vidéo', 'Video', 'PDF', 'Landing page', 'Newsletter',
];

// Mots-clés qui indiquent un exercice/atelier/mise en situation
const EXERCICE_REGEX =
  /\b(atelier|exercice|mise[s]? en situation|simulation|simule[rz]?|pratiquer|pratique|jeux?\s*de\s*rôle|étude[s]? de cas|mini[- ]hack|cas pratiques?|travaux pratiques?|tour de table|quiz|qcm)\b/i;

interface ClassifiedBullets {
  contenu: string;
  outils: string;
  exercice: string;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function classifyBullets(titre: string, bullets: string[]): ClassifiedBullets {
  const contenus: string[] = [];
  const exercices: string[] = [];
  const outilsSet = new Set<string>();

  // Détection des outils dans tout le texte (titre + bullets)
  const allText = [titre, ...bullets].join(' ');
  for (const kw of OUTILS_KEYWORDS) {
    const re = new RegExp(`\\b${escapeRe(kw)}\\b`, 'i');
    if (re.test(allText)) outilsSet.add(kw);
  }

  // Classement bullets : exercice vs contenu
  for (const b of bullets) {
    if (EXERCICE_REGEX.test(b)) {
      exercices.push(b);
    } else {
      contenus.push(b);
    }
  }

  return {
    contenu: contenus.join(' · ') || '—',
    exercice: exercices.join(' · ') || '—',
    outils: Array.from(outilsSet).join(', ') || '—',
  };
}

/**
 * Parse 1 jour : extrait toutes les séquences avec horaire + bullets associés.
 * `lines` est la portion du programme entre 2 headers Jour (exclus).
 */
function parseDayLines(lines: string[]): RawSeq[] {
  const seqs: RawSeq[] = [];
  let current: RawSeq | null = null;

  for (const rawLine of lines) {
    // Strip les préfixes markdown ## avant tout matching
    const line = rawLine.trim().replace(/^#{1,3}\s*/, '');
    if (!line) continue;
    if (SECTION_RE.test(line)) {
      // header "Matin :" / "Après-midi :" — on ignore
      continue;
    }
    const m = line.match(SEQ_HORAIRE_RE);
    if (m) {
      // Nouvelle séquence : flush la précédente
      if (current) seqs.push(current);
      const [, h1, m1, h2, m2, titre] = m;
      const startMin = parseTimeToMin(h1!, m1 || '');
      const endMin = parseTimeToMin(h2!, m2 || '');
      const cleanTitre = titre?.trim() ?? '';
      current = {
        startMin,
        endMin,
        durationMin: Math.max(0, endMin - startMin),
        titre: cleanTitre,
        bullets: [],
        isPause: isPauseTitle(cleanTitre),
      };
      continue;
    }
    // Bullet ou continuation : si on a une séquence en cours, on ajoute
    if (current && line.length > 2) {
      // Nettoie les puces markdown éventuelles
      const cleaned = line.replace(/^[-•*]\s*/, '').trim();
      if (cleaned) current.bullets.push(cleaned);
    }
  }
  if (current) seqs.push(current);
  return seqs;
}

/**
 * Insère des pauses implicites dans les gaps ≥ 30 min entre séquences.
 * Typiquement : gap de 13h00 à 14h00 (norme Start Academy) → "Pause déjeuner".
 * Un gap de 10-15 min est une pause café, ≥ 30 min mérite une ligne dédiée.
 */
function fillGapsWithPauses(seqs: RawSeq[]): RawSeq[] {
  if (seqs.length < 2) return seqs;
  const result: RawSeq[] = [];
  for (let i = 0; i < seqs.length; i++) {
    result.push(seqs[i]!);
    const next = seqs[i + 1];
    if (!next) continue;
    const gap = next.startMin - seqs[i]!.endMin;
    if (gap < 30) continue;
    // Gap midday (fin entre 11h30 et 13h00) = pause déjeuner
    const endMin = seqs[i]!.endMin;
    const isDej = endMin >= 690 && endMin <= 870; // 11h30–14h30 (couvre normes historiques 12h-13h et règle Laurent 13h-14h)
    result.push({
      startMin: endMin,
      endMin: next.startMin,
      durationMin: gap,
      titre: isDej ? 'Pause déjeuner' : 'Pause',
      bullets: [],
      isPause: true,
    });
  }
  return result;
}

/**
 * Convertit un RawSeq en DerouleSequence pour le template.
 */
function rawToSequence(raw: RawSeq, isLastJour: boolean, isLastSeqOfDay: boolean): DerouleSequence {
  const dureeStr = `${fmtTime(raw.startMin)} – ${fmtTime(raw.endMin)} (${fmtDur(raw.durationMin)})`;
  if (raw.isPause) {
    return {
      duree: dureeStr,
      objectifs: raw.titre || 'Pause',
      contenu: '',
      outils: '',
      exercice: '',
      evaluation: '',
      isPause: true,
    };
  }
  // Séquence pédagogique : on classe les bullets en 3 catégories
  // (contenu / exercice / outils) à partir de mots-clés.
  const isClosing = isLastJour && isLastSeqOfDay;
  const classified = classifyBullets(raw.titre, raw.bullets);
  return {
    duree: dureeStr,
    objectifs: raw.titre || (isClosing ? 'Évaluation des acquis et clôture' : 'Séquence pédagogique'),
    contenu: classified.contenu,
    outils: classified.outils,
    exercice: classified.exercice,
    evaluation: isClosing ? 'QCM final + synthèse' : 'Débriefing collectif et axes d\'amélioration',
  };
}

/**
 * Tente de parser le programme markdown pour produire un DerouleContent fidèle.
 * Retourne null si le programme n'a pas de structure horaire reconnaissable.
 *
 * Modes supportés :
 *  - Multi-jours : programme avec headers "Jour 1 : ...", "Jour 2 : ..."
 *  - Mono-jour : programme avec sections "Matinée (...) : ..." + "Après-midi : ..."
 *    (le programme parle d'une seule journée, on regroupe toutes les séquences
 *    sous 1 unique DerouleJour avec un theme de fallback).
 *
 * @param fallbackTitle Titre utilisé pour le `theme` du jour en mode mono-jour
 *                      (ex: titre du produit).
 */
export function parseProgrammeToDeroule(
  programmeMd: string | null | undefined,
  fallbackTitle?: string,
): DerouleContent | null {
  if (!programmeMd || programmeMd.trim().length < 50) return null;

  const lines = programmeMd.split('\n');

  // Repère les indices des headers "Jour N"
  const jourIndices: { idx: number; numero: number; titre: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    // Le programme markdown peut avoir "## Jour 1 : ..." ou "Jour 1 : ..."
    const cleaned = line.replace(/^#{1,3}\s*/, '');
    const m = cleaned.match(JOUR_HEADER_RE);
    if (m) {
      jourIndices.push({
        idx: i,
        numero: parseInt(m[1]!, 10),
        titre: m[2]!.trim(),
      });
    }
  }

  // Mode multi-jours : ≥1 header "Jour N" trouvé
  if (jourIndices.length > 0) {
    const jours: DerouleJour[] = [];
    for (let j = 0; j < jourIndices.length; j++) {
      const start = (jourIndices[j]?.idx ?? 0) + 1;
      const end = jourIndices[j + 1]?.idx ?? lines.length;
      const dayLines = lines.slice(start, end);
      const rawSeqs = fillGapsWithPauses(parseDayLines(dayLines));
      if (rawSeqs.length === 0) continue;
      const isLastJour = j === jourIndices.length - 1;
      // La dernière séquence pédagogique = dernière non-pause
      const lastPedaIdx = rawSeqs.reduce((acc, r, k) => (!r.isPause ? k : acc), -1);
      const sequences: DerouleSequence[] = rawSeqs.map((raw, k) =>
        rawToSequence(raw, isLastJour, k === lastPedaIdx),
      );
      jours.push({ theme: jourIndices[j]!.titre, sequences });
    }
    if (jours.length === 0) return null;
    const hasStructure = jours.some((j) => j.sequences.length >= 3);
    return hasStructure ? { jours } : null;
  }

  // Mode mono-jour : pas de "Jour N" header — on parse tout le programme
  // comme une seule journée. Cas typique : formation 7-8h structurée par
  // "Matinée :" + "Après-midi :".
  const rawSeqs = fillGapsWithPauses(parseDayLines(lines));
  if (rawSeqs.length < 3) return null;
  const lastPedaIdx = rawSeqs.reduce((acc, r, k) => (!r.isPause ? k : acc), -1);
  const sequences: DerouleSequence[] = rawSeqs.map((raw, k) =>
    rawToSequence(raw, true, k === lastPedaIdx),
  );
  return {
    jours: [
      {
        theme: fallbackTitle?.trim() || 'Programme de la journée',
        sequences,
      },
    ],
  };
}
