/**
 * seed-journees-faros.ts — les 4 journées « L'Agent Incomparable » du diagnostic du stand.
 *
 * POURQUOI CES 4 PRODUITS
 *
 * Le diagnostic routait vers des journées du catalogue dont le programme n'est
 * pas un programme IA (Booster vendeur, Vendez mieux avec l'IA…). Or le modèle
 * a interdiction d'inventer hors du programme source : le prospect recevait donc
 * un email Start Academy sans la patte IA — exactement l'inverse de ce qu'on est
 * venu vendre sur le stand. Et MANAGEMENT_EQUIPE n'avait aucune journée courte :
 * le résolveur basculait de force sur l'axe productivité.
 *
 * Ces 4 journées sont assemblées à partir du contenu Faros
 * (`AGENT-INCOMPARABLE-CONTENU-20260817`) et du programme 068 déjà rédigé.
 * Chaque ligne du déroulé vient d'une capsule qui existe, ce qui donne trois
 * garanties d'un coup :
 *  - IA × métier par construction, puisque c'est le contenu Faros ;
 *  - Qualiopi-propre : programme envoyé = programme animé, chaque point traçable ;
 *  - ancrage : le modèle recopie ces lignes, donc l'email ne promet rien d'autre.
 *
 * FORME DU `programMd` — UNE IDÉE PAR LIGNE
 *
 * `ancrerProgramme()` normalise tout le programme en une chaîne et vérifie que
 * la ligne source rendue par le modèle s'y retrouve. Une ligne = une idée
 * complète et autonome : c'est ce qui permet au modèle d'en citer une sans la
 * tronquer, et à la vérification de la retrouver.
 *
 * TRAÇABILITÉ DES CAPSULES
 *
 * Les références Faros (`M1-A1`…) ne doivent PAS partir chez le prospect. Elles
 * sont conservées ici en second membre de chaque ligne — sous forme de donnée
 * plutôt que de commentaire : un commentaire se désynchronise dès qu'on insère
 * une ligne, une paire non. `programMd` ne garde que le premier membre.
 *
 * IDEMPOTENCE
 *
 * Clé = (tenantId, code), contrainte unique en base. Réexécutable autant de fois
 * qu'on veut : les 4 produits sont mis à jour, jamais dupliqués. Le script ne
 * touche à AUCUN autre produit, ne crée aucune session, n'envoie aucun email.
 *
 * Run : cd apps/web && node --import tsx --env-file=../../.env scripts/seed-journees-faros.ts
 */

import { prisma, Modality, Prisma } from '@qualiof/db';

const TENANT_ID = 'db191440-a144-48d1-93c1-767e6f647f2c';

/**
 * 336 € HT = 42 €/h × 8 h, soit EXACTEMENT la prise en charge AGEFICE d'une
 * journée. C'est le tarif des 9 autres journées de 8 h du catalogue (vérifié le
 * 02/09/2026) et c'est ce qui rend vraie la phrase du script d'appel : pour un
 * ressortissant AGEFICE à jour de sa contribution, il ne reste rien à payer.
 *
 * VALIDÉ ET FIGÉ par Laurent le 02/09/2026, POUR CES QUATRE PRODUITS SEULEMENT.
 * Ce script n'a aucune vocation à harmoniser le catalogue : la tarification des
 * autres produits relève d'autres règles (forfait de groupe par entreprise,
 * intra sur mesure) et une erreur de tarif ne se voit pas — elle se lit six
 * semaines plus tard dans le chiffre d'affaires.
 */
const PRIX_JOURNEE_HT = '336.00';

/**
 * Les SEULS codes que ce script a le droit de toucher.
 *
 * Garde-fou volontairement redondant avec la liste `JOURNEES` : le jour où
 * quelqu'un ajoutera une entrée pour « juste mettre à jour un autre produit »,
 * le script refusera au lieu de lui appliquer silencieusement 336 € HT.
 */
const CODES_AUTORISES = new Set(['FRM-0004', 'FRM-0005', 'FRM-0006', 'FRM-0007']);

/** Une ligne du déroulé, et la capsule Faros dont elle vient. */
type Ligne = readonly [texte: string, capsule: string];

/** Blocs du déroulé : un intitulé de demi-journée, puis ses lignes. */
interface Bloc {
  titre: string;
  lignes: readonly Ligne[];
}

function composerProgramme(blocs: readonly Bloc[]): string {
  return blocs
    .map((b) => [b.titre, '', ...b.lignes.map(([texte]) => `- ${texte}`)].join('\n'))
    .join('\n\n');
}

/** Toutes les capsules citées, pour le contrôle de traçabilité en fin de run. */
function capsules(blocs: readonly Bloc[]): string[] {
  return blocs.flatMap((b) => b.lignes.map(([, c]) => c));
}

// ─────────────────────────────────────────────────────────────────────────────
// J1 — PROSPECTION_MANDATS
// ─────────────────────────────────────────────────────────────────────────────

const J1: readonly Bloc[] = [
  {
    titre: 'Matinée (9h - 13h) : Trouver des vendeurs',
    lignes: [
      ["Le retrait invisible : être occupé sans construire de vendeurs — activité, visibilité ou acquisition.", 'M1-A1'],
      ['La boucle vendeur en six gestes : chaque action produit une donnée, un contact ou une prochaine étape.', 'M1-A2'],
      ['Diagnostic : où fuit votre acquisition ? Chacun repart avec ses trois fuites identifiées.', 'M1-A3'],
      ['Une tournée doit laisser une base, pas seulement des photos.', 'M1-B1'],
      ['My Boîtage : construire une rue à partir des photos, enrichir la base par la voix, corriger sans casser.', 'M1-B2/B3/B4'],
      ['La routine secteur de 45 minutes par semaine.', 'M1-B5'],
      ["Un signal n'est pas un projet : lire les signaux vendeurs sans fabriquer une certitude.", 'M1-C1/C6'],
      ['DVF : repérer les maisons qui ont fait leur temps.', 'M1-C2'],
      ["Baromètre hyper-local : arriver en offreur d'information.", 'M1-C3'],
      ['Expert DPE : répondre utilement sans promettre une nouvelle classe.', 'M1-C4'],
      ['Prioriser le secteur : agir, préparer, surveiller.', 'M1-C7'],
      ["Assist'immo : transformer une situation en message, décliné par canal (courrier, SMS, vocal) en restant conforme.", 'M1-D1/D2'],
      ['Démonstration : une campagne baromètre vraiment multi-canal.', 'M1-D3'],
    ],
  },
  {
    titre: 'Après-midi (14h - 18h) : Gagner le mandat',
    lignes: [
      ['Votre intel en 15 minutes : la fiche de préparation du premier rendez-vous générée depuis vos outils de secteur.', 'M2-A2'],
      ["Vos 5 questions et vos 2 parades d'entrée ; atelier : préparez votre prochain rendez-vous vendeur.", 'M2-A3/A4'],
      ['La reconnaissance client : tout se joue dans la demi-heure.', 'M2-B1'],
      ["Le protocole vendeur en direct : l'IA guide la découverte et produit le compte rendu.", 'M2-B2'],
      ['Les livrables : ce qui part maintenant (mail de la demi-heure, courrier de voisinage), ce qui est gardé pour le second rendez-vous.', 'M2-B3/B4'],
      ['Le premier rendez-vous découvre, le second conclut : garder ses cartouches.', 'M2-D1'],
      ['La présentation de stratégie : six slides qui répondent au projet du vendeur.', 'M2-D2'],
      ["L'exclusivité, chiffrée et montrée.", 'M2-D3'],
      ['Le closing collaboratif et les trois objections.', 'M2-D4'],
      ['Le vendeur qui veut réfléchir : la vidéo qui conclut à votre place.', 'M2-D5'],
      ["Construire le plan d'acquisition vendeur sur 30 jours et piloter les bons indicateurs chaque vendredi.", 'M1-F1/F2'],
      ['Bonus base dormante : réactiver sans envoyer le même message à tout le monde.', 'M1-F3'],
      ['Synthèse et engagement 24 h : la première action de demain matin.', 'M2-E3'],
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// J2 — IA_PRODUCTIVITE
// ─────────────────────────────────────────────────────────────────────────────

const J2: readonly Bloc[] = [
  {
    titre: "Matinée (9h - 13h) : Le socle — parler aux IA et s'équiper",
    lignes: [
      ['Audit de votre semaine : où partent les heures.', 'M5-A1'],
      ['La méthode de délégation en quatre temps : ce que vous gardez, ce que vous confiez.', 'M5-A2'],
      ["L'erreur du « pote » : pourquoi l'IA répond à côté.", 'M0-A1'],
      ['RCT puis CLARTÉ sur une annonce immobilière : la demande qui obtient la bonne réponse du premier coup.', 'M0-A2'],
      ['Atelier : réécrire trois de vos demandes réelles.', 'M0-A3'],
      ["Double casquette et reverse prompting : faire écrire le prompt parfait par l'IA.", 'M0-A4'],
      ['Analyser un fichier ou une photo : diagnostic, plan, photo de bien.', 'M0-A5'],
      ["Instructions personnalisées et mémoire : l'assistant qui vous connaît.", 'M0-B1'],
      ['Un dossier = un Projet : atelier, créez votre projet « vendeur ».', 'M0-B2/B3'],
      ['Ton et format par défaut.', 'M0-B4'],
    ],
  },
  {
    titre: 'Après-midi (14h - 18h) : Les heures gagnées, une par une',
    lignes: [
      ["Le procès-verbal d'assemblée générale : d'imbuvable à moderne — NotebookLM sur la pile du dossier.", 'M5-B1'],
      ["Diagnostics et copropriété : le dossier qui répond aux questions de l'acheteur, sources à l'appui.", 'M5-B2'],
      ['Le compromis et les coûts : relecture guidée des conditions suspensives, relance du notaire.', 'M5-B3'],
      ['Atelier : vos trois synthèses sur vos propres dossiers.', 'M5-B4'],
      ["La commande /mail : trois réponses d'avance sur un mail délicat ; atelier, installez votre commande.", 'M5-C1/C2'],
      ['My juridic assistant : le premier réflexe juridique, encadré par trois règles.', 'M5-D1'],
      ['La veille immobilière en automatique, sur votre région.', 'M5-D2'],
      ['Du texte au visuel : le compte rendu de rendez-vous transformé en présentation Gamma.', 'M0-E1/E2'],
      ['Après chaque visite : la double reconnaissance, côté vendeur et côté acheteur.', 'M4-C1'],
      ["Le compte des heures et l'engagement : ce que vous mettez en place lundi.", 'M5-E1'],
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// J3 — NOTORIETE_DIGITALE
// ─────────────────────────────────────────────────────────────────────────────

const J3: readonly Bloc[] = [
  {
    titre: 'Matinée (9h - 13h) : La visibilité qui rapporte des estimations',
    lignes: [
      ['Le moment juste : demander un avis quand la satisfaction est exprimée.', 'M1-E1'],
      ['Demander, relancer et répondre aux avis sans tricher.', 'M1-E2'],
      ['Veille concurrentielle avec les applications ChatGPT : observer pour décider.', 'M1-E3'],
      ['Présence Locale IA : piloter la stratégie au lieu de générer un post de plus.', 'M1-E4'],
      ['Une semaine de présence locale en deux heures.', 'M1-E5'],
      ["Baromètre hyper-local : arriver en offreur d'information.", 'M1-C3'],
      ['Démonstration : une campagne baromètre vraiment multi-canal.', 'M1-D3'],
      ['Corriger, nommer, stocker et relancer : la bibliothèque qui évite de recommencer.', 'M1-D5'],
    ],
  },
  {
    titre: 'Après-midi (14h - 18h) : Commercialiser — la fenêtre de tir',
    lignes: [
      ["Un bien n'est neuf qu'une seule fois.", 'M3-A1'],
      ['Le plan de communication : votre feuille de route visible ; atelier, votre plan de lancement.', 'M3-A2/A3'],
      ["La première photo décide de tout ; l'ordre des photos raconte une histoire.", 'M3-B1/B2'],
      ['Atelier : votre vitrine.', 'M3-B3'],
      ["De l'annonce gagnante aux déclinaisons par canal.", 'M3-C1'],
      ['La rotation des quinze jours, en exécution ; atelier, votre kit d\'annonces prêt à tourner.', 'M3-C2/C3'],
      ['Le teaser : chauffer le marché avant la mise en ligne.', 'M3-D1'],
      ['Le post de lancement et la capsule vidéo.', 'M3-D2'],
      ['Atelier : votre lancement à blanc.', 'M3-D3'],
      ["Synthèse : le chef d'orchestre et l'engagement.", 'M3-E1'],
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// J4 — MANAGEMENT_EQUIPE
//
// Option B retenue (Laurent, 02/09/2026) : le programme 068 déjà rédigé, dont
// la séquence « Training du manager » est enrichie des points de pilotage Faros.
// Le manager repart en pilotant la MÉTHODE de son équipe, pas seulement ses
// chiffres — c'est ce qui distingue cette journée d'une formation de gestion.
// ─────────────────────────────────────────────────────────────────────────────

const J4: readonly Bloc[] = [
  {
    titre: 'Matinée (9h - 13h) : Voir clair — son marché, sa donnée, ses comptes',
    lignes: [
      ['Accueil et cadrage : les enjeux managériaux actuels, et le positionnement de l\'IA comme outil d\'aide à la décision.', '068'],
      ['Identification des sources de données pertinentes pour un benchmark de marché.', '068'],
      ['Analyse de la concurrence locale : positionnement, services, avis Google.', '068'],
      ['Étude de la pression concurrentielle : volume de biens, nombre de biens par agent.', '068'],
      ['Construction d\'un benchmark clair, factuel et exploitable.', '068'],
      ['Méthodologie de recherche approfondie appliquée à l\'immobilier.', '068'],
      ['Collecte, croisement et hiérarchisation des données ; vérification de la fiabilité des informations.', '068'],
      ['Synthèse des données pour faciliter la prise de décision.', '068'],
      ['Identification des indicateurs financiers clés utiles au pilotage.', '068'],
      ['Lecture simplifiée d\'un bilan comptable à l\'aide d\'un outil dédié.', '068'],
      ['Analyse des leviers de performance et identification des points de vigilance.', '068'],
    ],
  },
  {
    titre: "Après-midi (14h - 18h) : Entraîner son équipe à partir des chiffres",
    lignes: [
      ["Analyse des indicateurs d'activité individuels et collectifs.", '068'],
      ['Préparation structurée des entretiens individuels.', '068'],
      ['Construction de réunions commerciales efficaces basées sur les chiffres.', '068'],
      ['Renforcement de la posture managériale par une prise de décision factuelle.', '068'],
      ['Le contrat de suivi vendeur : la promesse posée le jour de la signature, érigée en standard d\'équipe.', 'M4-A3'],
      ["Le taux d'attractivité : lire les chiffres d'un mandat comme un professionnel.", 'M4-C3'],
      ['Le rendez-vous du vendredi : l\'hebdomadaire qui rassure le vendeur, installé en rituel d\'agence.', 'M4-C2'],
      ['Vos chiffres de conseiller : le tableau de bord individuel que chacun tient.', 'M6-E1'],
      ["La salle d'entraînement : l'IA comme sparring-partner pour entraîner ses conseillers avant leurs rendez-vous.", 'Train my agent T1/T2'],
      ['Synthèse : plan d\'action managérial priorisé et définition des indicateurs de suivi.', '068'],
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────

const ACCES =
  "Inscription au minimum 14 jours calendaires avant le début de la formation auprès de formation@start-academy.fr. " +
  "Une convention de formation est adressée à la validation de l'inscription, la convocation 7 jours avant le début. " +
  'Un test de positionnement est à réaliser avant la formation. En cas de subrogation de paiement, ' +
  "l'accord du financeur doit nous être parvenu avant le début de la formation.";

const EVALUATION =
  "Émargement à la demi-journée. Évaluation des acquis par QCM en fin de formation, complétée par des mises en situation " +
  'tout au long de la journée. Évaluation de la satisfaction du stagiaire. Certificat de réalisation remis à chaque participant.';

const ACCESSIBILITE =
  'Nos formations sont accessibles aux personnes en situation de handicap. Les modalités (durée, rythme, supports, salle) ' +
  'sont adaptées après étude des besoins avec le référent handicap : formation@start-academy.fr.';

const SUPPORT =
  'Support pédagogique numérique remis à chaque participant. Ateliers guidés sur les outils réellement utilisables en agence. ' +
  "Chaque participant travaille sur ses propres dossiers pendant la journée.";

interface Journee {
  code: string;
  title: string;
  theme: string;
  targetAudience: string;
  prerequisites: string;
  trainerProfile: string;
  objectives: string[];
  blocs: readonly Bloc[];
}

const JOURNEES: readonly Journee[] = [
  {
    code: 'FRM-0004',
    title: "Rentrer plus de mandats avec l'IA : de la prospection au mandat exclusif",
    theme: 'Acquisition / IA',
    targetAudience: "Conseillers immobiliers, agents commerciaux, dirigeants d'agence.",
    prerequisites: "Aucun prérequis. Un compte ChatGPT (version gratuite suffisante) est nécessaire pour les ateliers.",
    trainerProfile:
      "Formateur Start Academy, professionnel de l'immobilier en activité, spécialiste de l'acquisition vendeur et de l'usage de l'IA en agence.",
    objectives: [
      "Distinguer activité et acquisition, et repérer où fuit sa prospection vendeur.",
      "Construire et enrichir une base de secteur à partir d'une tournée, avec l'IA, en 45 minutes par semaine.",
      "Détecter les signaux vendeurs de son secteur (DVF, baromètre hyper-local, DPE) et arriver en offreur d'information.",
      "Préparer un rendez-vous vendeur en 15 minutes et dérouler un protocole de découverte guidé par l'IA.",
      "Présenter l'exclusivité chiffrée, traiter les trois objections courantes et conclure sur un second rendez-vous.",
      "Piloter un plan d'acquisition vendeur sur 30 jours avec ses indicateurs.",
    ],
    blocs: J1,
  },
  {
    code: 'FRM-0005',
    title: "Gagner 5 à 10 heures par semaine grâce à l'IA dans son activité immobilière",
    theme: 'IA',
    targetAudience:
      "Conseillers immobiliers, agents commerciaux, gestionnaires locatifs, syndics, dirigeants d'agence.",
    prerequisites: "Aucun prérequis. Un compte ChatGPT (version gratuite suffisante) est nécessaire pour les ateliers.",
    trainerProfile:
      "Formateur Start Academy, professionnel de l'immobilier en activité, spécialiste de l'IA générative appliquée au quotidien de l'agence.",
    objectives: [
      "Auditer sa semaine et identifier les tâches à déléguer à l'IA.",
      "Formuler des demandes qui obtiennent la bonne réponse du premier coup (méthode CLARTÉ, reverse prompting).",
      "Paramétrer son assistant (instructions personnalisées, mémoire, un dossier = un projet) pour ne plus repartir de zéro.",
      "Synthétiser un procès-verbal d'assemblée générale, un dossier de diagnostics ou un compromis en quelques minutes.",
      "Répondre à ses mails délicats avec trois réponses d'avance et automatiser sa veille immobilière.",
      'Produire un compte rendu ou une présentation client en un geste.',
    ],
    blocs: J2,
  },
  {
    code: 'FRM-0006',
    title:
      "Devenir le professionnel le plus visible de son secteur grâce à l'IA : avis, présence locale, commercialisation",
    theme: 'Notoriété / IA',
    targetAudience: "Conseillers immobiliers, agents commerciaux, dirigeants d'agence.",
    prerequisites: "Aucun prérequis. Un compte ChatGPT (version gratuite suffisante) est nécessaire pour les ateliers.",
    trainerProfile:
      "Formateur Start Academy, professionnel de l'immobilier en activité, spécialiste de la visibilité locale et de la commercialisation assistée par l'IA.",
    objectives: [
      'Obtenir, relancer et répondre aux avis clients au bon moment, sans tricher.',
      'Observer la concurrence locale et en tirer des décisions.',
      "Piloter sa présence locale avec l'IA : une semaine de contenus en deux heures.",
      "Arriver sur son secteur en offreur d'information avec un baromètre hyper-local diffusé sur plusieurs canaux.",
      'Lancer un bien comme une nouveauté : photos, annonces déclinées par canal, teaser et post de lancement.',
      'Tenir un plan de communication de quinze jours sur chaque mandat.',
    ],
    blocs: J3,
  },
  {
    code: 'FRM-0007',
    title: "Piloter son agence et son équipe avec l'IA : benchmark, chiffres, entretiens",
    theme: 'Management / IA',
    targetAudience:
      "Directeurs d'agence immobilière, responsables commerciaux, managers d'équipe, responsables de développement ou de réseau.",
    prerequisites:
      "Une expérience en management ou en direction d'agence est recommandée. Être à l'aise avec un assistant d'intelligence artificielle.",
    trainerProfile:
      "Formateur Start Academy, expert en management immobilier, pilotage d'agence et stratégie de performance. Expérience d'accompagnement de dirigeants, managers et réseaux immobiliers.",
    objectives: [
      'Réaliser un benchmark structuré de son marché immobilier afin de se positionner objectivement face à la concurrence.',
      'Maîtriser la recherche approfondie pour collecter, croiser et exploiter des données fiables.',
      "Analyser un bilan comptable à l'aide d'un outil dédié afin d'identifier les leviers de performance de l'agence.",
      'Utiliser les chiffres de pilotage pour préparer ses entretiens individuels et ses réunions commerciales.',
      "Poser des standards d'équipe sur le suivi vendeur et entraîner ses conseillers avant leurs rendez-vous, avec l'IA comme sparring-partner.",
    ],
    blocs: J4,
  },
];

async function main() {
  const ecrire = process.env.WRITE === '1';
  console.log(ecrire ? '=== ÉCRITURE ===' : '=== SIMULATION (WRITE=1 pour écrire) ===\n');

  // Vérifié AVANT toute écriture, et sur les deux sens : aucun code étranger ne
  // passe, et aucune des quatre journées n'a été retirée par mégarde.
  const codes = JOURNEES.map((j) => j.code);
  const intrus = codes.filter((c) => !CODES_AUTORISES.has(c));
  if (intrus.length > 0) {
    throw new Error(
      `Ce script ne tarifie QUE les journées Faros (décision Laurent du 02/09/2026). ` +
        `Codes non autorisés : ${intrus.join(', ')}.`,
    );
  }
  if (codes.length !== CODES_AUTORISES.size) {
    throw new Error(`Attendu ${CODES_AUTORISES.size} journées, trouvé ${codes.length}.`);
  }

  for (const j of JOURNEES) {
    const programMd = composerProgramme(j.blocs);
    const refs = capsules(j.blocs);

    // Garde-fou métier : le mot « pige » est interdit dans tout ce qui part vers
    // un prospect (règle du 11/08/2026). Le seed refuse plutôt que d'écrire.
    if (/\bpige/i.test(programMd) || j.objectives.some((o) => /\bpige/i.test(o))) {
      throw new Error(`${j.code} : le mot « pige » est interdit — corriger le contenu avant de semer.`);
    }
    // La référence de capsule ne doit jamais atteindre le prospect.
    if (/\[[A-Z]\d?-?[A-Z]?\d?\]/.test(programMd)) {
      throw new Error(`${j.code} : une référence de capsule a fuité dans le programMd.`);
    }

    const donnees = {
      title: j.title,
      durationHours: 8,
      modality: Modality.PRESENTIEL,
      prerequisites: j.prerequisites,
      targetAudience: j.targetAudience,
      objectives: j.objectives,
      programMd,
      pedagogicalMethods:
        'Formation en présentiel. Alternance de démonstrations en direct et d\'ateliers sur les dossiers réels des participants.',
      evaluationMethods: EVALUATION,
      accessibility: ACCESSIBILITE,
      trainerProfile: j.trainerProfile,
      pedagogicalSupport: SUPPORT,
      accessConditions: ACCES,
      priceHT: new Prisma.Decimal(PRIX_JOURNEE_HT),
      vatRate: new Prisma.Decimal('0'),
      theme: j.theme,
      isActive: true,
      capacityMin: 5,
      capacityMax: 25,
      bpfSpecialty: "326 - Informatique, traitement de l'information, réseaux de transmission des données",
      bpfCategory: 'F.3.d - Autres formations professionnelles',
    };

    if (!ecrire) {
      console.log(
        `${j.code} — ${j.title}\n` +
          `   ${donnees.durationHours} h · ${PRIX_JOURNEE_HT} € HT · ${j.theme}\n` +
          `   ${j.objectives.length} objectifs · ${programMd.split('\n').filter((l) => l.startsWith('- ')).length} lignes de déroulé · ${new Set(refs).size} capsules Faros\n`,
      );
      continue;
    }

    const avant = await prisma.trainingProduct.findUnique({
      where: { tenantId_code: { tenantId: TENANT_ID, code: j.code } },
      select: { id: true },
    });

    await prisma.trainingProduct.upsert({
      where: { tenantId_code: { tenantId: TENANT_ID, code: j.code } },
      create: { tenantId: TENANT_ID, code: j.code, ...donnees },
      update: donnees,
    });

    console.log(`${avant ? 'mis à jour' : 'créé     '} ${j.code} — ${j.title}`);
  }

  if (ecrire) {
    const codes = JOURNEES.map((j) => j.code);
    const relus = await prisma.trainingProduct.findMany({
      where: { tenantId: TENANT_ID, code: { in: codes } },
      select: { code: true, title: true, durationHours: true, priceHT: true, isActive: true, programMd: true },
      orderBy: { code: 'asc' },
    });
    console.log(`\n--- relecture : ${relus.length}/4 ---`);
    for (const r of relus) {
      console.log(
        `${r.code} · ${r.durationHours} h · ${r.priceHT} € · actif=${r.isActive} · ` +
          `${r.programMd.split('\n').filter((l) => l.startsWith('- ')).length} lignes · ${r.title}`,
      );
    }
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
