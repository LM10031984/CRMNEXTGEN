import { sessionTotalHT, type SessionRegime } from '@/lib/sessions/session-regime';

/**
 * Correction du 17/09/2026 de « le mode du PRODUIT, LE POINT DE DÉPART » :
 * une session déclarée impose désormais son régime et son montant ; NULL conserve
 * les règles historiques ci-dessous. Aucun prix catalogue n’est modifié.
 *
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

/**
 * `TrainingProduct.pricingMode`, retapé ici en union de chaînes.
 *
 * Pourquoi ne pas importer l'enum Prisma : ce module est PUR, et le rester est
 * ce qui permet de tester les cas tordus en une ligne, sans base. Les valeurs
 * sont les mêmes chaînes — un renommage côté schéma casserait la compilation
 * chez les appelants, qui eux connaissent Prisma.
 */
export type ModeProduit = 'PAR_STAGIAIRE' | 'FORFAIT_ENTREPRISE';

/**
 * Le mode du PRODUIT, traduit pour le gabarit.
 *
 * Deux vocabulaires, et c'est voulu : le produit dit comment il se VEND
 * (`FORFAIT_ENTREPRISE`), le document dit ce qu'il AFFICHE
 * (`TOTAL_ENTREPRISE`). Les confondre ferait croire qu'un forfait catalogue et
 * un total d'inscrits sont la même grandeur — ils coïncident souvent, pas
 * toujours.
 */
export function prixModeDuProduit(modeProduit: ModeProduit): PrixProgramme['mode'] {
  return modeProduit === 'FORFAIT_ENTREPRISE' ? 'TOTAL_ENTREPRISE' : 'PAR_STAGIAIRE';
}

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
 *    ne concerne qu'une partie de la salle.
 *    ⚠ DEPUIS LE 16/09/2026, ce repli n'est plus le mode de fonctionnement
 *    visé, seulement un filet : une session mixte se SCINDE désormais en deux
 *    sessions (88 h entreprise / 72 h indépendants), qui partagent dates,
 *    salle et formateur. Les deux populations n'ayant pas le même tarif,
 *    chacune a ses propres pièces. Le repli reste en place pour les sessions
 *    déjà mixtes en base, et parce qu'un total partiel serait faux ;
 *  - un prix manquant → le total serait faux et sous-estimerait l'engagement.
 *    La convention refusera d'ailleurs, en nommant qui compléter.
 *
 * Le cas DEUX ENTREPRISES à deux forfaits sur une même session reste non
 * traité, délibérément : cf. `docs/deferred.md` § D-1 (piste `SessionPricing`
 * par commanditaire, et ce qui la rouvrira).
 */
export function resoudrePrixProgramme(input: {
  /**
   * `TrainingProduct.pricingMode` — LE POINT DE DÉPART depuis le 17/09/2026.
   *
   * Avant, le mode se DÉDUISAIT de la composition de la session. Un produit
   * vendu au forfait et un produit vendu à la place étaient donc
   * indiscernables tant qu'on ne regardait pas qui s'était inscrit, et le
   * catalogue ne pouvait rien annoncer de juste.
   */
  regimeSession?: SessionRegime | null;
  prixTotalSession?: unknown;
  modeProduit: ModeProduit;
  inscrits: ReadonlyArray<InscritPourPrix>;
  tarifSession: unknown;
  prixProduit: unknown;
}): PrixProgramme {
  if (input.regimeSession === 'ENTREPRISE') return { mode: 'TOTAL_ENTREPRISE', montantHT: sessionTotalHT({ regime: input.regimeSession, priceTotalHT: input.prixTotalSession }, []) };
  if (input.regimeSession === 'INDIVIDUEL') return { mode: 'PAR_STAGIAIRE', montantHT: resoudreTarifProgramme(input.tarifSession, input.prixProduit) };
  const tarifCatalogue = resoudreTarifProgramme(input.tarifSession, input.prixProduit);

  // Vendu à la place : rien dans la composition de la salle ne peut en faire un
  // forfait. La question ne se pose plus, elle est tranchée au catalogue.
  if (input.modeProduit === 'PAR_STAGIAIRE') {
    return { mode: 'PAR_STAGIAIRE', montantHT: tarifCatalogue };
  }

  // Vendu au forfait. Sans inscrit, le montant est celui du catalogue : c'est
  // le cas du programme produit, et d'une session pas encore remplie.
  const { inscrits } = input;
  if (inscrits.length === 0) return { mode: 'TOTAL_ENTREPRISE', montantHT: tarifCatalogue };

  // Avec des inscrits, le total des lignes fait foi — c'est lui que somment la
  // convention d'entreprise et la facture groupée. Pas `tarif × effectif` : les
  // prix peuvent légitimement différer d'un salarié à l'autre.
  //
  // ⚠ Si les conditions ne confirment pas, ON NE RETOMBE PAS en silence sur le
  // prix par tête : ce serait annoncer un prix de place sur un produit vendu au
  // forfait. L'appelant doit avoir appelé `refusForfaitNonConfirme` AVANT et
  // s'être arrêté ; le catalogue ici n'est qu'un filet, jamais un résultat
  // attendu.
  if (refusForfaitNonConfirme({ modeProduit: input.modeProduit, inscrits }) !== null) {
    return { mode: 'TOTAL_ENTREPRISE', montantHT: tarifCatalogue };
  }

  const total = inscrits.reduce((somme, i) => somme + Number(i.priceHT), 0);
  return { mode: 'TOTAL_ENTREPRISE', montantHT: total };
}

/**
 * Ce qui EMPÊCHE un produit au forfait d'annoncer un total sur cette session.
 *
 * Rend le motif, nommé, ou `null` quand tout confirme. Séparé de
 * `resoudrePrixProgramme` pour la même raison qu'`avertissementsEtapeWizard`
 * l'est de `valideEtapeWizard` : un appelant qui confondrait les deux
 * retomberait sur un montant plausible au lieu de s'arrêter.
 *
 * LES CONDITIONS N'ONT PAS CHANGÉ, LEUR RÔLE SI. Elles décidaient ; elles
 * confirment. Quand elles ne confirment pas, ce n'est plus « alors c'est un prix
 * par tête » — c'est « alors cette session ne peut pas porter ce produit », et
 * il faut le dire à qui peut le corriger.
 */
export function refusForfaitNonConfirme(input: {
  regimeSession?: SessionRegime | null;
  prixTotalSession?: unknown;
  modeProduit: ModeProduit;
  inscrits: ReadonlyArray<InscritPourPrix>;
}): string | null {
  if (input.regimeSession === 'INDIVIDUEL') return null;
  if (input.regimeSession === 'ENTREPRISE') {
    try { sessionTotalHT({ regime: input.regimeSession, priceTotalHT: input.prixTotalSession }, []); } catch (e) { return (e as Error).message; }
    if (new Set(input.inscrits.map((i) => i.sponsorOrgId)).size > 1) return 'La session entreprise doit porter un seul commanditaire. Scindez la session par entreprise.';
    if (input.inscrits.some((i) => !i.couvertParConvention)) return 'Un payeur ne correspond pas au régime ENTREPRISE. Corrigez le commanditaire dans la fiche inscription.';
    return null;
  }
  if (input.modeProduit !== 'FORFAIT_ENTREPRISE') return null;

  const { inscrits } = input;
  if (inscrits.length === 0) return null;

  const commanditaires = new Set(inscrits.map((i) => i.sponsorOrgId));
  if (commanditaires.size > 1) {
    return (
      `Ce produit est vendu au forfait pour une entreprise, mais cette session porte ` +
      `${commanditaires.size} commanditaires : un total ne concernerait qu'une partie de la salle. ` +
      `Scindez la session, une par commanditaire.`
    );
  }

  const horsConvention = inscrits.filter((i) => !i.couvertParConvention).length;
  if (horsConvention > 0) {
    return (
      `Ce produit est vendu au forfait pour les salariés d'une entreprise, mais ` +
      `${horsConvention} inscrit${horsConvention > 1 ? 's ne relèvent' : ' ne relève'} pas de sa convention ` +
      `(indépendant, agent commercial ou dirigeant). Inscrivez-${horsConvention > 1 ? 'les' : 'le'} sur le ` +
      `produit vendu à la place, ou corrigez leur rattachement.`
    );
  }

  const sansPrix = inscrits.filter((i) => !(Number(i.priceHT) > 0)).length;
  if (sansPrix > 0) {
    return (
      `Ce produit est vendu au forfait, et ${sansPrix} inscrit${sansPrix > 1 ? 's n\'ont' : " n'a"} pas de prix : ` +
      `le total serait faux et sous-estimerait l'engagement. Renseignez leur tarif sur l'inscription.`
    );
  }

  return null;
}

/**
 * Le programme de cette session doit-il être le sien, ou le catalogue suffit-il ?
 *
 * Constat du 11/09 (ASSALIT SYNDIC, SES-0107) : le mode TOTAL_ENTREPRISE
 * existait depuis le 02/09 mais n'était atteint par AUCUN bouton de
 * l'application. « Préparer la formation », la matrice Qualiopi et le pack de
 * clôture appelaient tous le générateur PRODUIT — un programme de catalogue,
 * qui annonce le prix par tête. Résultat : 2 500 € « par stagiaire » face à une
 * convention de 2 500 € pour huit salariés, dans la même enveloppe OPCO.
 *
 * Deux raisons, et deux seulement, de sortir du catalogue :
 *  - un tarif a été consenti POUR CETTE SESSION (`pricePerLearner`) — c'est lui
 *    que reprennent la convention et la facture, pas le prix catalogue ;
 *  - la session est portée par UNE convention d'entreprise : le montant qui
 *    engage est le total du groupe, une notion qui n'existe pas au catalogue.
 *
 * Partout ailleurs — sessions inter, auto-payeurs, salles mixtes — le programme
 * reste le document de catalogue partagé, conformément à la règle du 18/06
 * (contenu FIGÉ au produit).
 */
export function programmeDoitEtrePropreALaSession(input: {
  regimeSession?: SessionRegime | null;
  prixTotalSession?: unknown;
  modeProduit: ModeProduit;
  inscrits: ReadonlyArray<InscritPourPrix>;
  tarifSession: unknown;
  prixProduit: unknown;
}): boolean {
  if (input.regimeSession) return true;
  const tarifSession = Number(input.tarifSession ?? 0);
  if (Number.isFinite(tarifSession) && tarifSession > 0) return true;

  // Un produit au forfait SANS inscrit n'a rien à dire de plus que son
  // catalogue : le montant serait le même, et un document de session identique
  // au document produit est un doublon à maintenir. Depuis le 17/09, le
  // catalogue sait annoncer le forfait tout seul.
  if (input.inscrits.length === 0) return false;

  return resoudrePrixProgramme(input).mode === 'TOTAL_ENTREPRISE';
}
