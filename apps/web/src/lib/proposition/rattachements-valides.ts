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

/** Le module visé, désigné comme Laurent le désigne : son programme et son titre. */
export interface CibleRattachement {
  /** Le code du programme d'origine — `BIB-D034`, `BIB-D017`. */
  programme: string;
  /** Le titre du module, tel qu'il est au catalogue. */
  module: string;
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
      { programme: 'BIB-D006', module: 'Apprendre à vendre un rendez-vous découverte au téléphone' },
    ],
  },
  {
    ruleId: 'decouverte',
    douleur: 'Découverte vendeur formalisée',
    signal:
      'Découverte vendeur — chacun sa méthode au rendez-vous vendeur, pas de trame de découverte avant estimation',
    cibles: [
      { programme: 'BIB-D017', module: 'Maîtriser les techniques de découverte vendeur' },
      {
        programme: 'BIB-D008',
        module: 'Mettre en Pratique des Situations de Découverte du Projet Acheteur-Vendeur',
      },
    ],
  },
  {
    ruleId: 'defense-du-prix',
    douleur: 'Les conseillers tiennent le prix de rentrée',
    signal:
      'Mandat — le prix de rentrée se lâche pour ne pas perdre l’affaire : la négociation du mandat ne se tient pas',
    cibles: [{ programme: 'BIB-D017', module: 'Convaincre le vendeur avec des arguments solides' }],
  },
  {
    ruleId: 'suivi-vendeur',
    douleur: 'Rythme de suivi vendeur',
    signal:
      "Suivi vendeur — aucun rythme organisé : le vendeur entend parler de l'agence quand il y a du neuf",
    cibles: [
      { programme: 'BIB-D037', module: 'Préparer un Excellent Dossier de Suivi Vendeur' },
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
        programme: 'BIB-D008',
        module: 'Mettre en Pratique des Situations de Découverte du Projet Acheteur-Vendeur',
      },
      {
        programme: 'BIB-D012',
        module:
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
      { programme: 'BIB-D034', module: 'Rédiger des compromis de vente efficaces' },
      { programme: 'BIB-D034', module: 'Gérer les objections et trouver des solutions de compromis' },
    ],
  },
  {
    ruleId: 'compromis-vers-acte',
    douleur: 'Transformation compromis → acte',
    signal:
      'Transformation — trop de compromis n’arrivent pas à l’acte : la vente se perd après la signature',
    cibles: [
      { programme: 'BIB-D034', module: 'Rédiger des compromis de vente efficaces' },
      { programme: 'BIB-D034', module: 'Gérer les objections et trouver des solutions de compromis' },
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
