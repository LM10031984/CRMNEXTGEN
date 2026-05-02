/**
 * Pied de page commun à TOUS les documents PDF générés par QualiOF
 * (programme, convention, facture, AGEFICE, attestation, certificat,
 * analyse besoin, QCM, grille observation…).
 *
 * Format aligné strictement sur les docs types Start Academy fournis
 * par Laurent (cf word/footer1.xml des conventions DOCX).
 */

import { getOfConfig } from './of-config';

const BRAND_DARK = '#00527A';

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Footer HTML autonome répété par Gotenberg sur chaque page (passé en
 * `footer.html` dans le multipart). À utiliser via `renderHtmlToPdf(html,
 * { footerHtml: renderOfStandardFooterHtml() })`.
 */
export function renderOfStandardFooterHtml(): string {
  const of = getOfConfig();
  const contactNom = `${of.contact.prenom} ${of.contact.nom}`.trim();
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family: Calibri, Helvetica, Arial, sans-serif; font-size: 7.5pt; color: #475569; margin: 0; padding: 0;">
  <div style="border-top: 1px solid #94A3B8; padding: 4px 18mm 0 18mm; text-align: center; line-height: 1.45;">
    <strong style="color: ${BRAND_DARK};">${escapeHtml(of.name)}</strong> – Siège social : ${escapeHtml(of.addressFull)} - SIRET : ${escapeHtml(of.siret)} – NDA ${escapeHtml(of.rnq)}<br>
    Coordonnées de contact : ${escapeHtml(contactNom)} - ${escapeHtml(of.contact.email)} - ${escapeHtml(of.contact.phone)}
  </div>
</body></html>`;
}
