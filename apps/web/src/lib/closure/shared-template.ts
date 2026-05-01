/**
 * Module partagé pour les 5 templates HTML du pack fin de formation.
 *
 * Reproduit l'identité visuelle de Qualiopi Gen (cf pdf-generator.ts) :
 *   - Bandeau bleu foncé `#00527A` avec logo Start Academy blanc centré
 *   - Encart info formation (bleu clair F0F9FF, bordure 3px BRAND_BLUE)
 *   - Sections titrées en bleu foncé MAJUSCULE soulignées
 *   - Footer corporate fixe bas de page (siège social + RNQ + contact)
 *
 * Le rendu PDF passe par Gotenberg (cohérent avec programme-template.ts).
 */

import path from 'node:path';
import fs from 'node:fs';
import { getOfConfig } from '@/lib/of-config';

export const BRAND_BLUE = '#00B4E6';
export const BRAND_DARK = '#00527A';
export const BRAND_LIGHT_BG = '#F0F9FF';
export const TEXT = '#1E293B';
export const MUTED = '#64748B';

const fileCache = new Map<string, string>();

/**
 * Charge un fichier image depuis `apps/web/src/assets/` et retourne une data-URL.
 * Retourne '' si le fichier est absent (le template doit gracefully fallback).
 */
function loadAssetDataUrl(filenames: string[]): string {
  const cacheKey = filenames.join('|');
  const cached = fileCache.get(cacheKey);
  if (cached !== undefined) return cached;
  for (const name of filenames) {
    try {
      const p = path.join(process.cwd(), 'src', 'assets', name);
      const buf = fs.readFileSync(p);
      const ext = path.extname(name).slice(1) || 'png';
      const url = `data:image/${ext};base64,${buf.toString('base64')}`;
      fileCache.set(cacheKey, url);
      return url;
    } catch {
      /* try next */
    }
  }
  fileCache.set(cacheKey, '');
  return '';
}

export function loadLogoColorDataUrl(): string {
  return loadAssetDataUrl(['logo-start-academy.png']);
}

export function loadSignatureDataUrl(): string {
  return loadAssetDataUrl(['tampon-signature.png', 'signature-laurent.png']);
}

export function escapeHtml(s: string | null | undefined): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatDateFr(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function formatHours(hours: number): string {
  if (hours <= 0) return '—';
  if (hours % 7 === 0) {
    const days = hours / 7;
    return `${hours} heures (${days} journée${days > 1 ? 's' : ''} de 7 heures)`;
  }
  return `${hours} heures`;
}

export interface ClosureContext {
  // Apprenant
  apprenantPrenom: string;
  apprenantNom: string;
  apprenantCivility: string | null;
  // Session / produit
  sessionCode: string;
  sessionTitle: string;
  sessionStartDate: Date;
  sessionEndDate: Date;
  sessionLocation: string | null;
  sessionTrainers: string[];
  durationHours: number;
}

/**
 * Bloc styles commun. Importé tel quel par les 5 templates.
 */
export const SHARED_STYLES = `
<style>
  @page { size: A4; margin: 0 0 22mm 0; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Calibri', 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 11pt;
    color: ${TEXT};
    line-height: 1.5;
    margin: 0;
    padding: 0;
  }

  /* Bandeau header (fond blanc + logo couleur + bordure bleu foncé) */
  header.brand {
    background: white;
    border-bottom: 4px solid ${BRAND_DARK};
    padding: 14mm 0 8mm 0;
    text-align: center;
    margin: 0;
  }
  header.brand img.logo { height: 18mm; width: auto; }
  header.brand .of-name {
    font-size: 22pt;
    font-weight: 700;
    letter-spacing: 1px;
  }

  /* Wrapper contenu (marges latérales) */
  main.body { padding: 12mm 18mm 0 18mm; }

  /* Titre du document (sous le bandeau) */
  h1.doc-title {
    color: ${BRAND_DARK};
    font-size: 18pt;
    font-weight: 700;
    margin: 0 0 6px 0;
    text-transform: none;
  }
  h1.doc-title.center { text-align: center; }
  .doc-subtitle { color: ${MUTED}; font-size: 10pt; margin: 0 0 8px 0; font-style: italic; }
  .doc-subtitle.center { text-align: center; }
  hr.doc-rule {
    border: none;
    border-top: 1.5px solid ${BRAND_DARK};
    margin: 0 0 12px 0;
  }

  /* Encart info formation (bleu clair) */
  .info-box {
    background: ${BRAND_LIGHT_BG};
    border-left: 3px solid ${BRAND_BLUE};
    border-radius: 4px;
    padding: 10px 14px;
    margin: 0 0 14px 0;
    font-size: 10pt;
  }
  .info-box .row { display: flex; gap: 6px; align-items: baseline; margin: 3px 0; flex-wrap: wrap; }
  .info-box .label { color: ${MUTED}; font-weight: 600; min-width: 80px; }
  .info-box .value { color: ${TEXT}; }
  .info-box .pair { display: inline-flex; gap: 6px; margin-right: 24px; }

  /* Bloc stagiaire compact */
  .stagiaire-block {
    margin: 0 0 16px 0;
  }
  .stagiaire-block .name { font-size: 13pt; font-weight: 700; color: ${BRAND_DARK}; }
  .stagiaire-block .meta { font-size: 9.5pt; color: ${MUTED}; margin-top: 2px; }

  /* Sections titrées */
  h2.section {
    font-size: 12pt;
    color: ${BRAND_DARK};
    margin: 16px 0 6px 0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 700;
    border-bottom: 1.5px solid ${BRAND_BLUE};
    padding-bottom: 3px;
  }
  h2.section.no-rule { border-bottom: none; padding-bottom: 0; }

  ul.bullets { margin: 4px 0 12px 22px; padding: 0; }
  ul.bullets li { margin-bottom: 4px; font-size: 10.5pt; }

  p.paragraph { margin: 4px 0 10px 0; font-size: 10.5pt; line-height: 1.55; }

  /* Tables (grille observation, déroulé) */
  table.data {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 12px 0;
    font-size: 9.5pt;
  }
  table.data thead th {
    background: ${BRAND_DARK};
    color: white;
    text-align: left;
    padding: 6px 8px;
    font-weight: 700;
    font-size: 9pt;
  }
  table.data tbody td {
    border: 1px solid #E2E8F0;
    padding: 6px 8px;
    vertical-align: top;
  }
  table.data tbody tr:nth-child(even) td { background: #F8FAFC; }

  .badge-niveau {
    display: inline-block;
    padding: 2px 7px;
    border-radius: 3px;
    color: white;
    font-weight: 700;
    font-size: 9pt;
    min-width: 16px;
    text-align: center;
  }
  .badge-niveau.A { background: #16A34A; }
  .badge-niveau.B { background: #3B82F6; }
  .badge-niveau.C { background: #F59E0B; }
  .badge-niveau.D { background: #DC2626; }

  /* Footer fixe bas de page (toutes pages) */
  footer.corp {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    border-top: 1px solid #94A3B8;
    padding: 4px 18mm 8px 18mm;
    font-size: 7.5pt;
    color: #475569;
    text-align: center;
    line-height: 1.45;
    background: white;
  }

  /* Signature & cachet */
  .signature-block {
    margin-top: 28px;
    display: flex;
    flex-wrap: wrap;
    gap: 40px;
    align-items: flex-start;
  }
  .signature-block .col {
    min-width: 220px;
  }
  .signature-block .label { font-weight: 600; color: ${BRAND_DARK}; font-size: 10pt; }
  .signature-block .role { font-size: 9pt; color: ${MUTED}; margin-top: 2px; }
  .signature-block img.tampon { height: 38mm; margin-top: 6px; }

  /* QCM specific */
  .qcm-question {
    margin-bottom: 14px;
    page-break-inside: avoid;
  }
  .qcm-question .q-num {
    color: ${BRAND_DARK};
    font-weight: 700;
    font-size: 10.5pt;
  }
  .qcm-question .q-text {
    color: ${TEXT};
    font-size: 10.5pt;
    margin-bottom: 6px;
  }
  .qcm-question ul.options { list-style: none; padding-left: 0; margin: 0; }
  .qcm-question ul.options li {
    margin: 3px 0;
    font-size: 10pt;
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }
  .qcm-question ul.options .checkbox {
    width: 11px;
    height: 11px;
    border: 1.2px solid #94A3B8;
    border-radius: 2px;
    display: inline-block;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .legend-box {
    background: ${BRAND_LIGHT_BG};
    border-radius: 4px;
    padding: 6px 10px;
    margin: 0 0 10px 0;
    font-size: 9pt;
    color: ${MUTED};
  }

  section.attestation-body {
    margin-top: 14px;
    text-align: justify;
    font-size: 11pt;
    line-height: 1.7;
  }
  section.attestation-body strong { color: ${BRAND_DARK}; }
  section.attestation-body p { margin: 8px 0; }
</style>
`;

/**
 * Bandeau brand en haut de chaque doc — fond blanc avec logo couleur centré
 * + barre bleu foncé épaisse en bas (cohérent avec programme-template.ts existant
 * de QualiOF qui utilise déjà ce pattern).
 */
export function renderBrandHeader(): string {
  const of = getOfConfig();
  const dataUrl = loadLogoColorDataUrl();
  const inner = dataUrl
    ? `<img class="logo" src="${dataUrl}" alt="${escapeHtml(of.name)}" />`
    : `<div class="of-name" style="color:${BRAND_DARK};">${escapeHtml(of.name).toUpperCase()}</div>`;
  return `<header class="brand">${inner}</header>`;
}

/**
 * Encart "info formation" affiché sous le titre (bleu clair, 4 champs sur 2 lignes).
 */
export function renderInfoBox(ctx: ClosureContext): string {
  const dateStr =
    ctx.sessionStartDate.toDateString() === ctx.sessionEndDate.toDateString()
      ? `Le ${formatDateFr(ctx.sessionStartDate)}`
      : `Du ${formatDateFr(ctx.sessionStartDate)} au ${formatDateFr(ctx.sessionEndDate)}`;
  const trainer = ctx.sessionTrainers.length > 0 ? ctx.sessionTrainers.join(', ') : 'À confirmer';
  return `
<div class="info-box">
  <div class="row">
    <span class="label">Formation :</span>
    <span class="value"><strong>${escapeHtml(ctx.sessionTitle)}</strong></span>
  </div>
  <div class="row">
    <span class="pair"><span class="label">Date(s) :</span><span class="value">${escapeHtml(dateStr)}</span></span>
    <span class="pair"><span class="label">Durée :</span><span class="value">${escapeHtml(formatHours(ctx.durationHours))}</span></span>
  </div>
  <div class="row">
    <span class="pair"><span class="label">Lieu :</span><span class="value">${escapeHtml(ctx.sessionLocation ?? 'À confirmer')}</span></span>
    <span class="pair"><span class="label">Formateur :</span><span class="value">${escapeHtml(trainer)}</span></span>
  </div>
</div>
`.trim();
}

export function renderStagiaireBlock(ctx: ClosureContext): string {
  const civ = ctx.apprenantCivility ?? '';
  return `
<div class="stagiaire-block">
  <div class="name">${escapeHtml(`${civ ? civ + ' ' : ''}${ctx.apprenantPrenom} ${ctx.apprenantNom}`.trim())}</div>
</div>
`.trim();
}

export function renderCorpFooter(): string {
  const of = getOfConfig();
  const respFullName = `${of.resp.prenom} ${of.resp.nom}`.trim();
  return `
<footer class="corp">
  <strong style="color:${BRAND_DARK};">${escapeHtml(of.name)}</strong> – siège social ${escapeHtml(of.addressFull)} – N° SIRET ${escapeHtml(of.siret)}<br>
  NDA ${escapeHtml(of.rnq)} – Coordonnées de contact : ${escapeHtml(respFullName)} – E-mail : ${escapeHtml(of.email)} – Tél : ${escapeHtml(of.phone)}
</footer>
`.trim();
}

/**
 * Wrapper : produit un document HTML complet à partir d'un body interne.
 */
export function wrapHtml(opts: { title: string; bodyHtml: string }): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(opts.title)}</title>
  ${SHARED_STYLES}
</head>
<body>
${opts.bodyHtml}
${renderCorpFooter()}
</body>
</html>`;
}
