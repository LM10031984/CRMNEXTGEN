/**
 * L'IA entre dans le MÉTIER — et la règle qui la rend sûre entre avec elle.
 *
 * ## La doctrine, 17/09/2026
 *
 * > « Dans chaque cas on met de l'IA dans le métier — c'est ça notre expertise. »
 *
 * Conséquence directe : **aucun module d'IA n'est écrit.** Pas de socle, pas de
 * chapitre outils, pas de module « Les garde-fous ». Un stagiaire n'apprend
 * jamais l'IA pour elle-même : il apprend à rentrer un mandat, à ne pas perdre
 * un vendeur, à faire travailler sa base — et l'IA est l'instrument du geste.
 *
 * ## Le problème que cette garde résout
 *
 * « Dissoudre » les garde-fous dans les modules métier a un coût : si personne
 * ne vérifie, **« dissous » veut dire « disparu »**. On aurait retiré le module
 * qui portait les précautions et gagné des modules qui envoient un conseiller
 * coller des données de vendeur dans un outil en ligne.
 *
 * Le bloc `**Règle qui traverse le module.**` EST ce qui remplace le module
 * garde-fous. Trois phrases, toujours les mêmes, dans chaque module qui porte
 * un geste IA :
 *
 *   • l'IA prépare, le conseiller décide ;
 *   • rien ne part au client sans relecture ;
 *   • aucune donnée confidentielle dans un outil.
 *
 * ## Ce que la garde fait, et ce qu'elle ne fait pas
 *
 * Elle refuse un module qui **cite un outil d'IA sans porter la règle**. Elle
 * n'exige rien d'un module qui n'en cite aucun : la majorité des modules métier
 * n'ont pas de geste IA, et les obliger à porter la règle la viderait de son
 * sens — un texte qu'on colle partout ne se lit plus nulle part.
 *
 * Elle ne juge pas non plus la QUALITÉ du geste : savoir si « s'aider de
 * ChatGPT » est le bon geste pédagogique est une lecture de Laurent, pas une
 * expression régulière.
 */

/**
 * Les outils nommément cités — une LISTE, pas une intuition.
 *
 * Une liste se relit et se complète ; un motif vague attrape « ia » dans
 * « médias » et rate « NotebookLM ». Le jour où un outil manque, on l'ajoute
 * ici et la garde le voit partout d'un coup.
 */
export const OUTILS_IA = [
  'chatgpt',
  'notebooklm',
  'claude',
  'gemini',
  'copilot',
  'perplexity',
  'midjourney',
  'dall-e',
  'whisper',
] as const;

/** Le marqueur exact du bloc. C'est un contrat de forme, pas une suggestion. */
export const ENTETE_REGLE = '**Règle qui traverse le module.**';

/** Le motif rendu quand un module cite un outil sans porter la règle. */
export const MOTIF_REGLE_MANQUANTE =
  "Ce module met un outil d'IA dans les mains d'un stagiaire sans porter le bloc " +
  "« Règle qui traverse le module » — l'IA prépare, le conseiller décide ; rien ne part " +
  "au client sans relecture ; aucune donnée confidentielle dans un outil. C'est ce bloc qui " +
  'remplace le module garde-fous : sans lui, « dissous » veut dire « disparu ».';

/**
 * Le module cite-t-il un outil d'IA ?
 *
 * Les tournures génériques (« intelligence artificielle », « l'IA », « un
 * prompt ») comptent autant qu'un nom de marque : un module qui dit « demandez
 * à l'IA de rédiger » met bien un outil dans les mains du stagiaire.
 *
 * `\bIA\b` est cherché sur le texte NON minusculé, sinon « ia » attraperait
 * « médias », « spécialiser », « initiale ».
 */
export function citeUnOutilIA(contenu: string | null | undefined): boolean {
  const t = contenu ?? '';
  const bas = t.toLowerCase();
  if (OUTILS_IA.some((o) => bas.includes(o))) return true;
  if (/intelligence artificielle/i.test(t)) return true;
  if (/\bIA\b/.test(t)) return true;
  if (/\bprompts?\b/i.test(t)) return true;
  return false;
}

/** Le module porte-t-il le bloc de règle ? */
export function porteLaRegle(contenu: string | null | undefined): boolean {
  return (contenu ?? '').includes(ENTETE_REGLE);
}

export type SortDuGesteIA = { conforme: true } | { conforme: false; motif: string };

/**
 * La décision, et elle tient en une phrase : un geste IA sans sa règle est
 * refusé ; tout le reste passe.
 */
export function sortDuGesteIA(contenu: string | null | undefined): SortDuGesteIA {
  if (!citeUnOutilIA(contenu)) return { conforme: true };
  if (porteLaRegle(contenu)) return { conforme: true };
  return { conforme: false, motif: MOTIF_REGLE_MANQUANTE };
}
