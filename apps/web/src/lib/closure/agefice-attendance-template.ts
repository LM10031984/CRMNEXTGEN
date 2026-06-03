/**
 * BUG-12 V2 — Template HTML pour l'attestation d'assiduité AGEFICE.
 *
 * Reproduit fidèlement le modèle officiel AGEFICE Janvier 2025 (cf
 * "Attestation d'assiduité - Kristin KING.pdf"). Génération HTML → PDF via
 * Gotenberg (cohérent avec les autres docs Qualiopi).
 *
 * Remplace l'approche pdf-lib form-fill (`agefice-attendance-fill.ts`) qui
 * donnait un rendu pixelisé et figé sur le PDF AGEFICE 2023.
 */

import {
  BRAND_DARK,
  SECTION_BLUE,
  TEXT,
  MUTED,
  escapeHtml,
  loadLogoColorDataUrl,
  loadSignatureDataUrl,
  loadStampDataUrl,
} from './shared-template';

export interface AgeficeAttendanceTemplateData {
  tenantId: string;

  formationIntitule: string;
  formationDateDebut: Date;
  formationDateFin: Date;
  formateurNomQualite: string | null;
  nombreParticipants: number | null;

  ofRaisonSociale: string;
  ofNumeroDeclaration: string;
  ofDreetsVille: string;
  ofResponsablePrenomNom: string;
  ofResponsableQualite: string;
  ofLieuDelivrance: string;

  stagiaireNomPrenom: string;
  entrepriseRaisonSociale: string | null;

  prevuePresIndividuel: number;
  prevuePresCollectif: number;
  prevueFoadSync: number;
  prevueFoadAsync: number;

  realiseePresIndividuel: number | null;
  realiseePresCollectif: number | null;
  realiseeFoadSync: number | null;
  realiseeFoadAsync: number | null;

  sommeChiffres: number | null;
  sommeLettres: string | null;
  modeReglement: string;
  dateReglement: Date | null;

  dateDelivrance: Date;
}

function fmtDateFr(d: Date | null | undefined): string {
  if (!d) return '';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

function fmtMontant(n: number | null | undefined): string {
  if (n == null) return '';
  return n.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtH(n: number | null | undefined): string {
  if (n == null || n === 0) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1).replace('.', ',');
}

export function renderAgeficeAttendanceHtml(d: AgeficeAttendanceTemplateData): string {
  const logo = loadLogoColorDataUrl(d.tenantId);
  const signature = loadSignatureDataUrl(d.tenantId, 'pedago'); // fallback bundled = signature-laurent.png
  const stamp = loadStampDataUrl(d.tenantId);

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Attestation d'assiduité AGEFICE — ${escapeHtml(d.stagiaireNomPrenom)}</title>
<style>
  @page {
    size: A4;
    margin: 10mm 12mm 8mm 12mm;
  }
  * { box-sizing: border-box; }
  html, body {
    font-family: 'Calibri', 'Helvetica Neue', Arial, sans-serif;
    color: ${TEXT};
    font-size: 10pt;
    line-height: 1.25;
    margin: 0;
    padding: 0;
  }

  .header {
    display: flex;
    align-items: center;
    gap: 8mm;
    margin-bottom: 3mm;
  }
  .header img.logo {
    height: 15mm;
    width: auto;
  }
  .header h1 {
    flex: 1;
    margin: 0;
    color: ${SECTION_BLUE};
    font-weight: 400;
    font-size: 14pt;
    letter-spacing: 0.2pt;
    line-height: 1.15;
  }

  .intro {
    margin: 2mm 0 3mm 0;
    line-height: 1.4;
  }
  .intro .val { font-weight: 700; }
  .intro ul {
    list-style: disc;
    margin: 1mm 0 0 7mm;
    padding: 0;
  }
  .intro ul li { margin: 0.5mm 0; }

  h2.section-title {
    color: ${BRAND_DARK};
    font-size: 10.5pt;
    font-weight: 700;
    margin: 2.5mm 0 1.5mm 0;
  }

  table.info, table.heures {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 2.5mm;
  }
  table.info td, table.heures td, table.heures th {
    border: 0.4pt solid #94a3b8;
    padding: 1.2mm 2.2mm;
    vertical-align: middle;
  }
  table.info td.label {
    width: 56mm;
    background: #f8fafc;
  }
  table.heures th {
    background: #f8fafc;
    font-weight: 700;
    text-align: center;
  }
  table.heures td:first-child {
    width: 80mm;
  }
  table.heures td.center {
    text-align: center;
  }
  sup { font-size: 6.5pt; }

  .clause {
    text-align: justify;
    margin: 2mm 0;
    line-height: 1.35;
  }

  .reglement {
    border: 0.5pt solid #94a3b8;
    background: #f0f9ff;
    padding: 2mm 3mm;
    margin: 2mm 0;
  }
  .reglement h3 {
    margin: 0 0 1mm 0;
    font-size: 10pt;
    color: ${BRAND_DARK};
  }
  .reglement .val {
    font-weight: 700;
    border-bottom: 0.3pt dotted #64748b;
    padding: 0 1.5mm;
  }

  .signature {
    margin-top: 3mm;
  }
  .signature .fait-le { margin-bottom: 2mm; line-height: 1.55; }
  .signature .fait-le .val {
    font-weight: 700;
    border-bottom: 0.3pt dotted #64748b;
    padding: 0 1.5mm;
  }
  .signature .blocks {
    display: flex;
    gap: 8mm;
  }
  .signature .blocks .col {
    flex: 1;
    text-align: center;
  }
  .signature .blocks .col .title {
    font-weight: 700;
    margin-bottom: 0.5mm;
  }
  .signature .blocks .col .ident {
    margin-bottom: 1mm;
  }
  .signature .blocks .col .visual {
    position: relative;
    height: 24mm;
    margin: 0 auto;
    width: 55mm;
  }
  .signature .blocks .col .visual img.sig {
    position: absolute;
    left: 50%;
    top: 1mm;
    transform: translateX(-50%);
    height: 13mm;
    width: auto;
    z-index: 1;
  }
  .signature .blocks .col .visual img.stamp {
    position: absolute;
    left: 50%;
    top: 3mm;
    transform: translateX(-50%);
    height: 22mm;
    width: auto;
    opacity: 0.85;
    z-index: 2;
  }
  .signature .blocks .col .caption {
    font-size: 8.5pt;
    color: ${MUTED};
  }

  .footnotes {
    margin-top: 3mm;
    font-size: 7pt;
    color: ${MUTED};
    line-height: 1.25;
  }
  .footnotes ol {
    margin: 0;
    padding-left: 4mm;
  }
  .footnotes ol li { margin: 0; }
  .footnotes .modele {
    text-align: center;
    margin-top: 1mm;
    font-style: italic;
  }
</style>
</head>
<body>
  <div class="header">
    ${logo ? `<img class="logo" src="${logo}" alt="Logo" />` : ''}
    <h1>ATTESTATION D'ASSIDUITÉ DE FORMATION ET DE RÈGLEMENT</h1>
  </div>

  <div class="intro">
    Je soussigné <span class="val">${escapeHtml(d.ofResponsablePrenomNom)}</span>
    agissant en qualité de <span class="val">${escapeHtml(d.ofResponsableQualite)}</span><br/>
    de <span class="val">${escapeHtml(d.ofRaisonSociale)}</span>
    enregistré sous le numéro de déclaration d'activité
    <span class="val">${escapeHtml(d.ofNumeroDeclaration)}</span>
    auprès de la DREETS/DRIEETS/DEETS de <span class="val">${escapeHtml(d.ofDreetsVille)}</span>,
    atteste que :
    <ul>
      <li>Madame ou Monsieur : <span class="val">${escapeHtml(d.stagiaireNomPrenom)}</span></li>
      <li>de : <span class="val">${escapeHtml(d.entrepriseRaisonSociale ?? '')}</span></li>
      <li>a bien suivi l'action de formation telle que détaillée ci-dessous</li>
    </ul>
  </div>

  <h2 class="section-title">Formation concernée</h2>
  <table class="info">
    <tr><td class="label">Intitulé de formation</td><td>${escapeHtml(d.formationIntitule)}</td></tr>
    <tr><td class="label">Date de démarrage</td><td>${fmtDateFr(d.formationDateDebut)}</td></tr>
    <tr><td class="label">Date de fin</td><td>${fmtDateFr(d.formationDateFin)}</td></tr>
    <tr><td class="label">Nom et qualité du formateur</td><td>${escapeHtml(d.formateurNomQualite ?? '')}</td></tr>
    <tr><td class="label">Nombre de participants</td><td>${d.nombreParticipants ?? ''}</td></tr>
  </table>

  <table class="heures">
    <tr>
      <th>Durée en heure(s)</th>
      <th>Prévue</th>
      <th>Réalisée</th>
    </tr>
    <tr>
      <td>Durée en présentiel individuel<sup>1</sup></td>
      <td class="center">${fmtH(d.prevuePresIndividuel)}</td>
      <td class="center">${fmtH(d.realiseePresIndividuel)}</td>
    </tr>
    <tr>
      <td>Durée en présentiel collectif<sup>2</sup></td>
      <td class="center">${fmtH(d.prevuePresCollectif)}</td>
      <td class="center">${fmtH(d.realiseePresCollectif)}</td>
    </tr>
    <tr>
      <td>Durée en distanciel synchrone<sup>3</sup></td>
      <td class="center">${fmtH(d.prevueFoadSync)}</td>
      <td class="center">${fmtH(d.realiseeFoadSync)}</td>
    </tr>
    <tr>
      <td>Durée en distanciel asynchrone<sup>4</sup></td>
      <td class="center">${fmtH(d.prevueFoadAsync)}</td>
      <td class="center">${fmtH(d.realiseeFoadAsync)}</td>
    </tr>
  </table>

  <p class="clause">
    L'organisme de formation assure avoir réalisé la formation conformément aux modalités détaillées
    dans la demande préalable de financement d'action de formation et/ou dans la convention de
    formation signée avec le stagiaire et dans le respect des critères de financement de l'AGEFICE.
    Il assure avoir fourni la double assistance technique et pédagogique prévue par les textes et
    s'engage à conserver l'ensemble des pièces justificatives permettant de démontrer la réalité et le
    suivi de l'action, de l'accompagnement et de l'assistance du stagiaire.
  </p>

  ${
    d.sommeChiffres != null
      ? `<div class="reglement">
    <h3>Si la facture acquittée n'est pas transmise :</h3>
    <p style="margin:0;">
      J'atteste également que le bénéficiaire de cette action a bien réglé la totalité du coût
      pédagogique H.T. (ou de sa participation au coût pédagogique H.T.) pour un montant de :
      <span class="val">${fmtMontant(d.sommeChiffres)}</span>
      ${d.sommeLettres ? `(<span class="val">${escapeHtml(d.sommeLettres)}</span>) euros` : 'euros'}
      payés par <span class="val">${escapeHtml(d.modeReglement)}</span>
      en date(s) du <span class="val">${fmtDateFr(d.dateReglement)}</span>.
    </p>
  </div>`
      : ''
  }

  <p class="clause">
    L'AGEFICE se réserve le droit de suspendre les paiements en cas de non-conformité, de procéder
    à tout signalement auprès des autorités compétentes et d'initier toutes procédures, y compris
    juridictionnelles, en cas de fausses déclarations ou justificatifs mensongers.
  </p>

  <div class="signature">
    <div class="fait-le">
      Fait à : <span class="val">${escapeHtml(d.ofLieuDelivrance)}</span><br/>
      Le : <span class="val">${fmtDateFr(d.dateDelivrance)}</span>
    </div>
    <div class="blocks">
      <div class="col">
        <div class="title">L'organisme de formation</div>
        <div class="ident">${escapeHtml(d.ofResponsablePrenomNom)}, ${escapeHtml(d.ofResponsableQualite)}</div>
        <div class="visual">
          ${signature ? `<img class="sig" src="${signature}" alt="Signature" />` : ''}
          ${stamp ? `<img class="stamp" src="${stamp}" alt="Cachet" />` : ''}
        </div>
      </div>
      <div class="col">
        <div class="title">Le stagiaire</div>
        <div class="ident">${escapeHtml(d.stagiaireNomPrenom)}</div>
        <div class="visual"></div>
        <div class="caption">Signature et cachet</div>
      </div>
    </div>
  </div>

  <div class="footnotes">
    <ol>
      <li>Formateur et stagiaires nécessairement réunis physiquement en un même lieu</li>
      <li>Plus d'un stagiaire même s'ils appartiennent à la même entreprise</li>
      <li>Formateur et stagiaires nécessairement réunis en temps réel sur des plages horaires préalablement définies — classe virtuelle, face à face en visioconférence</li>
      <li>Bénéficiant d'un suivi logiciel des temps de connexion en temps réel avec horaire, durée et adresse IP ainsi que d'une assistance technique et pédagogique appropriée et avérée</li>
    </ol>
    <div class="modele">Modèle AGEFICE – Janvier 2025</div>
  </div>
</body>
</html>`;
}
