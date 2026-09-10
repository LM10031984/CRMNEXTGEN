/**
 * Repère les zones de signature du formulaire AGEFICE officiel.
 *
 * Le dossier AGEFICE n'est PAS rendu par un gabarit HTML : c'est le formulaire
 * officiel (`src/assets/agefice-template.pdf`) rempli champ par champ par
 * `agefice-form-fill.ts`. Les ancres HTML des autres documents n'ont donc aucune
 * prise dessus, et la zone de signature du chef d'entreprise doit être repérée
 * en coordonnées PDF.
 *
 *   pnpm -F @qualiof/web exec tsx scripts/_inspect-agefice-signature-box.ts
 */

import { PDFDocument } from 'pdf-lib';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const CHEMIN = path.resolve(import.meta.dirname, '../src/assets/agefice-template.pdf');

async function main(): Promise<void> {
  const pdf = await PDFDocument.load(readFileSync(CHEMIN));
  const pages = pdf.getPages();

  console.log(`Formulaire : ${pages.length} pages`);
  pages.forEach((p, i) => {
    const { width, height } = p.getSize();
    console.log(`  page ${i + 1} : ${width.toFixed(0)} × ${height.toFixed(0)} pt`);
  });

  const refPage = new Map<string, number>();
  pages.forEach((p, i) => refPage.set(p.ref.toString(), i));

  console.log('\nChamps de formulaire liés à la signature :');
  for (const champ of pdf.getForm().getFields()) {
    const nom = champ.getName();
    if (!/signature|lieu|cachet/i.test(nom)) continue;
    for (const w of champ.acroField.getWidgets()) {
      const r = w.getRectangle();
      const p = w.dict.get(w.dict.context.obj('P'));
      const idx = p ? refPage.get(p.toString()) : undefined;
      console.log(
        `  « ${nom} »  page ${idx === undefined ? '?' : idx + 1}` +
          `  x=${r.x.toFixed(0)} y=${r.y.toFixed(0)} w=${r.width.toFixed(0)} h=${r.height.toFixed(0)}`,
      );
    }
  }

  console.log('\nTous les champs, par page (pour situer les blocs) :');
  const parPage = new Map<number, Array<{ nom: string; x: number; y: number }>>();
  for (const champ of pdf.getForm().getFields()) {
    for (const w of champ.acroField.getWidgets()) {
      const r = w.getRectangle();
      const p = w.dict.get(w.dict.context.obj('P'));
      const idx = p ? (refPage.get(p.toString()) ?? -1) : -1;
      if (!parPage.has(idx)) parPage.set(idx, []);
      parPage.get(idx)!.push({ nom: champ.getName(), x: r.x, y: r.y });
    }
  }
  for (const [idx, champs] of [...parPage.entries()].sort((a, b) => a[0] - b[0])) {
    const tri = [...champs].sort((a, b) => b.y - a.y);
    console.log(`\n  ── page ${idx + 1} — ${champs.length} champ(s) ──`);
    for (const c of tri) console.log(`     y=${c.y.toFixed(0)} x=${c.x.toFixed(0)}  ${c.nom}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
