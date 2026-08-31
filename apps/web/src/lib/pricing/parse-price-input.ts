/**
 * Normalise un montant saisi à la main, en distinguant « rien saisi » de
 * « zéro saisi ».
 *
 * Cette distinction n'est pas cosmétique : les actions d'inscription font
 * `input.priceHT ?? resolveDefaultParticipantPrice(...)`. Renvoyer 0 pour un
 * champ vide court-circuite donc la cascade et crée un inscrit à 0 € — E-2
 * rouvert par l'interface. Renvoyer `undefined` laisse la cascade décider ;
 * un 0 réellement tapé reste un choix explicite et est respecté.
 *
 * MODULE PUR.
 */

export function parsePriceInput(raw: string): number | undefined {
  const nettoye = raw.replace(/\s/g, '').replace(',', '.');
  if (nettoye === '') return undefined;
  const n = Number(nettoye);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}
