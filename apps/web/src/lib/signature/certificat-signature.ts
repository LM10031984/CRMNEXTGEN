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
import { GROUP_CONVENTION_ENTITY_TYPES } from '@/lib/docs/convention-coverage';

/**
 * Le préfixe, figé à UN endroit.
 *
 * « Certificat de SIGNATURE », jamais « certificat » tout court : le catalogue
 * porte déjà un `CERTIFICAT_REALISATION`, et les deux se retrouvent côte à côte
 * dans le dossier de téléchargement d'un admin qui monte un dossier AGEFICE.
 */
const PREFIXE_CERTIFICAT = 'Certificat-de-signature';

/**
 * LE SEGMENT QUI DIT QUELLE PIÈCE LE CERTIFICAT COUVRE.
 *
 * POURQUOI IL EXISTE. Un dossier AGEFICE porte DEUX demandes de signature — la
 * convention et le formulaire — donc deux certificats. Nommés seulement d'après
 * la personne et la session, ils sortaient sous le MÊME nom : deux pièces
 * jointes identiques en apparence dans le mail du financeur, et deux entrées en
 * collision dans le ZIP du pack audit. Un instructeur ne pouvait plus dire quel
 * certificat couvrait quelle pièce.
 *
 * POURQUOI UNE TABLE, ET PAS `docTypeFilenameLabel`. Le libellé long du
 * catalogue donnerait « Convention-de-formation-professionnelle » au milieu
 * d'un nom déjà long. On ne garde que ce qui DISTINGUE les trois pièces
 * signables — et un type absent d'ici n'ajoute AUCUN segment, plutôt qu'un
 * `-PROGRAMME-` qui ferait chercher un certificat sur un document qui ne se
 * signe pas.
 */
const SEGMENT_PAR_PIECE: Record<string, string> = {
  CONVENTION: 'Convention',
  AGEFICE: 'Dossier-AGEFICE',
  ASSIDUITE: 'Attestation-assiduite',
};

export interface PartiesNomCertificat {
  /** Le `Document.type` de la pièce couverte, quand on le connaît. */
  docType?: string | null;
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
    SEGMENT_PAR_PIECE[parties.docType ?? ''] ?? '',
    personFilenamePart(parties.firstName, parties.lastName),
    asciiSlug(parties.sessionCode),
  ].filter(Boolean);
  return `${segments.join('-')}.pdf`;
}

/* ── QUI NOMMER SUR UN CERTIFICAT — la règle partagée ────────────────────── */

/** Une personne, réduite à ce qu'un nom de fichier en retient. */
export interface PersonneCouverte {
  firstName: string;
  lastName: string;
}

/**
 * La personne à porter sur le nom du certificat, ou `null`.
 *
 * CE QU'ELLE RÉPARE (recette du 12/09/2026). Le même certificat s'appelait
 * `Certificat-de-signature-Convention-DEMO-SIG-01.pdf` téléchargé depuis la
 * ligne, et `…-Convention-Julien-DEMO-SIG-BERNARD-DEMO-SIG-01.pdf` en pièce
 * jointe du dossier. Deux noms pour un fichier : impossible de dire à un
 * financeur « c'est le même document ».
 *
 * POURQUOI LES DEUX DIVERGEAIENT. La route lisait le participant sur le
 * `Document` — nul pour une convention de GROUPE, qui ne porte que son
 * organisation. Le dossier, lui, le lisait sur l'inscription qu'il compose : il
 * avait donc toujours un nom, au prix d'un défaut symétrique — le certificat
 * d'une convention de groupe prenait le nom de l'inscrit dont on ouvrait le
 * dossier, soit autant de noms que de salariés pour un seul fichier.
 *
 * LA RÈGLE, DÉSORMAIS UNIQUE : un certificat porte un nom de personne quand la
 * demande ne couvre QU'ELLE. Sinon aucun — un fichier unique ne peut pas
 * s'appeler du nom de l'un des trois qu'il couvre.
 *
 * ⚠ DÉDOUBLONNÉ PAR LE NOM, pas par un identifiant : ce module n'en reçoit pas,
 * et deux inscrits homonymes produiraient de toute façon le même nom de
 * fichier. Une demande portant deux pièces du même apprenant (convention
 * individuelle + dossier AGEFICE) n'est donc pas prise pour un groupe.
 */
export function personneDuCertificat(
  couvertes: readonly PersonneCouverte[],
): PersonneCouverte | null {
  const parNom = new Map<string, PersonneCouverte>();
  for (const p of couvertes) {
    parNom.set(`${p.firstName}\u0000${p.lastName}`, p);
  }
  if (parNom.size !== 1) return null;
  return [...parNom.values()][0]!;
}

/** Une pièce, réduite à ce qui dit QUI elle couvre. */
export interface PieceCouvrante {
  /** `Document.entityType` — String libre côté schéma. */
  entityType: string | null;
  /** `Document.entityId` — le commanditaire, ou la session. */
  entityId: string | null;
  /** L'apprenant quand la pièce est NOMINATIVE ; `null` pour une pièce de groupe. */
  participant: PersonneCouverte | null;
}

/**
 * Les inscrits qu'une pièce couvre — DEUX chemins, et les deux existent en
 * production (cf. `lib/docs/convention-coverage.ts`) :
 *
 *  • une pièce NOMINATIVE porte son participant ;
 *  • une convention de GROUPE n'en porte aucun. Elle porte son organisation
 *    (`entityType='organization'`, `entityId=sponsorOrgId`) ou la session
 *    entière (`entityType='session'`, la forme produite par les scripts `_gen-*`).
 *
 * ⚠ SANS LE SECOND CHEMIN, une convention d'ENTREPRISE INDIVIDUELLE — une seule
 * personne, mais stockée en forme de groupe — sort sans nom. C'est exactement
 * ce que la recette du 12/09 a constaté sur DEMO-SIG-01 : la route ne nommait
 * personne là où le dossier nommait Julien.
 *
 * Une forme d'entité inconnue ne couvre personne : on ne devine pas une portée.
 */
export function personnesCouvertesParLaPiece(a: {
  piece: PieceCouvrante;
  participantsSession: readonly { sponsorOrgId: string | null; person: PersonneCouverte }[];
}): PersonneCouverte[] {
  if (a.piece.participant) return [a.piece.participant];
  const forme = a.piece.entityType ?? '';
  if (!GROUP_CONVENTION_ENTITY_TYPES.includes(forme as never)) return [];
  // `session` porte la session ENTIÈRE ; `organization` ne porte que les
  // inscrits de ce commanditaire — une session peut réunir deux entreprises.
  if (forme === 'session') return a.participantsSession.map((p) => p.person);
  return a.participantsSession
    .filter((p) => p.sponsorOrgId === a.piece.entityId)
    .map((p) => p.person);
}
