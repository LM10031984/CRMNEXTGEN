import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
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
  /**
   * ⚠ LA SOURCE LUE A CHANGÉ le 11/09/2026 (demande n°4). La zone ne vit plus
   * dans `tab-apres.tsx` : elle est fusionnée dans le bloc « Signature
   * électronique », en section repliée sous les lignes. Les promesses gardées
   * ici sont les MÊMES — choix du type, émargement par défaut, affectation
   * participant par participant — mais elles se vérifient à son nouveau
   * domicile. Les laisser pointer l'ancien fichier les aurait rendues vertes
   * en ne regardant plus rien.
   */
  const apresSrc = readFileSync(
    path.join(__dirname, '..', '..', 'tabs', 'tab-apres.tsx'),
    'utf-8',
  );
  const blocSrc = readFileSync(
    path.join(__dirname, '..', '..', 'signature', 'bloc-signature.tsx'),
    'utf-8',
  );

  it('l’onglet Après propose émargement ET assiduité', () => {
    const bloc = apresSrc.slice(apresSrc.indexOf('<BlocSignature'));
    expect(bloc).toMatch(/depotDocTypeOptions=/);
    expect(bloc).toMatch(/EMARGEMENT/);
    expect(bloc).toMatch(/ASSIDUITE/);
  });

  it('l’émargement reste le type par défaut', () => {
    const bloc = apresSrc.slice(apresSrc.indexOf('<BlocSignature'));
    expect(bloc).toMatch(/depotDocType="EMARGEMENT"/);
  });

  it('l’affectation reste participant par participant', () => {
    // Règle métier n°1 : la fiche est individuelle, jamais un « signé » posé
    // sur toute la session d'un coup.
    const bloc = apresSrc.slice(apresSrc.indexOf('<BlocSignature'));
    expect(bloc).toMatch(/depotParticipants=\{dropZoneParticipants\}/);
    // …et c'est bien le bloc qui les passe à la zone.
    const zone = blocSrc.slice(blocSrc.indexOf('<SignedDocDropZone'));
    expect(zone).toMatch(/participants=\{depotParticipants\}/);
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
    //
    // ⚠ ASSERTION MISE À JOUR le 11/09/2026 (correction n°5). Elle citait
    // `docTypeOptions?.find(` — le mécanisme de CONCATÉNATION qui produisait
    // « Déposer les convention signés ». La promesse gardée est la même (le
    // titre suit la sélection), le mécanisme a changé.
    expect(componentSrc).toMatch(/titreDepotSigne\(selectedDocType\)/);
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
    // Le gabarit fautif, dans le JSX : `Déposer les {libelleCourant} signés`.
    expect(componentSrc).not.toMatch(/Déposer les \{/);
    // Plus aucun libellé de type n'est passé en minuscules pour être recollé.
    expect(componentSrc).not.toMatch(/\.label\.toLowerCase\(\)/);
  });

  it('le titre vient de `titreDepotSigne`, et SUIT le type sélectionné', () => {
    expect(componentSrc).toMatch(/titreDepotSigne\(selectedDocType\)/);
    expect(componentSrc).toMatch(/['"]@\/lib\/sessions\/titre-depot-signe['"]/);
  });
});

/**
 * Demande n°4 de Laurent (11/09/2026) — « Une seule zone, une seule règle ».
 *
 * POURQUOI CE TEST EST UN BALAYAGE, ET PAS TROIS `expect` NOMMÉS. La promesse
 * n'est pas « tab-avant n'en a plus » : c'est « il n'en reste NULLE PART
 * ailleurs ». Un test qui nommerait les deux onglets d'aujourd'hui resterait
 * vert le jour où un troisième écran en rajouterait une — et le dépôt
 * redeviendrait un geste qu'on cherche à deux endroits, avec deux règles.
 *
 * Deux chemins vers la même preuve qui s'EXCLUENT (un scan déposé sur une
 * pièce partie en signature annule l'envoi, décision n°4) ne peuvent pas vivre
 * dans deux coins différents de l'écran : c'est là qu'on en déclenche un sans
 * voir l'autre.
 */
describe('une seule zone de dépôt dans tout l’écran session', () => {
  const racineSessions = path.join(__dirname, '..', '..');

  function fichiersTsx(dossier: string): string[] {
    const out: string[] = [];
    for (const entree of readdirSync(dossier, { withFileTypes: true })) {
      if (entree.name === '__tests__') continue;
      const complet = path.join(dossier, entree.name);
      if (entree.isDirectory()) out.push(...fichiersTsx(complet));
      else if (entree.name.endsWith('.tsx')) out.push(complet);
    }
    return out;
  }

  it('`<SignedDocDropZone>` n’est monté QUE par le bloc « Signature »', () => {
    const monteurs = fichiersTsx(racineSessions).filter((f) => {
      const src = readFileSync(f, 'utf-8');
      // Le fichier qui la DÉFINIT ne la monte pas : son en-tête la cite, et
      // une citation n'est pas un second endroit où déposer un scan.
      if (/export\s+function\s+SignedDocDropZone/.test(src)) return false;
      return src.includes('<SignedDocDropZone');
    });
    expect(monteurs.map((f) => path.relative(racineSessions, f))).toEqual([
      path.join('signature', 'bloc-signature.tsx'),
    ]);
  });

  it('les deux onglets ne l’importent plus — un import mort finit par se remonter', () => {
    for (const onglet of ['tab-avant.tsx', 'tab-apres.tsx']) {
      const src = readFileSync(path.join(racineSessions, 'tabs', onglet), 'utf-8');
      expect(src).not.toMatch(/<SignedDocDropZone/);
      expect(src).not.toMatch(/\bSignedDocDropZone\b/);
    }
  });

  it('le bloc rend la section repliée, avec les trois chaînes partagées', () => {
    const blocSrc = readFileSync(
      path.join(racineSessions, 'signature', 'bloc-signature.tsx'),
      'utf-8',
    );
    expect(blocSrc).toMatch(/TITRE_DEPOT_MANUEL/);
    expect(blocSrc).toMatch(/AIDE_DEPOT_MANUEL/);
    expect(blocSrc).toMatch(/MENTION_RETOUR_AUTOMATIQUE/);
    // Repliée : le cas courant du bloc reste l'envoi en signature.
    expect(blocSrc).toMatch(/defaultOpen=\{false\}/);
  });
});
