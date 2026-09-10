/**
 * Quel tarif le programme annonce — module NEUTRE et PUR.
 *
 * Constat du 02/09 sur SES-0109 : le programme annonçait « 2 500 € HT par
 * stagiaire » (prix catalogue) pendant que la convention du MÊME dossier OPCO
 * annonçait 2 200 € pour deux salariés. Deux pièces contradictoires dans la
 * même enveloppe.
 *
 * Le tarif de la session l'emporte donc sur celui du catalogue : c'est celui
 * qui a été réellement consenti, et c'est lui que reprennent la convention et
 * la facture. Le prix produit ne sert que de repli.
 *
 * On ne descend JAMAIS à zéro : un tarif de session effacé retombe sur le
 * catalogue plutôt que d'annoncer une formation gratuite — même prudence que
 * `applyPriceCascade`, qui refuse de propager un zéro.
 *
 * Vit à part de `programme-core` pour rester testable sans base, sans PDF et
 * sans variables d'environnement (même discipline que `payer-rule.ts`).
 */
export function resoudreTarifProgramme(prixSession: unknown, prixProduit: unknown): number {
  const session = Number(prixSession ?? 0);
  const produit = Number(prixProduit ?? 0);
  if (Number.isFinite(session) && session > 0) return session;
  return Number.isFinite(produit) && produit > 0 ? produit : 0;
}

/** Comment le programme annonce son tarif. */
export type PrixProgramme = {
  mode: 'PAR_STAGIAIRE' | 'TOTAL_ENTREPRISE';
  montantHT: number;
};

export interface InscritPourPrix {
  priceHT: number;
  sponsorOrgId: string;
  /** Cet inscrit relève-t-il de la convention d'entreprise ? (cf. `payer-rule`) */
  couvertParConvention: boolean;
}

/**
 * Le montant que le programme doit annoncer, et comment le lire.
 *
 * Correction du 02/09 (Laurent) : « c'est un contrat avec une entreprise donc
 * le montant est pas par stagiaire, il devrait afficher 2 200 € et pas 1 100 €
 * par stagiaire. La règle il prend le montant total point. »
 *
 * Une convention d'entreprise engage l'entreprise sur UN montant global. Écrire
 * « 1 100 € par stagiaire » à côté d'une convention de 2 200 € pour deux
 * salariées, c'est le même chiffre dit de deux façons — et l'OPCO lit deux
 * montants différents dans la même enveloppe.
 *
 * Le total est la SOMME DES `priceHT` DES INSCRITS, exactement ce que somment
 * la convention (`generateConventionEntrepriseCore`) et la facture groupée. Pas
 * un produit `tarif × effectif` : les prix peuvent légitimement différer d'un
 * salarié à l'autre, seul le total engage.
 *
 * Bascule en TOTAL uniquement quand la session est ENTIÈREMENT portée par UNE
 * convention d'entreprise. Sinon on reste au prix par stagiaire :
 *  - session inter avec des auto-payeurs → un total n'aurait aucun sens, il
 *    additionnerait des gens qui ne se connaissent pas ;
 *  - session mixte (salariés + agents commerciaux de la même agence) → le
 *    programme est un document partagé, il ne peut pas annoncer un total qui
 *    ne concerne qu'une partie de la salle ;
 *  - un prix manquant → le total serait faux et sous-estimerait l'engagement.
 *    La convention refusera d'ailleurs, en nommant qui compléter.
 */
export function resoudrePrixProgramme(input: {
  inscrits: ReadonlyArray<InscritPourPrix>;
  tarifSession: unknown;
  prixProduit: unknown;
}): PrixProgramme {
  const parStagiaire: PrixProgramme = {
    mode: 'PAR_STAGIAIRE',
    montantHT: resoudreTarifProgramme(input.tarifSession, input.prixProduit),
  };

  const { inscrits } = input;
  if (inscrits.length === 0) return parStagiaire;
  if (!inscrits.every((i) => i.couvertParConvention)) return parStagiaire;
  if (new Set(inscrits.map((i) => i.sponsorOrgId)).size !== 1) return parStagiaire;
  if (!inscrits.every((i) => Number(i.priceHT) > 0)) return parStagiaire;

  const total = inscrits.reduce((somme, i) => somme + Number(i.priceHT), 0);
  return { mode: 'TOTAL_ENTREPRISE', montantHT: total };
}
