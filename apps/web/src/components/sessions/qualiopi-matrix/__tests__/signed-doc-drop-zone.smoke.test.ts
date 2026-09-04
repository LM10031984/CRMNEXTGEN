import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Smoke test source-regex `SignedDocDropZone` (lot A — spec 2026-09-04 §5 A).
 *
 * Couverture (7 grep-tests) :
 *  1. exporte SignedDocDropZone, client component
 *  2. glisser-déposer multi-fichiers PDF (onDrop / onDragOver / multiple)
 *  3. validation client 10 Mo + messages FR
 *  4. liste d'affectation : un <select> de participants par fichier
 *  5. pré-affectation automatique via autoAssignFiles (helper pur)
 *  6. bouton « Enregistrer N fichiers » + variante multipage (A.2)
 *  7. wires uploadSignedScans avec FormData
 */

const componentSrc = readFileSync(
  path.join(__dirname, '..', 'signed-doc-drop-zone.tsx'),
  'utf-8',
);

describe('SignedDocDropZone smoke (lot A)', () => {
  it('exporte SignedDocDropZone en client component', () => {
    expect(componentSrc).toMatch(/^'use client';/m);
    expect(componentSrc).toMatch(/export\s+function\s+SignedDocDropZone/);
  });

  it('accepte le glisser-déposer multi-fichiers PDF', () => {
    expect(componentSrc).toMatch(/onDrop=/);
    expect(componentSrc).toMatch(/onDragOver=/);
    expect(componentSrc).toMatch(/onDragLeave=/);
    expect(componentSrc).toMatch(/multiple/);
    expect(componentSrc).toMatch(/accept=['"]application\/pdf['"]/);
  });

  it('valide 10 Mo max + messages FR', () => {
    expect(componentSrc).toMatch(/10\s*\*\s*1024\s*\*\s*1024/);
    expect(componentSrc).toContain('Format non supporté');
    expect(componentSrc).toContain('Fichier trop volumineux');
  });

  it("propose une liste d'affectation fichier → participant", () => {
    expect(componentSrc).toMatch(/<select/);
    expect(componentSrc).toMatch(/participants\.map/);
  });

  it('pré-affecte via le helper pur autoAssignFiles', () => {
    expect(componentSrc).toMatch(/autoAssignFiles/);
    expect(componentSrc).toMatch(/findDuplicateAssignments/);
    expect(componentSrc).toMatch(/['"]@\/lib\/signed-scan-match['"]/);
  });

  it('expose le bouton d’enregistrement et la variante multipage (A.2)', () => {
    expect(componentSrc).toContain('Enregistrer');
    expect(componentSrc).toContain('une fiche par page');
  });

  it('wires uploadSignedScans avec FormData', () => {
    expect(componentSrc).toMatch(/uploadSignedScans/);
    expect(componentSrc).toMatch(/FormData/);
    expect(componentSrc).toMatch(/['"]@\/server\/actions\/qualiopi-matrix['"]/);
  });
});
