/**
 * Le CODE d'un produit de formation importé depuis SmartOF.
 *
 * ## Pourquoi cette fonction vit ici et pas dans le script
 *
 * `import-smartof.ts` appelle `main()` au chargement du module : l'importer
 * depuis un test lancerait l'import POUR DE VRAI, contre la base pointée par
 * `.env`. La règle de nommage sort donc dans un module pur, testable seul —
 * même motif que `lib/corpus-local.ts`.
 *
 * ⚠ **Extraction à iso-comportement.** Le repli hexadécimal ci-dessous est
 * celui d'origine (`import-smartof.ts` l.415 avant extraction), volontairement
 * NON corrigé à ce stade : le correctif vient après le test qui le met en
 * défaut (cf. `.claude/commands/quick.md` §4 ter — un test qui n'a jamais rougi
 * n'est pas un test).
 */

/** La ligne source SmartOF, réduite à ce qui décide du code. */
export interface ProductCodeSource {
  /** UID SmartOF — identifie la LIGNE source, pas le produit. */
  uid: string;
  /** `Custom ID` de la ligne source : la référence d'origine. `null` si absente. */
  customId: string | null;
}

/**
 * Rend le code à écrire pour cette ligne.
 *
 * @param source ligne SmartOF (UID + `Custom ID`)
 * @param taken  codes déjà pris — base + codes alloués pendant le même run
 */
export function resolveProductCode(source: ProductCodeSource, taken: ReadonlySet<string>): string {
  // Iso-comportement de l'origine : le repli ne regarde PAS les codes déjà
  // pris, il hache le UID. `taken` est dans la signature pour le correctif à
  // venir (séquence `PROD-NNNN`), pas encore lu.
  void taken;
  return source.customId ?? `PROD-${source.uid.substring(0, 8)}`;
}
