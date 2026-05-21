/**
 * Template HTML de la Convocation stagiaire (Qualiopi indic 9 — info
 * déroulement prestation).
 *
 * Lettre formelle envoyée à chaque stagiaire AVANT la formation, qui
 * précise : titre, dates, horaires, lieu complet, formateur, modalités
 * d'évaluation, contact référent handicap.
 *
 * BUG-14 — pattern clone-light de convention-template.ts (réutilise
 * OfConfig + brand header + paged footer + logo data URL).
 */

import type { OfConfig } from './of-config';
import { loadLogoColorDataUrl } from './closure/shared-template';
import {
  OF_PAGED_FOOTER_STYLES,
  OF_PAGED_PAGE_RULE,
  renderOfPagedFooter,
} from './of-paged-footer';

export interface ConvocationData {
  stagiairePrenom: string;
  stagiaireNom: string;
  stagiaireCivilite: 'MR' | 'MME' | null;
  stagiaireAddressFull: string | null;

  formationTitre: string;
  formationDuree: number; // heures
  dateDebut: Date;
  dateFin: Date;
  horaires: string; // ex: "9h00 – 17h00 (pauses incluses)"
  modaliteText: string; // "présentiel" / "distanciel" / "mixte"

  lieuName: string | null;
  lieuAddressFull: string | null;

  formateurFullName: string | null;

  /** Adresse du stagiaire formatée (ligne unique). */
  evaluationModaliteText: string;

  /** Date de signature de la convocation. */
  signatureDate: Date;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

function fmtAddress(of: OfConfig): string {
  return [of.addressStreet, [of.addressCp, of.addressVille].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
}

const BRAND_DARK = '#00527A';

export function renderConvocationHtml(
  data: ConvocationData,
  of: OfConfig,
  tenantId?: string,
): string {
  const civility = data.stagiaireCivilite === 'MR' ? 'M.' : data.stagiaireCivilite === 'MME' ? 'Mme' : '';
  const fullName = `${data.stagiairePrenom} ${data.stagiaireNom}`.trim();
  const civNom = [civility, fullName].filter(Boolean).join(' ');
  const dateDebutStr = fmtDate(data.dateDebut);
  const dateFinStr = fmtDate(data.dateFin);
  const sameDays = dateDebutStr === dateFinStr;
  const lieuLine = data.lieuName
    ? data.lieuAddressFull
      ? `${data.lieuName} — ${data.lieuAddressFull}`
      : data.lieuName
    : data.lieuAddressFull ?? 'À préciser';
  const logoSrc = loadLogoColorDataUrl(tenantId);

  const ofAddress = fmtAddress(of);
  const responsible = of.resp.prenom && of.resp.nom ? `${of.resp.prenom} ${of.resp.nom}` : of.name;

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Convocation — ${escapeHtml(data.formationTitre)}</title>
<style>
  @page { size: A4; margin: 24mm 18mm 30mm 18mm; }
  ${OF_PAGED_PAGE_RULE}
  ${OF_PAGED_FOOTER_STYLES}
  body { font-family: 'Helvetica', Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #1F2937; margin: 0; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28pt; }
  .header img { max-height: 60pt; }
  .header .meta { text-align: right; font-size: 9pt; color: #475569; }
  h1 { font-size: 16pt; color: ${BRAND_DARK}; margin: 24pt 0 12pt 0; text-align: center; letter-spacing: 0.5pt; text-transform: uppercase; }
  .recipient { margin: 0 0 20pt 0; }
  .recipient strong { color: ${BRAND_DARK}; }
  p { margin: 8pt 0; }
  .key-info { background: #F8FAFC; border-left: 3pt solid ${BRAND_DARK}; padding: 12pt 16pt; margin: 16pt 0; }
  .key-info dt { font-weight: bold; color: ${BRAND_DARK}; display: inline-block; min-width: 110pt; }
  .key-info dd { margin: 0 0 6pt 0; display: inline-block; }
  .key-info dl { margin: 0; }
  .signature { margin-top: 36pt; }
  .signature .line { margin-top: 24pt; border-top: 1pt solid #94A3B8; width: 200pt; }
  .handicap { font-size: 10pt; color: #475569; margin-top: 24pt; padding: 12pt; background: #FEF3C7; border-left: 3pt solid #D97706; }
</style>
</head>
<body>
${renderOfPagedFooter()}

<div class="header">
  ${logoSrc ? `<img src="${escapeHtml(logoSrc)}" alt="Logo ${escapeHtml(of.name)}">` : `<div><strong>${escapeHtml(of.name)}</strong></div>`}
  <div class="meta">
    ${escapeHtml(of.name)}<br>
    ${escapeHtml(ofAddress)}<br>
    SIRET ${escapeHtml(of.siret)}<br>
    NDA ${escapeHtml(of.rnq)}
  </div>
</div>

<h1>Convocation à la formation</h1>

<div class="recipient">
  À l'attention de<br>
  <strong>${escapeHtml(civNom)}</strong>${data.stagiaireAddressFull ? `<br>${escapeHtml(data.stagiaireAddressFull)}` : ''}
</div>

<p>
  ${civility ? `${escapeHtml(civility)}` : 'Madame, Monsieur'},
</p>

<p>
  Nous avons le plaisir de vous confirmer votre inscription à la formation
  intitulée <strong>${escapeHtml(data.formationTitre)}</strong> que nous
  dispensons au sein de notre organisme de formation
  <strong>${escapeHtml(of.name)}</strong>.
</p>

<p>
  Vous trouverez ci-dessous les informations pratiques de votre formation :
</p>

<div class="key-info">
  <dl>
    <dt>Formation :</dt><dd>${escapeHtml(data.formationTitre)}</dd><br>
    <dt>Durée :</dt><dd>${data.formationDuree} heures</dd><br>
    <dt>${sameDays ? 'Date' : 'Du'} :</dt><dd>${escapeHtml(dateDebutStr)}${sameDays ? '' : ` au ${escapeHtml(dateFinStr)}`}</dd><br>
    <dt>Horaires :</dt><dd>${escapeHtml(data.horaires)}</dd><br>
    <dt>Modalité :</dt><dd>${escapeHtml(data.modaliteText)}</dd><br>
    <dt>Lieu :</dt><dd>${escapeHtml(lieuLine)}</dd><br>
    ${data.formateurFullName ? `<dt>Formateur :</dt><dd>${escapeHtml(data.formateurFullName)}</dd><br>` : ''}
    <dt>Évaluation :</dt><dd>${escapeHtml(data.evaluationModaliteText)}</dd>
  </dl>
</div>

<p>
  Nous vous demandons de bien vouloir vous présenter <strong>15 minutes avant
  le début de la formation</strong> pour la formalité d'émargement et
  l'accueil des stagiaires.
</p>

<p>
  Un livret de formation vous sera remis en début de session. Une liste
  d'émargement sera à signer à la demi-journée. À l'issue de la formation,
  un certificat de réalisation vous sera délivré.
</p>

<div class="handicap">
  <strong>Accessibilité PSH :</strong> Si vous êtes en situation de handicap
  et que vous souhaitez signaler un besoin d'adaptation, n'hésitez pas à
  contacter notre référent handicap
  <strong>${escapeHtml(of.handicapReferent)}</strong> avant la formation
  pour étudier ensemble les modalités possibles.
</div>

<p>
  En cas d'empêchement ou de question, vous pouvez nous joindre au
  ${escapeHtml(of.phone)} ou par email à ${escapeHtml(of.email)}.
</p>

<p>
  Cordialement,
</p>

<div class="signature">
  Fait à ${escapeHtml(of.addressVille || '')}, le ${escapeHtml(fmtDate(data.signatureDate))}<br>
  <strong>${escapeHtml(responsible)}</strong><br>
  ${of.resp.titre ? escapeHtml(of.resp.titre) : ''} ${escapeHtml(of.name)}
  <div class="line"></div>
</div>

</body>
</html>`;
}
