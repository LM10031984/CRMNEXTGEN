/**
 * Le tri de la liste des factures — validation de l'URL et `orderBy` Prisma.
 *
 * Module PUR, volontairement hors de `server/actions/invoices-list.ts` : un
 * fichier `'use server'` ne peut exporter que des fonctions asynchrones, et on
 * veut pouvoir tester ce choix de classement sans base de données.
 *
 * Le tri est fait par Postgres, pas par le navigateur : la liste est paginée
 * (50 lignes), un tri côté client ne classerait que la page affichée et
 * mentirait dès la deuxième.
 */

export const INVOICE_SORT_KEYS = ['numero', 'date', 'payeur', 'montant', 'statut'] as const;

export type InvoiceSortKey = (typeof INVOICE_SORT_KEYS)[number];
export type SortDir = 'asc' | 'desc';

/**
 * Classement par défaut : la dernière facture émise en tête. Inchangé depuis la
 * Phase 11 — le tri cliquable s'ajoute, il ne redéfinit pas ce qu'on voit en
 * arrivant sur la page.
 */
export const DEFAULT_INVOICES_ORDER_BY = [
  { issueDate: 'desc' },
  { number: 'desc' },
] as const;

/**
 * `?sort=` et `?dir=` arrivent de l'URL : tout peut s'y trouver. Une clé
 * inconnue ne doit jamais atteindre Prisma — elle y déclencherait une erreur de
 * validation à l'exécution, sur une page que l'utilisateur a simplement mal
 * recopiée.
 */
export function coerceInvoiceSort(
  rawSort: string | null | undefined,
  rawDir: string | null | undefined,
): { sort: InvoiceSortKey | null; dir: SortDir } {
  const sort = INVOICE_SORT_KEYS.includes(rawSort as InvoiceSortKey)
    ? (rawSort as InvoiceSortKey)
    : null;
  // Sans colonne, le sens n'a rien à qualifier : on rend l'état « classement
  // par défaut » plutôt qu'un `asc` orphelin que personne n'appliquera.
  if (!sort) return { sort: null, dir: 'desc' };
  return { sort, dir: rawDir === 'asc' ? 'asc' : 'desc' };
}

/**
 * Le `orderBy` Prisma d'une colonne.
 *
 * Deux choix assumés :
 *  - **payeur** : le libellé affiché est dérivé (`payerOrg.legalName ?? nom de
 *    la personne`). On classe donc les factures d'entreprise entre elles, puis
 *    celles au nom d'une personne — deux blocs, pas un alphabet unique. Un
 *    alphabet unique demanderait un `COALESCE` en SQL brut, donc de recopier
 *    tous les filtres dynamiques dans une `$queryRaw`.
 *  - **statut** : l'ordre est celui de l'enum Postgres (Brouillon, Émise,
 *    Payée, Partielle, En retard, Annulée, Avoir). Ce qu'on attend d'un clic
 *    sur « Statut », c'est de REGROUPER ; l'urgence, elle, a déjà ses filtres
 *    et ses cartes KPI en haut de page.
 *
 * Le départage final par numéro n'est pas cosmétique : sans lui, deux factures
 * du même jour (ou du même montant) permutent d'un rafraîchissement à l'autre,
 * et une ligne peut alors sauter d'une page à l'autre sans jamais s'afficher.
 */
export function buildInvoicesOrderBy(
  sort: InvoiceSortKey | null,
  dir: SortDir,
): Array<Record<string, unknown>> {
  const parNumero = { number: 'desc' as const };
  switch (sort) {
    case 'numero':
      return [{ number: dir }];
    case 'date':
      // `nulls: 'last'` seulement ici : quand on demande un classement par
      // date, les factures qui n'en ont pas encore (brouillons) sont un bruit
      // de fin de liste, pas une réponse. Postgres, lui, les mettrait en tête
      // d'un `DESC`.
      return [{ issueDate: { sort: dir, nulls: 'last' } }, parNumero];
    case 'payeur':
      return [
        { payerOrg: { legalName: dir } },
        { participant: { person: { lastName: dir } } },
        parNumero,
      ];
    case 'montant':
      return [{ amountTTC: dir }, parNumero];
    case 'statut':
      return [{ status: dir }, parNumero];
    default:
      return DEFAULT_INVOICES_ORDER_BY as unknown as Array<Record<string, unknown>>;
  }
}
