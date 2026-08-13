/**
 * Template HTML facture — GABARIT OFFICIEL de l'app (refonte 2026-08-12,
 * réplique du modèle fourni par Laurent : FACTURE_F-202601-214_BIANCO_INVEST).
 *
 * Structure : logo Start Academy en haut à gauche + bloc OF (nom, Siret,
 * adresse, portable, site, email) ; à droite « FACTURE N° » + date + encadré
 * client ; ligne « Formation : {titre} » ; tableau à en-tête bleu
 * (Désignation | Qté. | P.U HT | Total HT | TVA %) avec désignation riche
 * (dates, lieu, durée, formateur, stagiaires en puces) et « 1.00 forfait » ;
 * blocs TVA/échéance/règlement + encadré « Coordonnées bancaires » ; totaux
 * à droite (Total HT / Total TTC / Total dû) ; ligne NDA ; paragraphe
 * pénalités (texte exact du modèle). Le pied de page légal + « Page N/N »
 * vit dans `renderInvoiceFooterHtml` (footer.html Gotenberg).
 *
 * Mentions légales obligatoires conservées : numéro · date · TVA · échéance ·
 * exonération art. 261-4-4° du CGI. Mode AVOIR (Phase 11) préservé.
 *
 * Quick 260813-efh — champ `acquitted` : bascule le rendu en DUPLICATA
 * ACQUITTÉ pour les dossiers OPCO/AGEFICE (tampon PAYÉ + cachet OF +
 * signature dirigeant, « Fait à {lieu de formation}, le {fin de formation} »,
 * sans IBAN ni échéance ni pénalités). MÊME numéro que la facture d'origine —
 * ce n'est pas une seconde facture. Absent ⇒ gabarit inchangé.
 *
 * Adresse OF : décision Laurent 12/08 — 12 avenue des Camélias, 06800
 * Cagnes-sur-Mer (adresse officielle post-déménagement, lue du Tenant/env
 * via of-config, jamais en dur ici).
 */

import { formatIban } from './iban-format';
import {
  loadLogoColorDataUrl,
  loadPaidStampDataUrl,
  loadSignatureDataUrl,
  loadStampDataUrl,
} from './closure/shared-template';

/**
 * Constantes légales/bancaires Start Academy affichées sur le gabarit
 * (pas de champ Tenant dédié — app mono-tenant de fait ; différence assumée,
 * documentée au rapport 12/08). Le RIB lui-même vient du Tenant (iban/bic).
 */
const OF_CAPITAL = '10 €';
const OF_BANK_NAME = 'Banque Populaire Méditerranée';
const OF_WEBSITE_DEFAULT = 'https://www.start-academy.fr';

export interface InvoiceData {
  // Facture
  number: string;
  issueDate: Date;
  dueDate: Date;
  status: string;
  // Émetteur (OF)
  ofName: string;
  ofSiret: string;
  ofRnq: string;
  ofAddress: string;
  ofPhone: string;
  ofEmail: string;
  ofTvaIntra: string | null; // null = exonération
  /** Site web affiché dans le bloc OF (défaut : site officiel Start Academy). */
  ofWebsite?: string | null;
  /** Résolution du logo uploadé via Paramètres (fallback bundled). */
  tenantId?: string;
  // Destinataire (payeur)
  payerName: string;
  payerSiret: string | null;
  payerAddress: string | null;
  payerCp: string | null;
  payerVille: string | null;
  payerEmail: string | null;
  // Inscription
  apprenantNom: string;
  apprenantPrenom: string;
  formationTitre: string;
  formationCode: string;
  formationDateDebut: Date;
  formationDateFin: Date;
  formationDureeHeures: number;
  /** Désignation riche (modèle 12/08) — lieu de la formation. */
  formationLieu?: string | null;
  /** Désignation riche — formateur principal (« M. Jean-Guy Ourmières »). */
  formateurNom?: string | null;
  /** Désignation riche — « en présentiel » / « en distanciel ». */
  formationModalite?: string | null;
  /** Noms des stagiaires (puces). Défaut : lines?.labels, sinon l'apprenant. */
  stagiaires?: string[];
  // Montants
  amountHT: number;
  vatRate: number; // % (0 si exonération art. 261-4-4°)
  amountTTC: number;
  // Notes optionnelles
  notes: string | null;
  paymentMethod: string;
  paymentIban: string | null;
  paymentBic: string | null;
  // Facture multi-participants (groupage par sponsorOrg) — compat conservée.
  lines?: { label: string; amountHT: number }[];
  // Phase 11 Plan 11-05 — Mode AVOIR (NCN au sens CGI art. 289).
  documentKind?: 'FACTURE' | 'AVOIR';
  originalNumber?: string;
  originalIssueDate?: Date;
  /**
   * Quick 260813-efh — Édition ACQUITTÉE (duplicata pour dossier OPCO/AGEFICE).
   *
   * Ce n'est PAS une seconde facture : même numéro, même montant, seule la
   * présentation change (décision Laurent 13/08 — deux factures pour une même
   * prestation doubleraient le CA). Présent ⇒ le gabarit bascule en duplicata
   * acquitté : tampon PAYÉ + tampon OF + signature dirigeant, « Fait à … le … »,
   * et retrait de tout ce qui appelle un paiement (IBAN, échéance, pénalités).
   *
   * - `paidAt` : date de règlement réelle affichée en clair.
   * - `lieu`   : LIEU DE LA FORMATION (pas le siège social) — choix de Laurent.
   * - `date`   : DATE DE FIN DE FORMATION (pas la date du jour) — idem.
   */
  acquitted?: {
    paidAt: Date;
    lieu: string | null;
    date: Date;
  };
}

const fmtDate = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtEUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function f(v: string | null | undefined): string {
  return v ? escapeHtml(String(v)) : '';
}

const BLUE_HEADER = '#5B9BD5';
const BRAND_DARK = '#00527A';

const STYLES = `
<style>
  /* Marges gérées par Gotenberg (preferCssPageSize=false quand footerHtml
     est fourni) — garder un @page cohérent avec l'ancien gabarit. */
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 9.5pt; color: #111; line-height: 1.45; margin: 0; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; }
  .of-block { font-size: 9pt; color: #222; }
  .of-block img.logo { height: 64px; margin-bottom: 8px; display: block; }
  .of-block strong.name { font-size: 10.5pt; display: block; }
  .right-block { text-align: right; min-width: 250px; }
  .right-block .facture-no { font-size: 13pt; font-weight: 700; color: #111; }
  .right-block .date { font-size: 9pt; color: #333; margin-top: 2px; }
  .client-box { border: 1px solid #999; padding: 10px 14px; margin-top: 22px; text-align: left; font-size: 9.5pt; min-height: 58px; }
  .client-box strong { display: block; margin-bottom: 2px; }
  .formation-line { margin: 10px 0 8px 0; font-size: 10pt; }
  table.lines { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 9pt; }
  table.lines thead th { background: ${BLUE_HEADER}; color: white; padding: 7px 9px; text-align: left; font-size: 9pt; font-weight: 700; }
  table.lines thead th.right, table.lines td.right { text-align: right; }
  table.lines thead th.center, table.lines td.center { text-align: center; }
  table.lines tbody td { padding: 9px; border: 1px solid #D5DCE4; vertical-align: top; }
  td.designation .line { margin-bottom: 1px; }
  td.designation ul { margin: 6px 0 2px 16px; padding: 0; }
  td.designation li { margin-bottom: 1px; }
  .bottom { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 14px; }
  .bottom .left { font-size: 9pt; flex: 1; }
  .bottom .left .row { margin-bottom: 4px; }
  .bank-box { border: 1px solid #999; padding: 8px 12px; margin-top: 10px; font-size: 9pt; max-width: 320px; }
  .totals { min-width: 240px; font-size: 9.5pt; }
  .totals table { width: 100%; border-collapse: collapse; }
  .totals td { padding: 6px 10px; border-bottom: 1px solid #D5DCE4; }
  .totals tr.due td { font-weight: 700; background: #EDF2F7; }
  .nda { font-size: 9pt; margin: 14px 0; }
  .penalties { border: 1px solid #CBD5E1; padding: 9px 12px; font-size: 8.5pt; color: #333; margin-top: 10px; }
  .avoir-mention { background: #FEF3C7; border: 1px solid #FCD34D; padding: 12px; margin: 0 0 14px 0; border-radius: 4px; color: #78350F; }
  .notes { font-size: 9pt; color: #444; margin-top: 10px; }

  /* ── Édition ACQUITTÉE (quick 260813-efh) ─────────────────────────────
     Duplicata destiné aux dossiers OPCO/AGEFICE. Le numéro ne change pas :
     seule la présentation bascule. */
  .duplicata { margin-top: 6px; font-size: 9.5pt; font-weight: 700; color: #B91C1C; letter-spacing: 0.4px; }
  .paid-line { margin-top: 3px; font-size: 9pt; color: #166534; font-weight: 600; }
  /* Le tampon PAYÉ est un scan à fond BLANC OPAQUE : multiply fait
     disparaître le blanc et ne laisse que l'encre rouge (vrai effet tampon).
     print-color-adjust force Chromium/Gotenberg à conserver la couleur. */
  .paid-stamp-wrap { position: relative; height: 0; }
  .paid-stamp {
    position: absolute; right: 250px; top: -6px; width: 132px;
    transform: rotate(-8deg); mix-blend-mode: multiply; opacity: 0.92;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .acquit-block { margin-top: 18px; page-break-inside: avoid; text-align: right; }
  .acquit-lieu { font-size: 9.5pt; color: #111; margin-bottom: 2px; }
  .acquit-visuals { position: relative; display: inline-block; width: 230px; height: 105px; }
  .acquit-tampon {
    position: absolute; right: 6px; top: 4px; width: 108px; opacity: 0.9;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .acquit-signature { position: absolute; right: 74px; top: 26px; width: 132px; mix-blend-mode: multiply; }
</style>
`;

export function renderInvoiceHtml(d: InvoiceData): string {
  const exonerationTva = d.vatRate === 0;
  const docKind = d.documentKind ?? 'FACTURE';
  const isCreditNote = docKind === 'AVOIR';
  const headerTitle = isCreditNote ? 'AVOIR' : 'FACTURE';
  const logoDataUrl = loadLogoColorDataUrl(d.tenantId);

  // Quick 260813-efh — édition acquittée (duplicata OPCO/AGEFICE).
  // Les assets ne sont chargés QUE dans ce mode : l'édition apprenant reste
  // strictement identique au gabarit officiel du 12/08 (octets près).
  const acq = d.acquitted;
  const isAcquitted = Boolean(acq);
  const paidStampUrl = isAcquitted ? loadPaidStampDataUrl(d.tenantId) : '';
  const ofStampUrl = isAcquitted ? loadStampDataUrl(d.tenantId) : '';
  const signatureUrl = isAcquitted ? loadSignatureDataUrl(d.tenantId, 'dirigeant') : '';

  const avoirMention =
    isCreditNote && d.originalNumber
      ? `<div class="avoir-mention"><strong>Avoir sur facture ${escapeHtml(d.originalNumber)}</strong>${
          d.originalIssueDate ? ` émise le ${fmtDate.format(d.originalIssueDate)}` : ''
        }</div>`
      : '';

  // Dates : « le 27/07/2026 » (journée unique) ou « du X au Y ».
  const sameDay = fmtDate.format(d.formationDateDebut) === fmtDate.format(d.formationDateFin);
  const datesLabel = sameDay
    ? `le ${fmtDate.format(d.formationDateDebut)}`
    : `du ${fmtDate.format(d.formationDateDebut)} au ${fmtDate.format(d.formationDateFin)}`;
  const dureeLabel = `${d.formationDureeHeures}h00${d.formationModalite ? ` ${escapeHtml(d.formationModalite)}` : ''}`;

  const stagiaires =
    d.stagiaires && d.stagiaires.length > 0
      ? d.stagiaires
      : d.lines && d.lines.length > 0
        ? d.lines.map((l) => l.label)
        : [`${d.apprenantPrenom} ${d.apprenantNom.toUpperCase()}`.trim()];

  const website = d.ofWebsite === null ? '' : (d.ofWebsite ?? OF_WEBSITE_DEFAULT);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>${isCreditNote ? 'Avoir' : 'Facture'} ${escapeHtml(d.number)}</title>
${STYLES}
</head>
<body>

<div class="header">
  <div class="of-block">
    ${logoDataUrl ? `<img class="logo" src="${logoDataUrl}" alt="${escapeHtml(d.ofName)}" />` : ''}
    <strong class="name">${escapeHtml(d.ofName.toUpperCase())}</strong>
    Siret: ${escapeHtml(d.ofSiret)}<br>
    ${escapeHtml(d.ofAddress)}<br>
    Portable: ${escapeHtml(d.ofPhone)}<br>
    ${website ? `${escapeHtml(website)}<br>` : ''}
    ${escapeHtml(d.ofEmail)}
  </div>
  <div class="right-block">
    <div class="facture-no">${headerTitle} N° ${escapeHtml(d.number)}</div>
    <div class="date">Date: ${fmtDate.format(d.issueDate)}</div>
    ${
      acq
        ? `<div class="duplicata">DUPLICATA — FACTURE ACQUITTÉE</div>
    <div class="paid-line">Payé le ${fmtDate.format(acq.paidAt)} par ${escapeHtml(d.paymentMethod)}</div>`
        : ''
    }
    <div class="client-box">
      <strong>${escapeHtml(d.payerName)}</strong>
      ${d.payerAddress ? `${f(d.payerAddress)}<br>` : ''}
      ${[d.payerCp, d.payerVille].filter((s): s is string => Boolean(s)).map(escapeHtml).join(' ')}${d.payerCp || d.payerVille ? ' France' : ''}
      ${d.payerSiret ? `<br>SIRET ${f(d.payerSiret)}` : ''}
    </div>
  </div>
</div>

${avoirMention}

<div class="formation-line">Formation : ${escapeHtml(d.formationTitre)}</div>

<table class="lines">
  <thead>
    <tr>
      <th style="width: 58%;">Désignation</th>
      <th class="center">Qté.</th>
      <th class="right">P.U HT</th>
      <th class="right">Total HT</th>
      <th class="right">TVA %</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td class="designation">
        <div class="line"><strong>Formation : ${escapeHtml(d.formationTitre)}</strong></div>
        <div class="line"><strong>Formation :</strong> ${escapeHtml(d.formationTitre)} – ${d.formationDureeHeures}h00</div>
        <div class="line"><strong>Dates :</strong> ${datesLabel}</div>
        ${d.formationLieu ? `<div class="line"><strong>Lieu de la formation :</strong> ${escapeHtml(d.formationLieu)}</div>` : ''}
        <div class="line"><strong>Durée :</strong> ${dureeLabel}</div>
        ${d.formateurNom ? `<div class="line"><strong>Formateur :</strong> ${escapeHtml(d.formateurNom)}</div>` : ''}
        <div class="line" style="margin-top: 8px;"><strong>Nom des stagiaires :</strong></div>
        <ul>${stagiaires.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>
      </td>
      <td class="center">1.00 forfait</td>
      <td class="right">${fmtEUR.format(d.amountHT)}</td>
      <td class="right">${fmtEUR.format(d.amountHT)}</td>
      <td class="right">${d.vatRate.toFixed(2)}%</td>
    </tr>
  </tbody>
</table>

<div class="bottom">
  <div class="left">
    ${exonerationTva ? `
    <div class="row">T.V.A. non applicable ou exonérée<br>TVA non applicable en vertu de l'article 261-4-4° du CGI</div>
    ` : ''}
    ${acq ? '' : `<div class="row"><strong>Date d'échéance:</strong>&nbsp;&nbsp;${fmtDate.format(d.dueDate)}</div>`}
    <div class="row"><strong>Mode de règlement:</strong> ${escapeHtml(d.paymentMethod)}</div>
    ${!acq && d.paymentIban ? `
    <div class="bank-box">
      <strong>Coordonnées bancaires:</strong><br>
      ${escapeHtml(OF_BANK_NAME)}<br>
      <strong>IBAN</strong>: ${escapeHtml(formatIban(d.paymentIban))}<br>
      ${d.paymentBic ? `<strong>BIC</strong>: ${escapeHtml(d.paymentBic)}` : ''}
    </div>` : ''}
  </div>
  ${
    acq && paidStampUrl
      ? `<div class="paid-stamp-wrap"><img class="paid-stamp" src="${paidStampUrl}" alt="PAYÉ" /></div>`
      : ''
  }
  <div class="totals">
    <table>
      <tr><td>Total HT</td><td class="right" style="text-align:right;">${fmtEUR.format(d.amountHT)}</td></tr>
      <tr><td>Total TTC</td><td class="right" style="text-align:right;">${fmtEUR.format(d.amountTTC)}</td></tr>
      ${
        acq
          ? `<tr><td>Réglé</td><td class="right" style="text-align:right;">${fmtEUR.format(d.amountTTC)}</td></tr>
      <tr class="due"><td>Reste dû</td><td class="right" style="text-align:right;">${fmtEUR.format(0)}</td></tr>`
          : `<tr class="due"><td>Total dû</td><td class="right" style="text-align:right;">${fmtEUR.format(d.amountTTC)}</td></tr>`
      }
    </table>
  </div>
</div>

<div class="nda">NDA : ${escapeHtml(d.ofRnq)}</div>

${d.notes ? `<div class="notes"><strong>Notes :</strong> ${escapeHtml(d.notes)}</div>` : ''}

${
  acq
    ? `<div class="acquit-block">
  <div class="acquit-lieu">Fait à ${escapeHtml(acq.lieu ?? d.ofAddress)}, le ${fmtDate.format(acq.date)}</div>
  <div class="acquit-visuals">
    ${ofStampUrl ? `<img class="acquit-tampon" src="${ofStampUrl}" alt="Cachet de l'organisme" />` : ''}
    ${signatureUrl ? `<img class="acquit-signature" src="${signatureUrl}" alt="Signature" />` : ''}
  </div>
</div>`
    : `<div class="penalties">
  Pas d'escompte pour paiement anticipé. Passée la date d'échéance, tout paiement différé entraine
  l'application d'une pénalité de 3 fois le taux d'intérêt légal (loi 2008-776 du 04/08/2008) ainsi
  qu'une indemnité forfaitaire pour frais de recouvrement de 40 euros (Décret 2012-1115 du 02/10/2012).
</div>`
}

</body>
</html>`;
}

/**
 * Pied de page légal facture (footer.html Gotenberg, répété chaque page) :
 * « SAS START ACADEMY au capital de 10 € - {SIREN} / TVA intracommunautaire:
 * {FRxx} » + « Page N/N » à droite. Remplace renderOfStandardFooterHtml pour
 * les factures (refonte gabarit 12/08 — pas de « V2 du … »).
 * Police 30pt : Chromium downscale ~30 % le footer.html (rendu ~9pt).
 */
export function renderInvoiceFooterHtml(opts: {
  ofName: string;
  ofSiret: string;
  ofTvaIntra: string | null;
}): string {
  const siren = opts.ofSiret.replace(/\s/g, '').slice(0, 9);
  // ⚠ Constaté 12/08 : le footer.html Gotenberg/Chromium ne « downscale »
  // PAS le contenu (le commentaire 36pt→11pt hérité de of-pdf-footer était
  // erroné — l'ancien footer débordait de la marge et sortait tronqué).
  // → tailles RÉELLES ~8.5pt, table (les flex passent mal dans footer.html).
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 8.5pt; color: #333; margin: 0; padding: 0 16mm; -webkit-print-color-adjust: exact;">
  <table style="width: 100%; border-collapse: collapse; border-top: 1.5px solid ${BRAND_DARK};">
    <tr>
      <td style="width: 60pt;"></td>
      <td style="text-align: center; padding-top: 5px; line-height: 1.45; font-size: 8.5pt;">
        SAS ${escapeHtml(opts.ofName.toUpperCase())} au capital de ${escapeHtml(OF_CAPITAL)} - ${escapeHtml(siren)}${
          opts.ofTvaIntra ? `<br>TVA intracommunautaire: ${escapeHtml(opts.ofTvaIntra)}` : ''
        }
      </td>
      <td style="width: 60pt; text-align: right; padding-top: 5px; font-size: 8pt; color: #555; white-space: nowrap;">
        Page <span class="pageNumber"></span>/<span class="totalPages"></span>
      </td>
    </tr>
  </table>
</body></html>`;
}
