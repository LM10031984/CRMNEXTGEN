/**
 * Génération PDF via Gotenberg (déjà installé sur localhost:3001).
 * On envoie un HTML formaté + assets, on récupère le PDF en buffer.
 */

const GOTENBERG_URL = process.env.GOTENBERG_URL ?? 'http://localhost:3001';

export async function renderHtmlToPdf(html: string, fileName = 'document.html'): Promise<Buffer> {
  // Gotenberg attend un multipart/form-data avec le HTML en pièce jointe.
  const form = new FormData();
  form.append('files', new Blob([html], { type: 'text/html' }), fileName);
  // Marges raisonnables A4 (en pouces, le défaut Gotenberg)
  form.append('marginTop', '0.6');
  form.append('marginBottom', '0.6');
  form.append('marginLeft', '0.6');
  form.append('marginRight', '0.6');
  form.append('paperWidth', '8.27'); // A4
  form.append('paperHeight', '11.69');
  form.append('preferCssPageSize', 'true');

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
