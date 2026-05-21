/**
 * Template HTML générique pour les docs légaux statiques tenant
 * (CGV + Règlement intérieur — BUG-15).
 *
 * Pattern : markdown → HTML via marked + paged footer + brand header
 * basique. Pas de personnalisation par stagiaire (docs statiques tenant).
 */

import { marked } from 'marked';
import type { OfConfig } from './of-config';
import { loadLogoColorDataUrl } from './closure/shared-template';
import {
  OF_PAGED_FOOTER_STYLES,
  OF_PAGED_PAGE_RULE,
  renderOfPagedFooter,
} from './of-paged-footer';

export interface LegalDocData {
  /** Titre affiché dans le PDF — ex: "Conditions Générales de Vente" */
  title: string;
  /** Markdown source — éditable côté Paramètres */
  markdown: string;
  /** Version / date d'édition pour traçabilité (footer h1) */
  version?: string | null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function fmtAddress(of: OfConfig): string {
  return [of.addressStreet, [of.addressCp, of.addressVille].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
}

const BRAND_DARK = '#00527A';

export function renderLegalDocHtml(
  data: LegalDocData,
  of: OfConfig,
  tenantId?: string,
): string {
  const logoSrc = loadLogoColorDataUrl(tenantId);
  const ofAddress = fmtAddress(of);
  // marked synchrone (pas async pour rester compatible avec WeasyPrint pipeline).
  const bodyHtml = marked.parse(data.markdown || '*Document non rédigé. Allez dans Paramètres > Documents légaux pour le compléter.*', {
    async: false,
    breaks: true,
  }) as string;

  const today = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${escapeHtml(data.title)} — ${escapeHtml(of.name)}</title>
<style>
  @page { size: A4; margin: 24mm 18mm 30mm 18mm; }
  ${OF_PAGED_PAGE_RULE}
  ${OF_PAGED_FOOTER_STYLES}
  body { font-family: 'Helvetica', Arial, sans-serif; font-size: 10.5pt; line-height: 1.55; color: #1F2937; margin: 0; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24pt; padding-bottom: 12pt; border-bottom: 1pt solid #E5E7EB; }
  .header img { max-height: 55pt; }
  .header .meta { text-align: right; font-size: 9pt; color: #475569; }
  h1.doc-title { font-size: 18pt; color: ${BRAND_DARK}; margin: 24pt 0 4pt 0; text-align: center; letter-spacing: 0.5pt; text-transform: uppercase; }
  .doc-meta { text-align: center; font-size: 9pt; color: #6B7280; margin-bottom: 24pt; }
  .body h1 { font-size: 14pt; color: ${BRAND_DARK}; margin: 18pt 0 8pt 0; border-bottom: 1pt solid #E5E7EB; padding-bottom: 4pt; }
  .body h2 { font-size: 12pt; color: ${BRAND_DARK}; margin: 14pt 0 6pt 0; }
  .body h3 { font-size: 11pt; color: #374151; margin: 10pt 0 4pt 0; }
  .body p { margin: 6pt 0; }
  .body ul, .body ol { margin: 6pt 0; padding-left: 20pt; }
  .body li { margin: 2pt 0; }
  .body strong { color: ${BRAND_DARK}; }
  .body blockquote { border-left: 3pt solid ${BRAND_DARK}; padding-left: 12pt; margin: 12pt 0; color: #475569; font-style: italic; }
  .body code { font-family: 'Courier New', monospace; font-size: 9.5pt; background: #F3F4F6; padding: 1pt 4pt; border-radius: 2pt; }
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

<h1 class="doc-title">${escapeHtml(data.title)}</h1>
<div class="doc-meta">${data.version ? `Version ${escapeHtml(data.version)} — ` : ''}À jour au ${escapeHtml(today)}</div>

<div class="body">
${bodyHtml}
</div>

</body>
</html>`;
}
