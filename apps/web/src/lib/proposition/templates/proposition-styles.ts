import {
  weasyprintFontRule,
  weasyprintHeroBlocks,
  weasyprintPageModel,
  WEASYPRINT_COMMON_CSS,
} from '@/lib/docs/weasyprint-base';

/**
 * Feuille de style de la proposition — générée depuis la maquette
 * `.planning/specs/2026-09-01-maquette-proposition.html`, avec les mêmes trois
 * transformations que pour l'audit :
 *
 *   • l'@import Google Fonts retiré : le moteur PDF tourne sans réseau sortant ;
 *   • le filigrane « SPÉCIMEN » retiré : c'est un document remis au client ;
 *   • les `var(--couleur)` RÉSOLUS en littéraux — WeasyPrint 60 ne substitue
 *     pas les custom properties dans les propriétés raccourcies, et l'ignore
 *     en silence.
 *
 * Le socle de compatibilité, lui, n'est PAS retranscrit : il est importé de
 * `lib/docs/weasyprint-base.ts` (spec §9.5). Ne restent ci-dessous que les
 * transpositions propres au gabarit de la proposition — celles dont les
 * sélecteurs n'existent que dans cette maquette.
 */
export const PROPOSITION_STYLES = String.raw`
  *{box-sizing:border-box; margin:0}
  html{background:#e9edf1}
  body{font-family:'Montserrat',system-ui,Segoe UI,Arial,sans-serif; color:#1c2733; font-size:10.5pt; line-height:1.55; background:#e9edf1; padding:24px 0}
  h1,h2,h3,.display{font-family:'Rajdhani','Montserrat',system-ui,sans-serif}
  .page{width:210mm; min-height:297mm; margin:0 auto 24px; background:#ffffff; padding:16mm 17mm 26mm; position:relative; box-shadow:0 2px 14px rgba(16,42,67,.14)}

  .band{background:#00527A; color:#fff; margin:-16mm -17mm 0; padding:20mm 17mm 16mm}
  .kicker{font-family:'Rajdhani'; font-weight:600; letter-spacing:.22em; font-size:9.5pt; text-transform:uppercase; color:#3EA9FF}
  .band h1{font-size:27pt; font-weight:700; line-height:1.1; margin-top:5mm; color:#fff}
  .band .sub{font-size:13pt; color:#cfe7f7; margin-top:2mm; font-weight:500}
  .band-meta{margin-top:10mm; font-size:9pt; color:#a9c9dd}
  .band-meta b{display:block; color:#fff; font-size:10pt; font-weight:600}

  .sec{margin-top:8mm}
  .sec>h2{font-size:16pt; font-weight:700; color:#00527A; border-bottom:2px solid #00527A; padding-bottom:1.5mm; margin-bottom:3.5mm}
  .sec>h2 .no{font-size:10pt; color:#3EA9FF; font-weight:600; letter-spacing:.08em}
  .muted{color:#7b8894; font-size:8.5pt}
  .lead{color:#4a5a68}
  ul.dash{list-style:none; margin-top:2mm}
  ul.dash li{padding-left:5mm; position:relative; margin-bottom:1.6mm; color:#4a5a68}
  ul.dash li::before{content:"\2013"; position:absolute; left:0; color:#3EA9FF; font-weight:700}
  ul.dash b{color:#1c2733}

  table{width:100%; border-collapse:collapse; font-size:9pt; margin-top:2.5mm}
  th{font-family:'Rajdhani'; font-size:8.5pt; text-transform:uppercase; letter-spacing:.1em; text-align:left; color:#fff; background:#00527A; padding:2.2mm 3mm; font-weight:600}
  td{padding:2.1mm 3mm; border-bottom:1px solid #dde4ea; vertical-align:top}
  tr:nth-child(even) td{background:#f4f8fb}
  td.num,th.num{text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap}
  tr.total td{background:#00527A; color:#fff; font-weight:700; font-size:10pt; border:none}
  tr.subtotal td{background:rgba(0,82,122,.08); font-weight:600}
  td.grouphead{background:#f4f8fb; font-weight:700; color:#00527A}

  .phase{margin-top:3.5mm; border:1px solid #dde4ea; border-radius:2.5mm; padding:4mm 5mm; background:#ffffff}
  .phase .tag{font-family:'Rajdhani'; font-weight:700; color:#00527A; font-size:11pt; line-height:1.25}
  .phase .tag small{display:block; font-family:'Montserrat'; font-weight:500; font-size:8pt; color:#7b8894; letter-spacing:.04em}
  .phase h3{font-size:11pt; color:#1c2733; font-weight:700}
  .phase p{font-size:9pt; color:#4a5a68; margin-top:1mm}
  .phase .why{font-size:8.5pt; color:#00527A; background:rgba(0,82,122,.08); border-radius:1.5mm; padding:1.5mm 3mm; margin-top:2mm; display:block}
  /* Les modules composés (lot I-2). Aucun flex ni grid : WeasyPrint ne les
     implémente pas et échoue en SILENCE (§9.5). Tout tient en flux de blocs. */
  .phase .modules{margin:2mm 0 0; padding:0; list-style:none}
  .phase .modules li{font-size:9pt; color:#2b3a47; padding:1.2mm 0 1.2mm 3.5mm; border-left:2px solid #dde4ea; margin-top:1.2mm}
  .phase .modules li b{font-weight:600}
  .phase .modules .src{display:block; font-size:7.5pt; color:#7b8894; margin-top:.4mm}
  .phase .modules .need{display:block; font-size:7.5pt; color:#00527A; margin-top:.4mm}

  .callout{border:1.5px solid #9a6b00; background:#fdf6e3; border-radius:2.5mm; padding:4mm 5.5mm; margin-top:4mm}
  .callout h3{color:#9a6b00; font-size:10.5pt; text-transform:uppercase; letter-spacing:.1em; font-family:'Rajdhani'}
  .callout ul{list-style:none; margin-top:1.5mm}
  .callout li{font-size:9pt; color:#4a5a68; padding-left:5mm; position:relative; margin-bottom:1.2mm}
  .callout li::before{content:"\2013"; position:absolute; left:1mm; color:#9a6b00; font-weight:700}

  .budgetlegend{margin-top:1.8mm; font-size:8.5pt; color:#4a5a68; font-variant-numeric:tabular-nums}
  .budgetlegend b{color:#1c2733}
  .dot{display:inline-block; width:2.6mm; height:2.6mm; border-radius:.7mm; margin-right:1.5mm}

  .offert{border:2px solid #1a7f37; background:#e8f5ec; border-radius:2.5mm; padding:4mm 6mm; margin-top:4mm}
  .stamp{font-family:'Rajdhani'; font-weight:700; font-size:19pt; letter-spacing:.16em; color:#1a7f37; border:2.5px solid #1a7f37; border-radius:2mm; padding:1mm 5mm; white-space:nowrap}
  .offert p{font-size:8.8pt; color:#4a5a68}

  .steps td:first-child{font-weight:500}
  .sign{margin-top:8mm}
  .sign .box{border:1px dashed #7b8894; border-radius:2mm; padding:3.5mm 5mm; min-height:26mm; font-size:8.5pt; color:#7b8894}
  .legal{font-size:7.6pt; color:#7b8894; font-style:italic; margin-top:5mm; line-height:1.5}
  .notice{border:1px solid #dde4ea; border-left:4px solid #3EA9FF; background:#f4f8fb; border-radius:2mm; padding:3mm 4.5mm; margin-top:3mm; font-size:8.6pt; color:#4a5a68}

  /* ══════════════════════════════════════════════════════════════════════
     Compatibilité moteur PDF — le propre de CE gabarit
     ─────────────────────────────────────────────────────────────────────
     Ce qui vaut pour tout document (modèle de page, fontes, titres de
     section, pastilles, blocs héros) vient du socle importé. Ne restent ici
     que les sélecteurs de la maquette proposition.
     ══════════════════════════════════════════════════════════════════════ */
  ${weasyprintPageModel('16mm 17mm 22mm')}
  ${weasyprintFontRule(
    `body, h1, h2, h3, .kicker, th, .foot-brand, .display, .sub,
  .tag, .tag small, .stamp, .band-meta b, .callout h3`,
  )}
  ${WEASYPRINT_COMMON_CSS}
  ${weasyprintHeroBlocks([{ container: '.offert', big: '.stampcell', text: 'p' }])}

  /* ── La pagination : on laisse couler ──────────────────────────────────
     Le socle pose « break-after:page » sur « .page », parce que l'audit a un
     nombre de sections figé et qu'un chapitre y occupe une page. La
     proposition, elle, est un document court dont le contenu varie : forcer
     trois pages produisait une page à moitié vide dès qu'un axe débordait
     (constaté sur PROP-0001 : la page 2 ne portait qu'un seul axe et 20 cm de
     blanc). Les sections s'enchaînent donc au fil de l'eau, les blocs ne se
     coupent jamais en deux, et c'est le moteur qui décide où couper — jamais
     une estimation de hauteur. */
  .page{ break-after:auto; page-break-after:auto }
  .page + .page{ margin-top:8mm }

  /* Largeurs de colonnes, tableau par tableau.
     Sans elles, le moteur répartit au plus juste et le résultat se lit mal :
     la désignation du détail chiffré partait sur trois lignes pendant que
     cinq colonnes de chiffres prenaient toute la largeur. Une largeur globale
     serait pire encore — chaque tableau a sa propre colonne longue. */
  .pricing th:first-child, .pricing td:first-child{ width:36% }
  .planning th:first-child, .planning td:first-child{ width:26% }
  .funding th:first-child, .funding td:first-child{ width:14% }
  .funding th:nth-child(2), .funding td:nth-child(2){ width:30% }
  /* La colonne des montants ne se coupe pas : on la borne pour que la « base »
     — la phrase qui explique le droit — garde de quoi respirer. */
  .funding th:last-child, .funding td:last-child{ width:18% }
  .steps th:first-child, .steps td:first-child{ width:55% }

  /* Les axes : la maquette met « grid-template-columns:30mm 1fr; gap:4.5mm ».
     Sans grid, le libellé de l'axe et son contenu s'empilaient ; en table, la
     colonne de gauche garde ses 30 mm et le texte occupe le reste. */
  .phase{ display:table; width:100%; table-layout:fixed }
  .phase > .tag{ display:table-cell; width:30mm; vertical-align:top; padding-right:4.5mm }
  .phase > .body{ display:table-cell; vertical-align:top }

  /* L'entête : « display:flex; gap:8mm » sur des blocs d'information. En
     inline-block + marges, ils s'alignent et respirent sans gap. */
  .band-meta > div{ display:inline-block; vertical-align:top; margin-right:9mm; margin-bottom:3mm }
  .budgetlegend > span{ display:inline-block; margin-right:7mm }
  .dot{ vertical-align:-.2mm }

  /* La barre de répartition du budget : « flex:12000 / flex:2500 » n'est pas
     honoré. Une table à largeurs en pourcentage donne exactement la même
     proportion, et le moteur sait la dessiner. */
  .budgetbar{ display:table; width:100%; table-layout:fixed; height:7.5mm; margin-top:3mm;
              border-collapse:separate; border-spacing:0 }
  .budgetbar > div{ display:table-cell; height:7.5mm }
  .budgetbar .agefice{ background:#00527A }
  .budgetbar .opco{ background:#3EA9FF }

  /* Les deux cadres de signature : flex + gap → table à deux colonnes.
     « border-spacing » horizontal s'AJOUTE à la largeur de 100 % et faisait
     déborder le cadre de droite hors de la marge. L'espacement passe donc en
     padding d'une cellule enveloppe, à l'intérieur de la largeur. */
  .sign{ display:table; width:100%; table-layout:fixed; border-spacing:0 }
  .sign > .signcell{ display:table-cell; width:50%; vertical-align:top }
  .sign > .signcell:first-child{ padding-right:4mm }
  .sign > .signcell:last-child{ padding-left:4mm }

  /* Le tampon OFFERT.
     Deux choses : la maquette le fait pivoter de 4° — la rotation n'est pas
     fiable dans une cellule de table sous ce moteur, et un tampon droit reste
     un tampon. Et surtout, le cadre est posé sur un élément INTERNE à la
     cellule : dans une cellule de table, la marge de séparation est un padding
     INTÉRIEUR au cadre, si bien que le tampon touchait le texte. La cellule
     porte l'écart, le tampon porte le cadre. */
  .offert > .stampcell{ text-align:center }
  .offert .stamp{ display:inline-block }

  /* Un axe, un bloc de budget ou un cadre de signature ne se coupe pas entre
     deux pages : on laisse le moteur décider où couper, sans jamais estimer
     une hauteur (une estimation ratée tronque). */
  .phase, .callout, .offert, .sign, .notice{ break-inside:avoid; page-break-inside:avoid }
  table{ break-inside:auto }
  tr{ break-inside:avoid; page-break-inside:avoid }
`;
