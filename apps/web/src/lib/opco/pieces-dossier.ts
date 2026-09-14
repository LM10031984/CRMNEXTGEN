/**
 * LES PIÈCES D'UN DOSSIER DE FINANCEMENT, et laquelle de leurs versions part.
 *
 * DEUX RÈGLES MÉTIER DE LA SPEC SIGNATURE, appliquées ici parce que c'est ici
 * que le dossier se compose :
 *
 *  • n°2 — **le PDF signé fait foi.** `composeOpcoSubmission` joignait `pdfUrl`,
 *    donc la convention VIERGE, alors que `signedPdfUrl` existait à côté depuis
 *    le lot C.3. Un financeur recevait un dossier sans aucune signature.
 *  • n°3 — **le certificat de signature est une pièce à part entière**, jointe
 *    au dossier. « C'est ce que les AGEFICE réclament. »
 *
 * PUR : ni Prisma, ni réseau, ni horloge. C'est ce qui permet de tester « quelle
 * version part » sans monter un dossier complet.
 */

/** Les natures de pièce qu'un dossier peut porter. */
export type KindPieceDossier =
  | 'CNI'
  | 'RIB'
  | 'CFP_ATTESTATION'
  | 'AGEFICE_PA_FORM'
  | 'CONVENTION'
  | 'PROGRAMME'
  | 'AUDIT_TRAIL'
  | 'OTHER';

/**
 * Les libellés, à UN endroit — ils servent à la fois au corps du mail, à
 * l'écran et aux messages de refus. Trois copies finiraient par se contredire
 * sous les yeux du financeur.
 */
export const LIBELLES_PIECE_DOSSIER: Record<KindPieceDossier, string> = {
  CNI: 'Carte d’identité',
  RIB: 'RIB',
  CFP_ATTESTATION: 'Attestation CFP URSSAF',
  AGEFICE_PA_FORM: 'Formulaire AGEFICE PA pré-rempli',
  CONVENTION: 'Convention de formation',
  PROGRAMME: 'Programme pédagogique',
  AUDIT_TRAIL: 'Certificat de signature',
  OTHER: 'Autre',
};

/**
 * LES PIÈCES DONT LA SIGNATURE EST EXIGÉE, et elles seules.
 *
 * Le programme pédagogique, la pièce d'identité, le RIB et l'attestation CFP ne
 * se signent pas : les compter rendrait tout dossier éternellement
 * « incomplet », et un avertissement qui ne s'éteint jamais n'alerte plus.
 *
 * L'ORDRE EST CELUI DU DOSSIER — c'est lui qui gouverne l'énumération du
 * message de refus, pour que la phrase ne change pas de forme d'un dossier à
 * l'autre.
 */
export const PIECES_DONT_LA_SIGNATURE_EST_EXIGEE = [
  'CONVENTION',
  'AGEFICE_PA_FORM',
] as const satisfies readonly KindPieceDossier[];

export type PieceASigner = (typeof PIECES_DONT_LA_SIGNATURE_EST_EXIGEE)[number];

/** Une chaîne réellement remplie — une clé blanche n'est pas une preuve. */
function rempli(valeur: string | null | undefined): boolean {
  return (valeur ?? '').trim().length > 0;
}

/**
 * Quelle version de cette pièce part chez le financeur.
 *
 * Le `signe` remonté n'est pas un confort d'affichage : c'est lui que
 * `sendOpcoSubmission` relit pour refuser un dossier incomplet.
 */
export function versionAJoindre(doc: {
  pdfUrl: string;
  signedPdfUrl: string | null;
}): { key: string; signe: boolean } {
  if (rempli(doc.signedPdfUrl)) return { key: doc.signedPdfUrl!.trim(), signe: true };
  return { key: doc.pdfUrl, signe: false };
}

/**
 * Les pièces exigées qui sont PRÉSENTES au dossier mais pas signées.
 *
 * ⚠ PRÉSENTES. Une pièce exigée ABSENTE n'est pas « non signée », elle est
 * manquante — et les deux appellent deux gestes différents : générer, ou
 * signer. Les confondre ferait chercher une signature sur un document qui
 * n'existe pas. Le manque, lui, est déjà dit par `missing`.
 */
export function piecesNonSignees(
  pieces: readonly { kind: KindPieceDossier; signe: boolean }[],
): PieceASigner[] {
  return PIECES_DONT_LA_SIGNATURE_EST_EXIGEE.filter((exigee) =>
    pieces.some((piece) => piece.kind === exigee && !piece.signe),
  );
}

/**
 * LA PHRASE QUI FAIT CORRIGER : ce qui manque, la conséquence, puis les deux
 * gestes possibles.
 *
 * Les deux gestes sont nommés parce qu'aucun n'est évident : envoyer en
 * signature électronique depuis la fiche session, ou déposer le scan d'une
 * pièce signée à la main (lot A). Ne citer que le premier condamnerait les
 * dossiers déjà signés au stylo.
 */
export function messageDossierIncomplet(pieces: readonly PieceASigner[]): string {
  const libelles = pieces.map((p) => LIBELLES_PIECE_DOSSIER[p]);
  const pluriel = libelles.length > 1;
  const enumeration = pluriel
    ? `${libelles.slice(0, -1).join(', ')} et ${libelles[libelles.length - 1]}`
    : libelles[0];
  return (
    `Dossier incomplet : ${enumeration} non signée${pluriel ? 's' : ''}. ` +
    `Un financeur refuse un dossier dont les pièces ne portent pas de signature. ` +
    (pluriel
      ? 'Envoyez-les en signature depuis la fiche session, ou déposez les scans signés.'
      : 'Envoyez-la en signature depuis la fiche session, ou déposez le scan signé.')
  );
}
