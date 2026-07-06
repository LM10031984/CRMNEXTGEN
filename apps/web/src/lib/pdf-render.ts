/**
 * Génération PDF via Gotenberg (Chromium) ou WeasyPrint.
 *
 * Gotenberg/Chromium : meilleur support des images, JS, layouts complexes.
 *   Mais downscale les headers/footers (footer.html illisible) et ne répète
 *   pas `position: fixed` sur multi-pages.
 *
 * WeasyPrint : support natif CSS Paged Media (running headers/footers via
 *   `@page { @bottom-center { content: element(footer) } }`), footer
 *   répété et lisible sur chaque page. Utilisé pour les docs closure.
 */

import { sharedEnv } from '@qualiof/shared/env';

const GOTENBERG_URL = sharedEnv.GOTENBERG_URL;
const WEASYPRINT_URL = sharedEnv.WEASYPRINT_URL;

/**
 * En-tête `Authorization: Bearer <DOC_ENGINE_TOKEN>` CONDITIONNEL au token
 * (Phase 17, fondement Option A dual-ingress public authentifié).
 * Token absent (dev local) → objet vide → aucun header ajouté, le rendu marche
 * toujours. L'enforcement server-side Gotenberg/WeasyPrint est Phase 20/21.
 */
function authHeaders(): Record<string, string> {
  const token = sharedEnv.DOC_ENGINE_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Filigrane STAGING (Phase 21 APP-01, garde D-02) — technique background SVG
 * RÉPÉTÉ : Chromium ne répète PAS `position:fixed` multi-pages (cf. commentaire
 * d'en-tête), le filigrane est donc un background-image data-URI répété sur
 * tout le body. Couvre les 9 actions PDF synchrones ET le worker (chokepoint).
 */
const WATERMARK_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">
     <text x="50%" y="50%" text-anchor="middle" transform="rotate(-30 200 150)"
       font-family="Helvetica" font-size="48" fill="rgba(220,38,38,0.16)" font-weight="bold">STAGING</text>
   </svg>`,
);
const WATERMARK_STYLE = `<style>
  body { background-image: url("data:image/svg+xml,${WATERMARK_SVG}") !important;
         background-repeat: repeat !important; -webkit-print-color-adjust: exact; }
</style>`;

/** Injecte le filigrane STAGING si appEnv=staging. Purement additif — ne touche jamais le footer in-body. */
export function withStagingWatermark(
  html: string,
  appEnv: string = sharedEnv.NEXT_PUBLIC_APP_ENV,
): string {
  if (appEnv !== 'staging') return html;
  return html.includes('</head>')
    ? html.replace('</head>', `${WATERMARK_STYLE}</head>`)
    : WATERMARK_STYLE + html;
}

export async function renderHtmlToPdf(
  html: string,
  options?: { footerHtml?: string; headerHtml?: string },
): Promise<Buffer> {
  html = withStagingWatermark(html);
  const form = new FormData();
  form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
  if (options?.footerHtml) {
    form.append('files', new Blob([options.footerHtml], { type: 'text/html' }), 'footer.html');
  }
  if (options?.headerHtml) {
    form.append('files', new Blob([options.headerHtml], { type: 'text/html' }), 'header.html');
  }
  // Marges raisonnables A4 (en pouces, le defaut Gotenberg). On reserve plus
  // de marge en bas pour laisser la place au footer.html sans empieter sur
  // le contenu (sinon on a des paragraphes ecrits par-dessus le footer).
  form.append('marginTop', options?.headerHtml ? '0.9' : '0.6');
  // marginBottom 1.0 inch (~25mm) pour le footer.html Gotenberg avec
  // font-size 36pt (compense le downscale Chromium ~30% → visuel 11pt).
  // Il faut assez de hauteur pour 2 lignes en 36pt downscalées.
  form.append('marginBottom', options?.footerHtml ? '1.0' : '0.6');
  form.append('marginLeft', '0.6');
  form.append('marginRight', '0.6');
  form.append('paperWidth', '8.27');
  form.append('paperHeight', '11.69');
  // preferCssPageSize=false sinon le @page CSS ecrase nos marges Gotenberg
  // (et le contenu vient se superposer au footer.html sur les pages 2+).
  form.append('preferCssPageSize', options?.footerHtml ? 'false' : 'true');
  // Gotenberg/Chromium n'imprime pas les backgrounds sans ce champ — requis
  // pour que le filigrane STAGING (background SVG) apparaisse dans le PDF.
  if (sharedEnv.NEXT_PUBLIC_APP_ENV === 'staging') form.append('printBackground', 'true');

  // Gotenberg multipart : NE PAS fixer Content-Type manuel (fetch génère le
  // boundary FormData). On ajoute UNIQUEMENT le Bearer — le body FormData
  // (footer HTML dans body) reste intact (CLAUDE.md, anti-pattern documenté).
  const res = await fetch(`${GOTENBERG_URL}/forms/chromium/convert/html`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Gotenberg HTTP ${res.status} — ${txt.slice(0, 300)}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Rendu via WeasyPrint — utilisé pour les docs Qualiopi closure (footer
 * répété sur chaque page via CSS Paged Media). Le HTML doit utiliser :
 *   `@page { @bottom-center { content: element(footer); } }`
 *   `footer { position: running(footer); }`
 */
export async function renderHtmlToPdfWeasy(html: string): Promise<Buffer> {
  const res = await fetch(`${WEASYPRINT_URL}/pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...authHeaders() },
    body: withStagingWatermark(html),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`WeasyPrint HTTP ${res.status} — ${txt.slice(0, 300)}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
