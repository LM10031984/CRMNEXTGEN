/**
 * Scoring du diagnostic express — fonction PURE, aucun appel réseau.
 *
 * Choix assumé : le routage vers une problématique est fait par des RÈGLES,
 * pas par le modèle. Deux raisons, dans cet ordre :
 *  1. devant un prospect, un diagnostic doit être reproductible et explicable —
 *     « vous avez répondu ceci, donc on vous propose cela » ;
 *  2. c'est instantané. Le modèle n'intervient qu'ensuite, pour personnaliser
 *     un squelette déjà validé, jamais pour décider du sujet.
 *
 * Le module ne connaît ni prisma ni auth : il est testable seul, et réutilisable
 * côté worker si un jour la génération passe en file d'attente.
 */

import {
  QUESTIONS,
  PROBLEMATIQUES,
  type ProblematiqueKey,
  type Poids,
} from './questions';

/** Réponses brutes du formulaire : { questionId: choixValue }. */
export type Reponses = Record<string, string>;

export interface DiagnosticResultat {
  /** La problématique retenue — celle qui pilote la génération du programme. */
  dominante: ProblematiqueKey;
  /** La suivante, mentionnée en fin de programme comme prolongement possible. */
  secondaire: ProblematiqueKey | null;
  /** Score final par problématique, après garde-fous. Utile pour le CRM. */
  scores: Record<ProblematiqueKey, number>;
  /** Pourquoi cette problématique — phrases lisibles, tracées dans le lead. */
  justification: string[];
}

const TOUTES: ProblematiqueKey[] = [
  'IA_PRODUCTIVITE',
  'PROSPECTION_MANDATS',
  'MANAGEMENT_EQUIPE',
  'NOTORIETE_DIGITALE',
];

/**
 * Ordre de départage quand deux problématiques finissent à égalité ET que la
 * priorité déclarée ne tranche pas. Classement par ce qu'on sait le mieux
 * animer et vendre — c'est un choix commercial, pas une vérité.
 */
const ORDRE_DEPARTAGE: ProblematiqueKey[] = [
  'IA_PRODUCTIVITE',
  'PROSPECTION_MANDATS',
  'NOTORIETE_DIGITALE',
  'MANAGEMENT_EQUIPE',
];

/** Priorité déclarée (Q7) → problématique. Sert uniquement au départage. */
const PRIORITE_VERS_PROBLEMATIQUE: Record<string, ProblematiqueKey> = {
  MANDATS: 'PROSPECTION_MANDATS',
  TEMPS: 'IA_PRODUCTIVITE',
  EQUIPE: 'MANAGEMENT_EQUIPE',
  VISIBILITE: 'NOTORIETE_DIGITALE',
};

function scoresVides(): Record<ProblematiqueKey, number> {
  return { IA_PRODUCTIVITE: 0, PROSPECTION_MANDATS: 0, MANAGEMENT_EQUIPE: 0, NOTORIETE_DIGITALE: 0 };
}

function ajouter(scores: Record<ProblematiqueKey, number>, poids: Poids): void {
  for (const cle of TOUTES) {
    const p = poids[cle];
    if (p) scores[cle] += p;
  }
}

/**
 * Calcule la problématique dominante à partir des réponses.
 *
 * Tolérant aux réponses manquantes ou inconnues : une question sautée ne
 * rapporte simplement rien. Un formulaire vide retourne quand même une
 * problématique (la première de l'ordre de départage) — on ne laisse jamais
 * un prospect sur une erreur technique parce qu'il a mal cliqué.
 */
export function diagnostiquer(reponses: Reponses): DiagnosticResultat {
  const scores = scoresVides();
  const justification: string[] = [];

  for (const question of QUESTIONS) {
    const valeur = reponses[question.id];
    if (!valeur) continue;
    const choix = question.choix.find((c) => c.value === valeur);
    if (!choix) continue;
    ajouter(scores, choix.poids);
    if (Object.keys(choix.poids).length > 0) {
      justification.push(`${question.label} → ${choix.label}`);
    }
  }

  // Garde-fou : personne qui travaille seul ne se voit jamais proposer une
  // journée de management d'équipe, même si elle a coché « faire progresser
  // mon équipe ». Une journée hors-sujet devant un prospect coûte plus cher
  // qu'un diagnostic un peu moins fin.
  if (reponses.equipe === 'SEUL') {
    scores.MANAGEMENT_EQUIPE = 0;
    justification.push('Travaille seul → management d’équipe écarté');
  }

  const classement = classer(scores, reponses);

  // `classer` trie TOUTES (4 entrées constantes) : le tableau n'est jamais
  // vide, mais TypeScript ne peut pas le savoir depuis un `sort`.
  const dominante = classement[0] ?? ORDRE_DEPARTAGE[0]!;

  return {
    dominante,
    secondaire: classement[1] ?? null,
    scores,
    justification,
  };
}

/** Classement décroissant, départages appliqués. */
function classer(
  scores: Record<ProblematiqueKey, number>,
  reponses: Reponses,
): ProblematiqueKey[] {
  const prioritaire = PRIORITE_VERS_PROBLEMATIQUE[reponses.priorite ?? ''] ?? null;

  return [...TOUTES].sort((a, b) => {
    if (scores[b] !== scores[a]) return scores[b] - scores[a];
    // Égalité : la priorité déclarée par le prospect tranche — c'est le seul
    // endroit où il a dit explicitement ce qu'il voulait.
    if (prioritaire === a && scores[a] > 0) return -1;
    if (prioritaire === b && scores[b] > 0) return 1;
    return ORDRE_DEPARTAGE.indexOf(a) - ORDRE_DEPARTAGE.indexOf(b);
  });
}

/**
 * Résumé une ligne pour le champ `notes` du lead — ce que Laurent lit d'abord
 * quand il rappelle le prospect, sans ouvrir le programme.
 */
export function resumerPourLead(resultat: DiagnosticResultat, reponses: Reponses): string {
  const p = PROBLEMATIQUES[resultat.dominante];
  const lignes = [
    `Diagnostic : ${p.titre}`,
    `Scores : ${TOUTES.map((k) => `${k}=${resultat.scores[k]}`).join(' · ')}`,
    '',
    'Réponses :',
    ...QUESTIONS.map((q) => {
      const choix = q.choix.find((c) => c.value === reponses[q.id]);
      return `- ${q.label} ${choix ? choix.label : '(non répondu)'}`;
    }),
  ];
  return lignes.join('\n');
}
