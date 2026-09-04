/**
 * Quel PDF sert-on pour un `Document` ? (spec signature 2026-09-04 §4.2/§4.3)
 *
 * Règle métier n°2 du chantier signature, gravée : **le PDF signé fait foi**.
 * `/api/documents/[id]` sert donc `signedPdfUrl ?? pdfUrl`, avec un
 * `?original=1` pour retrouver la version non signée (re-génération, renvoi
 * pour signature, comparaison).
 *
 * Le lot A a commencé à écrire `Document.signedPdfUrl` (scans d'émargement
 * déposés) sans que la route ne le serve : ouvrir le document depuis la
 * matrice rendait encore le PDF vierge, alors que la cellule affichait
 * « Signé ». Le lot B ferme la boucle puisqu'il pose le modèle.
 *
 * Fonction pure et isolée : testable sans monter une requête Next.
 */

export interface ServedDocumentSource {
  pdfUrl: string;
  signedPdfUrl: string | null;
}

export interface ServedDocumentKey {
  /** Clé bucket à télécharger. */
  key: string;
  isSigned: boolean;
  /** Suffixe de nom de fichier, pour distinguer un signé d'un original. */
  suffix: string;
}

export function resolveServedDocumentKey(
  doc: ServedDocumentSource,
  opts: { original?: boolean },
): ServedDocumentKey {
  const signed = (doc.signedPdfUrl ?? '').trim();

  if (!opts.original && signed) {
    return { key: signed, isSigned: true, suffix: '-signe' };
  }
  return { key: doc.pdfUrl, isSigned: false, suffix: '' };
}
