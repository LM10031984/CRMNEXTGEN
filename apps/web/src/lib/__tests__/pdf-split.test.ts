import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';

/**
 * Lot A.2 — variante « un seul scan multipages » (spec §5 lot A) :
 * « case "Ce PDF contient une fiche par page" → découpage par page (pdf-lib),
 *   une fiche par participant dans l'ordre de la liste ».
 */

import { splitPdfPages, countPdfPages } from '../pdf-split';

async function makePdf(pages: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([595, 842]);
  return Buffer.from(await doc.save());
}

describe('countPdfPages', () => {
  it('compte les pages d’un PDF', async () => {
    expect(await countPdfPages(await makePdf(3))).toBe(3);
  });
});

describe('splitPdfPages', () => {
  it('découpe un PDF de 3 pages en 3 PDF d’une page', async () => {
    const parts = await splitPdfPages(await makePdf(3));
    expect(parts).toHaveLength(3);
    for (const part of parts) {
      expect(await countPdfPages(part)).toBe(1);
    }
  });

  it('rend un seul buffer pour un PDF d’une page', async () => {
    const parts = await splitPdfPages(await makePdf(1));
    expect(parts).toHaveLength(1);
  });

  it('rejette un buffer qui n’est pas un PDF', async () => {
    await expect(splitPdfPages(Buffer.from('pas un pdf'))).rejects.toThrow();
  });
});
