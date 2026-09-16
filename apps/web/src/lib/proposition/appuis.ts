/**
 * Comment un rapprochement lexical NOMME ses appuis.
 *
 * ## Pourquoi cette phrase mérite son fichier
 *
 * « Repose sur les mots de son intitulé » ne dit pas LESQUELS — et c'est ce qui
 * a rendu invisible le refus du 16/09/2026 : « Rédiger des compromis de vente
 * efficaces » a été proposé à cause du mot **« vente »**, pas de
 * « compromis », et personne ne pouvait le savoir sans rouvrir le module.
 *
 * Le cas à UN mot se dit différemment des autres, parce que c'est lui qui doit
 * sauter aux yeux : **un appui unique n'a pas de second témoin.** Si ce mot se
 * trompe de sens, rien ne le rattrape — relevé du 16/09 : 87 % des
 * rapprochements possibles sont dans ce cas.
 *
 * ## Pourquoi il est NEUTRE
 *
 * `module-matcher` importe déjà `PROGRAMME_NEEDS` de `programme-matcher` : y
 * loger la fonction aurait créé un cycle, et un cycle d'import ne se signale
 * pas — il rend une valeur `undefined` au chargement, loin de sa cause. Les
 * deux moteurs l'importent d'ici, et il n'y a toujours qu'une définition
 * (§4 bis).
 */
export function direLesAppuis(termes: readonly string[]): string {
  if (termes.length === 0) return 'le rapprochement repose sur les mots de l’intitulé';
  if (termes.length === 1) {
    return `le rapprochement ne tient que par le seul mot « ${termes[0]} » dans l’intitulé`;
  }
  return `le rapprochement tient par les mots « ${termes.join(' », « ')} » de l’intitulé`;
}
