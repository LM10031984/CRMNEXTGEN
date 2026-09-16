/**
 * Où s'écrit un relevé — la date du RUN, et jamais par-dessus un existant.
 *
 * ## La règle, et d'où elle vient
 *
 * Un relevé porte sa date (§4 quater). Un générateur qui écrit toujours au même
 * chemin la lui retire : le fichier annonce le jour de sa PREMIÈRE écriture et
 * porte le contenu de la DERNIÈRE. Il ment alors sur lui-même, et il emporte au
 * passage le rendu qu'il remplace.
 *
 * Constaté le 16/09/2026 sur `propose-rattachement.ts`, qui écrivait à
 * `.planning/260911-rattachement-douleur-module.md`. Personne ne pouvait le
 * relancer sans effacer le rendu des arbitrages du 11/09.
 *
 * ## Pourquoi `existe` est injecté
 *
 * Le cas qui compte — « le relevé du jour est déjà là » — doit être exerçable
 * sans toucher au disque. L'appelant passe sa propre sonde ; la décision se
 * teste, l'écriture ne la concerne pas.
 */

export interface OptionsReleve {
  /** Dossier de sortie, relatif à la racine du dépôt — `.planning`. */
  dossier: string;
  /** Le nom du relevé, sans date ni extension — `rattachement-douleur-module`. */
  base: string;
  /** L'instant du run. Injecté pour que le test n'ait pas à voyager dans le temps. */
  maintenant: Date;
  /** Ce chemin est-il déjà pris ? */
  existe: (chemin: string) => boolean;
}

/**
 * Le plafond de la boucle. Cent relevés du même nom le même jour ne sont pas un
 * cas d'usage : c'est une boucle d'appel, et mieux vaut le dire que l'absorber.
 */
const MAX_PAR_JOUR = 99;

/** `AAMMJJ` en heure LOCALE — un run de 1 h du matin appartient à SON jour. */
function jour(d: Date): string {
  const aa = String(d.getFullYear() % 100).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const jj = String(d.getDate()).padStart(2, '0');
  return `${aa}${mm}${jj}`;
}

/**
 * Le chemin du prochain relevé : daté du run, et libre.
 *
 * Le premier du jour prend le nom nu ; les suivants prennent un rang. On
 * n'écrase jamais — un relevé s'ajoute, il ne remplace pas.
 */
export function cheminReleve({ dossier, base, maintenant, existe }: OptionsReleve): string {
  const prefixe = `${dossier}/${jour(maintenant)}-${base}`;
  for (let rang = 1; rang <= MAX_PAR_JOUR; rang += 1) {
    const chemin = rang === 1 ? `${prefixe}.md` : `${prefixe}-${rang}.md`;
    if (!existe(chemin)) return chemin;
  }
  throw new Error(
    `${MAX_PAR_JOUR} relevés « ${prefixe} » existent déjà pour aujourd'hui. ` +
      `Ce n'est pas un jour chargé, c'est une boucle : vérifie l'appelant.`,
  );
}
