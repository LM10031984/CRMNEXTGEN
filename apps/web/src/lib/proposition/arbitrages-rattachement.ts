/**
 * Les rapprochements REFUSÉS par Laurent — le registre des arbitrages métier.
 *
 * ## Pourquoi un registre, et pas un correctif de score
 *
 * Un rapprochement peut être **lexicalement parfait et sémantiquement faux**.
 * Aucun réglage de poids ne l'attrape : les mots sont bons, c'est le SENS qui
 * ne l'est pas. Seul quelqu'un du métier peut le dire, et quand il l'a dit, la
 * décision doit survivre — à un ré-import du catalogue, à un changement de
 * score, à une session suivante qui ne saura pas.
 *
 * C'est la même mécanique que `RAYONS_TRANCHES` dans l'import du Drive : une
 * décision de catalogue se DÉCLARE, datée et motivée, plutôt que d'être passée
 * une fois à la main sur une base.
 *
 * ## La clé est le `sourceRef`, jamais l'`id` ni le titre
 *
 * L'identité stable d'un module dans sa source (`drive:034#2`) traverse les
 * ré-imports ; son `id` est recréé, et son titre peut être retouché. Laurent a
 * demandé que le moteur « ne le repropose plus jamais, même si le catalogue
 * bouge » — c'est le `sourceRef` qui le garantit.
 *
 * ## Ce que ce fichier n'est PAS
 *
 * Une liste noire de modules. Un arbitrage porte sur un **couple** (besoin,
 * module) : « Rédiger des compromis » reste un module parfaitement valable, et
 * il peut répondre à un autre besoin. C'est le rapprochement qui est faux, pas
 * le contenu.
 *
 * ## Le registre porte les DEUX sens (16/09/2026)
 *
 * Un rapprochement **CONFIRMÉ** n'est pas un « non-refusé » : c'est un
 * rapprochement **jugé**. La différence est opérationnelle — un confirmé ne se
 * re-soumet plus à la relecture métier (§5 ter), et il **survit aux règles
 * automatiques**, D-27 comprise.
 *
 * Le motif est le même que celui qui a fait choisir la variante B de D-27 :
 * punir un rapprochement parce qu'il tient sur peu de mots reviendrait à
 * sanctionner l'endroit où quelqu'un a pris la peine d'être explicite. Un
 * signal de catalogue est une décision humaine ; un arbitrage confirmé l'est
 * encore plus.
 */

export interface ArbitrageRattachement {
  /** REFUSE : le moteur ne le propose plus. CONFIRME : il est jugé, et il reste. */
  sens: 'REFUSE' | 'CONFIRME';
  /** Le code du besoin (`ProgrammeNeed.code`). */
  needCode: string;
  /** L'identité stable du module dans sa source — `drive:NNN#i`. */
  moduleSourceRef: string;
  /** Le titre au moment de l'arbitrage — pour relire, jamais pour identifier. */
  moduleTitle: string;
  /** Le motif, dans les mots de celui qui a tranché — VERBATIM, jamais résumé. */
  motif: string;
  /**
   * Ce que le MOTEUR avait retenu, s'il éclaire le refus.
   *
   * Séparé du motif à dessein : le motif est métier, ceci est technique, et les
   * mélanger ferait croire que la machine avait vu le problème.
   */
  constatTechnique?: string;
  date: string;
}

/**
 * Les refus, un par ligne, avec leur motif intégral.
 *
 * On ne résume pas un motif : c'est lui qui permettra, dans six mois, de savoir
 * si le refus vaut encore ou si le catalogue a changé entre-temps.
 */
export const ARBITRAGES_RATTACHEMENT: readonly ArbitrageRattachement[] = [
  {
    sens: 'REFUSE',
    needCode: 'transformation',
    moduleSourceRef: 'drive:034#2',
    moduleTitle: 'Rédiger des compromis de vente efficaces',
    motif:
      'Cette douleur porte sur le SUIVI DE LA RÉCEPTION DES PIÈCES pour le bon ' +
      'déroulé du dossier entre l’offre et l’acte. Pas sur la rédaction d’un ' +
      'compromis — que le conseiller ne rédige pas. Le rapprochement vient de ' +
      'l’homonyme « compromis » (terrain d’entente / avant-contrat de vente) : ' +
      'lexicalement parfait, sémantiquement faux.',
    constatTechnique:
      'Le terme qui a réellement déclenché le rapprochement est « vente » ' +
      '(mot-clé du besoin, présent dans le titre) — PAS « compromis », qui ne ' +
      'figure dans aucun mot-clé. L’homonyme n’apparaît donc même pas dans la ' +
      'trace lexicale : aucune relecture des `matchedTerms` n’aurait pu le ' +
      'prédire. Le besoin porte « compromis » dans ses ALERTES ' +
      '(offres_to_compromis_below_benchmark, compromis_to_acte_below_benchmark), ' +
      'où le mot désigne une ÉTAPE du tunnel ; le module l’emploie comme un ' +
      'DOCUMENT À RÉDIGER. Même mot, deux rôles.',
    date: '2026-09-16',
  },
  {
    sens: 'CONFIRME',
    needCode: 'transformation',
    moduleSourceRef: 'drive:034#3',
    moduleTitle: 'Gérer les objections et trouver des solutions de compromis',
    motif:
      'Gérer les objections pour faire aboutir une offre fait partie de ' +
      '« transformer visites et offres en actes ». Le rattachement est juste.',
    constatTechnique:
      'Rapproché par SIGNAUX, confiance forte, sur trois mots — « vente », ' +
      '« negociation », « offre ». Il aurait survécu à D-27 dans les deux ' +
      'variantes ; le confirmer ne le sauve de rien, ça le retire de la file ' +
      'de relecture.',
    date: '2026-09-16',
  },
];

/** Index (needCode → sourceRef → arbitrage), construit une fois. */
const PAR_BESOIN = new Map<string, Map<string, ArbitrageRattachement>>();
for (const a of ARBITRAGES_RATTACHEMENT) {
  const pour = PAR_BESOIN.get(a.needCode) ?? new Map();
  pour.set(a.moduleSourceRef, a);
  PAR_BESOIN.set(a.needCode, pour);
}

function arbitrageDe(needCode: string, moduleSourceRef: string | null): ArbitrageRattachement | null {
  if (!moduleSourceRef) return null;
  return PAR_BESOIN.get(needCode)?.get(moduleSourceRef) ?? null;
}

/**
 * Ce couple a-t-il été refusé ? Rend l'arbitrage, pour que l'appelant puisse le
 * DIRE au commercial plutôt que d'escamoter le module en silence.
 */
export function arbitrageRefusant(
  needCode: string,
  moduleSourceRef: string | null,
): ArbitrageRattachement | null {
  const a = arbitrageDe(needCode, moduleSourceRef);
  return a?.sens === 'REFUSE' ? a : null;
}

/**
 * Ce couple a-t-il été CONFIRMÉ par un humain ?
 *
 * Un confirmé traverse les règles automatiques : il a déjà été jugé sur le
 * fond, et une règle de forme n'a pas à revenir dessus.
 */
export function arbitrageConfirmant(
  needCode: string,
  moduleSourceRef: string | null,
): ArbitrageRattachement | null {
  const a = arbitrageDe(needCode, moduleSourceRef);
  return a?.sens === 'CONFIRME' ? a : null;
}
