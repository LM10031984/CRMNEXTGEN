/**
 * Les rattachements DOULEUR → MODULE validés par Laurent le 11/09/2026.
 *
 * **Source unique.** Le rapport de relecture (`propose:rattachement`) et
 * l'écriture en base (`ecrire:rattachements`) lisent tous les deux ce fichier.
 * Deux tables se seraient séparées au premier changement d'avis, et c'est
 * exactement le genre d'écart qu'on ne voit qu'une fois le mal fait.
 *
 * ## Ce qu'« écrire un rattachement » veut dire
 *
 * Le moteur de recommandation (`recommendModules`) choisit un module de deux
 * façons : par les mots de son intitulé (`source: 'lexique'`, une piste), ou
 * par un **signal du catalogue** (`source: 'signaux'`, une preuve). Rattacher
 * une douleur à un module, c'est poser sur le module le signal de cette
 * douleur — il devient alors recommandable POUR CETTE DOULEUR, et il l'est avec
 * son déroulé pédagogique, ce que les modules du catalogue diagnostic n'ont pas.
 *
 * ## Comment un signal est écrit, et pourquoi ainsi
 *
 * Un signal est une **phrase qu'on entend en rendez-vous**, pas une étiquette.
 * Deux contraintes, et elles tirent dans le même sens :
 *
 *   • il est ancré sur le **barème** — le libellé de la douleur et la question
 *     posée au dirigeant — jamais sur une reformulation de confort ;
 *   • il porte le **vocabulaire du besoin** (`PROGRAMME_NEEDS[].keywords`),
 *     sinon le moteur ne l'accroche pas et le rattachement ne sert à rien.
 *
 * ## Les deux rattachements qu'on ne peut PAS écrire ici
 *
 * `prompts-communs` et `coaching` pointent des **produits vendus sans modules**
 * (PROD-0042, PROD-0066, PROD-0058, PROD-c0c85e08) : leur contenu vit dans
 * `programMd`. Un signal se pose sur un MODULE — il n'y a rien où le poser.
 * C'est la conséquence de D-19 bis déjà consignée dans la spec : découper ces
 * programmes en modules est un travail de catalogue à faire les yeux ouverts,
 * pas un effet de bord d'un script. Ils sont déclarés ici avec leur motif pour
 * que l'absence soit lisible plutôt que silencieuse.
 */

/**
 * Le module visé.
 *
 * ⚠ **La clé est le `sourceRef`, jamais le titre.** Ce fichier a désigné ses
 * modules par `{ programme, module: titre }` jusqu'au 16/09/2026, et quatre des
 * sept décisions ont cessé de s'appliquer le 14/09 — le jour où quatre titres
 * ont été réécrits, sur arbitrage de Laurent et par le bon chemin
 * (`TITRES_TRANCHES`, keyé lui sur `sourceRef#order`).
 *
 * Ses arbitrages ont été détachés en appliquant ses arbitrages, et rien ne
 * s'est levé : un registre keyé sur un libellé se vide en silence le jour où
 * quelqu'un améliore le libellé. Or améliorer un libellé est son destin.
 */
export interface CibleRattachement {
  /** L'identité STABLE du module dans sa source — `drive:034#2`. Elle désigne. */
  sourceRef: string;
  /** Le code du programme d'origine — pour relire. */
  programme: string;
  /** Le titre AU MOMENT de la décision — pour relire, jamais pour identifier. */
  titreAuMomentDeLaDecision: string;
}

/** Un module du catalogue, tel que `resoudreCibles` a besoin de le voir. */
export interface ModuleDuCatalogue {
  sourceRef: string | null;
  programme: string;
  titre: string;
}

/** Une décision qui ne retrouve plus sa cible. */
export interface DecisionOrpheline {
  /** Le `sourceRef` cherché, et introuvable. */
  sourceRef: string;
  /** Le titre au moment de la décision — pour que la ligne se lise. */
  libelle: string;
  /** La douleur pour laquelle la décision avait été prise. */
  pour: string;
}

/** Une cible retrouvée, avec le titre qu'elle porte AUJOURD'HUI. */
export interface CibleResolue {
  cible: CibleRattachement;
  pour: string;
  titreActuel: string;
}

/**
 * Apparie les cibles au catalogue **par leur identité**, et dit ce qu'elle
 * n'a pas retrouvé.
 *
 * Le second point n'est pas un confort : c'est la moitié de la règle. Un
 * registre qui ne sait pas dire ce qu'il a perdu n'est pas un registre — c'est
 * précisément le signalement des orphelines qui a rendu visible le défaut du
 * 14/09, après quatre jours de silence.
 */
export function resoudreCibles(
  rattachements: readonly Pick<RattachementValide, 'douleur' | 'cibles'>[],
  catalogue: readonly ModuleDuCatalogue[],
): { trouvees: CibleResolue[]; orphelines: DecisionOrpheline[] } {
  const parRef = new Map(
    catalogue.filter((m) => m.sourceRef !== null).map((m) => [m.sourceRef as string, m]),
  );
  const trouvees: CibleResolue[] = [];
  const orphelines: DecisionOrpheline[] = [];
  for (const r of rattachements) {
    for (const cible of r.cibles) {
      const m = parRef.get(cible.sourceRef);
      if (m) trouvees.push({ cible, pour: r.douleur, titreActuel: m.titre });
      else
        orphelines.push({
          sourceRef: cible.sourceRef,
          libelle: cible.titreAuMomentDeLaDecision,
          pour: r.douleur,
        });
    }
  }
  return { trouvees, orphelines };
}

export interface RattachementValide {
  /** L'identifiant de la règle du barème (`listDiagnosticPainPoints`). */
  ruleId: string;
  /** Le libellé de la douleur, recopié du barème pour que le fichier se lise seul. */
  douleur: string;
  /**
   * Le signal à poser sur chaque module visé — une phrase de rendez-vous,
   * ancrée sur le barème et portant le vocabulaire du besoin.
   */
  signal: string;
  /** Les modules retenus, dans l'ordre voulu par Laurent. */
  cibles: CibleRattachement[];
  /** La réserve de Laurent, quand il en a posé une. */
  reserve?: string;
}

/**
 * Les douleurs dont le module retenu n'existe pas — pas encore, ou pas sous
 * cette forme. Déclarées pour que le trou soit visible et daté.
 */
export interface RattachementImpossible {
  ruleId: string;
  douleur: string;
  /** Ce que Laurent a retenu, et qui ne peut pas recevoir de signal. */
  retenu: string[];
  obstacle: string;
}

export const RATTACHEMENTS_VALIDES: readonly RattachementValide[] = [
  {
    ruleId: 'trame',
    douleur: "Trame d'appel commune",
    // Le besoin « prospection » cherche « prospection » ; la phrase reste celle
    // de la question posée au dirigeant (« il a une trame — ou il y va au
    // talent ? »). On ne dit RIEN du vendeur ici : le module retenu vient d'un
    // programme acquéreurs, et prêter à la phrase une portée vendeur qu'elle
    // n'a pas serait la première ligne fausse du fichier.
    signal: "Prospection — pas de trame d'appel commune : au téléphone, chacun y va au talent",
    cibles: [
      {
        sourceRef: 'drive:006#1',
        programme: 'BIB-D006',
        titreAuMomentDeLaDecision: 'Apprendre à vendre un rendez-vous découverte au téléphone',
      },
    ],
  },
  {
    ruleId: 'decouverte',
    douleur: 'Découverte vendeur formalisée',
    signal:
      'Découverte vendeur — chacun sa méthode au rendez-vous vendeur, pas de trame de découverte avant estimation',
    cibles: [
      {
        sourceRef: 'drive:017#1',
        programme: 'BIB-D017',
        titreAuMomentDeLaDecision: 'Maîtriser les techniques de découverte vendeur',
      },
      {
        sourceRef: 'drive:008#1',
        programme: 'BIB-D008',
        titreAuMomentDeLaDecision:
          'Mettre en Pratique des Situations de Découverte du Projet Acheteur-Vendeur',
      },
    ],
  },
  {
    ruleId: 'defense-du-prix',
    douleur: 'Les conseillers tiennent le prix de rentrée',
    signal:
      'Mandat — le prix de rentrée se lâche pour ne pas perdre l’affaire : la négociation du mandat ne se tient pas',
    cibles: [{
      sourceRef: 'drive:017#3',
      programme: 'BIB-D017',
      titreAuMomentDeLaDecision: 'Convaincre le vendeur avec des arguments solides',
    }],
  },
  {
    ruleId: 'suivi-vendeur',
    douleur: 'Rythme de suivi vendeur',
    signal:
      "Suivi vendeur — aucun rythme organisé : le vendeur entend parler de l'agence quand il y a du neuf",
    cibles: [
      {
        sourceRef: 'drive:037#2',
        programme: 'BIB-D037',
        titreAuMomentDeLaDecision: 'Préparer un Excellent Dossier de Suivi Vendeur',
      },
    ],
    reserve:
      'La douleur porte sur le RITUEL de suivi, le module sur la PRÉPARATION du dossier. Retenu comme le meilleur contenu existant, et repéré comme un endroit où écrire.',
  },
  {
    ruleId: 'decouverte-acquereur',
    douleur: 'Découverte acquéreur formalisée',
    signal:
      "Acquéreur — l'acheteur part en visite sans qu'on ait compris son projet : pas de face à face de qualification",
    cibles: [
      {
        sourceRef: 'drive:008#1',
        programme: 'BIB-D008',
        titreAuMomentDeLaDecision:
          'Mettre en Pratique des Situations de Découverte du Projet Acheteur-Vendeur',
      },
      {
        sourceRef: 'drive:012#2',
        programme: 'BIB-D012',
        titreAuMomentDeLaDecision:
          'Pratiquer une découverte acheteur de qualité en questionnant et écoutant activement les besoins des acheteurs :',
      },
    ],
  },
  {
    ruleId: 'offres-vers-compromis',
    douleur: 'Transformation offres → compromis',
    signal:
      'Transformation — trop d’offres ne deviennent pas des compromis : la négociation de l’offre décroche',
    cibles: [
      {
        sourceRef: 'drive:034#2',
        programme: 'BIB-D034',
        titreAuMomentDeLaDecision: 'Rédiger des compromis de vente efficaces',
      },
      {
        sourceRef: 'drive:034#3',
        programme: 'BIB-D034',
        titreAuMomentDeLaDecision: 'Gérer les objections et trouver des solutions de compromis',
      },
    ],
  },
  {
    ruleId: 'compromis-vers-acte',
    douleur: 'Transformation compromis → acte',
    signal:
      'Transformation — trop de compromis n’arrivent pas à l’acte : la vente se perd après la signature',
    cibles: [
      {
        sourceRef: 'drive:034#2',
        programme: 'BIB-D034',
        titreAuMomentDeLaDecision: 'Rédiger des compromis de vente efficaces',
      },
      {
        sourceRef: 'drive:034#3',
        programme: 'BIB-D034',
        titreAuMomentDeLaDecision: 'Gérer les objections et trouver des solutions de compromis',
      },
    ],
  },
];

export const RATTACHEMENTS_IMPOSSIBLES: readonly RattachementImpossible[] = [
  {
    ruleId: 'prompts-communs',
    douleur: "Modèles de prompts communs à l'équipe",
    retenu: [
      "PROD-0042 — L'intelligence artificielle au service des conseillers immobiliers (72h)",
      "PROD-0066 — L'intelligence artificielle au service des conseillers immobiliers - 16h",
      "PROD-0058 — L'IA au service des conseillers immobiliers (8h)",
    ],
    obstacle:
      'Ces trois produits sont VENDUS et ne portent aucun module : leur programme vit dans `programMd`. Un signal se pose sur un module — il n’y a rien où le poser.',
  },
  {
    ruleId: 'coaching',
    douleur: 'Coaching individuel régulier',
    retenu: ['PROD-c0c85e08 — Coaching Indiv'],
    obstacle:
      'Même cas : produit vendu, aucun module, contenu dans `programMd`.',
  },
];
