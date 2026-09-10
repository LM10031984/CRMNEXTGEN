/**
 * Le socle de rendu WeasyPrint — commun à TOUTES les sorties documentaires de
 * la chaîne diagnostic (spec §9.5, arbitrage du 03/09/2026).
 *
 * Pourquoi ce fichier existe : le moteur d'impression échoue **en silence** sur
 * plusieurs propriétés courantes. Rien dans les logs, rien dans les tests
 * unitaires, un défaut visible seulement en ouvrant le PDF. Ces règles ont été
 * payées une fois, en relisant page par page le premier audit réel (DIAG-0001,
 * 03/09/2026). Elles ne doivent pas se redécouvrir document par document — d'où
 * un socle qu'on RÉUTILISE, jamais une variante qu'on retranscrit à la main.
 *
 * Ce que le moteur ne sait pas faire, et ce qu'on écrit à la place :
 *
 * | Piège du moteur                              | La parade                        |
 * |----------------------------------------------|----------------------------------|
 * | CSS **Grid** et **`gap`** (ni grid, ni flex)  | flex + marges explicites ; table/table-cell dès qu'il faut des colonnes qui ne se chevauchent jamais |
 * | `min-height` n'établit pas le bloc conteneur d'un enfant `position:absolute` | pied de page en boîte de marge `@page`, avec `counter(page)`/`counter(pages)` |
 * | `overflow:hidden` tronque en silence          | interdit sur les blocs de page : un débordement doit produire une page de plus |
 * | `columns:2`                                   | flex `flex-wrap`                 |
 * | `var(--x)` dans une propriété raccourcie      | palette résolue en littéraux     |
 * | Fontes : seul Liberation est installé         | `'Liberation Sans', Helvetica, Arial` (alias fontconfig) |
 * | Glyphes hors fonte (✓ U+2713, ✗ U+2717)       | couleur + mots, jamais le glyphe |
 * | Pagination d'un flux                          | `break-inside:avoid`, et on laisse le moteur décider — jamais d'estimation de hauteur |
 *
 * Module PUR : aucun import prisma/next/react. Il ne produit que du texte CSS.
 */

/**
 * La pile de fontes réellement disponibles dans le conteneur de rendu.
 *
 * `DejaVu Sans`, `Montserrat`, `system-ui` et même le générique `sans-serif`
 * tombent tous sur Liberation **Mono** (chasse fixe) : un document entier peut
 * sortir en machine à écrire sans qu'aucune erreur ne soit levée. Seuls
 * « Liberation Sans », « Helvetica » et « Arial » (alias fontconfig) donnent
 * une proportionnelle.
 */
export const WEASYPRINT_FONT_STACK = `'Liberation Sans', Helvetica, Arial`;

/**
 * Le modèle de page.
 *
 * `@page` porte le format et les marges ; `.page` — la feuille de papier
 * simulée des maquettes — est neutralisée, sinon son padding s'ajouterait aux
 * marges de `@page` et tout le document se retrouverait deux fois en dedans.
 *
 * Effet de bord recherché : plus de `overflow:hidden`, donc plus de contenu
 * tronqué en silence. Un débordement produit une page de plus — un défaut qui
 * se VOIT.
 *
 * @param margins marges de `@page` (défaut : celles de l'audit).
 */
export function weasyprintPageModel(margins = '15mm 16mm 20mm'): string {
  return `
  @page{ size:A4; margin:${margins} }

  .page{ width:auto; height:auto; min-height:0; margin:0; padding:0;
         overflow:visible; box-shadow:none; background:transparent;
         break-after:page; page-break-after:always }
  body > :last-child{ break-after:auto; page-break-after:auto }

  @media print{ html,body{ background:#fff; padding:0 } .page{ box-shadow:none; margin:0 } }`;
}

/**
 * Force la pile de fontes disponible sur les sélecteurs donnés.
 *
 * `!important` assumé : les maquettes posent la police sur des sélecteurs plus
 * spécifiques (`.tile .display`, `.chap-meta .score`). Sans forcer, les
 * chiffres mis en avant retombent en chasse fixe. C'est une couche de
 * compatibilité générée, pas du style écrit à la main.
 */
export function weasyprintFontRule(selectors: string): string {
  return `
  ${selectors}{
    font-family: ${WEASYPRINT_FONT_STACK} !important;
  }`;
}

/** Un bloc « gros chiffre + phrase » et les sélecteurs de ses deux colonnes. */
export interface HeroBlockSelectors {
  /** Le conteneur (`.scorehero`, `.valuecard`, `.euro`, `.offert`…). */
  container: string;
  /** Le gros chiffre / le tampon, à largeur automatique. */
  big: string;
  /** La phrase, qui occupe le reste. */
  text: string;
}

/**
 * Les blocs héros, en table plutôt qu'en flex.
 *
 * En flex sans `gap`, le chiffre en `white-space:nowrap` déborde sur la
 * phrase : « 63 / 100 » recouvrait « comparé », « 900 000 € » mangeait le début
 * du texte. En table à largeur automatique, la colonne du chiffre prend sa
 * largeur réelle et la phrase occupe le reste — quel que soit le nombre
 * affiché.
 */
export function weasyprintHeroBlocks(blocks: readonly HeroBlockSelectors[]): string {
  const containers = blocks.map((b) => b.container).join(', ');
  const bigs = blocks.map((b) => `${b.container} ${b.big}`).join(', ');
  const texts = blocks.map((b) => `${b.container} ${b.text}`).join(', ');
  return `
  ${containers}{ display:table; width:100%; table-layout:auto }
  ${bigs}{
    display:table-cell; vertical-align:middle; white-space:nowrap; padding-right:6mm; width:1% }
  ${texts}{ display:table-cell; vertical-align:middle }`;
}

/**
 * Ce qui vaut pour toute sortie documentaire, quel que soit le gabarit.
 *
 * Les titres de section : les maquettes écrivent `display:flex; gap:3mm` entre
 * le numéro et le titre. Sans `gap`, on lit « 02Pourquoi », « 17Votre
 * potentiel ». En bloc + numéro inline-block, le titre reprend son propre fil :
 * il peut passer à la ligne sans décrocher du numéro.
 *
 * Les pastilles : `inline-flex` est traité comme un bloc par le moteur, elles
 * s'étiraient en barres pleine largeur. En `inline`, elles reprennent leur
 * taille.
 */
export const WEASYPRINT_COMMON_CSS = String.raw`
  .sec>h2{ display:block }
  .sec>h2 .no{ display:inline-block; margin-right:3mm }

  .chip{ display:inline; padding:.4mm 2.2mm }`;

/**
 * Le pied de page — en boîtes de marge `@page`, donc en CSS et non en HTML.
 *
 * C'est ce qui l'ancre réellement en bas de chaque page (un bloc absolu dans
 * une `.page` en `min-height` retombe dans le flux) et ce qui rend la
 * numérotation juste toute seule : `counter(pages)` connaît le total, que le
 * document fasse 3 pages ou 17 — aucun total n'est jamais écrit en dur (D-14).
 *
 * Le texte dépend du dossier : d'où une fonction plutôt qu'une constante.
 */
export function renderDocumentPageRule(args: { brand: string; documentLine: string }): string {
  // Chaîne CSS : seuls le backslash et le guillemet doivent être neutralisés.
  const css = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const box = `border-top:1px solid #dde4ea; padding-top:2mm; vertical-align:top;
               font-family:${WEASYPRINT_FONT_STACK}; font-size:7.5pt`;
  return `@page{
    @bottom-left{
      content:"${css(args.brand)}"; ${box};
      color:#00527A; font-weight:600; letter-spacing:.14em; text-align:left }
    @bottom-center{
      content:"${css(args.documentLine)}"; ${box}; color:#7b8894; text-align:center }
    @bottom-right{
      content:counter(page) " / " counter(pages); ${box};
      color:#7b8894; text-align:right }
  }`;
}
