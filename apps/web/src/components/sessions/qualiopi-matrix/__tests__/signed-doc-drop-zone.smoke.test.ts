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

/**
 * Complément lot B (Laurent, 10/09/2026) — l'onglet Après ne dépose plus que
 * des émargements.
 *
 * L'attestation d'assiduité se signe majoritairement **en présentiel**, en fin
 * de session : c'est le cas courant, et il passe par le même geste que
 * l'émargement — on ramasse les feuilles, on scanne, on dépose. L'envoi en
 * signature électronique (lot C) restera l'exception, pour le distanciel.
 *
 * L'émargement reste le type par défaut : c'est le dépôt le plus fréquent, et
 * le lot A l'avait câblé ainsi.
 */
describe('zone de dépôt — choix du type de document', () => {
  const apresSrc = readFileSync(
    path.join(__dirname, '..', '..', 'tabs', 'tab-apres.tsx'),
    'utf-8',
  );

  it('l’onglet Après propose émargement ET assiduité', () => {
    const bloc = apresSrc.slice(apresSrc.indexOf('<SignedDocDropZone'));
    expect(bloc).toMatch(/docTypeOptions=/);
    expect(bloc).toMatch(/EMARGEMENT/);
    expect(bloc).toMatch(/ASSIDUITE/);
  });

  it('l’émargement reste le type par défaut', () => {
    const bloc = apresSrc.slice(apresSrc.indexOf('<SignedDocDropZone'));
    expect(bloc).toMatch(/docType="EMARGEMENT"/);
  });

  it('l’affectation reste participant par participant', () => {
    // Règle métier n°1 : la fiche est individuelle, jamais un « signé » posé
    // sur toute la session d'un coup.
    const bloc = apresSrc.slice(apresSrc.indexOf('<SignedDocDropZone'));
    expect(bloc).toMatch(/participants=\{dropZoneParticipants\}/);
  });

  it('les deux types proposés sont réellement acceptés côté serveur', async () => {
    // Un sélecteur qui propose un type refusé par l'action serait un
    // cul-de-sac : `persistSignedScan` ne reporterait le PDF signé sur aucun
    // `Document`, et la cellule resterait muette.
    const { DOCUMENT_DOC_TYPES } = await import('@/lib/doc-scope');
    expect(DOCUMENT_DOC_TYPES).toContain('EMARGEMENT');
    expect(DOCUMENT_DOC_TYPES).toContain('ASSIDUITE');
  });

  it('l’en-tête suit le type choisi, sinon il mentirait', () => {
    // Sans ça, l'encadré annonce « Déposer les émargements signés » alors que
    // l'admin a sélectionné l'attestation d'assiduité.
    expect(componentSrc).toMatch(/docTypeOptions\?\.find\(/);
  });
});

/**
 * Retour d'écran Laurent, 11/09/2026 — correction n°5.
 *
 * « Déposer les convention signés » : pluriel absent, accord masculin sur un
 * nom féminin. La cause n'est pas une faute de frappe mais la CONCATÉNATION
 * `Déposer les {libellé} signés`, qui porte l'accord en dur et en produira une
 * au prochain type ajouté. Le titre vient désormais d'une table par `DocType`.
 */
describe('titre de la zone de dépôt — une table, pas une concaténation', () => {
  it('le composant ne fabrique plus le titre par concaténation', () => {
    expect(componentSrc).not.toMatch(/Déposer les \{/);
    expect(componentSrc).not.toContain('signés\n');
  });

  it('le titre vient de `titreDepotSigne`, et SUIT le type sélectionné', () => {
    expect(componentSrc).toMatch(/titreDepotSigne\(selectedDocType\)/);
    expect(componentSrc).toMatch(/['"]@\/lib\/sessions\/titre-depot-signe['"]/);
  });
});
