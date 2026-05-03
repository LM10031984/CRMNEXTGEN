/**
 * Génération PDF via Gotenberg (déjà installé sur localhost:3001).
 * On envoie un HTML formaté + assets, on récupère le PDF en buffer.
 *
 * Note Gotenberg : sur /forms/chromium/convert/html, le fichier principal
 * DOIT s'appeler "index.html". Le paramètre `fileName` du second arg n'est
 * conservé que pour de futurs assets (CSS, images).
 */

const GOTENBERG_URL = process.env.GOTENBERG_URL ?? 'http://localhost:3001';

export async function renderHtmlToPdf(
  html: string,
  options?: { footerHtml?: string; headerHtml?: string },
): Promise<Buffer> {
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
  // marginBottom 1.1 inch pour reserver de la place a un footer 9pt sur 2
  // lignes + line-height 1.5 (sinon le contenu vient empieter dessus).
  form.append('marginBottom', options?.footerHtml ? '1.1' : '0.6');
  form.append('marginLeft', '0.6');
  form.append('marginRight', '0.6');
  form.append('paperWidth', '8.27');
  form.append('paperHeight', '11.69');
  // preferCssPageSize=false sinon le @page CSS ecrase nos marges Gotenberg
  // (et le contenu vient se superposer au footer.html sur les pages 2+).
  form.append('preferCssPageSize', options?.footerHtml ? 'false' : 'true');

  const res = await fetch(`${GOTENBERG_URL}/forms/chromium/convert/html`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Gotenberg HTTP ${res.status} — ${txt.slice(0, 300)}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
