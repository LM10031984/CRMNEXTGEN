/**
 * Lot A — pré-affectation d'un scan signé à un participant (spec 2026-09-04 §5 A).
 *
 * « Pré-affectation automatique quand le nom du fichier contient le nom ou
 *   prénom du participant (normalisation sans accents/casse — ex.
 *   `emargement-dupont.pdf` → Dupont), sinon vide. »
 *
 * Fonctions PURES (aucun I/O) : testées seules, réutilisables client + serveur.
 *
 * Règle métier gravée n°4 (signataires résolus, jamais devinés) appliquée ici :
 * en cas d'ambiguïté — deux homonymes, aucun départage possible — on rend
 * `null` et c'est l'admin qui tranche dans la liste d'affectation. Une
 * mauvaise pré-affectation silencieuse mettrait l'émargement d'un stagiaire
 * dans le dossier d'un autre : c'est un faux Qualiopi.
 */

/** Longueur minimale d'un token pour être discriminant (« le », « de »… écartés). */
const MIN_TOKEN_LENGTH = 3;

/** Minuscules, sans accents, ponctuation → espaces simples. */
export function normalizeForMatch(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenize(input: string): string[] {
  return normalizeForMatch(input)
    .split(' ')
    .filter((t) => t.length >= MIN_TOKEN_LENGTH);
}

export interface MatchCandidate {
  id: string;
  fullName: string;
}

/**
 * Rend l'id du participant dont le nom ou prénom apparaît dans le nom de
 * fichier, ou `null` si aucun ne correspond — ou si plusieurs correspondent
 * aussi bien (homonymes non départageables).
 *
 * Départage : le candidat qui partage le PLUS de tokens avec le nom de fichier
 * l'emporte (`emargement-jean-dupont.pdf` → Jean DUPONT plutôt que Marie DUPONT).
 */
export function matchParticipantByFilename(
  filename: string,
  candidates: readonly MatchCandidate[],
): string | null {
  const fileTokens = new Set(tokenize(filename));
  if (fileTokens.size === 0) return null;

  let best: { id: string; score: number } | null = null;
  let tied = false;

  for (const candidate of candidates) {
    const score = tokenize(candidate.fullName).filter((t) => fileTokens.has(t)).length;
    if (score === 0) continue;
    if (!best || score > best.score) {
      best = { id: candidate.id, score };
      tied = false;
    } else if (score === best.score) {
      tied = true;
    }
  }

  if (!best || tied) return null;
  return best.id;
}

/** Pré-affectation de N fichiers : rend un tableau aligné sur `filenames`. */
export function autoAssignFiles(
  filenames: readonly string[],
  candidates: readonly MatchCandidate[],
): Array<string | null> {
  return filenames.map((name) => matchParticipantByFilename(name, candidates));
}

/**
 * Participants affectés plus d'une fois — deux scans pour le même stagiaire
 * s'écraseraient l'un l'autre. L'UI bloque l'enregistrement tant qu'il en reste.
 */
export function findDuplicateAssignments(
  assignments: ReadonlyArray<string | null>,
): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of assignments) {
    if (!id) continue;
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return [...duplicates];
}
