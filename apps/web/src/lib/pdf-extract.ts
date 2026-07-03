/**
 * Extraction texte de PDF / images.
 * - PDFs natifs (avec couche texte) : unpdf (rapide, gratuit)
 * - Images JPG/PNG/WebP : OCR vision via callLlm (Claude vision cloud / vision local)
 * - PDF scan sans couche texte : fallback automatique pdftoppm (rasterisation)
 *   + OCR vision sur chaque page rastérisée
 */

import { callLlm } from '@/lib/llm-client';

/**
 * Rastérise un PDF en PNG via `pdftoppm` (poppler-utils, CLI brew).
 *
 * Choix d'implémentation : CLI plutôt que lib Node native parce que les libs
 * type `pdf-to-png-converter` / `pdfjs-dist + canvas` pullent un binaire
 * `canvas.node` que webpack ne sait pas bundler (crash Next.js build) et qui
 * a régulièrement des problèmes de prebuilt sur ARM64. `pdftoppm` est un
 * binaire système (`brew install poppler`), aucune dep Node, marche partout.
 *
 * 144 DPI : compromis lisibilité MRZ / taille — assez pour qu'un vision model
 * lise une CNI, sans alourdir inutilement la requête vision.
 */
async function rasterizePdfPagesToPng(pdfBuffer: Buffer): Promise<Buffer[]> {
  const { execFile } = await import('node:child_process');
  const { mkdtemp, readFile, readdir, rm, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);

  const dir = await mkdtemp(path.join(tmpdir(), 'qualiof-pdf-'));
  try {
    const pdfPath = path.join(dir, 'in.pdf');
    await writeFile(pdfPath, pdfBuffer);
    await run('pdftoppm', ['-r', '144', '-png', pdfPath, path.join(dir, 'page')], {
      timeout: 60_000,
    });
    const files = (await readdir(dir))
      .filter((f) => f.endsWith('.png'))
      .sort(); // page-1.png, page-2.png, …
    return Promise.all(files.map((f) => readFile(path.join(dir, f))));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

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
  // unpdf est ESM-native et fonctionne dans les server actions Next.js
  // (pdf-parse v2 plante avec "Object.defineProperty called on non-object"
  // sur certains PDFs URSSAF dans le contexte Next 15 / RSC).
  try {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const uint8 = new Uint8Array(buffer);
    const doc = await getDocumentProxy(uint8);
    const pages = doc.numPages;
    const result = await extractText(doc, { mergePages: true });
    const t: unknown = result.text;
    const finalText = (typeof t === 'string' ? t : Array.isArray(t) ? (t as string[]).join('\n') : '').trim();
    const warnings: string[] = [];
    if (finalText.length < 30) {
      warnings.push("Texte extrait très court — le PDF est probablement un scan sans OCR. Re-déposer une photo (JPEG) du document permettrait à l'OCR vision de le traiter.");
    }
    return { text: finalText, pages, warnings };
  } catch (e: any) {
    return { text: '', pages: 0, warnings: [`Échec parsing PDF : ${e?.message ?? e}`] };
  }
}

/**
 * OCR d'une image via `callLlm({ imageBuffer })` (tier vision — Claude Haiku
 * vision en cloud OpenRouter, llama3.2-vision en local selon AI_PROVIDER).
 * Retourne la transcription brute du texte visible. Lent (2-15 s selon le
 * modèle / la taille image), à appeler en fire-and-forget côté pipeline.
 *
 * En cas d'échec : retour text:'' / pages:0 (null-équivalent → saisie
 * manuelle admin). PAS de stub généré (D-03c).
 */
export async function extractTextFromImage(buffer: Buffer): Promise<ExtractedDoc> {
  try {
    // imageBuffer force le tier vision côté callLlm (détection mime interne).
    const r = await callLlm({
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
        `Échec OCR vision : ${e?.message ?? e}. ` +
          "Vérifiez la clé OPENROUTER_API_KEY ou l'accès réseau (ou l'accès Ollama local selon AI_PROVIDER), " +
          'ou saisissez les champs manuellement.',
      ],
    };
  }
}

export async function extractTextFromFile(buffer: Buffer, contentType: string): Promise<ExtractedDoc> {
  if (contentType === 'application/pdf' || contentType.endsWith('/pdf')) {
    const parsed = await extractTextFromPdf(buffer);
    // Fallback PDF scanné : si la couche texte est quasi-vide, on rastérise
    // chaque page et on appelle l'OCR vision dessus. Cas typique : CNI/RIB
    // scannés via iPhone "Scanner un document" — 1-2 images JPEG dans un PDF.
    if (parsed.text.trim().length >= 30) return parsed;
    try {
      const pngs = await rasterizePdfPagesToPng(buffer);
      if (pngs.length === 0) {
        return {
          ...parsed,
          warnings: [...parsed.warnings, 'Rasterisation pdftoppm a produit 0 image.'],
        };
      }
      const warnings = [
        ...parsed.warnings,
        `PDF sans couche texte — OCR vision sur ${pngs.length} page(s) rastérisée(s) (pdftoppm 144dpi).`,
      ];
      const texts: string[] = [];
      for (const [i, png] of pngs.entries()) {
        const ocr = await extractTextFromImage(png);
        warnings.push(...ocr.warnings.map((w) => `[page ${i + 1}] ${w}`));
        if (ocr.text) texts.push(ocr.text);
      }
      return { text: texts.join('\n\n'), pages: pngs.length, warnings };
    } catch (e: any) {
      const isNotFound = /ENOENT|not found|spawn pdftoppm/i.test(String(e?.message ?? e));
      return {
        ...parsed,
        warnings: [
          ...parsed.warnings,
          isNotFound
            ? "Rasterisation impossible : `pdftoppm` introuvable (installer poppler-utils via `brew install poppler`)."
            : `Rasterisation pdftoppm échouée : ${e?.message ?? e}`,
        ],
      };
    }
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
