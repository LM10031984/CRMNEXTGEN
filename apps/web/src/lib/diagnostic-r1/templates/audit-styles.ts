/**
 * Feuille de style du rapport d'audit — générée depuis la maquette
 * `.planning/specs/2026-09-01-maquette-audit.html`, avec trois transformations :
 *
 *   • l'@import Google Fonts retiré : le moteur PDF tourne sans réseau sortant,
 *     et une police qui ne charge pas décale toute la mise en page ;
 *   • le filigrane « SPÉCIMEN » retiré : c'est un vrai document remis au client ;
 *   • les `var(--couleur)` RÉSOLUS en valeurs littérales. WeasyPrint 60 ne
 *     substitue pas les custom properties dans les propriétés raccourcies :
 *     `color:var(--ok)` fonctionne, `background:var(--ok-bg)` est ignoré en
 *     silence. Sans cette résolution, les en-têtes de tableau sortaient en
 *     blanc sur blanc et les tuiles sans bordure — sans la moindre erreur.
 *
 * Ne pas retoucher à la main : la maquette est la référence de rendu, et un
 * test de contrat vérifie l'intégrité de cette feuille.
 */
export const AUDIT_STYLES = String.raw`
:root{
    --brand-deep:#00527A; --brand-vif:#3EA9FF; --brand-deep-08:rgba(0,82,122,.08);
    --ink:#1c2733; --ink-2:#4a5a68; --ink-3:#7b8894; --line:#dde4ea; --paper:#ffffff; --wash:#f4f8fb;
    --ok:#1a7f37; --warn:#9a5b00; --alert:#b42318; --ok-bg:#e8f5ec; --warn-bg:#fdf3e1; --alert-bg:#fdebe9;
    --gold:#9a6b00; --gold-bg:#fdf6e3;
  }
  *{box-sizing:border-box; margin:0}
  html{background:#e9edf1}
  body{font-family:'Montserrat',system-ui,Segoe UI,Arial,sans-serif; color:#1c2733; font-size:10pt; line-height:1.5; background:#e9edf1; padding:24px 0}
  h1,h2,h3,h4,.display{font-family:'Rajdhani','Montserrat',system-ui,sans-serif}
  .page{width:210mm; min-height:297mm; margin:0 auto 24px; background:#ffffff; padding:15mm 16mm 24mm; position:relative; box-shadow:0 2px 14px rgba(16,42,67,.14); overflow:hidden}
  .page>*{position:relative; z-index:1}
  @page{size:A4; margin:0}
  @media print{ html,body{background:#fff; padding:0} .page{box-shadow:none; margin:0; page-break-after:always} }

  .page > .footer{position:absolute; left:16mm; right:16mm; bottom:7mm; display:flex; justify-content:space-between; font-size:7.5pt; color:#7b8894; border-top:1px solid #dde4ea; padding-top:2mm}
  .foot-brand{font-family:'Rajdhani'; font-weight:600; letter-spacing:.14em; color:#00527A}

  .kicker{font-family:'Rajdhani'; font-weight:600; letter-spacing:.22em; font-size:9.5pt; text-transform:uppercase; color:#3EA9FF}
  .sec{margin-top:7mm}
  .sec>h2, .chap-title{font-size:15.5pt; font-weight:700; color:#00527A; border-bottom:2px solid #00527A; padding-bottom:1.5mm; margin-bottom:3.5mm; display:flex; align-items:baseline; gap:3mm}
  .sec>h2 .no, .chap-title .no{font-size:10pt; color:#3EA9FF; font-weight:600; letter-spacing:.08em}
  h4{font-family:'Rajdhani'; font-size:9.5pt; text-transform:uppercase; letter-spacing:.12em; color:#00527A; margin-bottom:1.5mm}
  .muted{color:#7b8894; font-size:8.5pt}
  .lead{color:#4a5a68}
  .grid2{display:grid; grid-template-columns:1fr 1fr; gap:5mm}
  .grid3{display:grid; grid-template-columns:1fr 1fr 1fr; gap:4mm}

  .tile{border:1px solid #dde4ea; border-radius:3mm; padding:3.5mm 4.5mm; background:#ffffff}
  .tile .display{font-size:18pt; font-weight:700; color:#00527A; line-height:1.1}
  .tile .display small{font-size:9.5pt; color:#7b8894; font-weight:500}
  .tile p{font-size:8.3pt; color:#4a5a68; margin-top:1mm}
  .tile .lbl{font-size:7.8pt; text-transform:uppercase; letter-spacing:.12em; color:#7b8894; font-weight:600}

  .chip{display:inline-flex; align-items:center; gap:1.2mm; font-size:8pt; font-weight:600; padding:.6mm 2.4mm; border-radius:99px; white-space:nowrap}
  .chip.ok{color:#1a7f37; background:#e8f5ec} .chip.warn{color:#9a5b00; background:#fdf3e1} .chip.alert{color:#b42318; background:#fdebe9}

  blockquote{border-left:3px solid #3EA9FF; background:#f4f8fb; padding:3mm 5mm; font-style:italic; color:#4a5a68; border-radius:0 2mm 2mm 0; margin:2mm 0; font-size:9.5pt}
  blockquote footer{font-style:normal; font-size:8.3pt; color:#7b8894; margin-top:1.2mm}

  table{width:100%; border-collapse:collapse; font-size:8.8pt; margin-top:2mm}
  th{font-family:'Rajdhani'; font-size:8.3pt; text-transform:uppercase; letter-spacing:.1em; text-align:left; color:#fff; background:#00527A; padding:2mm 2.8mm; font-weight:600}
  td{padding:1.9mm 2.8mm; border-bottom:1px solid #dde4ea; vertical-align:top}
  tr:nth-child(even) td{background:#f4f8fb}
  td.num,th.num{text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap}

  /* Restitution « ce que vous nous avez dit » */
  table.qa td:first-child{width:52mm; color:#7b8894; font-size:8.3pt}
  table.qa td:nth-child(2){font-weight:500}

  /* Scorecard */
  .scorebars{display:grid; gap:1.8mm; margin-top:2.5mm}
  .srow{display:grid; grid-template-columns:52mm 1fr 24mm; align-items:center; gap:3mm}
  .srow .slabel{font-size:8.8pt; font-weight:600}
  .srow .slabel small{display:block; font-weight:400; color:#7b8894; font-size:7.4pt}
  .sbarwrap{background:#f4f8fb; border-radius:1.2mm; height:6.5mm; position:relative}
  .sbar{height:100%; background:#00527A; border-radius:1.2mm; display:flex; align-items:center; justify-content:flex-end}
  .sbar span{color:#fff; font-size:8pt; font-weight:700; padding-right:2mm; font-variant-numeric:tabular-nums}
  .srow .schip{text-align:left}

  .scorehero{display:flex; align-items:center; gap:6mm; border:1px solid #dde4ea; border-left:5px solid #00527A; border-radius:2.5mm; padding:4mm 6mm; background:#f4f8fb}
  .scorehero .big{font-family:'Rajdhani'; font-size:30pt; font-weight:700; color:#00527A; line-height:1; white-space:nowrap}
  .scorehero .big small{font-size:13pt; color:#7b8894}
  .scorehero p{font-size:9pt; color:#4a5a68}

  /* Chapitres */
  .chap-head{display:flex; justify-content:space-between; align-items:flex-start; gap:5mm}
  .chap-meta{text-align:right; white-space:nowrap}
  .chap-meta .score{font-family:'Rajdhani'; font-size:20pt; font-weight:700; color:#00527A; line-height:1}
  .chap-meta .score small{font-size:10pt; color:#7b8894}
  .chap-meta .answered{font-size:7.6pt; color:#7b8894; margin-top:.5mm}

  .lecture{margin-top:2mm; color:#4a5a68; font-size:9.3pt}
  .lecture b{color:#1c2733}

  .euro{border:1.5px solid #9a6b00; background:#fdf6e3; border-radius:2.5mm; padding:3mm 4.5mm; margin-top:3mm; display:flex; gap:4mm; align-items:baseline}
  .euro .amount{font-family:'Rajdhani'; font-size:16pt; font-weight:700; color:#9a6b00; white-space:nowrap}
  .euro p{font-size:8.6pt; color:#4a5a68}

  .lever{border:1.5px solid #1a7f37; background:#e8f5ec; border-radius:2.5mm; padding:3mm 4.5mm; margin-top:3mm}
  .lever h4{color:#1a7f37}
  .lever p{font-size:8.8pt; color:#4a5a68}

  /* Funnel */
  .funnel{display:grid; gap:2px; margin-top:2.5mm}
  .frow{display:grid; grid-template-columns:42mm 1fr 26mm; align-items:center; gap:3mm}
  .frow .stage{font-size:8.8pt; font-weight:600}
  .frow .stage small{display:block; font-weight:400; color:#7b8894; font-size:7.3pt}
  .barwrap{background:#f4f8fb; border-radius:1.2mm; height:7mm; position:relative}
  .bar{height:100%; background:#00527A; border-radius:1.2mm; display:flex; align-items:center; justify-content:flex-end}
  .bar span{color:#fff; font-size:8.3pt; font-weight:600; padding-right:2.3mm; font-variant-numeric:tabular-nums}
  .outlbl{position:absolute; top:50%; transform:translateY(-50%); color:#1c2733; font-size:8.3pt; font-weight:600; white-space:nowrap; font-variant-numeric:tabular-nums}
  .conv{font-size:8.3pt; color:#4a5a68}

  /* Priorités */
  .prio{display:grid; gap:3mm; margin-top:2.5mm}
  .pcard{display:grid; grid-template-columns:11mm 1fr; gap:4mm; border:1px solid #dde4ea; border-left:4px solid #00527A; border-radius:2mm; padding:3.5mm 4.5mm; background:#ffffff}
  .pcard .n{font-family:'Rajdhani'; font-size:20pt; font-weight:700; color:#3EA9FF; line-height:1}
  .pcard h3{font-size:11pt; color:#00527A; font-weight:700}
  .pcard p{font-size:8.8pt; color:#4a5a68; margin-top:1mm}
  .pcard .link{font-size:7.8pt; color:#7b8894; margin-top:1.2mm}

  /* Couverture */
  .cover-band{background:#00527A; color:#fff; margin:-15mm -16mm 0; padding:24mm 16mm 18mm}
  .cover-band h1{font-size:31pt; font-weight:700; line-height:1.08; margin-top:6mm; color:#fff}
  .cover-band .agency{font-size:15pt; font-weight:500; color:#cfe7f7; margin-top:3mm}
  .cover-meta{display:flex; flex-wrap:wrap; gap:9mm; margin-top:12mm; font-size:8.8pt; color:#a9c9dd}
  .cover-meta b{display:block; color:#fff; font-size:10pt; font-weight:600}
  .valuecard{margin-top:9mm; border:1.5px solid #9a6b00; background:#fdf6e3; border-radius:2.5mm; padding:4mm 6mm; display:flex; align-items:center; gap:6mm}
  .valuecard .v{font-family:'Rajdhani'; font-size:21pt; font-weight:700; color:#9a6b00; white-space:nowrap}
  .valuecard p{font-size:8.8pt; color:#4a5a68}
  .cover-badges{display:flex; gap:4mm; margin-top:8mm; flex-wrap:wrap}
  .cbadge{border:1px solid #dde4ea; border-radius:99px; padding:1.6mm 4.5mm; font-size:8.5pt; color:#4a5a68; background:#f4f8fb; font-weight:600}

  /* Sommaire */
  .toc{columns:2; column-gap:8mm; margin-top:3mm}
  .toc div{break-inside:avoid; display:flex; justify-content:space-between; gap:3mm; padding:1.7mm 0; border-bottom:1px dotted #dde4ea; font-size:9pt}
  .toc div b{color:#00527A; font-family:'Rajdhani'; margin-right:2mm}
  .toc div span:last-child{color:#7b8894; font-variant-numeric:tabular-nums}

  .idgrid{display:grid; grid-template-columns:1fr 1fr; gap:0 8mm; margin-top:2mm}
  .idgrid div{display:flex; justify-content:space-between; gap:4mm; padding:1.6mm 0; border-bottom:1px dotted #dde4ea; font-size:8.8pt}
  .idgrid div span:first-child{color:#7b8894}
  .idgrid div span:last-child{font-weight:600; text-align:right}

  /* ══════════════════════════════════════════════════════════════════════
     Compatibilité moteur PDF (WeasyPrint 60)
     ─────────────────────────────────────────────────────────────────────
     Ajouté APRÈS la maquette, jamais à sa place : la maquette reste la
     référence de rendu à l'écran, ce bloc ne corrige que ce que le moteur
     d'impression ne sait pas faire. Trois manques, tous silencieux :

       1. CSS Grid n'est pas implémenté — sans ces règles, chaque grille
          s'empile en une colonne et le rapport double de longueur ;
       2. « gap » n'est pas appliqué en flex — les blocs se touchent, et sur
          la couverture le montant venait littéralement chevaucher le texte.
          D'où les marges explicites sur les enfants ;
       3. « system-ui » n'est pas résolu et retombe sur une chasse fixe. On
          nomme des familles que le conteneur possède réellement.
     ══════════════════════════════════════════════════════════════════════ */
  /* !important assumé : la maquette pose la police sur des sélecteurs plus
     spécifiques (« .tile .display », « .chap-meta .score »). Sans forcer, les
     chiffres mis en avant retombaient sur une chasse fixe. C'est une couche de
     compatibilité générée, pas du style écrit à la main. */
  body, h1, h2, h3, h4, .kicker, th, .foot-brand,
  .display, .agency, .chap-title, .score, .big, .v, .cover-meta b{
    font-family: 'DejaVu Sans', Helvetica, Arial, sans-serif !important;
  }

  /* Les pastilles s'étiraient en barres pleine largeur : inline-flex est traité
     comme un bloc par le moteur. En inline, elles reprennent leur taille. */
  .chip{display:inline; padding:.4mm 2.2mm}

  .grid2, .grid3{display:flex; flex-wrap:wrap; align-items:stretch}
  .grid2 > *{flex:1 1 46%; max-width:48%; margin:0 2% 4mm 0}
  .grid3 > *{flex:1 1 30%; max-width:31%; margin:0 2% 4mm 0}

  .idgrid{display:flex; flex-wrap:wrap}
  .idgrid > div{flex:1 1 46%; max-width:48%; margin-right:2%}

  .toc{columns:auto; display:block}
  .toc div{display:flex; justify-content:space-between}

  .srow{display:flex; align-items:center}
  .srow .slabel{flex:0 0 52mm; padding-right:3mm}
  .srow .sbarwrap{flex:1 1 auto; margin-right:3mm}
  .srow .schip{flex:0 0 22mm}

  .scorehero{display:flex; align-items:center}
  .scorehero .big{margin-right:6mm}

  .chap-head{display:flex; justify-content:space-between; align-items:flex-start}

  .cover-meta{display:flex; flex-wrap:wrap}
  .cover-meta > div{margin-right:9mm; margin-bottom:3mm}

  .cover-badges{display:flex; flex-wrap:wrap}
  .cover-badges .cbadge{margin:0 4mm 3mm 0}

  .valuecard{display:flex; align-items:center}
  .valuecard .v{margin-right:6mm; flex:0 0 auto}
  .valuecard p{flex:1 1 auto}

  .footer{display:flex; justify-content:space-between}
`;
