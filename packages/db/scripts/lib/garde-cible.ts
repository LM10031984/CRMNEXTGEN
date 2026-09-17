/**
 * La garde de cible — PREMIER ordre de toute transaction qui écrit au catalogue.
 *
 * ## Le trou qu'elle bouche
 *
 * Un import identifie sa base au début du run, puis écrit. Entre les deux, rien
 * ne prouvait que c'était la MÊME base : l'inventaire de lecture passait par une
 * chaîne de connexion (`db:query:prod`, la lecture seule) et l'écriture par une
 * autre (`DIRECT_URL`, seule capable de tenir une transaction interactive).
 * Deux chaînes, deux hypothèses, aucune vérification entre elles.
 *
 * Ce n'est pas théorique : `aws-0` et `aws-1` sont deux grappes différentes, et
 * un chiffre dans un nom d'hôte est tout ce qui sépare la production de
 * l'aperçu (§4 sexies). Une base d'aperçu restaurée porte le même tenant et le
 * même schéma — un `SELECT` n'y lèverait aucune erreur, il rendrait des chiffres
 * faux en silence.
 *
 * ## Ce qu'elle compare, et pourquoi PAS des constantes
 *
 * Elle compare les marqueurs relus sur la connexion QUI ÉCRIT à ceux relevés en
 * tête de run — ceux-là mêmes qui sont imprimés et écrits dans le rapport.
 * L'invariant tenu est : **la base que j'ai inventoriée et dont je rends compte
 * est la base dans laquelle j'écris.**
 *
 * Graver « 51 produits, 86 modules » en dur aurait paru plus sûr et aurait été
 * pire : la garde se serait mise à refuser dès le premier import réussi, donc
 * dès le deuxième run — celui qui prouve l'idempotence. Une garde qui refuse le
 * cas normal finit débranchée (§4 quaterdecies), et une garde débranchée ne
 * garde rien.
 *
 * ## Pourquoi c'est un ENVELOPPE et pas une fonction à appeler
 *
 * `transactionGardee` prend le corps de l'écriture en paramètre. Un import qui
 * l'utilise ne peut pas oublier la garde : il n'y a pas d'ordre à placer avant,
 * il y a une transaction qu'on n'ouvre pas autrement. C'est le même raisonnement
 * que `SET TRANSACTION READ ONLY` dans le lanceur de lecture — un garde qui rend
 * l'erreur impossible vaut mieux qu'une consigne qui la déconseille.
 */

/** Les marqueurs de CONTENU qui identifient une base. Jamais son nom (§4 sexies). */
export interface MarqueursCible {
  tenantId: string;
  tenantNom: string;
  produits: number;
  modules: number;
}

/** Levée quand la base d'écriture n'est pas celle qu'on a inventoriée. */
export class CibleInattendueError extends Error {
  constructor(public readonly ecarts: string[]) {
    super(`La base d'écriture n'est pas celle du relevé : ${ecarts.length} écart(s).`);
    this.name = 'CibleInattendueError';
  }
}

/**
 * Les écarts entre attendu et lu — fonction PURE, pour qu'elle soit testable
 * sans base.
 *
 * Elle rend la LISTE des écarts et non un booléen : « la base est fausse » ne
 * dit pas quoi regarder, « 51 produits attendus, 123 lus » le dit.
 */
export function ecartsDeCible(attendu: MarqueursCible, lu: MarqueursCible | null): string[] {
  if (lu === null) {
    return [`tenant \`${attendu.tenantId}\` INTROUVABLE sur la connexion d'écriture`];
  }
  const ecarts: string[] = [];
  const compare = (quoi: string, a: string | number, b: string | number): void => {
    if (a !== b) ecarts.push(`${quoi} — attendu : ${a} · lu : ${b}`);
  };
  compare('tenant id', attendu.tenantId, lu.tenantId);
  compare('tenant nom', `« ${attendu.tenantNom} »`, `« ${lu.tenantNom} »`);
  compare('produits', attendu.produits, lu.produits);
  compare('modules', attendu.modules, lu.modules);
  return ecarts;
}

/** Les seules options de transaction dont l'import se sert. */
export interface OptionsTransaction {
  maxWait?: number;
  timeout?: number;
}

/**
 * Le strict minimum de client dont la garde a besoin.
 *
 * Signature de MÉTHODE et non de propriété, et `options` typées précisément :
 * `$transaction` de Prisma est surchargée (tableau de promesses / fonction
 * interactive), et une signature trop lâche fait résoudre TypeScript vers la
 * mauvaise surcharge.
 */
export interface ClientTransactionnel<TX> {
  $transaction<R>(fn: (tx: TX) => Promise<R>, options?: OptionsTransaction): Promise<R>;
}

/**
 * Ouvre une transaction dont le PREMIER ordre relit les marqueurs, et dont le
 * corps ne tourne que s'ils concordent.
 *
 * `relire` est fourni par l'appelant parce que la forme exacte des compteurs
 * dépend du schéma qu'il connaît ; la DÉCISION, elle, est ici et nulle part
 * ailleurs.
 */
export async function transactionGardee<TX, T>(
  prisma: ClientTransactionnel<TX>,
  attendu: MarqueursCible,
  relire: (tx: TX) => Promise<MarqueursCible | null>,
  corps: (tx: TX) => Promise<T>,
  options?: OptionsTransaction,
): Promise<T> {
  return prisma.$transaction(async (tx: TX) => {
    // PREMIER ordre. Rien ne s'écrit avant lui, par construction.
    const ecarts = ecartsDeCible(attendu, await relire(tx));
    if (ecarts.length > 0) throw new CibleInattendueError(ecarts);
    return corps(tx);
  }, options);
}
