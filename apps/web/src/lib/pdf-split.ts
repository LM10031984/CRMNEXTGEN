/**
 * Lot A.2 — découpage d'un scan multipages (spec 2026-09-04 §5 A).
 *
 * « Case "Ce PDF contient une fiche par page" → découpage par page (pdf-lib),
 *   une fiche par participant dans l'ordre de la liste. »
 *
 * C'est le geste réel du formateur : il passe la pile d'émargements dans le
 * scanner en une fois et récupère un seul PDF de N pages.
 *
 * pdf-lib est déjà une dépendance (`agefice-form-fill.ts`). Le découpage se
 * fait côté serveur : rien à ajouter au bundle client.
 */

import { PDFDocument } from 'pdf-lib';

export async function countPdfPages(buffer: Buffer): Promise<number> {
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  return doc.getPageCount();
}

/**
 * Découpe un PDF en N buffers d'une page, dans l'ordre du document.
 * Lève si le buffer n'est pas un PDF lisible (pdf-lib rejette).
 */
export async function splitPdfPages(buffer: Buffer): Promise<Buffer[]> {
  const source = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const pageCount = source.getPageCount();

  const parts: Buffer[] = [];
  for (let index = 0; index < pageCount; index++) {
    const target = await PDFDocument.create();
    const [page] = await target.copyPages(source, [index]);
    target.addPage(page);
    parts.push(Buffer.from(await target.save()));
  }
  return parts;
}
