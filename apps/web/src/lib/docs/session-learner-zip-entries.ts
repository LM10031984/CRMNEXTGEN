/**
 * Entrées de l'archive « les documents d'UN apprenant, pour UNE session,
 * sur UNE phase » (Laurent 2026-09-10).
 *
 * À ne pas confondre avec `learner-zip-entries.ts`, qui empaquette TOUTE la vie
 * documentaire d'une personne (toutes ses sessions) depuis `resolveDocs`. Ici
 * on part des MÊMES références que la matrice de la fiche session
 * (`deriveCellState`), pour une raison précise : `resolveDocs` ne voit que les
 * documents portant `participantId`, donc il RATE la convention d'entreprise —
 * celle rattachée à l'organisation commanditaire et projetée sur chaque
 * salarié par `expandGroupConventions`. Or c'est la pièce n°1 du dossier
 * OPCO. Le ZIP d'une session doit montrer exactement ce que la fiche montre.
 *
 * Module PUR (aucune I/O) : il ne fait que choisir, nommer et dédoublonner.
 * L'appelant dérive les références et lit le stockage.
 */

import { buildDownloadFilename, asciiSlug, personFilenamePart } from './download-filename';
import { phaseOfDocType, phaseSlug, type DocPhase } from './doc-phase';

/** Une pièce résolue pour un apprenant : son type et où la lire. */
export interface LearnerDocRef {
  /** DocType de matrice (`CONVENTION`, `EVALUATION_ACQUIS`…). */
  docType: string;
  /** Table d'origine — l'appelant sait où lire la clé de stockage. */
  kind: 'document' | 'asset';
  id: string;
}

export interface SessionLearnerZipEntry {
  /** Chemin dans l'archive. */
  path: string;
  kind: 'document' | 'asset';
  id: string;
  docType: string;
}

export interface SessionLearnerZipInput {
  refs: readonly LearnerDocRef[];
  /** `null` = dossier complet, rangé en sous-dossiers par phase. */
  phase: DocPhase | null;
  firstName: string | null;
  lastName: string | null;
  /** Code de session lisible, ex. `SES-0110`. */
  sessionCode: string | null;
}

/**
 * Deux documents peuvent produire le même nom (même type résolu deux fois,
 * apprenant sans prénom…). `archiver` accepterait le doublon en silence et
 * l'utilisateur perdrait un fichier à la décompression.
 */
function dedupe(path: string, taken: Set<string>): string {
  if (!taken.has(path)) {
    taken.add(path);
    return path;
  }
  const dot = path.lastIndexOf('.');
  const base = dot > 0 ? path.slice(0, dot) : path;
  const ext = dot > 0 ? path.slice(dot) : '';
  let n = 2;
  while (taken.has(`${base}-${n}${ext}`)) n++;
  const unique = `${base}-${n}${ext}`;
  taken.add(unique);
  return unique;
}

export function buildSessionLearnerZipEntries(
  input: SessionLearnerZipInput,
): SessionLearnerZipEntry[] {
  const taken = new Set<string>();
  // Une même référence peut être résolue pour deux docTypes (le programme
  // produit partagé, par exemple) : on ne l'empaquette qu'une fois.
  const seenRefs = new Set<string>();

  return input.refs
    .filter((r) => {
      if (input.phase && phaseOfDocType(r.docType) !== input.phase) return false;
      const sig = `${r.kind}:${r.id}`;
      if (seenRefs.has(sig)) return false;
      seenRefs.add(sig);
      return true;
    })
    // Tri stable : deux archives du même apprenant se comparent à l'œil.
    .sort((a, b) => a.docType.localeCompare(b.docType))
    .map((ref) => {
      const filename = buildDownloadFilename({
        docType: ref.docType,
        firstName: input.firstName,
        lastName: input.lastName,
        sessionCode: input.sessionCode,
      });
      // Dossier complet → sous-dossiers par phase, pour que Laurent retrouve
      // « ce qui est parti avant » sans lire les noms un par un. Phase unique
      // demandée → archive à plat, le dossier serait un clic de plus pour rien.
      const folder = input.phase
        ? ''
        : `${phaseSlug(phaseOfDocType(ref.docType) ?? 'apres')}/`;
      return {
        path: dedupe(`${folder}${filename}`, taken),
        kind: ref.kind,
        id: ref.id,
        docType: ref.docType,
      };
    });
}

/**
 * Nom de l'archive.
 * `Avant-la-formation-Johanna-FOURNEAU-SES-0110.zip`, ou
 * `Dossier-complet-Johanna-FOURNEAU-SES-0110.zip` sans phase.
 *
 * La phase EN TÊTE : dans le dossier Téléchargements, les archives se rangent
 * alors par phase puis par apprenant, ce qui est l'ordre dans lequel Laurent
 * monte un dossier OPCO.
 */
export function buildSessionLearnerZipFilename(input: {
  phase: DocPhase | null;
  firstName: string | null;
  lastName: string | null;
  sessionCode: string | null;
}): string {
  const segments = [
    input.phase ? phaseSlug(input.phase) : 'Dossier-complet',
    personFilenamePart(input.firstName, input.lastName),
    asciiSlug(input.sessionCode),
  ].filter(Boolean);
  return `${segments.join('-')}.zip`;
}
