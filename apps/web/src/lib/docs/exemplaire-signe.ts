/**
 * Un exemplaire signé ne se détruit jamais par une régénération.
 *
 * LE DÉFAUT FERMÉ ICI (21/09/2026)
 *
 * Les générateurs de documents commencent tous par la même chose : effacer la
 * pièce précédente, puis en créer une neuve.
 *
 *     await prisma.document.deleteMany({ where: { tenantId, type, participantId } });
 *
 * Ce `where` ne regardait pas `signedPdfUrl`. Régénérer emportait donc
 * l'exemplaire SIGNÉ — le scan déposé par l'apprenant, ou le retour
 * d'e-signature DocuSeal — alors même que l'écran promettait le contraire
 * (« Les documents déjà signés ou envoyés sont conservés »). Sur une assiduité
 * AGEFICE déjà partie dans un dossier de solde, c'est la preuve de ce qui a été
 * envoyé qui disparaissait.
 *
 * LA RÈGLE, décidée par Laurent le 21/09/2026 : la pièce neuve devient la
 * pièce courante, à faire signer ; l'exemplaire signé est CONSERVÉ. Le dossier
 * de solde déjà envoyé continue de pointer dessus — il référence des clés de
 * stockage, pas des identifiants, donc sa pièce jointe reste résolvable tant
 * que la ligne vit.
 *
 * ⚠ CE MODULE NE REMPLACE PAS LA CONFIRMATION. Il est la dernière ceinture, au
 * point d'écriture : même si un appelant oublie `checkDocumentReplacement`, il
 * ne peut plus détruire un signé. Les deux vont ensemble — le garde demande
 * l'autorisation, celui-ci rend la faute impossible.
 *
 * MODULE VOLONTAIREMENT MINUSCULE : trois générateurs l'utilisent. Trois copies
 * d'une même règle, c'est la panne du 28/08 sur la composition du lieu.
 */

/**
 * Un document PORTE un exemplaire signé dès que `signedPdfUrl` est renseigné —
 * `''` ne compte pas, c'est un champ vidé, pas un PDF.
 *
 * `signedAt` n'entre PAS dans le test : un scan peut être déposé sans date. La
 * présence du fichier fait foi.
 */
export function porteUnExemplaireSigne(doc: { signedPdfUrl?: string | null }): boolean {
  return typeof doc.signedPdfUrl === 'string' && doc.signedPdfUrl.trim() !== '';
}

/**
 * Le fragment de `where` qui exclut les lignes portant un exemplaire signé.
 *
 * Deux valeurs à écarter, pas une : `null` (jamais signé) et `''` (champ vidé).
 * Le fragment est placé sous `AND` par l'appelant, pour ne pas écraser un `OR`
 * qu'il porterait déjà.
 */
export const SANS_EXEMPLAIRE_SIGNE = {
  OR: [{ signedPdfUrl: null }, { signedPdfUrl: '' }],
} as const;

/** Le minimum d'un client Prisma pour ce module — `prisma` ou un `tx`. */
interface ClientDocuments {
  document: {
    deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
  };
}

export interface CibleDocuments {
  tenantId: string;
  /** `DocType` — le type de la pièce régénérée. */
  type: string;
  participantId: string;
}

export interface ResultatSuppression {
  /** Lignes effacées : celles qui ne portaient aucun exemplaire signé. */
  supprimes: number;
}

/**
 * Efface les pièces remplaçables d'un participant, et SEULEMENT celles-là.
 *
 * Remplace le `deleteMany` direct des générateurs. UNE SEULE requête,
 * volontairement : compter les lignes épargnées aurait été agréable, mais une
 * requête de plus sur un chemin appelé en boucle par le pack de clôture se
 * paie, et l'information ne sert à personne — la ligne signée reste en base,
 * c'est vérifiable là où ça compte.
 */
export async function supprimerDocumentsRemplacables(
  client: ClientDocuments,
  cible: CibleDocuments,
): Promise<ResultatSuppression> {
  const { count } = await client.document.deleteMany({
    where: {
      tenantId: cible.tenantId,
      type: cible.type,
      participantId: cible.participantId,
      AND: [SANS_EXEMPLAIRE_SIGNE],
    },
  });

  return { supprimes: count };
}
