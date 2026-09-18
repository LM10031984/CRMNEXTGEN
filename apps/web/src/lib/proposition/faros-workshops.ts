/**
 * Adaptations en ateliers présentiels du corpus Formation Faros, consulté le
 * 18/09/2026 (TOURNAGE-PAR-MODULE et LIVRAISON_PARCOURS). Les durées ci-dessous
 * incluent la pratique : elles ne sont pas les durées des vidéos sources.
 * Sources conservées pour la traçabilité interne ; aucun script de tournage
 * ni capsule en préparation n'est diffusé. Une nouvelle édition = nouvelle ref.
 */
export interface FarosWorkshop {
  sourceRef: string;
  title: string;
  durationMin: number;
  ruleIds: string[];
  outcome: string;
  sourceCapsules: string[];
  prerequisites: string;
  steps: { minutes: number; action: string }[];
  exercise: string;
  evaluation: string;
}

const PREREQUIS = 'Disposer d’un ordinateur, d’un accès à un assistant IA et d’un dossier immobilier anonymisé. Le formateur fournit un cas fictif si nécessaire.';

function atelier(slug: string, title: string, ruleIds: string[], sourceCapsules: string[], outcome: string,
  demonstration: string, pratique: string, exercise: string, evaluation: string): FarosWorkshop {
  return {
    sourceRef: `faros-applique:v1:${slug}`, title, ruleIds, sourceCapsules, outcome,
    durationMin: 120, prerequisites: PREREQUIS,
    steps: [
      { minutes: 15, action: 'Reprendre le constat du diagnostic et observer la pratique actuelle sur un cas anonymisé. Définir le livrable à améliorer.' },
      { minutes: 25, action: demonstration },
      { minutes: 50, action: pratique },
      { minutes: 20, action: evaluation },
      { minutes: 10, action: 'Corriger le livrable, le ranger dans les outils de travail et fixer une première utilisation sous 24 heures puis une revue à J+7.' },
    ], exercise, evaluation,
  };
}

export const FAROS_WORKSHOPS: readonly FarosWorkshop[] = [
  atelier('prospection-locale', 'Construire une campagne locale avec l’IA', ['sources', 'qui-prospecte'], ['M1-C3', 'M1-D1/D2/D3', 'M1-F1/F2'],
    'Construire une campagne locale multicanale, avec messages IA relus et prochaines actions datées.',
    'Démontrer la production d’un baromètre local à partir de données vérifiées puis sa déclinaison avec Assist’immo en message court, courrier et trame de prise de contact.',
    'Chaque participant choisit une cible de son secteur, fournit ses sources à l’assistant, rédige trois variantes puis programme ses actions et la mesure des réponses.',
    'Produire un mini-plan d’acquisition sur 30 jours et trois messages pour une même situation, adaptés au canal et sans inventer de projet vendeur.',
    'Vérifier les sources du baromètre, la cohérence cible/message/canal, le respect des oppositions et la présence d’une prochaine action datée.'),
  atelier('decouverte-vendeur', 'Formaliser une découverte vendeur avec le protocole IA', ['decouverte'], ['M2-A3/A4', 'M2-B2/B4'],
    'Conduire une découverte vendeur et transformer ses notes en dossier structuré et compte rendu relu avec l’IA.',
    'Démontrer le protocole vendeur : motivation, échéance, bien, contraintes et prochaines étapes. Dicter un débrief anonymisé puis distinguer faits, ressentis et informations manquantes.',
    'En binôme, mener la découverte d’un vendeur fictif puis transformer notes et débrief vocal en dossier. Préparer le mail de reconnaissance et le confronter aux notes originales.',
    'Remettre un dossier vendeur structuré et un mail de synthèse personnalisé qui reprend le projet du client sans compléter les informations absentes.',
    'Le binôme contrôle la fidélité aux propos, les questions manquantes, les faits non sourcés et la prochaine étape ; le formateur valide la version corrigée.'),
  atelier('strategie-mandat', 'Présenter une stratégie de mandat avec l’IA', ['exclusivite', 'rdv-vers-mandat'], ['M2-D2/D3/D4'],
    'Présenter une stratégie de vente personnalisée et argumenter l’exclusivité avec un support préparé par IA.',
    'Construire les six pages de stratégie dans Gamma depuis un dossier vendeur : projet, marché, positionnement, services, calendrier et engagement. Relier chaque service à un bénéfice pour ce vendeur.',
    'Créer la présentation d’un dossier anonymisé puis jouer le rendez-vous de restitution et les objections à l’exclusivité. Corriger les promesses qui dépassent les services réellement fournis.',
    'Produire une présentation de stratégie de vente et une réponse à trois objections du vendeur, en utilisant ses objectifs et son calendrier.',
    'Évaluer la personnalisation au projet, la justification des services et la réponse aux objections ; aucun chiffre ni engagement inventé ne doit subsister.'),
  atelier('defense-prix', 'Argumenter le prix avec des données de marché et l’IA', ['defense-du-prix', 'prix-au-dessus', 'avis-de-valeur'], ['M2-A2', 'M2-C2', 'M2-D2'],
    'Préparer un avis de valeur argumenté et défendre le positionnement de prix à partir de comparables vérifiés avec l’aide de l’IA.',
    'Montrer comment organiser des comparables sourcés, distinguer prix affichés et ventes constatées, et utiliser l’IA pour structurer une argumentation sans lui déléguer l’estimation.',
    'Sur un dossier anonymisé, comparer les biens, documenter les écarts et préparer un support écrit. Jouer l’entretien avec un vendeur qui demande un prix supérieur au marché.',
    'Construire un avis de valeur écrit avec sources et limites, puis préparer une argumentation de prix adaptée au projet et aux objections du vendeur.',
    'Contrôler chaque comparable et chaque montant dans la source ; vérifier que le conseiller explique les écarts et conserve la décision de positionnement.'),
  atelier('suivi-vendeur', 'Ritualiser le suivi vendeur avec un journal et l’IA', ['suivi-vendeur'], ['M4-A3', 'M4-B1/B3'],
    'Installer un suivi vendeur hebdomadaire et produire un compte rendu fiable à partir du journal de mandat avec l’IA.',
    'Poser le contrat de suivi : canal, fréquence et jour. Monter le projet de mandat puis démontrer les commandes de compte rendu de visite et de bilan hebdomadaire.',
    'Renseigner une semaine d’actions et de visites dans un journal anonymisé. Produire un mail et un message court, relire les chiffres et distinguer action réalisée et action prévue.',
    'Remettre le contrat de suivi, le journal de mandat et deux comptes rendus adaptés au canal choisi par le vendeur, avec prochaine action datée.',
    'Comparer les comptes rendus au journal : toutes les actions annoncées existent, les retours sont fidèles et le rendez-vous de suivi est planifié.'),
  atelier('requalification-stock', 'Préparer un bilan de commercialisation avec l’IA', ['requalification'], ['M4-C3', 'M4-D2'],
    'Produire un bilan de commercialisation sourcé pour décider des actions de requalification du mandat.',
    'Démontrer le bilan à partir du projet vendeur, des statistiques de diffusion, des visites et des comparables. Distinguer problème de visibilité, de présentation et de positionnement.',
    'Construire le bilan d’un mandat fictif avec l’IA, vérifier les calculs et les comparables puis préparer une restitution au vendeur et deux options d’action argumentées.',
    'Produire un bilan de commercialisation et un plan d’action daté, justifiés par le journal du mandat et les données de marché fournies.',
    'Contrôler les calculs, les sources et la cohérence entre observations et actions proposées ; refuser toute baisse de prix déduite d’un indicateur isolé.'),
  atelier('decouverte-acheteur', 'Structurer un dossier acheteur avec l’IA', ['decouverte-acquereur'], ['M6-B1', 'M6-C1'],
    'Transformer la découverte acheteur en dossier exploitable et en proposition d’accompagnement avec l’IA.',
    'Démontrer l’extraction de notes de découverte et le complément vocal : critères, priorités, budget déclaré, échéance et retours des visites. Marquer les informations restant à vérifier.',
    'Mener une découverte en binôme, construire le dossier avec l’IA puis préparer une synthèse et une présentation d’accompagnement adaptées aux critères exprimés.',
    'Livrer un dossier acheteur, les questions complémentaires et une présentation des services réellement proposés, avec la prochaine étape du suivi.',
    'Comparer le dossier aux notes ; distinguer budget déclaré et financement vérifié, critères essentiels et préférences, sans inventer d’accord bancaire.'),
  atelier('base-fiable', 'Fiabiliser sa base immobilière avec l’IA', ['crm-a-jour'], ['M1-B1/B3/B4'],
    'Mettre à jour une base de contacts en contrôlant les extractions IA, les doublons et les prochaines actions.',
    'Démontrer l’enrichissement d’une fiche depuis des notes et un vocal anonymisés. Séparer information confirmée et hypothèse, repérer les doublons et préparer une correction réversible.',
    'Sur une copie d’exercice, faire proposer les corrections par l’IA, comparer ligne à ligne avec les sources puis valider manuellement les fusions et la prochaine action.',
    'Remettre dix fiches corrigées et un journal des changements ; aucune information incertaine ne doit être enregistrée comme un fait confirmé.',
    'Vérifier la provenance de chaque correction, l’absence de doublons créés, le traitement des oppositions et la possibilité de retrouver l’état précédent.'),
  atelier('base-dormante', 'Réactiver une base dormante avec des messages IA ciblés', ['exploitation-base'], ['M1-F3', 'M1-D1/D2/D5'],
    'Segmenter une base dormante et préparer des relances IA adaptées à chaque situation et autorisées.',
    'Démontrer la segmentation des anciennes estimations, anciens acheteurs et investisseurs. Donner à l’assistant le contexte vérifié pour rédiger un message propre à chaque segment.',
    'Préparer un mini-lot anonymisé, exclure les oppositions et les coordonnées sans provenance, produire les messages et programmer le suivi des réponses avant tout envoi.',
    'Remettre trois segments, leurs messages relus et un tableau de suivi avec date, réponse, mise à jour de la fiche et prochaine action.',
    'Vérifier que chaque message se rattache au contexte connu, qu’aucun projet actuel n’est supposé et qu’une opposition exclut bien toute relance.'),
  atelier('collecte-avis', 'Organiser la collecte d’avis avec des messages préparés par IA', ['collecte-avis', 'avis-par-vente'], ['M1-E1/E2', 'M1-D1/D2'],
    'Installer un processus de demande d’avis au bon moment, avec messages IA personnalisés et relance mesurée.',
    'Repérer un signal de satisfaction et préparer avec l’IA une demande courte. Montrer le lien d’avis, la relance unique et le tableau de suivi, sans écrire l’avis à la place du client.',
    'Travailler trois situations : conseil apprécié, transaction terminée et retour critique. Rédiger demande et relance, vérifier le lien et définir le moment de déclenchement.',
    'Produire une procédure de collecte, deux modèles de demande et une relance unique, avec un tableau qui distingue demandes envoyées et avis reçus.',
    'Contrôler la liberté de réponse, l’absence de faux avis, d’incitation ou de transaction inventée, et la confidentialité des informations du dossier.'),
  atelier('assistant-metier', 'Configurer un assistant IA pour ses dossiers immobiliers', ['ia-parametree'], ['M0-B1/B2/B3/B4'],
    'Configurer des instructions métier et un espace de dossier pour obtenir des réponses IA contextualisées.',
    'Démontrer les instructions personnalisées, le ton et le format attendus puis un projet dédié à un dossier vendeur anonymisé. Expliquer ce qui relève des instructions et des sources.',
    'Configurer l’assistant sur un cas fictif, demander une synthèse puis comparer avec une demande sans contexte. Corriger les instructions et les informations autorisées.',
    'Livrer des instructions métier réutilisables et un espace dossier contenant une source anonymisée, une consigne et une synthèse vérifiée.',
    'Tester une question dont la source ne donne pas la réponse : l’assistant doit signaler le manque et ne pas compléter le dossier par une invention.'),
  atelier('prompts-metier', 'Créer des modèles IA communs pour les tâches immobilières', ['prompts-communs'], ['M0-A2/A3/A4', 'M4-B3'],
    'Construire et tester des modèles de demandes IA partagés pour des livrables immobiliers récurrents.',
    'Démontrer une demande structurée : rôle, contexte, tâche, sources, format et critères de contrôle. La transformer en commande réutilisable pour un compte rendu de visite.',
    'Chaque participant crée puis fait tester par un collègue deux modèles : synthèse de découverte et suivi vendeur. Documenter les entrées obligatoires et les limites.',
    'Remettre deux modèles documentés avec exemple anonymisé, sortie attendue et grille de vérification avant usage par l’équipe.',
    'Tester les modèles sur un second dossier : ils doivent rester adaptés, signaler les données manquantes et ne reprendre aucun fait du premier cas.'),
  atelier('verification-ia', 'Vérifier les réponses IA sur un dossier immobilier', ['anti-hallucination'], ['M0-A5', 'M5-B1/B2'],
    'Contrôler une synthèse IA en retrouvant les informations dans les documents immobiliers sources.',
    'Démontrer une synthèse de documents anonymisés dans un assistant ou NotebookLM. Retrouver dans les sources chaque affirmation, distinguer citation, calcul et interprétation.',
    'Faire produire une synthèse comportant des points à vérifier puis confronter les chiffres et affirmations aux pièces. Marquer les inconnues et préparer les questions à l’interlocuteur compétent.',
    'Remettre une synthèse corrigée et une grille affirmation/source/statut, avec les points restant à vérifier explicitement signalés.',
    'Aucune affirmation sans source ne reste présentée comme certaine ; les calculs sont vérifiés et toute interprétation juridique est orientée vers le professionnel compétent.'),
];

export function farosContent(w: FarosWorkshop): string {
  return [
    `## ${w.title}`, `**Objectif observable :** ${w.outcome}`, `**Prérequis :** ${w.prerequisites}`,
    `**Durée sur site :** ${w.durationMin} minutes, démonstration et pratique comprises.`,
    '**Règle qui traverse le module.** L’IA prépare, le conseiller décide. Rien ne part au client sans relecture. Aucune donnée confidentielle dans un outil, aucune réponse publiée sans l’avoir lue.',
    '### Déroulé', ...w.steps.map((s) => `- ${s.minutes} min — ${s.action}`),
    `### Atelier et livrable\n${w.exercise}`, `### Évaluation\n${w.evaluation}`,
  ].join('\n\n');
}
