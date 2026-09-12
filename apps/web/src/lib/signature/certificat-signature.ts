/**
 * Le CERTIFICAT DE SIGNATURE (audit log du prestataire), nommé pour un humain.
 *
 * C'est une pièce à part entière — règle métier n°3 de la spec : « stocké à
 * côté du PDF signé, joint au dossier AGEFICE et au ZIP du pack audit. C'est ce
 * que les AGEFICE réclament. » Depuis le lot C.3 il est bien téléchargé et
 * stocké (`signature-retour.ts`), mais il n'était offert nulle part : le défaut
 * D-C3-5, constaté à la mise en prod du 12/09/2026.
 *
 * POURQUOI UN NOM CALCULÉ, ET PAS LE NOM DE L'OBJET STOCKÉ. En production, les
 * routes de téléchargement REDIRIGENT (302) vers une signed URL Supabase : le
 * `Content-Disposition` posé par la route n'est jamais appliqué, et le
 * navigateur retombe sur le nom technique de l'objet. C'est exactement la
 * régression corrigée le 08/09 sur les autres routes — le nom doit être passé à
 * la signature elle-même (`{ download: <nom> }`).
 *
 * PUR : ni Prisma, ni réseau, ni horloge.
 */

import { asciiSlug, personFilenamePart } from '@/lib/docs/download-filename';

/**
 * Le préfixe, figé à UN endroit.
 *
 * « Certificat de SIGNATURE », jamais « certificat » tout court : le catalogue
 * porte déjà un `CERTIFICAT_REALISATION`, et les deux se retrouvent côte à côte
 * dans le dossier de téléchargement d'un admin qui monte un dossier AGEFICE.
 */
const PREFIXE_CERTIFICAT = 'Certificat-de-signature';

export interface PartiesNomCertificat {
  firstName?: string | null;
  lastName?: string | null;
  /** Code de session, ex. 'SES-0112'. */
  sessionCode?: string | null;
}

/**
 * `Certificat-de-signature-Stephane-ROUSSEAU-SES-0112.pdf`.
 *
 * ASCII STRICT, comme `buildDownloadFilename` : le nom part dans la query
 * string d'une signed URL puis dans un en-tête HTTP, où un « é » ou une
 * apostrophe sont des sources d'ennuis silencieux selon le navigateur.
 *
 * Chaque segment est optionnel — une convention de GROUPE ne couvre personne en
 * particulier, et lui coller un nom ferait croire que le certificat ne vaut que
 * pour cette personne. Jamais vide, en revanche : un `?download=` vide ferait
 * réapparaître le nom technique de l'objet, c'est-à-dire le défaut d'origine.
 */
export function nomFichierCertificat(parties: PartiesNomCertificat): string {
  const segments = [
    PREFIXE_CERTIFICAT,
    personFilenamePart(parties.firstName, parties.lastName),
    asciiSlug(parties.sessionCode),
  ].filter(Boolean);
  return `${segments.join('-')}.pdf`;
}
