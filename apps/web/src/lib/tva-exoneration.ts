/**
 * L'exonération de TVA de Start Academy : la phrase, et le code.
 *
 * Start Academy facture de la formation professionnelle continue, exonérée par
 * l'art. 261-4-4°a du CGI. Cette mention doit figurer sur la facture, la
 * convention, le programme, la proposition, le devis et la page catalogue —
 * six surfaces qu'un même client peut recevoir le même jour.
 *
 * ── Pourquoi un module à part, et pas `catalogue-constants.ts` ───────────
 *
 * C'est là qu'elle vivait, sous le nom `MENTION_TVA`. Mais ce fichier est
 * documenté comme « textes standards pour la page publique /catalogue » : une
 * mention fiscale portée par des pièces comptables n'y était plus à sa place,
 * et la ranger là a produit exactement ce qu'on pouvait craindre — chaque
 * appelant hors catalogue s'est réécrit sa propre version. Huit formulations
 * coexistaient au 10/09/2026. Une seule source, un seul nom, et un test qui
 * scanne les sources pour que ça le reste (`__tests__/tva-exoneration.test.ts`).
 *
 * ── La ponctuation appartient à l'appelant ───────────────────────────────
 *
 * La constante ne porte PAS de point final. Celui qui termine une phrase
 * l'ajoute dans son template. C'est ce qui permet à la convention d'écrire
 * `(<em>${MENTION_EXONERATION_TVA}</em>)` sans se retrouver avec « du CGI.) ».
 * Centraliser les mots suffit ; imposer la ponctuation ferait diverger les
 * appelants une deuxième fois.
 *
 * ── Ce qui est surchargeable, et ce qui ne l'est pas ─────────────────────
 *
 * LE TEXTE l'est : `Tenant.vatExemptionText`, renseigné, prend le pas sur la
 * constante — c'est un override légitime par organisme, et la constante n'est
 * que son défaut applicatif (`tenant?.vatExemptionText?.trim() || MENTION_…`).
 *
 * LE CODE ne l'est pas. Pas de colonne, pas de champ tenant, pas de paramètre :
 * il est constant dans ce lot. Un OF à un régime différent ne porterait pas un
 * autre code VATEX, il porterait une autre catégorie de TVA que `E` — ce que
 * `vatCategoryFor()` de `lib/einvoice/invoice-snapshot.ts` sait déjà faire.
 *
 * Le « pourquoi ce code-là » et le repli si le validateur de la plateforme le
 * refuse sont écrits dans `lib/einvoice/invoice-snapshot.ts`, au point où le
 * code est posé sur la ligne. Ce module dit QUOI, pas comment on l'a choisi.
 */

/**
 * Mention légale d'exonération, SANS point final (cf. en-tête).
 *
 * Apostrophe droite U+0027 et degré U+00B0 : ce sont les octets déjà imprimés
 * sur les factures émises. Ne pas « corriger » en apostrophe typographique.
 */
export const MENTION_EXONERATION_TVA = "TVA non applicable en vertu de l'article 261-4-4° du CGI";

/**
 * Code VATEX de la liste EN 16931, posé sur chaque ligne de catégorie `E`.
 * Décision D-2, tranchée le 10/09/2026. Non surchargeable (cf. en-tête).
 */
export const CODE_VATEX_EXONERATION_TVA = 'VATEX-EU-132-1I';
