/**
 * Template HTML pour l'export PDF audit Qualiopi (Phase 13 Plan 04 — VEILLE-03).
 *
 * 1 PDF par thème (INDIC_23/24/25/26) couvrant le critère 6 Qualiopi. Pattern
 * clone-strict `legal-docs-template.ts` (BUG-15) avec body sous forme de
 * tableau au lieu de markdown.
 *
 * Architecture :
 *  - Header : logo tenant + nom + date d'export + titre du thème.
 *  - Body   : tableau 6 colonnes (Source/Type/Resp./Fréquence/Dernière revue/Exploitation).
 *  - Footer : running element WeasyPrint (`renderOfPagedFooter` — répété par page).
 *
 * **Moteur PDF : WeasyPrint** (cf. feedback_footer_pdf_qualiof.md — Gotenberg
 * footer illisible sur multi-pages). Le bloc `@page { @bottom-center { content:
 * element(corpfooter) } }` est défini via `OF_PAGED_PAGE_RULE`.
 *
 * **NDA visible dans le footer paged** : `renderOfPagedFooter()` injecte
 * automatiquement SIRET + NDA (numDA) + adresse à partir de `getOfConfig()`.
 * Pour la cohérence avec D-02 du plan, on ré-affiche aussi SIRET + NDA dans
 * le header (snapshot fourni en paramètre) pour qu'un auditeur Qualiopi ait
 * l'identité tenant à plusieurs endroits.
 */

import type { OfConfig } from './of-config';
import {
  OF_PAGED_FOOTER_STYLES,
  OF_PAGED_PAGE_RULE,
  renderOfPagedFooter,
} from './of-paged-footer';

/**
 * Labels métier des 4 thèmes Qualiopi critère 6 (indicateurs 23-26).
 * Importable côté server action pour passer `themeLabel` dans `VeilleAuditData`.
 */
export const VEILLE_THEME_LABELS: Record<
  'INDIC_23' | 'INDIC_24' | 'INDIC_25' | 'INDIC_26',
  string
> = {
  INDIC_23: 'Indicateur 23 — Veille évolutions du secteur de la formation professionnelle',
  INDIC_24: "Indicateur 24 — Veille évolutions du secteur d'activité (immobilier)",
  INDIC_25: 'Indicateur 25 — Veille innovations pédagogiques et technologiques',
  INDIC_26: 'Indicateur 26 — Veille handicap et accessibilité (Agefiph + DREETS)',
};

export function getVeilleThemeLabel(
  theme: 'INDIC_23' | 'INDIC_24' | 'INDIC_25' | 'INDIC_26',
): string {
  return VEILLE_THEME_LABELS[theme];
}

export interface VeilleAuditData {
  theme: 'INDIC_23' | 'INDIC_24' | 'INDIC_25' | 'INDIC_26';
  themeLabel: string;
  watches: Array<{
    title: string;
    url: string | null;
    source: string | null;
    responsable: string | null;
    frequency: string | null;
    exploitation: string | null;
    dateLastReviewed: Date | null;
    dateAdded: Date;
  }>;
  generatedAt: Date;
  tenantName: string;
}

/**
 * Snapshot identité tenant à afficher dans le header du PDF.
 *
 * **Pourquoi un snapshot et pas `OfConfig` complet** : la signature du template
 * doit rester minimale et n'exposer que ce qui sert au rendu. Le footer paged
 * lit `getOfConfig()` directement (ENV-driven), donc le snapshot ne sert
 * qu'au header.
 */
export interface VeilleTenantSnapshot {
  siret: string;
  nda: string;
  address?: string;
}

function escapeHtml(s: string | null | undefined): string {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function fmtDate(d: Date | null): string {
  if (!d) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

function fmtExportDate(d: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

const BRAND_DARK = '#00527A';

/**
 * Pratique : surcharge d'`OfConfig` (utilisé par certaines server actions
 * downstream) — un tenant snapshot peut être dérivé sans dupliquer la
 * signature complète. Garder l'API simple : on accepte `VeilleTenantSnapshot`
 * directement.
 */
export function renderVeilleAuditHtml(
  data: VeilleAuditData,
  tenantSnapshot: VeilleTenantSnapshot,
): string {
  const rows = data.watches
    .map(
      (w) => `
    <tr>
      <td>
        <strong>${escapeHtml(w.title)}</strong>
        ${
          w.url
            ? `<br/><a href="${escapeHtml(w.url)}" style="color:#1d4ed8;font-size:8.5pt;word-break:break-all;">${escapeHtml(w.url)}</a>`
            : ''
        }
      </td>
      <td>${escapeHtml(w.source)}</td>
      <td>${escapeHtml(w.responsable)}</td>
      <td>${escapeHtml(w.frequency)}</td>
      <td>${fmtDate(w.dateLastReviewed)}</td>
      <td>${escapeHtml(w.exploitation)}</td>
    </tr>`,
    )
    .join('\n');

  const emptyRow = `<tr><td colspan="6" style="text-align:center;color:#6b7280;padding:20px">Aucune source active pour cet indicateur.</td></tr>`;

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Veille Qualiopi — ${escapeHtml(data.themeLabel)}</title>
<style>
  ${OF_PAGED_PAGE_RULE}
  ${OF_PAGED_FOOTER_STYLES}
  body {
    font-family: 'Helvetica', Arial, sans-serif;
    font-size: 10pt;
    line-height: 1.45;
    color: #1f2937;
    margin: 0;
  }
  header.doc-header {
    border-bottom: 2px solid ${BRAND_DARK};
    padding-bottom: 6mm;
    margin-bottom: 8mm;
  }
  header.doc-header .top-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }
  header.doc-header .tenant-block strong {
    color: ${BRAND_DARK};
    font-size: 12pt;
  }
  header.doc-header .tenant-block .ids {
    font-size: 8.5pt;
    color: #475569;
    margin-top: 2mm;
  }
  header.doc-header .meta {
    text-align: right;
    font-size: 9pt;
    color: #475569;
  }
  h1.doc-title {
    font-size: 15pt;
    color: ${BRAND_DARK};
    margin: 6mm 0 2mm 0;
    line-height: 1.3;
  }
  .doc-subtitle {
    font-size: 11pt;
    color: #4b5563;
    margin-bottom: 4mm;
  }
  .meta-row {
    font-size: 9pt;
    color: #6b7280;
    margin-bottom: 6mm;
  }
  table.veille {
    width: 100%;
    border-collapse: collapse;
    margin-top: 4mm;
  }
  table.veille th,
  table.veille td {
    border: 1px solid #d1d5db;
    padding: 5px 7px;
    vertical-align: top;
    font-size: 8.5pt;
  }
  table.veille th {
    background: #f3f4f6;
    text-align: left;
    font-weight: bold;
    color: ${BRAND_DARK};
  }
  table.veille tr {
    page-break-inside: avoid;
  }
</style>
</head>
<body>
${renderOfPagedFooter()}

<header class="doc-header">
  <div class="top-row">
    <div class="tenant-block">
      <strong>${escapeHtml(data.tenantName)}</strong>
      <div class="ids">
        SIRET ${escapeHtml(tenantSnapshot.siret)} · NDA ${escapeHtml(tenantSnapshot.nda)}
        ${tenantSnapshot.address ? `<br/>${escapeHtml(tenantSnapshot.address)}` : ''}
      </div>
    </div>
    <div class="meta">
      Export Qualiopi<br/>
      ${escapeHtml(fmtExportDate(data.generatedAt))}
    </div>
  </div>
  <h1 class="doc-title">${escapeHtml(data.themeLabel)}</h1>
  <div class="doc-subtitle">Veille réglementaire continue — critère 6 Qualiopi</div>
</header>

<main>
  <p class="meta-row">
    ${data.watches.length} source${data.watches.length > 1 ? 's' : ''} active${data.watches.length > 1 ? 's' : ''}
    dans cet indicateur au ${escapeHtml(fmtDate(data.generatedAt))}.
  </p>
  <table class="veille">
    <thead>
      <tr>
        <th style="width:26%">Source</th>
        <th style="width:12%">Type</th>
        <th style="width:10%">Resp.</th>
        <th style="width:10%">Fréquence</th>
        <th style="width:11%">Dernière revue</th>
        <th style="width:31%">Exploitation</th>
      </tr>
    </thead>
    <tbody>
      ${data.watches.length ? rows : emptyRow}
    </tbody>
  </table>
</main>
</body>
</html>`;
}

/**
 * Helper de convenance — construit un `VeilleTenantSnapshot` depuis un
 * `OfConfig` (loadOfConfig). Permet à la server action d'éviter le boilerplate
 * de mapping.
 */
export function snapshotFromOfConfig(of: OfConfig): VeilleTenantSnapshot {
  return {
    siret: of.siret,
    nda: of.rnq,
    address: of.addressFull || undefined,
  };
}
