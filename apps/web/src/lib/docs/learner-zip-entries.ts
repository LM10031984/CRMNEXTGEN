/**
 * Construction des entrées du ZIP « tous les documents d'un apprenant ».
 *
 * Demande Laurent 2026-09-08 : « ça serait bien qu'il y ait un bouton pour
 * télécharger tous les documents pour un apprenant ». Le pendant, côté
 * personne, du ZIP « pack fin de formation » qui existe côté session.
 *
 * Module PUR (aucune I/O) : il transforme la sortie de `resolveDocs` en une
 * liste de chemins d'archive. L'action serveur se charge ensuite de lire les
 * objets et d'empiler l'archive. Découpage volontaire — c'est la partie qui
 * porte les règles (quoi inclure, comment nommer) et qui doit être testable
 * sans base ni stockage.
 *
 * Trois règles, dans cet ordre :
 *  1. **Version courante seulement** — `resolveDocs` remonte tout l'historique
 *     des régénérations ; une archive qui contiendrait 3 versions du même
 *     certificat serait ingérable pour un auditeur.
 *  2. **Rien sans `href`** — c'est le garde-fou RGPD déjà posé par `resolveDocs` :
 *     pièce d'identité, RIB et attestation CFP ont `href: null` et n'entrent
 *     donc JAMAIS dans le ZIP. On ne le contourne pas.
 *  3. **Rien qui ne soit réellement là** — `status: 'missing'` est écarté ;
 *     `status: 'stub'` est CONSERVÉ mais rangé à part (voir `stubCount`), un
 *     document au contenu générique reste un document que Laurent a produit.
 */

import type { DocAnchor, UnifiedDoc } from './resolve-docs';
import { buildDownloadFilename } from './download-filename';

/**
 * `DocAnchor` est une union discriminée : seuls les ancrages `participant` et
 * `session` portent un `sessionId` (un doc de niveau produit ou organisme n'en
 * a pas). Lecture typée pour éviter un cast.
 */
export function sessionIdOfAnchor(anchor: DocAnchor): string | null {
  return anchor.level === 'participant' || anchor.level === 'session' ? anchor.sessionId : null;
}

export interface LearnerZipEntry {
  /** Chemin dans l'archive, ex. `SES-0110/Certificat-de-realisation-….pdf`. */
  path: string;
  /** Table d'origine — l'appelant sait où lire la clé de stockage. */
  sourceTable: UnifiedDoc['sourceTable'];
  sourceId: string;
  /** Vrai si le document a été produit avec un contenu générique (stub). */
  usedStub: boolean;
}

export interface LearnerZipInput {
  docs: UnifiedDoc[];
  firstName: string | null;
  lastName: string | null;
  /** sessionId → code lisible (« SES-0110 »). Absent = document hors session. */
  sessionCodeById: Map<string, string>;
}

/** Dossier d'archive d'un document : son code de session, ou « Hors-session ». */
function folderFor(doc: UnifiedDoc, sessionCodeById: Map<string, string>): string {
  const sessionId = sessionIdOfAnchor(doc.anchor);
  const code = sessionId ? sessionCodeById.get(sessionId) : undefined;
  return code ?? 'Hors-session';
}

/**
 * Rend un chemin unique dans l'archive. Deux documents peuvent légitimement
 * produire le même nom (même type, même session, apprenant sans prénom…) —
 * `archiver` accepterait les doublons en silence et l'utilisateur perdrait un
 * fichier à la décompression. On suffixe donc « -2 », « -3 »…
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

export function buildLearnerZipEntries(input: LearnerZipInput): LearnerZipEntry[] {
  const taken = new Set<string>();
  return input.docs
    .filter((d) => d.isCurrent && d.status !== 'missing' && !!d.href)
    // Tri stable : par dossier puis par type, pour que deux archives du même
    // apprenant se comparent à l'œil.
    .sort((a, b) => {
      const fa = folderFor(a, input.sessionCodeById);
      const fb = folderFor(b, input.sessionCodeById);
      return fa === fb ? a.docType.localeCompare(b.docType) : fa.localeCompare(fb);
    })
    .map((doc) => {
      const folder = folderFor(doc, input.sessionCodeById);
      const filename = buildDownloadFilename({
        docType: doc.docType,
        firstName: input.firstName,
        lastName: input.lastName,
        sessionCode: folder === 'Hors-session' ? null : folder,
      });
      return {
        path: dedupe(`${folder}/${filename}`, taken),
        sourceTable: doc.sourceTable,
        sourceId: doc.sourceId,
        usedStub: doc.usedStub,
      };
    });
}

/** Nom de l'archive : `Documents-Stephane-ROUSSEAU-20260908.zip`. */
export function buildLearnerZipFilename(
  firstName: string | null,
  lastName: string | null,
  today: Date,
): string {
  const stamp = today.toISOString().slice(0, 10).replace(/-/g, '');
  return buildDownloadFilename({
    docType: 'DOSSIER_APPRENANT',
    firstName,
    lastName,
    suffix: stamp,
    ext: 'zip',
  });
}
