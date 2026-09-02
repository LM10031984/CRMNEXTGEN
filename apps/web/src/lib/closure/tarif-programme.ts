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
