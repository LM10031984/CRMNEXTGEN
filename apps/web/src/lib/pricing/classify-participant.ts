/**
 * Un inscrit engage-t-il déjà quelqu'un ? — **source unique** de la règle.
 *
 * Sert à la cascade de tarif (`applyPriceCascade`) : quand le tarif d'une
 * session change, le nouveau prix ne redescend QUE sur les inscrits dont aucun
 * document contractuel ne porte encore de montant.
 *
 * Règle validée par Laurent le 28/08 : **une convention ou une facture émise
 * ferme le prix**. Modifier `SessionParticipant.priceHT` après coup ferait dire
 * à la fiche un montant différent de celui de la pièce déjà produite — deux
 * documents contractuels qui se contredisent, exactement ce que la convention
 * de groupe et la facture groupée s'imposent d'éviter.
 *
 * MODULE PUR : aucune lecture, aucune écriture. Il reçoit l'état, il tranche.
 */

export interface EngagementParticipant {
  id: string;
  /** Une facture porte déjà ce participant (individuelle ou groupée). */
  aFacture: boolean;
  /** Une convention le couvre (nominative ou de groupe). */
  aConvention: boolean;
}

/** Motif pour lequel un inscrit est laissé de côté — sert au journal d'audit. */
export type MotifExclusion = 'facture' | 'convention';

export interface CascadeCible {
  /** Inscrits dont le prix peut être mis à jour sans rien contredire. */
  aMettreAJour: string[];
  /** Inscrits laissés tels quels, avec le motif. */
  exclus: { id: string; motif: MotifExclusion }[];
}

export function estEngage(p: EngagementParticipant): boolean {
  return p.aFacture || p.aConvention;
}

/**
 * Sépare les inscrits que la cascade peut toucher de ceux qu'elle doit laisser.
 *
 * La facture prime sur la convention dans le motif : c'est la pièce qui a le
 * plus de conséquences (comptabilité, OPCO), et c'est celle qu'on veut voir
 * nommée en premier dans un journal d'audit.
 */
export function partitionnerPourCascade(
  participants: ReadonlyArray<EngagementParticipant>,
): CascadeCible {
  const aMettreAJour: string[] = [];
  const exclus: { id: string; motif: MotifExclusion }[] = [];

  for (const p of participants) {
    if (p.aFacture) exclus.push({ id: p.id, motif: 'facture' });
    else if (p.aConvention) exclus.push({ id: p.id, motif: 'convention' });
    else aMettreAJour.push(p.id);
  }

  return { aMettreAJour, exclus };
}
