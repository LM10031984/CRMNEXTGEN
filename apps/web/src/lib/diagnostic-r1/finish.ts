/**
 * Ce que fait le bouton « Terminer » du dernier chapitre — fonction pure.
 *
 * Sortie de la boucle constatée le 03/09/2026 : « Terminer » était un simple
 * lien vers la fiche du diagnostic, et cette fiche redirigeait vers le premier
 * chapitre incomplet tant que le statut valait EN_COURS. Le commercial cliquait
 * « Terminer » au chapitre 11 et se retrouvait au chapitre 2, sans explication,
 * sans que rien ne soit terminé. Deux défauts qui se renforçaient : le bouton
 * ne terminait pas, et la seule page capable de le dire était inatteignable.
 *
 * Les règles de la spec §6 que ce module encode :
 *   • une donnée manquante ne BLOQUE jamais — même obligatoire ;
 *   • mais elle ne disparaît pas non plus : s'il manque des obligatoires, on
 *     montre lesquelles et où, avec des liens directs ;
 *   • et on ne renvoie JAMAIS au chapitre 1 en silence.
 */

import type { DiagnosticProgress } from './progress';

export type FinishAction =
  /** Rien ne manque : on clôt et on atterrit sur le récapitulatif. */
  | { kind: 'complete'; href: string }
  /**
   * Des réponses obligatoires manquent : on emmène sur le récapitulatif qui
   * les liste, sans clore. L'utilisateur choisit — les compléter, ou terminer
   * quand même. Ce n'est pas un blocage, c'est une information.
   */
  | { kind: 'review-missing'; href: string; missingCount: number; chapters: number[] };

/**
 * L'URL du récapitulatif.
 *
 * `vue=recap` n'est pas cosmétique : sans ce paramètre, la fiche d'un
 * diagnostic EN_COURS redirige vers le premier chapitre incomplet (c'est la
 * reprise, voulue depuis la liste). C'est exactement ce qui fabriquait la
 * boucle. Le paramètre dit « je viens de terminer, ne me renvoie pas saisir ».
 */
export function recapHref(diagnosticId: string): string {
  return `/app/diagnostics/${diagnosticId}?vue=recap`;
}

export function resolveFinishAction(
  diagnosticId: string,
  progress: DiagnosticProgress,
): FinishAction {
  const chapters = progress.chapters
    .filter((c) => c.missingRequired.length > 0)
    .map((c) => c.chapter);
  const missingCount = progress.chapters.reduce((s, c) => s + c.missingRequired.length, 0);

  if (missingCount > 0) {
    return { kind: 'review-missing', href: recapHref(diagnosticId), missingCount, chapters };
  }
  return { kind: 'complete', href: recapHref(diagnosticId) };
}

/** « Il manque 3 réponses obligatoires, aux chapitres 2 et 5. » */
export function describeMissingRequired(missingCount: number, chapters: number[]): string {
  if (missingCount === 0) return 'Toutes les réponses obligatoires sont renseignées.';
  const reponses =
    missingCount === 1 ? '1 réponse obligatoire' : `${missingCount} réponses obligatoires`;
  if (chapters.length === 0) return `Il manque ${reponses}.`;
  const liste =
    chapters.length === 1
      ? `au chapitre ${chapters[0]}`
      : `aux chapitres ${chapters.slice(0, -1).join(', ')} et ${chapters[chapters.length - 1]}`;
  return `Il manque ${reponses}, ${liste}.`;
}
