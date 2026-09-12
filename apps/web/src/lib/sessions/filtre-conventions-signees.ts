/**
 * Le filtre « Conventions signées » de la liste des sessions — lot D (D-2).
 *
 * CE QU'IL FAISAIT AVANT. `sessions/page.tsx` portait un filtre nommé `signed`
 * dont le critère était `TrainingSession.status IN (VALIDATED, IN_PROGRESS,
 * COMPLETED)` : aucun rapport avec une signature. Constaté le 04/09 en
 * répondant à la décision ouverte D-2 — « le libellé ment ». Il mentait
 * d'autant plus tranquillement qu'AUCUNE PUCE ne l'exposait : le filtre n'était
 * atteignable qu'en tapant l'URL, donc personne ne pouvait voir qu'il répondait
 * autre chose que son nom.
 *
 * POURQUOI LE CRITÈRE VIT ICI, et pas dans le `where` de la page. Un critère
 * écrit au fil d'une page n'est vérifiable qu'à la lecture — et c'est
 * exactement comme cela que celui-ci a survécu à plusieurs lots en disant le
 * contraire de son nom.
 */

import type { Prisma } from '@qualiof/db';

/** Le libellé de la puce. Il DIT ce que le filtre fait. */
export const LIBELLE_FILTRE_CONVENTIONS_SIGNEES = 'Conventions signées';

/**
 * Les sessions dont AU MOINS UNE convention porte une signature.
 *
 * ⚠ LES DEUX ORIGINES, comme `etatDeLaPiece` côté fiche session.
 * `signedPdfUrl` est posé par le webhook DocuSeal (lot C.3) ET par le dépôt de
 * scan manuel (lot A, `persistSignedScan`) ; `status: 'signed'` couvre les
 * lignes écrites avant que la colonne existe. N'en lire qu'une ferait
 * disparaître de la liste des sessions réellement signées — le défaut que ce
 * filtre est censé réparer.
 *
 * La troisième origine de `etatDeLaPiece` — `docStatus.MANUAL_OK`, une colonne
 * Json de `SessionParticipant` — n'est volontairement PAS lue ici : elle n'est
 * pas filtrable efficacement, et le dépôt d'un scan sur une pièce qui a un
 * `Document` écrit de toute façon les deux colonnes ci-dessus. Une convention
 * a toujours son `Document`.
 */
export const WHERE_CONVENTIONS_SIGNEES: Prisma.TrainingSessionWhereInput = {
  documents: {
    some: {
      type: 'CONVENTION',
      OR: [{ signedPdfUrl: { not: null } }, { status: 'signed' }],
    },
  },
};
