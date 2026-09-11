/**
 * Le prompt d'extraction et le contrat de sortie — FONCTIONS PURES.
 *
 * Un seul appel LLM structuré (spec §6.4, point 2) : le transcript entier
 * confronté au set de questions de la variante. Pas de découpage chapitre par
 * chapitre — un dirigeant répond au Ch.5 pendant qu'on lui parle du Ch.3, et
 * un appel par chapitre perdrait exactement ces réponses-là.
 *
 * Ce que le prompt interdit, et qui est ensuite REVÉRIFIÉ par `normalize.ts` —
 * un prompt n'est pas un garde-fou, c'est une consigne :
 *   • inventer une réponse « plausible » ;
 *   • embellir un montant (« environ 700 k€ » ne devient pas 700 000) ;
 *   • citer autre chose que le texte source, mot pour mot.
 *
 * PII : le transcript part au modèle — c'est la matière même de la
 * fonctionnalité. Les fiches équipe nominatives, elles, n'y entrent JAMAIS
 * (spec §L-10) : on n'envoie que la liste des questions, jamais les réponses
 * déjà saisies ni un `DiagnosticParticipant`.
 *
 * MODULE PUR : ni prisma, ni next, ni appel réseau.
 */

import { z } from 'zod';
import {
  DIAGNOSTIC_CHAPTERS,
  getQuestionsForVariant,
  REFERENTIAL_VERSION,
  type DiagnosticQuestion,
  type DiagnosticVariantKey,
} from '@qualiof/shared/diagnostic';

/**
 * Version du prompt, tracée dans `AIGenerationJob.promptVersion`.
 * À bumper dès qu'une consigne change : sans elle, impossible de dire quel
 * prompt a produit une réponse relue il y a trois mois.
 */
export const PROMPT_VERSION = 'transcript-v1';

/** Le contrat de sortie. Strict : une clé en trop et le lot entier est rejeté. */
export const SortieExtractionSchema = z.object({
  reponses: z
    .array(
      z
        .object({
          questionId: z.string().min(1),
          value: z.unknown(),
          confidence: z.number(),
          quote: z.string(),
        })
        .strip(),
    )
    .max(200),
});
export type SortieExtraction = z.infer<typeof SortieExtractionSchema>;

export const SYSTEM_PROMPT_TRANSCRIPT = `Tu assistes un consultant en formation qui vient de mener un entretien de diagnostic dans une agence immobilière. Tu reçois le COMPTE RENDU VERBATIM de cet entretien et la liste des questions de son questionnaire. Ton travail : dire, pour chaque question, ce que le dirigeant a effectivement répondu — et te taire sur le reste.

CE QU'EST LE DOCUMENT SOURCE : une conversation réelle. Digressions, hésitations, phrases coupées, plusieurs interlocuteurs, sujets abandonnés en cours de route, ordre des sujets qui ne suit pas le questionnaire. Une réponse au chapitre 5 peut très bien avoir été donnée pendant qu'on parlait du chapitre 3 : cherche dans tout le texte.

RÈGLE ABSOLUE — NE RIEN INVENTER :
- si la réponse n'est pas dans le compte rendu, N'ÉMETS RIEN pour cette question. Une question absente de ta sortie est un résultat normal et attendu : le consultant la posera au rendez-vous suivant ;
- ne déduis pas un chiffre d'un autre (« 40 ventes à 200 000 € » ne donne PAS un chiffre d'affaires) ;
- n'arrondis jamais « vers le beau » : « dans les 700 000 » n'est pas 700 000. Si le dirigeant reste vague sur un montant, n'émets pas la réponse ;
- ne complète pas avec ce que tu sais du marché immobilier.

RÈGLE ABSOLUE — LA CITATION EST LITTÉRALE :
Chaque réponse est accompagnée de "quote" : un extrait COPIÉ MOT POUR MOT du compte rendu, celui qui justifie ta réponse. Pas un résumé, pas une reformulation, pas une phrase recomposée à partir de deux passages. Au moins une dizaine de mots. Une citation qu'on ne retrouve pas telle quelle dans le texte fait rejeter la réponse.

LA CONFIANCE ("confidence", entre 0 et 1) :
- 0.9-1.0 : le dirigeant donne le chiffre ou le fait explicitement, sans ambiguïté ;
- 0.7-0.9 : il le dit clairement mais en passant, ou en reformulant la question ;
- 0.4-0.7 : il l'aborde sans être net — c'est probable, ça reste à confirmer ;
- < 0.4 : n'émets pas. Le doute n'a pas besoin d'être documenté, il a besoin d'être posé au client.
Ne surévalue pas : une confiance haute fait passer la réponse dans une confirmation groupée, une confiance basse la fait relire une par une. C'est toi qui décides du travail du consultant.

LE FORMAT DE "value", selon le type déclaré par la question :
- int : un nombre entier, sans unité ni séparateur (12, pas "12 agents") ;
- money : un nombre en EUROS, sans symbole (720000) ;
- percent : un nombre de 0 à 100 (35) ;
- yesno : exactement "yes" ou "no" ;
- choice : exactement UNE des valeurs techniques listées pour cette question ;
- multichoice : un TABLEAU de valeurs techniques listées pour cette question ;
- date : "AAAA-MM-JJ" ;
- url : l'adresse complète ;
- text : la réponse en une à deux phrases, dans les mots du dirigeant.

TU RÉPONDS UNIQUEMENT EN JSON, sans texte autour, sous la forme :
{"reponses":[{"questionId":"identity-agencies-count","value":2,"confidence":0.95,"quote":"on a deux agences, une à Nantes et une à Saint-Herblain"}]}
Si tu ne trouves rien : {"reponses":[]}`;

/** Une question, mise en forme pour le catalogue envoyé au modèle. */
function decrireQuestion(q: DiagnosticQuestion): string {
  const morceaux = [`- ${q.id} [${q.type}] : ${q.question}`];
  if (q.choices?.length) {
    const valeurs = q.choices
      .map((c) => (q.optionLabels?.[c] ? `${c} (${q.optionLabels[c]})` : c))
      .join(', ');
    morceaux.push(`  valeurs possibles : ${valeurs}`);
  }
  if (q.type === 'yesno' && q.answerLabels) {
    morceaux.push(`  yes = ${q.answerLabels.yes} · no = ${q.answerLabels.no}`);
  }
  if (q.hint) morceaux.push(`  ce qu'on cherche : ${q.hint}`);
  return morceaux.join('\n');
}

export interface EntreePrompt {
  transcript: string;
  variant: DiagnosticVariantKey;
  /**
   * Les questions auxquelles le commercial a DÉJÀ répondu (mode HYBRIDE) : on
   * ne les soumet pas au modèle. Économie de contexte, et surtout : on ne lui
   * donne pas l'occasion de proposer une réponse qui serait de toute façon
   * rejetée par la normalisation.
   */
  dejaRepondues?: readonly string[];
}

/** Les questions réellement soumises au modèle, dans l'ordre du questionnaire. */
export function questionsASoumettre(entree: EntreePrompt): DiagnosticQuestion[] {
  const deja = new Set(entree.dejaRepondues ?? []);
  return getQuestionsForVariant(entree.variant).filter((q) => !deja.has(q.id));
}

export function construirePromptUtilisateur(entree: EntreePrompt): string {
  const questions = questionsASoumettre(entree);
  const parChapitre = DIAGNOSTIC_CHAPTERS.map((meta) => {
    const duChapitre = questions.filter((q) => q.chapter === meta.chapter);
    if (duChapitre.length === 0) return null;
    return [`## Chapitre ${meta.chapter} — ${meta.title}`, ...duChapitre.map(decrireQuestion)].join(
      '\n',
    );
  })
    .filter((bloc): bloc is string => bloc !== null)
    .join('\n\n');

  return [
    `# Questionnaire (référentiel ${REFERENTIAL_VERSION}, variante ${entree.variant})`,
    '',
    parChapitre,
    '',
    '# Compte rendu du rendez-vous',
    '',
    entree.transcript.trim(),
  ].join('\n');
}
