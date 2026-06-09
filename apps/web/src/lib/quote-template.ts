/**
 * Template HTML devis pour Start Academy / QualiOF.
 *
 * Structure :
 *  - Entête (par défaut OF tenant : logo + raison sociale + SIRET + adresse,
 *    OU `headerCustomMd` override en markdown)
 *  - Bloc destinataire (nom, contact, adresse, SIRET, email)
 *  - Titre + numéro DEV-NNNN + dates
 *  - Tableau des lignes (description, qté, PU HT, TVA, total HT)
 *  - Totaux (HT, TVA, TTC)
 *  - Notes / mentions
 *  - Footer Start Academy (corporate, identique aux conventions)
 *
 * Format A4 portrait. Compatible Gotenberg + WeasyPrint.
 */

import { marked } from 'marked';
import type { OfConfig } from './of-config';
import { loadLogoColorDataUrl } from './closure/shared-template';

export interface QuoteTemplateData {
  number: string;
  status: string;
  title: string;
  createdAt: Date;
  validUntil: Date | null;
  // Destinataire
  recipientName: string;
  recipientContact: string | null;
  recipientAddress: string | null;
  recipientEmail: string | null;
  recipientSiret: string | null;
  // Lignes
  lines: Array<{
    description: string;
    quantity: number;
    unitPriceHT: number;
    vatRate: number;
    lineTotalHT: number;
  }>;
  // Totaux
  amountHT: number;
  amountVAT: number;
  amountTTC: number;
  // Personnalisation
  headerCustomMd: string | null;
  notes: string | null;
}

const fmtEur = (n: number) =>
  n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });

const fmtDate = (d: Date) =>
  d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

const escapeHtml = (s: string | null | undefined): string => {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

function renderDefaultHeader(of: OfConfig, tenantId?: string): string {
  const logo = (() => {
    try {
      return loadLogoColorDataUrl(tenantId);
    } catch {
      return '';
    }
  })();
  return `
    <div class="header-of">
      ${logo ? `<img src="${logo}" alt="${escapeHtml(of.name)}" class="header-logo" />` : ''}
      <div class="header-info">
        <div class="header-name">${escapeHtml(of.name)}</div>
        <div class="header-line">${escapeHtml(of.addressFull)}</div>
        <div class="header-line">SIRET ${escapeHtml(of.siret)} · NDA ${escapeHtml(of.rnq)}</div>
        ${of.email ? `<div class="header-line">${escapeHtml(of.email)}${of.phone ? ' · ' + escapeHtml(of.phone) : ''}</div>` : ''}
      </div>
    </div>
  `;
}

function renderCustomHeader(md: string): string {
  // Le markdown utilisateur est rendu en HTML. Pour la sécurité on n'autorise
  // pas de scripts (marked sanitize par défaut sur les tags inline).
  const html = marked.parse(md, { async: false }) as string;
  return `<div class="header-custom">${html}</div>`;
}

export function renderQuoteHtml(
  data: QuoteTemplateData,
  of: OfConfig,
  tenantId?: string,
): string {
  const header = data.headerCustomMd
    ? renderCustomHeader(data.headerCustomMd)
    : renderDefaultHeader(of, tenantId);

  const linesHtml = data.lines
    .map(
      (l) => `
    <tr>
      <td class="col-desc">${escapeHtml(l.description)}</td>
      <td class="col-num">${l.quantity.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}</td>
      <td class="col-num">${fmtEur(l.unitPriceHT)}</td>
      <td class="col-num">${l.vatRate.toLocaleString('fr-FR')}%</td>
      <td class="col-num"><strong>${fmtEur(l.lineTotalHT)}</strong></td>
    </tr>
  `,
    )
    .join('');

  const notesHtml = data.notes
    ? `<div class="notes"><h3>Notes</h3><div class="notes-body">${escapeHtml(data.notes).replace(/\n/g, '<br/>')}</div></div>`
    : '';

  const validUntilHtml = data.validUntil
    ? `<div class="meta-row"><span class="meta-label">Valide jusqu'au</span><span class="meta-value">${fmtDate(data.validUntil)}</span></div>`
    : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Devis ${escapeHtml(data.number)}</title>
  <style>
    * { box-sizing: border-box; }
    @page { size: A4; margin: 0; }
    body {
      font-family: -apple-system, system-ui, "Helvetica Neue", Arial, sans-serif;
      color: #1f2937;
      font-size: 10.5pt;
      line-height: 1.45;
      margin: 0;
      padding: 0;
    }
    .page {
      padding: 18mm 16mm 25mm 16mm;
    }
    /* ── Header (default OF or custom markdown) ─────────────────────────── */
    .header-of {
      display: flex;
      gap: 18px;
      padding-bottom: 12px;
      border-bottom: 2px solid #d1d5db;
      margin-bottom: 16px;
    }
    .header-logo {
      max-width: 80px;
      max-height: 80px;
      object-fit: contain;
    }
    .header-info {
      flex: 1;
    }
    .header-name {
      font-size: 14pt;
      font-weight: 700;
      color: #111827;
    }
    .header-line {
      font-size: 9.5pt;
      color: #4b5563;
      margin-top: 2px;
    }
    .header-custom {
      padding-bottom: 12px;
      border-bottom: 2px solid #d1d5db;
      margin-bottom: 16px;
    }
    .header-custom h1, .header-custom h2 { margin: 0 0 4px 0; }
    .header-custom p { margin: 2px 0; }

    /* ── Titre devis + métadonnées ──────────────────────────────────────── */
    .title-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 18px;
    }
    .title {
      font-size: 22pt;
      font-weight: 700;
      color: #111827;
      margin: 0;
      letter-spacing: -0.5px;
    }
    .subtitle {
      font-size: 11pt;
      color: #6b7280;
      margin-top: 4px;
    }
    .meta {
      text-align: right;
      font-size: 9.5pt;
    }
    .meta-row {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }
    .meta-label {
      color: #6b7280;
    }
    .meta-value {
      color: #111827;
      font-weight: 500;
      min-width: 90px;
      text-align: right;
    }

    /* ── Destinataire ───────────────────────────────────────────────────── */
    .recipient {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 12px 14px;
      margin-bottom: 18px;
      max-width: 360px;
    }
    .recipient-label {
      font-size: 8.5pt;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: #6b7280;
      margin-bottom: 4px;
    }
    .recipient-name {
      font-size: 11pt;
      font-weight: 600;
      color: #111827;
    }
    .recipient-line {
      font-size: 9.5pt;
      color: #374151;
      margin-top: 2px;
      white-space: pre-line;
    }

    /* ── Tableau lignes ─────────────────────────────────────────────────── */
    table.lines {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 14px;
    }
    table.lines thead th {
      background: #1f2937;
      color: white;
      padding: 8px 10px;
      text-align: left;
      font-size: 9pt;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    table.lines tbody td {
      padding: 8px 10px;
      border-bottom: 1px solid #e5e7eb;
      vertical-align: top;
    }
    table.lines tbody tr:nth-child(even) {
      background: #f9fafb;
    }
    .col-desc { width: 50%; }
    .col-num { text-align: right; white-space: nowrap; }

    /* ── Totaux ─────────────────────────────────────────────────────────── */
    .totals {
      margin-left: auto;
      width: 50%;
      max-width: 280px;
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 10px;
      font-size: 10.5pt;
    }
    .totals-row.subtotal { color: #4b5563; }
    .totals-row.grand {
      background: #1f2937;
      color: white;
      font-weight: 700;
      font-size: 12pt;
      border-radius: 4px;
      margin-top: 6px;
    }

    /* ── Notes ──────────────────────────────────────────────────────────── */
    .notes {
      margin-top: 22px;
      padding-top: 14px;
      border-top: 1px solid #e5e7eb;
    }
    .notes h3 {
      font-size: 10pt;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: #6b7280;
      margin: 0 0 6px 0;
    }
    .notes-body {
      font-size: 9.5pt;
      color: #4b5563;
    }

    /* ── Footer fixe (Start Academy corporate, pattern QualiOF) ────────── */
    .footer-fixed {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 8px 16mm 12px 16mm;
      border-top: 1px solid #e5e7eb;
      font-size: 8pt;
      color: #6b7280;
      text-align: center;
      background: white;
    }
  </style>
</head>
<body>
  <div class="page">
    ${header}

    <div class="title-row">
      <div>
        <h1 class="title">Devis ${escapeHtml(data.number)}</h1>
        <div class="subtitle">${escapeHtml(data.title)}</div>
      </div>
      <div class="meta">
        <div class="meta-row">
          <span class="meta-label">Émis le</span>
          <span class="meta-value">${fmtDate(data.createdAt)}</span>
        </div>
        ${validUntilHtml}
      </div>
    </div>

    <div class="recipient">
      <div class="recipient-label">Destinataire</div>
      <div class="recipient-name">${escapeHtml(data.recipientName)}</div>
      ${data.recipientContact ? `<div class="recipient-line">${escapeHtml(data.recipientContact)}</div>` : ''}
      ${data.recipientAddress ? `<div class="recipient-line">${escapeHtml(data.recipientAddress)}</div>` : ''}
      ${data.recipientEmail ? `<div class="recipient-line">${escapeHtml(data.recipientEmail)}</div>` : ''}
      ${data.recipientSiret ? `<div class="recipient-line">SIRET ${escapeHtml(data.recipientSiret)}</div>` : ''}
    </div>

    <table class="lines">
      <thead>
        <tr>
          <th class="col-desc">Désignation</th>
          <th class="col-num">Qté</th>
          <th class="col-num">PU HT</th>
          <th class="col-num">TVA</th>
          <th class="col-num">Total HT</th>
        </tr>
      </thead>
      <tbody>
        ${linesHtml || '<tr><td colspan="5" style="text-align:center; padding:20px; color:#6b7280;">Aucune ligne saisie</td></tr>'}
      </tbody>
    </table>

    <div class="totals">
      <div class="totals-row subtotal"><span>Total HT</span><span>${fmtEur(data.amountHT)}</span></div>
      <div class="totals-row subtotal"><span>TVA</span><span>${fmtEur(data.amountVAT)}</span></div>
      <div class="totals-row grand"><span>Total TTC</span><span>${fmtEur(data.amountTTC)}</span></div>
    </div>

    ${notesHtml}
  </div>

  <div class="footer-fixed">
    ${escapeHtml(of.name)} · SIRET ${escapeHtml(of.siret)} · NDA ${escapeHtml(of.rnq)}${of.tvaIntra ? ` · TVA ${escapeHtml(of.tvaIntra)}` : ''}
  </div>
</body>
</html>`;
}
