/**
 * Footer corporate "running element" pour WeasyPrint (CSS Paged Media).
 *
 * À utiliser pour tous les docs PDF rendus via `renderHtmlToPdfWeasy` qui
 * doivent répéter le footer corporate sur chaque page (programme, convention,
 * factures, AGEFICE…).
 *
 * Pourquoi pas le footer Gotenberg (`footer.html` natif) :
 *   - Chromium downscale la zone footer ~30% → texte illisible même à 36pt
 *   - Multi-pages : `position: fixed bottom: 0` n'apparaît que sur la dernière
 *
 * Pattern validé sur les 5 docs closure (cf shared-template.ts).
 *
 * Usage :
 *   - Inclure `OF_PAGED_FOOTER_STYLES` dans le <style> du document
 *   - Mettre `@page` rule avec `@bottom-center { content: element(corpfooter); }`
 *   - Placer `renderOfPagedFooter()` en TÊTE du <body> (avant le contenu)
 */

import { getOfConfig } from './of-config';
import { DOC_VERSION } from './doc-version';

const BRAND_DARK = '#00527A';

function escapeHtml(s: string | null | undefined): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Bloc CSS à inclure dans le `<style>` du document. Définit le running element
 * et son apparence visuelle. NE définit PAS la règle `@page` — chaque template
 * définit ses propres marges et appelle `@bottom-center { content: element(corpfooter); }`.
 */
export const OF_PAGED_FOOTER_STYLES = `
  footer.corp {
    position: running(corpfooter);
    padding: 4px 18mm 0 18mm;
    border-top: 1px solid #94A3B8;
    font-size: 11pt;
    line-height: 1.4;
    color: #1F2937;
    text-align: center;
  }
  footer.corp strong { color: ${BRAND_DARK}; }
`;

/**
 * Règle `@page` standard pour docs OF avec footer running. Marge bas 22mm
 * pour réserver la place au footer (border-top + 2 lignes 11pt).
 */
export const OF_PAGED_PAGE_RULE = `
  @page { size: A4; margin: 22mm 18mm 22mm 18mm; @bottom-center { content: element(corpfooter); } }
`;

/**
 * Footer HTML à placer en TÊTE du `<body>`. WeasyPrint lit le running element
 * dès qu'il le rencontre dans le flow → doit être présent AVANT le contenu
 * de la page 1 pour apparaître dans `@bottom-center` dès la page 1.
 */
export function renderOfPagedFooter(): string {
  const of = getOfConfig();
  const contactNom = `${of.contact.prenom} ${of.contact.nom}`.trim();
  return `<footer class="corp">
  <strong>${escapeHtml(of.name)}</strong> – Siège social : ${escapeHtml(of.addressFull)} - SIRET : ${escapeHtml(of.siret)} – NDA ${escapeHtml(of.rnq)}<br>
  Coordonnées de contact : ${escapeHtml(contactNom)} - ${escapeHtml(of.contact.email)} - ${escapeHtml(of.contact.phone)}<br><span style="font-size:9pt;color:#64748B;">${escapeHtml(DOC_VERSION)}</span>
</footer>`;
}
