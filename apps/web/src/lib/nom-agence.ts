/**
 * Le nom de l'agence cliente — **une seule résolution, pour toutes les pièces**.
 *
 * ## Pourquoi ce fichier
 *
 * La fonction existait en DEUX exemplaires identiques (`propositions.ts`,
 * `diagnostic-audit.ts`) et la sonde de composition en avait un TROISIÈME,
 * différent : `d.organization?.legalName ?? 'Agence'`. D'où le programme
 * composé de DIAG-0001 remis à Laurent le 14/09 avec « Parcours sur mesure —
 * **Agence** », quand la proposition, elle, portait bien « BATI BATI
 * OURMIERES ».
 *
 * C'est le corollaire de §4 bis : **dupliquer un mapping, c'est se garantir une
 * divergence muette**. Ici elle a produit un document relu par le dirigeant
 * avec un nom générique à la première ligne.
 *
 * ## Ce que cette fonction N'EST PAS
 *
 * **Un correctif du défaut de fond.** Le nom du client ne devrait pas venir
 * d'un champ de notes en texte libre : il devrait venir d'une `Organization`.
 * Aujourd'hui elle n'existe pas sur DIAG-0001, et la règle tranchée par
 * Laurent le 15/09 la rendra obligatoire avant l'émission d'une proposition.
 *
 * **Ce repli meurt ce jour-là**, et un test vérifiera qu'aucun nom de client ne
 * vient plus d'un champ libre. En attendant, le retirer ferait disparaître le
 * nom — il reste, et il est nommé pour ce qu'il est.
 */

export interface SourceNomAgence {
  organization: { legalName: string } | null;
  lead: { notes: string | null; firstName: string | null; lastName: string | null };
  reference: string;
}

/**
 * Par ordre de fiabilité décroissante, et le premier NON VIDE gagne.
 *
 * Le `??` d'origine était un défaut : `[null, null].filter(Boolean).join(' ')`
 * rend `''`, qui n'est pas nullish — le repli sur la référence ne se
 * déclenchait donc JAMAIS, et une agence sans nom sortait en chaîne vide.
 * Une absence affichée comme une valeur vide, c'est §4 quinquies une fois de
 * plus : on retombe sur la référence du dossier, qui existe toujours.
 */
export function nomAgence(d: SourceNomAgence): string {
  const candidats = [
    d.organization?.legalName,
    d.lead.notes?.replace(/^Agence\s*:\s*/i, ''),
    [d.lead.firstName, d.lead.lastName].filter(Boolean).join(' '),
  ];
  for (const c of candidats) {
    const v = c?.trim();
    if (v) return v;
  }
  return d.reference;
}
