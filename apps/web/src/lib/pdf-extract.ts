/**
 * Extraction texte de PDF / images.
 * - PDFs natifs (avec couche texte) : pdf-parse
 * - Scans / images : pour MVP V2, on retourne le texte vide et on logue
 *   un warning. À terme, intégration Tesseract.
 */

// pdf-parse est en CJS pur, on charge dynamiquement pour éviter les
// problèmes de bundling Next.js.

export interface ExtractedDoc {
  text: string;
  pages: number;
  warnings: string[];
}

export async function extractTextFromPdf(buffer: Buffer): Promise<ExtractedDoc> {
  // @ts-expect-error import ESM dynamique d'un module CJS
  const pdfParse = (await import('pdf-parse')).default ?? (await import('pdf-parse'));
  try {
    const r = await pdfParse(buffer);
    const text = (r.text ?? '').trim();
    const warnings: string[] = [];
    if (text.length < 30) {
      warnings.push('Texte extrait très court — le PDF est probablement un scan sans OCR.');
    }
    return { text, pages: r.numpages ?? 0, warnings };
  } catch (e: any) {
    return { text: '', pages: 0, warnings: [`Échec parsing PDF : ${e?.message ?? e}`] };
  }
}

export async function extractTextFromFile(buffer: Buffer, contentType: string): Promise<ExtractedDoc> {
  if (contentType === 'application/pdf' || contentType.endsWith('/pdf')) {
    return extractTextFromPdf(buffer);
  }
  // Pour les images JPG/PNG sans OCR, on retourne vide avec warning
  return {
    text: '',
    pages: 0,
    warnings: [
      `Format ${contentType} non supporté pour extraction texte automatique. Re-déposer en PDF avec couche texte (pas un scan brut), ou ajouter Tesseract OCR au pipeline.`,
    ],
  };
}
