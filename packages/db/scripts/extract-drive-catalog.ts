/**
 * Extraction du corpus pédagogique vers un INSTANTANÉ versionné (lot I-1, D-19).
 *
 *   pnpm --filter @qualiof/db extract:drive-catalog
 *
 * Deux sources, un seul fichier de sortie :
 *   • le Drive « Formations et programmes » (dossiers 000 → 074) — la
 *     production réelle de Start Academy, en `.docx` ;
 *   • la formation Faros (`SA_<FAM>_M<NNN>_..._LIVRAISON_*`) — des modules
 *     finis, un par paquet de livraison.
 *
 * Pourquoi un instantané plutôt qu'une lecture directe à l'import : c'est le
 * pattern déjà retenu pour le catalogue diagnostic (`diag-module-catalog.json`),
 * et il tient pour trois raisons. L'import devient rejouable sur une machine où
 * le Drive n'est pas monté ; la revue de Laurent porte sur un fichier lisible
 * plutôt que sur un dossier cloud qui bouge ; et un `git diff` montre ce que
 * l'évolution du Drive change AVANT que ça n'atteigne la base.
 *
 * Ce script ne touche JAMAIS la base de données. Il lit des fichiers et écrit
 * un JSON. L'écriture en base, c'est `import-drive-catalog.ts`.
 *
 * Sur le découpage en modules : on ne devine pas, on RECONNAÎT. Le gabarit
 * Qualiopi de Start Academy est régulier, et quatre motifs couvrent la
 * production ; chaque programme dit lequel l'a découpé (`parsePattern`), et
 * celui qu'aucun motif n'attrape sort en UN module portant tout le déroulé,
 * jamais en zéro module silencieux.
 */

import { inflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { candidatsNxtCoach, premierEmplacementPorteur } from './lib/corpus-local.js';
import { retirerMentionsOrganisme } from './lib/mentions-organisme.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, 'data/drive-programmes-catalog.json');

const HOME = process.env.HOME ?? '';
const DRIVE_DIR =
  process.env.DRIVE_CATALOG_DIR ??
  path.join(
    HOME,
    'Library/CloudStorage/GoogleDrive-laurent@start-academy.fr/Drive partagés/Start Academy Drive/Start Academy/Formations et programmes',
  );
/** Un paquet de livraison Faros : `SA_<FAM>_M<NNN>_..._LIVRAISON_*`. */
const PAQUET_FAROS = /^SA_[A-Z]{3}_M\d{3}_.*LIVRAISON/;

/**
 * Le corpus Faros — déplacé hors d'iCloud le 11/09/2026, comme le dépôt.
 *
 * `~/Documents` est synchronisé par iCloud, qui duplique les fichiers pendant
 * qu'on les édite. Le dossier Faros a donc suivi le dépôt vers `~/Projects`.
 *
 * Le piège, vérifié le 11/09 : l'ANCIEN chemin existe toujours — iCloud y a
 * laissé un dossier **vide** et un sosie « Formation Faros 2 ». Un simple
 * `existsSync` y réussit donc et rend ZÉRO programme. C'est ainsi qu'une
 * extraction a perdu `faros:SA-ADM-M001` et `faros:SA-ACQ-M003` sans un mot.
 *
 * On ne se contente plus de l'existence : on cherche le premier emplacement qui
 * porte réellement un paquet de livraison. Un `FAROS_DIR` explicite reste
 * souverain — si on le pose, c'est qu'on sait ce qu'on fait.
 *
 * La recherche vit dans `lib/corpus-local.ts`, partagée avec
 * `import-diag-catalog.ts` : deux copies de ce raisonnement finiraient par
 * diverger, et c'est précisément une divergence muette qui a coûté deux
 * programmes.
 */
function trouverFaros(): string {
  const explicite = process.env.FAROS_DIR;
  if (explicite !== undefined && explicite.length > 0) return explicite;
  const candidats = candidatsNxtCoach();
  const porteur = premierEmplacementPorteur(candidats, (entrees) =>
    entrees.some((f) => PAQUET_FAROS.test(f)),
  );
  // Repli sur le premier candidat : le message d'erreur doit nommer un chemin.
  return porteur ?? candidats[0]!;
}

const FAROS_DIR = trouverFaros();

// ─────────────────────────────────────────────────────────────────────────────
// Lecture .docx — un .docx est un ZIP, et `word/document.xml` en est le texte
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extrait une entrée d'un ZIP sans dépendance externe.
 *
 * On passe par le répertoire central plutôt que par les en-têtes locaux : les
 * en-têtes locaux peuvent annoncer une taille nulle et renvoyer à un descripteur
 * placé APRÈS les données (bit 3 des flags), auquel cas on ne sait pas où
 * s'arrête l'entrée. Le répertoire central, lui, porte toujours les tailles.
 */
function readZipEntry(buf: Buffer, name: string): Buffer | null {
  let eocd = -1;
  const floor = Math.max(0, buf.length - 22 - 65536);
  for (let i = buf.length - 22; i >= floor; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;

  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);

  for (let i = 0; i < count; i++) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== 0x02014b50) return null;
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const entryName = buf.toString('utf8', off + 46, off + 46 + nameLen);

    if (entryName === name) {
      const lNameLen = buf.readUInt16LE(localOff + 26);
      const lExtraLen = buf.readUInt16LE(localOff + 28);
      const start = localOff + 30 + lNameLen + lExtraLen;
      const raw = buf.subarray(start, start + compSize);
      return method === 0 ? Buffer.from(raw) : inflateRawSync(raw);
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#8217;': '\u2019',
  '&#160;': '\u00a0',
};

function decode(raw: string): string {
  let text = raw.replace(/<[^>]+>/g, '');
  for (const [entity, char] of Object.entries(ENTITIES)) {
    text = text.split(entity).join(char);
  }
  return text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Une ligne du document, avec ce que Word sait de sa PLACE dans les listes.
 *
 * `numId` est l'identifiant de la liste à puces à laquelle le paragraphe
 * appartient. C'est le seul indice fiable pour distinguer un titre de section
 * de ses puces filles quand rien, dans le texte, ne les sépare — et le gabarit
 * de Start Academy est exactement dans ce cas sur une bonne moitié du corpus.
 */
export interface DocxLine {
  text: string;
  numId: string | null;
}

/** Les lignes d'un .docx, dans l'ordre, avec leur liste d'appartenance. */
export function readDocxLines(file: string): DocxLine[] {
  const xml = readZipEntry(readFileSync(file), 'word/document.xml');
  if (!xml) return [];
  const doc = xml.toString('utf8');
  const out: DocxLine[] = [];
  for (const para of doc.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []) {
    const numId = /<w:numId w:val="(\d+)"/.exec(para)?.[1] ?? null;
    // Un saut de ligne Word (`<w:br/>`) vaut une ligne, comme la fin de
    // paragraphe : sans ça, un titre et son contenu se retrouvent collés. Les
    // morceaux gardent le `numId` de leur paragraphe d'origine.
    for (const piece of para.split(/<w:br\s*\/?>/)) {
      out.push({ text: decode(piece), numId });
    }
  }
  return out;
}

/** Le texte d'un .docx, un paragraphe par ligne. */
export function readDocxText(file: string): string {
  return readDocxLines(file)
    .map((l) => l.text)
    .join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Le gabarit Qualiopi de Start Academy
// ─────────────────────────────────────────────────────────────────────────────

/** Sans accents ni casse — les intitulés du corpus sont irréguliers. */
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Là où commence le déroulé pédagogique, **par ordre de spécificité**.
 *
 * L'ordre compte, et le fait de retenir la PREMIÈRE occurrence aussi : le
 * gabarit Qualiopi répète « LES MOYENS PÉDAGOGIQUES ET TECHNIQUES » en pied de
 * document, après le programme. Retenir la dernière occurrence sautait tout le
 * déroulé — c'est ce qui faisait tomber « Booster vendeur » en un seul bloc
 * alors qu'il porte sept séquences horodatées.
 */
const BODY_START = [
  /contenu detaille de la formation/,
  /^programme( de la formation)?$/,
  /^le programme/,
  /moyens pedagogiques et techniques/,
];

/**
 * Là où il s'arrête. Tout ce qui suit est administratif (encadrement,
 * évaluation, inscription, accessibilité, tarif) et n'a rien à faire dans un
 * module — c'est du texte de convention, pas du contenu pédagogique.
 */
const BODY_END = [
  /encadrement de l['’ ]?action/,
  /moyens d['’ ]?evaluation/,
  /modalites d['’ ]?inscription/,
  /accessibilite aux personnes/,
  /^tarif/,
  /^contact/,
  /delai d['’ ]?acces/,
];

/**
 * Ce qui n'est pas un module, même quand le gabarit lui donne un créneau.
 *
 * Une pause déjeuner et un tour de table ont une heure de début et une heure de
 * fin ; ils ne se recommandent pas pour autant. Les laisser entrer polluerait
 * chaque axe de proposition d'un « Pause » de 30 minutes.
 */
const NOT_A_MODULE =
  /^(pause|dejeuner|repas|accueil|emargement|qcm|quiz de fin|questionnaire|tour de table|cloture|bilan de fin|synthese et cloture|fin de journee|evaluation des acquis)/;

interface ExtractedModule {
  sourceRef: string;
  order: number;
  title: string;
  contentMd: string;
  durationMin: number | null;
  /** D'où sort la durée — jamais deviné en silence. */
  durationSource: 'horaire' | 'declaree' | 'inconnue';
}

interface ExtractedProgramme {
  sourceRef: string;
  origin: 'drive' | 'faros';
  /** Le numéro du Drive (« 058 ») ou le code Faros (« SA-ACQ-M003 »). */
  reference: string;
  /**
   * Le nom que Laurent a donné au programme — le nom de DOSSIER pour le Drive.
   *
   * Il fait foi sur l'en-tête du .docx, qui est souvent un reste de copier-coller
   * du programme voisin : trois dossiers différents sortaient tous « Vente de
   * mandats exclusifs » alors que leur contenu, lui, était bon. Le dossier, on
   * le renomme quand on range ; l'en-tête interne, personne ne le relit.
   */
  title: string;
  /** Ce que le document dit de lui-même — gardé pour la revue, jamais retenu. */
  documentTitle: string;
  folder: string;
  file: string;
  objectives: string[];
  targetAudience: string | null;
  prerequisites: string | null;
  declaredDuration: string | null;
  /** Le motif qui a découpé ce programme. */
  parsePattern:
    | 'horaire'
    | 'module'
    | 'demi-journee'
    | 'duree-declaree'
    | 'liste-imbriquee'
    | 'bloc-unique';
  modules: ExtractedModule[];
  warnings: string[];
}

// ── Les quatre motifs de découpage ───────────────────────────────────────────

/** « 9h30 – 11h00 : Titre », « 9h30-10h45 Titre ». */
const P_HORAIRE =
  /^[^\w(]{0,4}(\d{1,2})\s*[hH:](\d{2})?\s*[–\-—à]+\s*(\d{1,2})\s*[hH:](\d{2})?\s*[:\-–—]?\s*(.*)$/;
/** « Module 3 : Titre », « Séquence 2 — Titre », « Jour 1 : Titre ». */
const P_MODULE = /^\s*(?:module|s[ée]quence|partie|chapitre|jour|atelier)\s*(?:n°)?\s*\d+\s*[:.\-–—]?\s*(.*)$/i;
/** « Demi-journée 1 — 09h00 à 13h00 » : le titre est sur la ligne SUIVANTE. */
const P_DEMI = /^\s*demi[-\s]?journ[ée]e\s*(?:n°)?\s*\d+/i;
/** « Durée : 2 heures » / « Durée : 2.5 heures » : le titre est AVANT. */
const P_DUREE = /^\s*dur[ée]e\s*[:\-]?\s*([\d.,]+)\s*(h|heure)/i;

function minutesBetween(h1: number, m1: number, h2: number, m2: number): number | null {
  const start = h1 * 60 + m1;
  const end = h2 * 60 + m2;
  const d = end - start;
  return d > 0 && d <= 8 * 60 ? d : null;
}

/** Le corps pédagogique : ce qui est entre le déroulé et l'administratif. */
function bodyLines(lines: DocxLine[]): DocxLine[] {
  let start = 0;
  for (const re of BODY_START) {
    const i = lines.findIndex((l) => re.test(norm(l.text)));
    if (i >= 0) {
      start = i + 1;
      break;
    }
  }
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (BODY_END.some((re) => re.test(norm(lines[i]!.text)))) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end);
}

interface RawSection {
  title: string;
  durationMin: number | null;
  durationSource: 'horaire' | 'declaree' | 'inconnue';
  content: string[];
}

function cutByHoraire(lines: DocxLine[]): RawSection[] {
  const out: RawSection[] = [];
  for (const { text: line } of lines) {
    const m = P_HORAIRE.exec(line);
    if (m && (m[5] ?? '').trim().length > 4) {
      out.push({
        title: m[5]!.trim(),
        durationMin: minutesBetween(+m[1]!, +(m[2] ?? 0), +m[3]!, +(m[4] ?? 0)),
        durationSource: 'horaire',
        content: [],
      });
    } else if (out.length > 0 && line.length > 0) {
      out[out.length - 1]!.content.push(line);
    }
  }
  return out;
}

function cutByModule(lines: DocxLine[]): RawSection[] {
  const out: RawSection[] = [];
  for (const { text: line } of lines) {
    const m = P_MODULE.exec(line);
    if (m) {
      // « Module 3 » seul : le titre est sur la ligne suivante, on la prendra
      // au premier contenu rencontré.
      out.push({
        title: (m[1] ?? '').trim(),
        durationMin: null,
        durationSource: 'inconnue',
        content: [],
      });
    } else if (out.length > 0 && line.length > 0) {
      const cur = out[out.length - 1]!;
      if (cur.title.length === 0) cur.title = line;
      else cur.content.push(line);
    }
  }
  return out;
}

function cutByDemiJournee(lines: DocxLine[]): RawSection[] {
  const out: RawSection[] = [];
  for (const { text: line } of lines) {
    if (P_DEMI.test(line)) {
      const m = P_HORAIRE.exec(line.replace(/^.*?(?=\d{1,2}\s*[hH:])/, ''));
      out.push({
        title: '',
        durationMin: m ? minutesBetween(+m[1]!, +(m[2] ?? 0), +m[3]!, +(m[4] ?? 0)) : null,
        durationSource: m ? 'horaire' : 'inconnue',
        content: [],
      });
    } else if (out.length > 0 && line.length > 0) {
      const cur = out[out.length - 1]!;
      if (cur.title.length === 0) cur.title = line;
      else cur.content.push(line);
    }
  }
  return out;
}

function cutByDureeDeclaree(all: DocxLine[]): RawSection[] {
  const lines = all.map((l) => l.text);
  const out: RawSection[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = P_DUREE.exec(lines[i]!);
    if (m && i > 0) {
      // Le titre est la ligne précédente ; on la retire du contenu de la
      // section d'avant, où elle vient d'être rangée à tort.
      const title = lines[i - 1]!.trim();
      const prev = out[out.length - 1];
      if (prev && prev.content[prev.content.length - 1] === title) prev.content.pop();
      out.push({
        title,
        durationMin: Math.round(parseFloat(m[1]!.replace(',', '.')) * 60),
        durationSource: 'declaree',
        content: [],
      });
    } else if (out.length > 0 && lines[i]!.length > 0) {
      out[out.length - 1]!.content.push(lines[i]!);
    }
  }
  return out;
}

/**
 * Cinquième motif : la LISTE IMBRIQUÉE de Word.
 *
 * Une bonne moitié du corpus n'horodate rien et ne numérote rien. « Maîtriser
 * le discours du rendez-vous de suivi » y est un titre de séquence, et les
 * trois lignes qui suivent en sont le détail — mais rien, dans le texte, ne les
 * distingue : même casse, même ponctuation, même puce à l'écran.
 *
 * Word, lui, le sait : chaque paragraphe porte le `numId` de sa liste, et le
 * gabarit range les titres dans UNE liste et chaque bloc de détails dans la
 * SIENNE. On repère donc la liste « chapeau » comme celle qui introduit le plus
 * de listes filles distinctes — c'est la définition même d'un plan.
 *
 * On ne devine pas la hiérarchie à partir des mots : on lit celle que l'auteur
 * a réellement posée en écrivant le document.
 */
function cutByListeImbriquee(lines: DocxLine[]): RawSection[] {
  const withNum = lines.filter((l) => l.numId !== null && l.text.length > 0);
  if (withNum.length < 4) return [];

  // Pour chaque liste, les listes DIFFÉRENTES qui suivent immédiatement ses
  // lignes. Celle qui en introduit le plus est la liste chapeau.
  const introduces = new Map<string, Set<string>>();
  for (let i = 0; i < withNum.length - 1; i++) {
    const here = withNum[i]!.numId!;
    const next = withNum[i + 1]!.numId!;
    if (next === here) continue;
    if (!introduces.has(here)) introduces.set(here, new Set());
    introduces.get(here)!.add(next);
  }
  let outline: string | null = null;
  let best = 1;
  for (const [numId, children] of introduces) {
    if (children.size > best) {
      best = children.size;
      outline = numId;
    }
  }
  if (outline === null) return [];

  const out: RawSection[] = [];
  for (const line of lines) {
    if (line.text.length === 0) continue;
    if (line.numId === outline) {
      out.push({ title: line.text, durationMin: null, durationSource: 'inconnue', content: [] });
    } else if (out.length > 0) {
      out[out.length - 1]!.content.push(line.text);
    }
  }
  // Un titre sans le moindre détail n'est pas un titre : c'est une puce du
  // chapeau restée seule. On ne retient que ce qui porte du contenu.
  return out.filter((sec) => sec.content.length > 0);
}

/**
 * Nettoie une section, puis dit si elle mérite d'être un module.
 *
 * Le nettoyage vaut pour TOUS les motifs, pas seulement pour l'horodaté : un
 * titre découpé par la liste Word peut très bien commencer par « 13h00-14h00 ».
 * Tant que le créneau reste collé au titre, deux choses cassent — la durée est
 * perdue alors qu'elle est écrite noir sur blanc, et « 13h00-14h00 Pause »
 * échappe au filtre des lignes logistiques, qui n'attend « pause » qu'en tête.
 * On enlève donc le créneau du titre, et on lui prend sa durée au passage.
 */
function refine(section: RawSection): RawSection {
  const m = P_HORAIRE.exec(section.title);
  if (!m || (m[5] ?? '').trim().length < 4) return section;
  const minutes = minutesBetween(+m[1]!, +(m[2] ?? 0), +m[3]!, +(m[4] ?? 0));
  return {
    ...section,
    title: m[5]!.trim(),
    durationMin: section.durationMin ?? minutes,
    durationSource: section.durationMin !== null ? section.durationSource : minutes !== null ? 'horaire' : section.durationSource,
  };
}

/** Les sections retenues : celles qui ont un vrai titre et ne sont pas logistiques. */
function keepReal(sections: RawSection[]): RawSection[] {
  return sections
    .map(refine)
    .filter((s) => s.title.length > 4 && !NOT_A_MODULE.test(norm(s.title)));
}

/** Un champ du gabarit : ce qui suit un intitulé, jusqu'au suivant en capitales. */
function sectionAfter(all: DocxLine[], pattern: RegExp, max = 12): string[] {
  const lines = all.map((l) => l.text);
  const i = lines.findIndex((l) => pattern.test(norm(l)));
  if (i < 0) return [];
  const out: string[] = [];
  for (let j = i + 1; j < lines.length && out.length < max; j++) {
    const line = lines[j]!;
    if (line.length === 0) continue;
    // Un nouvel intitulé de gabarit : tout en capitales, et pas une phrase.
    if (line === line.toUpperCase() && line.replace(/[^A-ZÀ-Ý]/g, '').length > 6) break;
    out.push(line);
  }
  return out;
}

function parseProgramme(
  docLines: DocxLine[],
  meta: {
    sourceRef: string;
    origin: 'drive' | 'faros';
    reference: string;
    folder: string;
    file: string;
    title?: string;
  },
): ExtractedProgramme {
  const lines = docLines;
  const nonEmpty = lines.map((l) => l.text).filter((l) => l.length > 0);
  const warnings: string[] = [];

  const body = bodyLines(lines).filter((l) => l.text.length > 0);

  const candidates: { pattern: ExtractedProgramme['parsePattern']; sections: RawSection[] }[] = [
    { pattern: 'demi-journee', sections: keepReal(cutByDemiJournee(body)) },
    { pattern: 'horaire', sections: keepReal(cutByHoraire(body)) },
    { pattern: 'module', sections: keepReal(cutByModule(body)) },
    { pattern: 'duree-declaree', sections: keepReal(cutByDureeDeclaree(body)) },
    { pattern: 'liste-imbriquee', sections: keepReal(cutByListeImbriquee(body)) },
  ];
  const best = candidates.reduce((a, b) => (b.sections.length > a.sections.length ? b : a));

  const title =
    nonEmpty.find((l) => l.length > 3 && !/^start academy/i.test(l)) ?? meta.reference;

  let pattern = best.pattern;
  let sections = best.sections;
  if (sections.length < 2) {
    // Aucun motif ne l'attrape. Plutôt qu'un programme invisible, on en fait UN
    // module portant tout le déroulé : il reste recommandable par son intitulé,
    // et le rapport dit qu'il attend un découpage à la main.
    pattern = 'bloc-unique';
    sections = [
      { title, durationMin: null, durationSource: 'inconnue', content: body.map((l) => l.text) },
    ];
    warnings.push('Aucun découpage reconnu — importé en un seul module, à découper à la main.');
  }

  // Les MENTIONS D'ORGANISME sortent du déroulé, ici et nulle part ailleurs.
  //
  // Le gabarit Qualiopi se termine par « QCM évaluation des acquis » et
  // « Questionnaire de satisfaction et clôture de la formation » ; typographiées
  // comme le reste, elles ont été avalées comme des puces du déroulé. Elles ont
  // déjà leur place légitime : la section « Modalités d'évaluation » du programme
  // composé, portée par l'ORGANISME. Dans un déroulé remis à un financeur, c'est
  // du doublon — et un financeur le lit.
  //
  // La normalisation se fait à l'EXTRACTION, JAMAIS par une correction en base :
  // vérifié le 11/09/2026, un point final retiré à la main en base est revenu au
  // premier `--apply`. Le filtre et son périmètre exact sont défendus dans
  // `lib/mentions-organisme.ts`.
  const modules: ExtractedModule[] = sections.map((s, i) => {
    const sourceRef = `${meta.sourceRef}#${i + 1}`;
    const brut = s.content.map((l) => `- ${l}`).join('\n');
    const { contentMd, retirees } = retirerMentionsOrganisme(brut);
    // Un module que le filtre vide ENTIÈREMENT ne part pas en silence : il se
    // nomme. Ce sont des modules FANTÔMES nés du pied de page — leur « titre »
    // est en réalité le dernier objectif de la liste précédente. Leur découpage
    // est le lot 3, pas ici.
    if (retirees.length > 0 && contentMd.trim().length === 0) {
      warnings.push(
        `\`${sourceRef}\` — déroulé entièrement fait de mentions d'organisme — vidé (module fantôme né du pied de page, découpage au lot 3).`,
      );
    }
    return {
      sourceRef,
      order: i + 1,
      title: s.title.slice(0, 200),
      contentMd,
      durationMin: s.durationMin,
      durationSource: s.durationSource,
    };
  });

  const sansDuree = modules.filter((m) => m.durationMin === null).length;
  if (sansDuree > 0) {
    warnings.push(`${sansDuree} module(s) sans durée lisible — défaut appliqué à l'import.`);
  }

  const objectives = sectionAfter(lines, /objectifs? p[ée]dagogiques?/).filter(
    (l) => !/^a l['’ ]issue/i.test(l) && !/^l['’ ]objectif d['’ ]une action/i.test(l),
  );
  if (objectives.length === 0) warnings.push('Aucun objectif pédagogique lisible.');

  return {
    sourceRef: meta.sourceRef,
    origin: meta.origin,
    reference: meta.reference,
    title: (meta.title ?? title).slice(0, 250),
    documentTitle: title.slice(0, 250),
    folder: meta.folder,
    file: meta.file,
    objectives,
    targetAudience: sectionAfter(lines, /public vis[ée]/, 4).join(' ') || null,
    prerequisites:
      sectionAfter(lines, /niveau de connaissances? pr[ée]alables?/, 2).join(' ') || null,
    declaredDuration: sectionAfter(lines, /^la dur[ée]e de (la )?formation/, 2).join(' ') || null,
    parsePattern: pattern,
    modules,
    warnings,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Parcours des deux sources
// ─────────────────────────────────────────────────────────────────────────────

function docxIn(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.docx') && !f.startsWith('~$') && !f.startsWith('.'))
    .sort();
}

/**
 * Le fichier PROGRAMME d'un dossier Drive.
 *
 * Un dossier contient souvent une convention, un QCM, une check-list et le
 * programme. On préfère le fichier qui se nomme « PROGRAMME », et à défaut
 * celui dont le découpage donne le plus de sections — c'est le programme, les
 * autres n'en ont pas.
 */
function pickProgrammeFile(
  dir: string,
  files: string[],
): { file: string; lines: DocxLine[] } | null {
  const scored = files.map((f) => {
    const lines = readDocxLines(path.join(dir, f));
    const body = bodyLines(lines).filter((l) => l.text.length > 0);
    const sections = Math.max(
      keepReal(cutByHoraire(body)).length,
      keepReal(cutByModule(body)).length,
      keepReal(cutByDemiJournee(body)).length,
      keepReal(cutByDureeDeclaree(body)).length,
      keepReal(cutByListeImbriquee(body)).length,
    );
    const named = /programme/i.test(f) ? 1000 : 0;
    const convention = /convention|certificat|qcm|check[\s-]?list|attestation/i.test(f) ? -500 : 0;
    const size = lines.reduce((n, l) => n + l.text.length, 0);
    return { file: f, lines, size, score: named + convention + sections };
  });
  const best = scored.sort((a, b) => b.score - a.score)[0];
  return best && best.size > 200 ? { file: best.file, lines: best.lines } : null;
}

function extractDrive(): ExtractedProgramme[] {
  if (!existsSync(DRIVE_DIR)) {
    console.error(`⚠  Drive introuvable : ${DRIVE_DIR}\n   (monter Google Drive, ou DRIVE_CATALOG_DIR=…)`);
    return [];
  }
  const out: ExtractedProgramme[] = [];
  for (const folder of readdirSync(DRIVE_DIR).sort()) {
    const dir = path.join(DRIVE_DIR, folder);
    if (!statSync(dir).isDirectory()) continue;
    const num = /^(\d{3})/.exec(folder);
    if (!num) continue;

    const files = docxIn(dir);
    if (files.length === 0) {
      out.push({
        sourceRef: `drive:${num[1]}`,
        origin: 'drive',
        reference: num[1]!,
        title: folder.replace(/^\d{3}[.\s-]*/, '').trim(),
        documentTitle: '',
        folder,
        file: '',
        objectives: [],
        targetAudience: null,
        prerequisites: null,
        declaredDuration: null,
        parsePattern: 'bloc-unique',
        modules: [],
        warnings: ['Aucun .docx dans le dossier — rien à importer.'],
      });
      continue;
    }
    const picked = pickProgrammeFile(dir, files);
    if (!picked) {
      out.push({
        sourceRef: `drive:${num[1]}`,
        origin: 'drive',
        reference: num[1]!,
        title: folder.replace(/^\d{3}[.\s-]*/, '').trim(),
        documentTitle: '',
        folder,
        file: '',
        objectives: [],
        targetAudience: null,
        prerequisites: null,
        declaredDuration: null,
        parsePattern: 'bloc-unique',
        modules: [],
        warnings: ['Aucun .docx lisible — rien à importer.'],
      });
      continue;
    }
    out.push(
      parseProgramme(picked.lines, {
        sourceRef: `drive:${num[1]}`,
        origin: 'drive',
        reference: num[1]!,
        folder,
        file: picked.file,
        title: folder.replace(/^\d{3}[.\s-]*/, '').trim(),
      }),
    );
  }
  return out;
}

/** Un champ du tableau « Champ / Décision » du master Faros. */
function farosField(lines: string[], label: string): string | null {
  const i = lines.findIndex((l) => norm(l) === norm(label));
  return i >= 0 && i + 1 < lines.length ? (lines[i + 1] ?? null) : null;
}

function extractFaros(): ExtractedProgramme[] {
  if (!existsSync(FAROS_DIR)) {
    console.error(`⚠  Faros introuvable : ${FAROS_DIR}`);
    return [];
  }
  const out: ExtractedProgramme[] = [];
  for (const folder of readdirSync(FAROS_DIR).sort()) {
    if (!PAQUET_FAROS.test(folder)) continue;
    const master = path.join(FAROS_DIR, folder, '01_MASTER');
    if (!existsSync(master)) continue;
    const files = docxIn(master).filter((f) => /MASTER_PRODUCTION/i.test(f));
    if (files.length === 0) continue;

    const docLines = readDocxLines(path.join(master, files[0]!));
    const lines = docLines.map((l) => l.text);
    const code = farosField(lines, 'Code') ?? folder.split('_').slice(0, 3).join('-');
    const title = farosField(lines, 'Titre') ?? folder;
    const pilier = farosField(lines, 'Pilier');
    const profil = farosField(lines, 'Profil diagnostic');

    const parsed = parseProgramme(docLines, {
      sourceRef: `faros:${code}`,
      origin: 'faros',
      reference: code,
      folder,
      file: files[0]!,
      title,
    });
    if (pilier) parsed.targetAudience = parsed.targetAudience ?? pilier;
    if (profil) {
      // « Profil diagnostic » est la seule chose du corpus Faros qui ressemble à
      // un signal de rendez-vous. On la transporte telle quelle : l'import en
      // fera un signal, sans jamais en inventer un second.
      parsed.warnings.push(`Profil diagnostic déclaré : ${profil}`);
    }
    out.push(parsed);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────

const programmes = [...extractDrive(), ...extractFaros()];

// ── Un instantané TRONQUÉ ne s'écrit pas ────────────────────────────────────
//
// Ce fichier est commité, et le `git diff` sert de revue. Écrire un instantané
// auquel une source entière manque, c'est proposer à la relecture un diff de
// centaines de suppressions où il faudrait deviner lesquelles sont voulues.
//
// Le cas s'est produit le 11/09/2026 : le dossier Faros avait déménagé, l'ancien
// chemin existait encore mais vide, et l'extraction a rendu 74 programmes au lieu
// de 76 sans un avertissement. On refuse désormais d'écrire, plutôt que d'écrire
// un mensonge plausible. L'import, lui, ne lit que ce JSON : une machine sans le
// Drive reste capable d'importer, elle n'a simplement pas à ré-extraire.
const parOrigine = {
  drive: programmes.filter((p) => p.origin === 'drive').length,
  faros: programmes.filter((p) => p.origin === 'faros').length,
};
if (parOrigine.drive === 0 || parOrigine.faros === 0) {
  console.error(
    `\n⛔ Instantané NON écrit — une source est muette (drive : ${parOrigine.drive} programme(s), faros : ${parOrigine.faros}).`,
  );
  console.error(`   Drive : ${DRIVE_DIR}`);
  console.error(`   Faros : ${FAROS_DIR}`);
  console.error(
    `   Monter la source manquante (ou poser DRIVE_CATALOG_DIR / FAROS_DIR), puis relancer.\n`,
  );
  process.exit(1);
}

const snapshot = {
  extractedAt: new Date().toISOString(),
  // Le NOM des sources, pas leur chemin : un chemin absolu embarque le dossier
  // personnel et l'adresse e-mail du compte Drive, et ce fichier est commité.
  // Les chemins réels restent configurables par `DRIVE_CATALOG_DIR` / `FAROS_DIR`.
  sources: { drive: path.basename(DRIVE_DIR), faros: path.basename(FAROS_DIR) },
  programmes,
};
writeFileSync(OUT, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

const modules = programmes.reduce((s, p) => s + p.modules.length, 0);
const vides = programmes.filter((p) => p.modules.length === 0).length;
const blocs = programmes.filter((p) => p.parsePattern === 'bloc-unique').length;

console.log(`\n=== Instantané écrit : ${path.relative(process.cwd(), OUT)} ===`);
console.log(`   ${programmes.length} programmes · ${modules} modules`);
console.log(`   dont ${blocs} en bloc unique (à découper à la main) et ${vides} sans contenu\n`);
for (const p of programmes) {
  const flag = p.modules.length === 0 ? '!!' : p.parsePattern === 'bloc-unique' ? ' ~' : '  ';
  console.log(
    `${flag} ${p.sourceRef.padEnd(18)} ${String(p.modules.length).padStart(3)} mod  ${p.parsePattern.padEnd(14)} ${p.title.slice(0, 58)}`,
  );
}
