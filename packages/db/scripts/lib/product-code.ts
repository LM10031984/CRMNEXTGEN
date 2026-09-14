/**
 * Le CODE d'un produit de formation importé depuis SmartOF.
 *
 * ## Une garde de PROVENANCE, pas une contrainte de format
 *
 * L'hétérogénéité des codes du catalogue est **VOULUE**. Le `Custom ID` SmartOF
 * est la référence d'origine : c'est elle qui permet de remonter au dossier
 * source. Un `CHECK` en base, ou une normalisation à l'import, rejetterait des
 * codes parfaitement légitimes — relevé du 11/09/2026 à 19:58 CEST sur la prod :
 * **41 codes**, dont 7 en `FRM-*` (les journées Faros de D-25), `PROD-047`,
 * `PROD-00661`, et quatre fragments hexadécimaux hérités de ce fichier même.
 * Cf. STATE.md « À savoir AVANT d'agir », point 1, qui en porte la liste.
 *
 * La frontière se trace donc sur la provenance, pas sur la forme :
 *
 *  - code venu du **fichier source** → **verbatim**, c'est la traçabilité ;
 *  - code **fabriqué par nous** → **séquence `PROD-NNNN`**, comme les trois
 *    autres sites qui en fabriquent (`crud-edits.ts` ~l.823,
 *    `import-diag-catalog.ts` ~l.217).
 *
 * ## Ce que le repli hexadécimal coûtait
 *
 * `PROD-${uid.substring(0, 8)}` rendait `PROD-7a78c8b2` : illisible, non
 * dictable au téléphone, et surtout **invisible au séquenceur**, qui ne lit que
 * `/^PROD-0*(\d+)$/`. Un code fabriqué hors série ne fait pas avancer la série,
 * il s'accumule à côté. Les quatre déjà en base **ne sont pas réécrits** — un
 * identifiant qui a servi ne se réécrit pas.
 */

/** La ligne source SmartOF, réduite à ce qui décide du code. */
export interface ProductCodeSource {
  /** UID SmartOF — identifie la LIGNE source, pas le produit. */
  uid: string;
  /** `Custom ID` de la ligne source : la référence d'origine. `null` si absente. */
  customId: string | null;
}

/**
 * Le plus grand numéro de la série `PROD-NNNN` parmi des codes existants.
 *
 * La lecture est celle du séquenceur de `crud-edits.ts` — `0*` avant les
 * chiffres, donc `PROD-00661` compte pour **661**, exactement comme
 * `PROD-0661`. Deux codes distincts pour l'œil, un seul numéro ici : c'est un
 * constat consigné, pas un comportement souhaité (cf. STATE.md). Lire ces codes
 * AUTREMENT que le séquenceur serait le vrai danger — deux sites qui fabriquent
 * des numéros à partir de deux lectures du même catalogue finiraient par se
 * croiser.
 */
function plusGrandNumero(codes: Iterable<string>): number {
  let max = 0;
  for (const code of codes) {
    const m = /^PROD-0*(\d+)$/.exec(code);
    if (m?.[1]) max = Math.max(max, Number.parseInt(m[1], 10));
  }
  return max;
}

/**
 * Rend le code à écrire pour cette ligne.
 *
 * @param source ligne SmartOF (UID + `Custom ID`)
 * @param taken  codes déjà pris — ceux de la base ET ceux alloués pendant le
 *               même run, sinon deux lignes sans `Custom ID` réclameraient le
 *               même numéro.
 * @throws si 50 numéros consécutifs sont déjà pris (même garde que
 *         `crud-edits.ts` : on vérifie avant d'écrire plutôt que d'écraser).
 */
export function resolveProductCode(source: ProductCodeSource, taken: ReadonlySet<string>): string {
  // Un Custom ID VIDE n'est pas un Custom ID ABSENT.
  //
  // `null` = la colonne n'est pas renseignée : provenance « nous », la série
  // maison s'applique, c'est le cas normal. Une chaîne vide (ou blanche) veut
  // dire que la colonne EXISTE et ne porte rien : la source est cassée, et
  // fabriquer un code par-dessus enterre le défaut au lieu de le montrer.
  //
  // C'est ce que faisait le `||` de `import-from-smartof.ts` (l.695) :
  // `p.customId?.trim() || \`PROD-…\`` traitait les deux cas à l'identique. Le
  // `??` seul ne suffit pas non plus — il laisserait passer la chaîne vide
  // jusqu'en base. D'où ce refus, ici, une fois pour les deux chemins.
  if (source.customId !== null && source.customId.trim().length === 0) {
    throw new Error(
      `Custom ID vide sur la ligne source ${source.uid} : la colonne existe et ne ` +
        `porte rien. Ce n'est pas une absence (qui ferait fabriquer un code de la ` +
        `série), c'est une erreur de source — à corriger dans SmartOF, pas ici.`,
    );
  }

  // Provenance « fichier source » : verbatim, quelle que soit la forme.
  if (source.customId) return source.customId;

  // Provenance « nous » : la série maison, au-dessus du plus grand existant.
  const base = plusGrandNumero(taken);
  for (let essai = 1; essai <= 50; essai++) {
    const candidat = `PROD-${String(base + essai).padStart(4, '0')}`;
    if (!taken.has(candidat)) return candidat;
  }
  throw new Error(
    `Impossible de fabriquer un code produit libre pour le UID SmartOF ${source.uid} ` +
      `(50 numéros consécutifs déjà pris au-dessus de ${base}).`,
  );
}
