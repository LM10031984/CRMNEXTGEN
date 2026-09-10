/**
 * « Notre lecture » — le paragraphe d'analyse qui ouvre chaque chapitre de l'audit.
 *
 * Version HEURISTIQUE, déterministe et testable. Elle est la valeur de repli
 * prévue par la spec (§L-8, leçon E-3) : la rédaction par IA arrive plus tard,
 * mais elle ne sera JAMAIS silencieuse — `generationSource` dit toujours d'où
 * vient le texte, et une sortie IA non relue (`reviewedAt`) ne part pas.
 *
 * Pourquoi une heuristique sérieuse plutôt qu'un texte à trous : c'est ce qui
 * tourne quand Ollama est éteint, un vendredi soir, à la veille d'un R2. Un
 * repli qui produit du charabia n'est pas un repli, c'est une panne différée.
 *
 * La construction suit toujours le même mouvement, celui de la maquette :
 * ce qui marche → ce qui coince → pourquoi ça coûte.
 */

import type { DiagnosticChapter } from '@qualiof/shared/diagnostic';

import type { DiagnosticAlert } from './ratios';

export type LectureSource = 'heuristique' | `llm:${string}`;

export interface ChapterLecture {
  chapter: DiagnosticChapter;
  text: string;
  source: LectureSource;
}

export interface LectureInput {
  chapter: DiagnosticChapter;
  chapterTitle: string;
  score: number | null;
  coverage: number;
  answeredCount: number;
  visibleCount: number;
  alerts: DiagnosticAlert[];
  ratios: Record<string, number | null>;
}

/** Les tournures qui ouvrent le paragraphe, selon le niveau du chapitre. */
function opening(score: number | null, title: string): string {
  if (score === null) return `Ce chapitre n'a pas été suffisamment renseigné pour être noté.`;
  if (score >= 80) return `${title} est un point d'appui de votre agence.`;
  if (score >= 60) return `${title} tient, sans être un point fort.`;
  if (score >= 40) return `${title} est en dessous de ce qu'on observe habituellement.`;
  return `${title} est le point le plus fragile de votre organisation.`;
}

/**
 * Une alerte devient une phrase. On garde le libellé métier tel quel — il a été
 * écrit pour être lu par un dirigeant, pas reformulé par une machine.
 */
function alertSentences(alerts: DiagnosticAlert[]): string[] {
  return alerts
    .filter((a) => a.audience === 'client')
    .sort((a, b) => severityRank(b) - severityRank(a))
    .slice(0, 3)
    .map((a) => a.label);
}

function severityRank(a: DiagnosticAlert): number {
  return a.severity === 'error' ? 3 : a.severity === 'warning' ? 2 : 1;
}

/** Ce que le chapitre coûte, quand on sait le dire sans inventer. */
function consequence(chapter: DiagnosticChapter, alerts: DiagnosticAlert[]): string | null {
  const codes = new Set(alerts.map((a) => a.code));
  if (codes.has('no_one_prospects')) {
    return "Tant que personne ne prospecte, le volume d'affaires dépend d'événements que vous subissez plutôt que vous ne les provoquez.";
  }
  if (codes.has('exclusivity_below_benchmark')) {
    return "Un mandat simple se défend mal : le prix se négocie sur le dos de l'agence, et la concurrence travaille le même bien.";
  }
  if (codes.has('compromis_to_acte_below_benchmark') || codes.has('buyer_financing_not_verified')) {
    return "Une vente qui tombe entre le compromis et l'acte, c'est un mandat rentré, un bien commercialisé et des visites — tout le travail, aucun honoraire.";
  }
  if (codes.has('seller_followup_weak')) {
    return "Sans rythme de suivi, la baisse de prix arrive trop tard, quand le bien s'est déjà usé sur le marché.";
  }
  if (codes.has('reviews_per_vente_below_benchmark')) {
    return 'Vos clients satisfaits ne se voient pas en ligne : chaque vendeur qui vous cherche trouve un silence là où vos concurrents ont une réputation.';
  }
  if (codes.has('seller_discovery_not_formalized')) {
    return 'Sans trame de découverte, la qualité du rendez-vous dépend de qui le mène — et se transmet mal aux nouveaux arrivants.';
  }
  if (codes.has('no_indicators_followed')) {
    return "Piloter au ressenti fonctionne tant que l'équipe est petite ; ça devient ingérable dès qu'elle grandit.";
  }
  if (chapter === 10) {
    return "Un outil installé mais non paramétré coûte du temps au lieu d'en faire gagner : chacun réinvente sa méthode, et les résultats sont inégaux.";
  }
  return null;
}

/** La réserve de lecture quand les données manquent — dite, jamais tue. */
function coverageCaveat(answered: number, visible: number): string | null {
  if (visible === 0) return null;
  const missing = visible - answered;
  if (missing === 0) return null;
  if (missing === 1)
    return `Une question de ce chapitre est restée sans réponse : la lecture est à confirmer sur ce point.`;
  return `${missing} questions de ce chapitre sont restées sans réponse : la lecture ci-dessus porte sur ce qui a été déclaré.`;
}

export function buildChapterLecture(input: LectureInput): ChapterLecture {
  const parts: string[] = [opening(input.score, input.chapterTitle)];

  const sentences = alertSentences(input.alerts);
  if (sentences.length > 0) {
    parts.push(...sentences);
  } else if (input.score !== null && input.score >= 60) {
    parts.push(
      "Aucun écart marquant n'est ressorti sur ce chapitre : les pratiques déclarées sont conformes à ce qu'on attend d'une agence qui tourne.",
    );
  }

  const cost = consequence(input.chapter, input.alerts);
  if (cost) parts.push(cost);

  const caveat = coverageCaveat(input.answeredCount, input.visibleCount);
  if (caveat) parts.push(caveat);

  return { chapter: input.chapter, text: parts.join(' '), source: 'heuristique' };
}

/**
 * Le premier levier du chapitre — l'action qui rapporte le plus vite.
 *
 * Volontairement MÉTIER par défaut, jamais « mettez de l'IA » : un point de
 * douleur commercial appelle un geste commercial (règle 7 de la commande). Les
 * modules IA se recommandent quand c'est l'outillage qui coince, pas quand
 * c'est la découverte vendeur.
 */
export interface ChapterLever {
  /** Trois à six mots — c'est ce qui titre une priorité du plan 90 jours. */
  title: string;
  /** La phrase complète, telle qu'elle apparaît dans l'encadré du chapitre. */
  action: string;
}

/**
 * Le premier levier du chapitre — l'action qui rapporte le plus vite.
 *
 * Volontairement MÉTIER par défaut, jamais « mettez de l'IA » : un point de
 * douleur commercial appelle un geste commercial (règle 7 de la commande). Les
 * modules IA se recommandent quand c'est l'outillage qui coince, pas quand
 * c'est la découverte vendeur qui n'existe pas.
 *
 * Le titre est séparé de l'action parce que les deux ne vivent pas au même
 * endroit : la phrase complète tient dans l'encadré du chapitre, mais recopiée
 * telle quelle comme titre de priorité page 16, elle donne un plan illisible.
 */
export function buildChapterLever(
  chapter: DiagnosticChapter,
  alerts: DiagnosticAlert[],
): ChapterLever {
  const codes = new Set(alerts.map((a) => a.code));

  if (codes.has('no_one_prospects') || chapter === 3) {
    return {
      title: 'Ritualiser la prospection',
      action:
        "Un rituel de prospection hebdomadaire sur créneau fixe, avec une trame d'appel commune : l'objectif n'est pas de prospecter plus, mais que toute l'équipe le fasse.",
    };
  }
  if (chapter === 4) {
    return {
      title: 'Formaliser la découverte vendeur',
      action:
        "Une trame de découverte vendeur écrite, utilisée par tous, et un avis de valeur remis systématiquement par écrit — c'est ce qui fait la différence entre une estimation et un mandat.",
    };
  }
  if (chapter === 5) {
    return {
      title: "Travailler l'exclusivité et le prix de rentrée",
      action:
        "Un argumentaire d'exclusivité travaillé en entraînement, et une règle claire sur le prix de rentrée : on ne prend pas un mandat à 10 % au-dessus du marché pour « ne pas perdre l'affaire ».",
    };
  }
  if (chapter === 6) {
    return {
      title: 'Programmer le suivi vendeur',
      action:
        "Un point vendeur à date fixe dès la signature du mandat, avec un compte rendu écrit : la baisse de prix se prépare, elle ne s'improvise pas au troisième mois.",
    };
  }
  if (chapter === 7) {
    return {
      title: 'Qualifier le financement acquéreur',
      action:
        "Une qualification financière systématique avant la première visite : c'est le geste qui supprime la majorité des compromis qui tombent.",
    };
  }
  if (chapter === 8) {
    return {
      title: "Suivre les dossiers jusqu'à l'acte",
      action:
        "Un suivi nominatif des dossiers entre compromis et acte, avec relance du courtier et du notaire aux échéances : les ventes ne se perdent pas, elles s'oublient.",
    };
  }
  if (chapter === 9) {
    return {
      title: 'Collecter les avis et faire travailler la base',
      action:
        "Une demande d'avis déclenchée à chaque acte signé, au moment où le client est content — puis une exploitation régulière de la base pour la faire travailler.",
    };
  }
  if (chapter === 10) {
    return {
      title: "Paramétrer les outils avant d'en ajouter",
      action:
        "Instructions personnalisées, modèles de prompts communs et réflexe de vérification : c'est ce qui fait que toute l'équipe obtient le même niveau de résultat.",
    };
  }
  if (chapter === 11) {
    return {
      title: 'Piloter sur trois indicateurs',
      action:
        "Trois indicateurs suivis chaque semaine, affichés devant l'équipe, et un point individuel mensuel : le pilotage commence par ce qui se mesure.",
    };
  }
  return {
    title: 'Reprendre les points signalés',
    action:
      "Reprendre les points signalés ci-dessus dans l'ordre où ils apparaissent dans votre chaîne : c'est en amont que les corrections rapportent le plus.",
  };
}
