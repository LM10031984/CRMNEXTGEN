/**
 * Extraction texte de PDF / images.
 * - PDFs natifs (avec couche texte) : pdf-parse (rapide, gratuit)
 * - Images JPG/PNG/WebP : Ollama vision (qwen2.5vl) — OCR local
 * - PDF scan sans couche texte : fallback vision via rendu pdfjs (TODO)
 */

import { callOllamaVision } from './ai-ollama';

export interface ExtractedDoc {
  text: string;
  pages: number;
  warnings: string[];
}

const VISION_OCR_PROMPT =
  'Transcris fidèlement TOUT le texte visible sur cette image, ' +
  "ligne par ligne, en respectant l'ordre et la mise en page. " +
  "Inclus les chiffres, dates, numéros, codes-barres lus, signatures (mentionne 'SIGNATURE' si présente). " +
  "Pas d'interprétation, pas de résumé, juste la transcription brute. " +
  "Si l'image est un document d'identité (CNI / passeport / titre de séjour), transcris aussi le contenu de la MRZ (zone à lecture optique en bas).";

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

/**
 * OCR d'une image via Ollama vision. Retourne la transcription brute du
 * texte visible. Lent (2-15 s selon le modèle / la taille image), à
 * appeler en fire-and-forget côté pipeline.
 */
export async function extractTextFromImage(buffer: Buffer): Promise<ExtractedDoc> {
  try {
    const r = await callOllamaVision({
      imageBuffer: buffer,
      prompt: VISION_OCR_PROMPT,
      temperature: 0,
      maxTokens: 1500,
    });
    const text = r.raw.trim();
    const warnings: string[] = [];
    if (text.length < 20) {
      warnings.push(`OCR vision quasi-vide (${text.length} caractères). L'image est peut-être floue ou trop sombre.`);
    }
    return { text, pages: 1, warnings };
  } catch (e: any) {
    return {
      text: '',
      pages: 0,
      warnings: [
        `Échec OCR Ollama vision : ${e?.message ?? e}. ` +
          `Vérifier que le modèle est installé (\`ollama pull qwen2.5vl:7b\`) et que Ollama tourne sur ${process.env.OLLAMA_HOST ?? 'http://localhost:11434'}.`,
      ],
    };
  }
}

export async function extractTextFromFile(buffer: Buffer, contentType: string): Promise<ExtractedDoc> {
  if (contentType === 'application/pdf' || contentType.endsWith('/pdf')) {
    return extractTextFromPdf(buffer);
  }
  if (contentType.startsWith('image/')) {
    return extractTextFromImage(buffer);
  }
  return {
    text: '',
    pages: 0,
    warnings: [`Format ${contentType} non supporté pour extraction texte. Formats acceptés : PDF natif, JPEG, PNG, WebP.`],
  };
}
