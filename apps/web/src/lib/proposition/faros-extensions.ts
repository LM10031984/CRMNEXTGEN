/** Ateliers de développement issus du corpus Faros local consulté le 18/09/2026.
 * Édition distincte : les treize ateliers déjà installés restent immuables.
 * 120 min = atelier accompagné, et non durée des capsules vidéo sources.
 */
import type { FarosWorkshop } from './faros-workshops';

function extension(
  slug: string,
  title: string,
  sourceCapsules: string[],
  outcome: string,
  demonstration: string,
  practice: string,
  evaluation: string,
): FarosWorkshop {
  return {
    sourceRef: `faros-complements:v1:${slug}`,
    title,
    sourceCapsules,
    outcome,
    ruleIds: [],
    durationMin: 120,
    prerequisites:
      'Disposer d’un ordinateur, d’un assistant IA et d’un dossier immobilier anonymisé ou du cas fictif fourni. Savoir contextualiser une demande et contrôler une réponse IA.',
    steps: [
      {
        minutes: 15,
        action:
          'Choisir une situation du parcours métier travaillé au diagnostic ; définir le livrable, les sources autorisées et les critères de réussite.',
      },
      { minutes: 25, action: demonstration },
      { minutes: 50, action: practice },
      { minutes: 20, action: evaluation },
      {
        minutes: 10,
        action: 'Corriger le livrable et fixer une application sur un dossier avec revue à J+7.',
      },
    ],
    exercise: practice,
    evaluation,
  };
}

export const FAROS_EXTENSION_WORKSHOPS: readonly FarosWorkshop[] = [
  extension(
    'lancement',
    'Orchestrer le lancement d’un bien avec l’IA',
    ['M3-A1/A2/A3'],
    'Construire un plan de lancement multicanal daté et validé avec le vendeur.',
    'Démontrer la préparation d’un calendrier J−7 à J+21 avec l’IA à partir du dossier du bien et des canaux réellement disponibles.',
    'Construire sur un cas immobilier le calendrier, les responsabilités, les points de contrôle et la présentation vendeur. Simuler une indisponibilité de photos et réviser le plan.',
    'Contrôler la cohérence des dates, la faisabilité des engagements, les sources et les mesures prévues après lancement.',
  ),
  extension(
    'photos',
    'Préparer et ordonner les photos immobilières avec l’IA',
    ['M3-B1/B2/B3'],
    'Préparer une séance photo et sélectionner une série cohérente qui représente fidèlement le bien.',
    'Montrer la critique assistée par IA d’un jeu de photos, le choix de l’accroche et l’ordre de visite. Distinguer photo réelle et projection explicitement signalée.',
    'Analyser une série fournie, écrire la préparation du bien, sélectionner les vues et justifier leur ordre. Comparer deux accroches sans masquer les défauts du bien.',
    'Vérifier la fidélité au bien, la lisibilité du parcours visuel et l’absence de modification trompeuse ; justifier chaque choix.',
  ),
  extension(
    'annonces',
    'Décliner et améliorer ses annonces avec l’IA',
    ['M3-C1/C2/C3'],
    'Créer un kit d’annonces vérifiées par canal et organiser leur révision à partir des résultats.',
    'Démontrer quatre déclinaisons depuis une fiche factuelle unique : portail, réseau social, courriel et message court ; préparer la rotation de l’annonce.',
    'Produire les quatre textes d’un dossier, vérifier chaque caractéristique et préparer deux variantes d’accroche avec un tableau de mesure à quinze jours.',
    'Comparer les textes aux pièces sources ; contrôler les mentions, la cohérence entre canaux et le protocole de mesure sans promesse inventée.',
  ),
  extension(
    'video-lancement',
    'Créer un teaser et une capsule de lancement avec l’IA',
    ['M3-D1/D2/D3'],
    'Produire un teaser et un storyboard de lancement fidèles au bien, avec un appel à l’action précis.',
    'Montrer la construction d’une capsule courte : accroche, faits vérifiés, points forts et appel à l’action ; coordonner le post et le calendrier du lancement.',
    'Rédiger avec l’IA le script, assembler un storyboard à partir des visuels fournis et préparer teaser, publication et feuille de route. Jouer le lancement à blanc.',
    'Vérifier les droits des visuels, la fidélité des descriptions, la distinction des projections et la cohérence de l’appel à l’action.',
  ),
  extension(
    'dossier-documentaire',
    'Interroger un dossier immobilier avec une IA sourcée',
    ['M5-A2', 'M5-B1/B2'],
    'Produire une synthèse de dossier et des réponses traçables aux pièces originales avec NotebookLM.',
    'Démontrer la sélection de sources dans un dossier anonymisé, l’extraction des décisions d’AG et la vérification des citations et des informations absentes.',
    'Constituer le dossier de travail, poser cinq questions acheteur, vérifier les passages cités et produire une synthèse. Traiter un document contradictoire et un scan incomplet.',
    'Contrôler chaque montant et date dans les originaux ; signaler les incertitudes et les validations à demander au notaire. La synthèse ne remplace aucune pièce officielle.',
  ),
  extension(
    'coordination-compromis',
    'Piloter les échanges du compromis à l’acte avec l’IA',
    ['M5-B3'],
    'Organiser les pièces, échéances et relances d’un dossier jusqu’à l’acte à partir des informations validées.',
    'Démontrer un tableau de suivi à partir d’un compromis fictif et la préparation de brouillons de relance pour les interlocuteurs du dossier.',
    'Relever les échéances explicites, constituer la liste des pièces manquantes, rédiger trois relances et simuler un changement de date confirmé par le notaire.',
    'Vérifier la traçabilité des dates, les destinataires et le statut de chaque pièce ; transmettre toute interprétation juridique au professionnel compétent.',
  ),
  extension(
    'mails-metier',
    'Répondre aux situations clients délicates avec l’IA',
    ['M5-C1'],
    'Créer une commande de rédaction de courriels métier avec contrôle humain avant envoi.',
    'Démontrer trois réponses possibles à un courriel vendeur, transformer la consigne réussie en modèle réutilisable et contrôler le ton et les engagements.',
    'Traiter trois cas anonymisés : vendeur inquiet, acheteur pressé et relance partenaire. Comparer les variantes, choisir et corriger une réponse puis tester le modèle sur un cas inédit.',
    'Contrôler la fidélité au contexte, la confidentialité, le ton et les engagements ; toute réponse reste un brouillon jusqu’à validation du conseiller.',
  ),
  extension(
    'outil-personnel',
    'Construire son assistant pour une tâche immobilière récurrente',
    ['BONUS-1', 'M5-C1'],
    'Configurer et tester un assistant spécialisé sur une tâche immobilière récurrente du parcours.',
    'Montrer comment transformer une procédure métier et ses exemples anonymisés en instructions d’assistant, avec format de sortie et critères de refus.',
    'Choisir une tâche du parcours, préparer les sources, configurer l’assistant et le tester sur trois cas dont un incomplet. Documenter les corrections et les conditions d’usage.',
    'Vérifier les résultats contre les sources, le traitement des données manquantes et les limites ; livrer les instructions et le journal de tests.',
  ),
  extension(
    'selection-acheteur',
    'Comparer les biens d’un acheteur avec l’IA',
    ['M6-D1'],
    'Produire une sélection de biens argumentée à partir de critères acheteur confirmés et d’annonces vérifiées.',
    'Démontrer un tableau de comparaison entre critères du dossier et annonces fournies ; distinguer critères remplis, manquants et informations à vérifier.',
    'Comparer cinq annonces, préparer une sélection commentée et un message de suivi. Réviser le classement après un retour acheteur et vérifier chaque lien et caractéristique.',
    'Contrôler les sources, l’absence de biens inventés, le respect des critères et l’explication des réserves ; le conseiller décide de la sélection finale.',
  ),
  extension(
    'pilotage-activite',
    'Piloter son activité immobilière avec des indicateurs et l’IA',
    ['M6-E1'],
    'Construire un tableau d’activité vérifiable et transformer ses ratios en actions métier datées.',
    'Démontrer le calcul des ratios à partir des estimations, mandats, visites, offres et compromis ; utiliser l’IA pour préparer la lecture du tableau.',
    'Reconstituer un mois d’activité sur un jeu de données, vérifier les calculs, identifier une priorité et préparer le plan d’action du mois suivant. Tester un mois avec données manquantes.',
    'Recalculer les ratios hors IA, distinguer constat et hypothèse, puis vérifier que les actions retenues correspondent aux indicateurs réellement disponibles.',
  ),
];
