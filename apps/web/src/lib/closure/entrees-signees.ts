/**
 * LE SOUS-DOSSIER `signes/` DU PACK AUDIT — spec §5 lot D.
 *
 * « Pack closure / ZIP audit : inclut les signés + audit trails dans un
 * sous-dossier `signes/`. »
 *
 * POURQUOI UN SOUS-DOSSIER, ET PAS LES SIGNÉS À LA PLACE DES ORIGINAUX. Le ZIP
 * est rangé par APPRENANT et prouve le DÉROULEMENT de la formation ; les pièces
 * signées, elles, prouvent l'ENGAGEMENT. Un auditeur les demande ensemble mais
 * les lit séparément. Et substituer les signés aux originaux ferait disparaître
 * la convention vierge — celle qu'il faut re-signer quand un refus arrive.
 *
 * PUR : il compose des entrées `{ clé bucket → nom dans l'archive }`, il ne
 * télécharge rien. C'est ce qui rend les collisions de noms testables en une
 * ligne — et il y en avait une, corrigée dans `nomFichierCertificat`.
 */

import { buildDownloadFilename } from '@/lib/docs/download-filename';
import { nomFichierCertificat } from '@/lib/signature/certificat-signature';

/** Le nom du dossier, figé à UN endroit — l'auditeur y est habitué. */
export const DOSSIER_SIGNES = 'signes';

export interface DocumentSignable {
  /** `Document.type`, ex. 'CONVENTION'. */
  type: string;
  /** Clé bucket de la version signée — `null` tant que rien n'est signé. */
  signedPdfUrl: string | null;
  /** L'apprenant, quand la pièce est nominative. `null` pour une pièce de groupe. */
  person: { firstName: string; lastName: string } | null;
  /** La demande de signature, pour son certificat. */
  signatureRequest: { id: string; auditTrailUrl: string | null } | null;
}

export interface EntreeArchive {
  /** Clé bucket à télécharger. */
  key: string;
  /** Chemin dans l'archive. */
  name: string;
}

function rempli(valeur: string | null | undefined): string | null {
  const v = (valeur ?? '').trim();
  return v.length > 0 ? v : null;
}

/**
 * Les entrées `signes/` d'une session : les PDF signés, puis les certificats.
 *
 * ⚠ DEUX DÉDUPLICATIONS, et elles ne gardent pas la même chose :
 *
 *  • par CLÉ pour les PDF — deux `Document` de même type peuvent pointer la
 *    même clé signée (les deux formes de stockage d'une convention de groupe,
 *    cf. `groupConventionAnyShapeWhere`) ;
 *  • par DEMANDE pour les certificats — une demande couvre 1..N pièces et son
 *    certificat les couvre toutes.
 */
export function entreesSignees(a: {
  sessionCode: string | null;
  documents: readonly DocumentSignable[];
}): EntreeArchive[] {
  const entrees: EntreeArchive[] = [];
  const clesVues = new Set<string>();
  const demandesVues = new Set<string>();

  for (const doc of a.documents) {
    const cle = rempli(doc.signedPdfUrl);
    if (cle === null || clesVues.has(cle)) continue;
    clesVues.add(cle);
    entrees.push({
      key: cle,
      // Le MÊME nom que la route de téléchargement unitaire, suffixe compris :
      // l'auditeur retrouve dans l'archive le fichier qu'il a pu ouvrir à
      // l'écran.
      name: `${DOSSIER_SIGNES}/${buildDownloadFilename({
        docType: doc.type,
        firstName: doc.person?.firstName,
        lastName: doc.person?.lastName,
        sessionCode: a.sessionCode,
        suffix: 'signe',
      })}`,
    });
  }

  for (const doc of a.documents) {
    const demande = doc.signatureRequest;
    const cle = rempli(demande?.auditTrailUrl);
    if (demande === null || cle === null || demandesVues.has(demande.id)) continue;
    demandesVues.add(demande.id);
    entrees.push({
      key: cle,
      name: `${DOSSIER_SIGNES}/${nomFichierCertificat({
        docType: doc.type,
        firstName: doc.person?.firstName,
        lastName: doc.person?.lastName,
        sessionCode: a.sessionCode,
      })}`,
    });
  }

  return entrees;
}
