/**
 * Changer le PROGRAMME (produit) d'une session — le garde-fou, module NEUTRE.
 *
 * POURQUOI CE MODULE EXISTE. Jusqu'ici le produit n'était posé qu'à la
 * création : une erreur de sélection dans le wizard se payait par la
 * suppression de la session. Or supprimer emporte tout le reste — créneaux,
 * formateur, et surtout le LIEN PUBLIC déjà diffusé, dont les dossiers déposés
 * se retrouvent détachés (`ON DELETE SET NULL`). Corriger le produit coûtait
 * donc plus cher que l'erreur.
 *
 * POURQUOI IL DIT NON. Une convention signée annonce un programme. Si on change
 * le produit après coup, le certificat de réalisation en annoncera un autre :
 * refus de prise en charge AGEFICE assuré, et non-conformité Qualiopi
 * indicateur 1 (information exacte sur la prestation). La règle figée avec
 * Laurent le 15/09/2026 est donc volontairement étroite :
 *
 *   BROUILLON  ET  AUCUNE FACTURE ÉMISE.
 *
 * Dès qu'une session est planifiée ou qu'une facture est partie, elle est
 * VENDUE : on ne réécrit pas ce qu'on a vendu, on annule et on recrée.
 *
 * POURQUOI DES AVERTISSEMENTS PLUTÔT QUE DES REFUS SUPPLÉMENTAIRES. Une durée
 * qui change ou des documents déjà générés ne rendent pas le changement faux —
 * ils rendent faux ce qui a été produit AVANT. L'admin doit le savoir, mais
 * c'est à lui de décider : refuser ici l'obligerait à supprimer la session,
 * c'est-à-dire exactement le remède qu'on cherche à éviter.
 *
 * Fonction PURE : l'appelant fait les lectures (statut, factures, durées,
 * créneaux, documents) et passe des nombres. Testable sans base.
 */

export interface ChangementProduitInput {
  /** `SessionStatus` de la session visée. */
  sessionStatus: string;
  /** Factures de la session dont le statut n'est PAS `DRAFT` (donc parties). */
  facturesEmises: number;
  /** Durée du produit actuellement porté. `null` = session sans produit. */
  dureeActuelleHeures: number | null;
  /** Durée du produit visé. */
  dureeCibleHeures: number;
  /** Créneaux déjà posés à l'agenda de la session. */
  creneaux: number;
  /** Documents déjà générés sur la session — ils citent l'ancien programme. */
  documentsGeneres: number;
}

export type ChangementProduitVerdict =
  | { autorise: true; avertissements: string[] }
  | { autorise: false; raison: string };

/** Le seul statut où le programme n'est encore promis à personne. */
const STATUT_MODIFIABLE = 'DRAFT';

export function verifierChangementProduit(
  input: ChangementProduitInput,
): ChangementProduitVerdict {
  // L'ordre compte : une facture partie est le motif le plus PARLANT pour
  // l'admin (« va voir tes factures »), là où « pas au brouillon » ne dit pas
  // quoi faire. On annonce donc l'obstacle le plus concret en premier.
  if (input.facturesEmises > 0) {
    return {
      autorise: false,
      raison:
        `${input.facturesEmises} facture(s) déjà émise(s) sur cette session : ` +
        `le programme facturé ne peut plus changer. Crédite ces factures, ou crée une autre session.`,
    };
  }

  if (input.sessionStatus !== STATUT_MODIFIABLE) {
    return {
      autorise: false,
      raison:
        `Le programme ne se change qu'au brouillon (cette session est « ${input.sessionStatus} »). ` +
        `Une session planifiée a déjà été annoncée à ses inscrits.`,
    };
  }

  const avertissements: string[] = [];

  // Durée : on ne compare que si l'on sait à quoi comparer. Traiter un produit
  // absent comme « 0 h » fabriquerait un avertissement alarmant et faux.
  const dureeChange =
    input.dureeActuelleHeures !== null && input.dureeActuelleHeures !== input.dureeCibleHeures;

  if (dureeChange) {
    avertissements.push(
      `Le nouveau programme dure ${input.dureeCibleHeures} h au lieu de ${input.dureeActuelleHeures} h.`,
    );
    // Les créneaux ne sont cités QUE s'il y en a : « 0 créneau ne couvre plus
    // la durée » est une phrase qui n'apprend rien et inquiète pour rien.
    if (input.creneaux > 0) {
      avertissements.push(
        `Tes ${input.creneaux} créneau(x) à l'agenda ne couvrent plus la durée : à revoir.`,
      );
    }
  }

  if (input.documentsGeneres > 0) {
    avertissements.push(
      `${input.documentsGeneres} document(s) déjà généré(s) citent l'ancien programme : à régénérer.`,
    );
  }

  return { autorise: true, avertissements };
}
