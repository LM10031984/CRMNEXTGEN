/** Preuve locale : Gotenberg sur 127.0.0.1:34003 uniquement, aucune base ni .env. */
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { extractText, getDocumentProxy } from 'unpdf';
import { renderAgeficeAttendanceHtml, type AgeficeAttendanceTemplateData } from '../src/lib/closure/agefice-attendance-template';
import { SIGNATURE_ROLES } from '../src/lib/signature/text-tags';

const output = await mkdtemp(path.join(tmpdir(), 'qualiof-assiduite-'));
console.log(`Artefacts : ${output}`);
const failures: string[] = [];
for (const long of [false, true]) {
  for (const signatureTags of [false, true]) {
    const name = `${long ? 'intitule-long' : 'standard'}-${signatureTags ? 'signature' : 'papier'}`;
    const data: AgeficeAttendanceTemplateData = {
      tenantId: 'preuve-locale-fictive',
      formationIntitule: long
        ? "L’intelligence artificielle au service des conseillers immobiliers : prospection, communication, relation client et accompagnement des projets immobiliers (72 heures)"
        : "L'intelligence artificielle au service des conseillers immobiliers (72h)",
      formationDateDebut: new Date('2026-11-23'), formationDateFin: new Date('2026-12-03'),
      formateurNomQualite: long ? 'Camille EXEMPLE, formatrice en immobilier et intelligence artificielle' : 'Camille EXEMPLE',
      nombreParticipants: 2,
      ofRaisonSociale: 'Organisme de formation de démonstration', ofNumeroDeclaration: 'DEMONSTRATION',
      ofDreetsVille: 'Provence-Alpes-Côte d’Azur', ofResponsablePrenomNom: 'Camille EXEMPLE',
      ofResponsableQualite: 'Directrice', lieuDelivrance: 'Cagnes-sur-Mer',
      stagiaireNomPrenom: long ? 'Alexandra EXEMPLE-DE-DEMONSTRATION' : 'Alex EXEMPLE',
      entrepriseRaisonSociale: long ? 'Société de démonstration des professionnels de l’immobilier' : 'Entreprise Exemple',
      prevuePresIndividuel: 0, prevuePresCollectif: 72, prevueFoadSync: 0, prevueFoadAsync: 0,
      realiseePresIndividuel: 0, realiseePresCollectif: 72, realiseeFoadSync: 0, realiseeFoadAsync: 0,
      sommeChiffres: 3024, sommeLettres: 'trois mille vingt-quatre euros', modeReglement: 'Virement bancaire',
      dateReglement: new Date('2026-12-03'), dateDelivrance: new Date('2026-12-03'), signatureTags,
    };
    const html = renderAgeficeAttendanceHtml(data);
    await writeFile(path.join(output, `${name}.html`), html);
    const form = new FormData();
    form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
    for (const side of ['Top', 'Bottom', 'Left', 'Right']) form.append(`margin${side}`, '0.6');
    form.append('paperWidth', '8.27'); form.append('paperHeight', '11.69');
    form.append('preferCssPageSize', 'true');
    const response = await fetch('http://127.0.0.1:34003/forms/chromium/convert/html', { method: 'POST', body: form });
    assert(response.ok, `Gotenberg local : ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    await writeFile(path.join(output, `${name}.pdf`), bytes);
    const pdf = await PDFDocument.load(bytes);
    const document = await getDocumentProxy(bytes.slice());
    const { text } = await extractText(document, { mergePages: false });
    const pages = text as string[];
    await document.destroy();
    console.log(`${name} : ${pdf.getPageCount()} page(s)`);
    try {
      assert.equal(pdf.getPageCount(), 1, `${name} doit tenir sur une page`);
      assert.match(pages[0]!, /Modèle AGEFICE/);
      assert(pages[0]!.includes(data.stagiaireNomPrenom));
      assert.match(pages[0]!, /assistance technique et pédagogique appropriée et avérée/);
      assert.match(pages[0]!, /3\s*024,00/);
      if (signatureTags) {
        const compact = pages[0]!.replace(/\s+/g, '');
        assert(compact.includes(`role=${SIGNATURE_ROLES.OF}`.replace(/\s+/g, '')));
        assert(compact.includes(`role=${SIGNATURE_ROLES.STAGIAIRE}`.replace(/\s+/g, '')));
      }
    } catch (error) {
      failures.push(String(error));
    }
  }
}
assert.equal(failures.length, 0, failures.join('\n'));
