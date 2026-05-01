/**
 * Contenu stub Day 2 pour les 3 docs IA-assistés (QCM, GRILLE_OBS, ANALYSE_BESOIN).
 *
 * Permet de valider le rendu HTML+Gotenberg sans dépendance Ollama. Day 3
 * remplacera ces fonctions par des appels `callOllama(...)` paramétrés par
 * le programme et le profil du stagiaire.
 *
 * NB : les stubs sont volontairement génériques mais "lisibles" (pas de
 * Lorem Ipsum) pour repérer rapidement un problème de rendu en dev.
 */

import type { ClosureContext } from './shared-template';
import type { QcmContent } from './qcm-template';
import type { GrilleContent } from './grille-observation-template';
import type { AnalyseBesoinContent } from './analyse-besoin-template';

export function stubQcmContent(_ctx: ClosureContext): QcmContent {
  return {
    questions: [
      {
        question: 'Quel est l\'objectif principal de cette formation ?',
        options: [
          { letter: 'A', text: 'Vendre plus de produits' },
          { letter: 'B', text: 'Acquérir des compétences professionnelles ciblées' },
          { letter: 'C', text: 'Obtenir un diplôme' },
          { letter: 'D', text: 'Faire du networking' },
        ],
        correct_answer: 'B',
      },
      {
        question: 'Quelle est la première étape d\'une démarche professionnelle structurée ?',
        options: [
          { letter: 'A', text: 'L\'analyse du besoin' },
          { letter: 'B', text: 'La signature du contrat' },
          { letter: 'C', text: 'L\'envoi de la facture' },
          { letter: 'D', text: 'La communication sur les réseaux sociaux' },
        ],
        correct_answer: 'A',
      },
      {
        question: 'Vrai ou faux : il est important d\'adapter son discours à son interlocuteur.',
        options: [
          { letter: 'A', text: 'Vrai' },
          { letter: 'B', text: 'Faux' },
        ],
        correct_answer: 'A',
      },
      {
        question: 'Quel outil est le plus adapté pour assurer un suivi structuré de ses contacts ?',
        options: [
          { letter: 'A', text: 'Un cahier papier' },
          { letter: 'B', text: 'Un tableau Excel non partagé' },
          { letter: 'C', text: 'Un CRM ou outil de gestion dédié' },
          { letter: 'D', text: 'La mémoire' },
        ],
        correct_answer: 'C',
      },
      {
        question: 'Vrai ou faux : la formation continue n\'est utile qu\'en début de carrière.',
        options: [
          { letter: 'A', text: 'Vrai' },
          { letter: 'B', text: 'Faux' },
        ],
        correct_answer: 'B',
      },
      {
        question: 'Que faut-il faire après chaque échange professionnel important ?',
        options: [
          { letter: 'A', text: 'Rien, passer au suivant' },
          { letter: 'B', text: 'Noter les points clés et préparer la relance' },
          { letter: 'C', text: 'Envoyer immédiatement un devis' },
          { letter: 'D', text: 'Téléphoner pour conclure dans la journée' },
        ],
        correct_answer: 'B',
      },
      {
        question: 'Quelle est la meilleure manière de gérer une objection client ?',
        options: [
          { letter: 'A', text: 'L\'ignorer' },
          { letter: 'B', text: 'Argumenter avec insistance' },
          { letter: 'C', text: 'Écouter, reformuler et répondre avec des éléments factuels' },
          { letter: 'D', text: 'Changer de sujet' },
        ],
        correct_answer: 'C',
      },
    ],
  };
}

export function stubGrilleContent(_ctx: ClosureContext): GrilleContent {
  return {
    competences: [
      { nom: 'Comprendre le contexte professionnel et son cadre réglementaire', niveau: null, observation: null },
      { nom: 'Appliquer les méthodes vues en formation à un cas concret', niveau: null, observation: null },
      { nom: 'Identifier les outils adaptés aux situations rencontrées', niveau: null, observation: null },
      { nom: 'Adapter sa communication à différents profils d\'interlocuteurs', niveau: null, observation: null },
      { nom: 'Structurer une démarche de suivi et de relance', niveau: null, observation: null },
      { nom: 'Évaluer les résultats obtenus et ajuster sa pratique', niveau: null, observation: null },
      { nom: 'Mettre en œuvre un plan d\'action post-formation', niveau: null, observation: null },
    ],
    observations_globales: null,
  };
}

export function stubAnalyseBesoinContent(ctx: ClosureContext): AnalyseBesoinContent {
  return {
    contexte_professionnel:
      `${ctx.apprenantPrenom} ${ctx.apprenantNom} exerce une activité professionnelle pour laquelle la formation « ${ctx.sessionTitle} » apporte des compétences directement applicables. Le recueil des besoins permet d'adapter le programme aux enjeux rencontrés sur le terrain.`,
    objectifs_stagiaire: [
      'Acquérir une vision claire des bonnes pratiques du domaine',
      'Maîtriser les outils et méthodes présentés pendant la formation',
      'Identifier les axes d\'amélioration immédiatement applicables au quotidien',
    ],
    attentes: [
      'Repartir avec des outils opérationnels',
      'Bénéficier de retours d\'expérience concrets',
      'Échanger avec d\'autres professionnels du secteur',
    ],
    competences_visees: [
      'Mettre en œuvre la méthode présentée',
      'Identifier les leviers de performance dans son activité',
      'Adapter sa pratique professionnelle aux exigences actuelles',
    ],
    freins_identifies: [
      'Manque de temps pour mettre en pratique entre les sessions',
    ],
    motivation:
      'Le stagiaire souhaite renforcer ses compétences pour gagner en autonomie et en performance dans son activité professionnelle.',
  };
}
