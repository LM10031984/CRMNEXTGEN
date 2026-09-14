/**
 * Lot D — LES PIÈCES DU DOSSIER DE FINANCEMENT, dans leur version qui fait foi.
 *
 * Règle métier n°2 de la spec : « le PDF signé fait foi ». Le dossier OPCO
 * l'ignorait complètement — `composeOpcoSubmission` joignait `pdfUrl`, donc la
 * convention VIERGE, alors que la version signée existait à côté depuis le lot
 * C.3. Un financeur recevait un dossier sans aucune signature.
 *
 * Règle métier n°3 : « le certificat de signature est une pièce à part
 * entière … joint au dossier AGEFICE. C'est ce que les AGEFICE réclament. »
 *
 * ⚠ VALEURS LITTÉRALES (règle n°2 du chantier) partout où l'on garde un nom de
 * fichier ou une phrase : ce sont elles qui partent chez le financeur.
 */

import { describe, it, expect } from 'vitest';
import {
  LIBELLES_PIECE_DOSSIER,
  PIECES_DONT_LA_SIGNATURE_EST_EXIGEE,
  messageDossierIncomplet,
  piecesNonSignees,
  versionAJoindre,
} from '../pieces-dossier';

describe('versionAJoindre — le PDF signé fait foi', () => {
  it('joint la version SIGNÉE quand elle existe', () => {
    expect(
      versionAJoindre({ pdfUrl: 'docs/convention.pdf', signedPdfUrl: 'signed/convention.pdf' }),
    ).toEqual({ key: 'signed/convention.pdf', signe: true });
  });

  it('retombe sur l’original quand rien n’est signé', () => {
    expect(versionAJoindre({ pdfUrl: 'docs/convention.pdf', signedPdfUrl: null })).toEqual({
      key: 'docs/convention.pdf',
      signe: false,
    });
  });

  it('une clé BLANCHE n’est pas une signature', () => {
    // `signedPdfUrl: '   '` enverrait une clé vide au bucket : le téléchargement
    // échouerait au moment de l'envoi, dossier par dossier, sans rien dire.
    expect(versionAJoindre({ pdfUrl: 'docs/c.pdf', signedPdfUrl: '  ' })).toEqual({
      key: 'docs/c.pdf',
      signe: false,
    });
  });
});

describe('piecesNonSignees — ce qui manque, nommé', () => {
  it('ne s’intéresse qu’aux pièces DONT la signature est exigée', () => {
    // Le programme et la pièce d'identité ne se signent pas : les compter
    // rendrait tout dossier éternellement « incomplet ».
    expect(PIECES_DONT_LA_SIGNATURE_EST_EXIGEE).toEqual(['CONVENTION', 'AGEFICE_PA_FORM']);
  });

  it('rend les pièces exigées et non signées, dans l’ordre du dossier', () => {
    expect(
      piecesNonSignees([
        { kind: 'CNI', signe: false },
        { kind: 'AGEFICE_PA_FORM', signe: false },
        { kind: 'CONVENTION', signe: false },
        { kind: 'PROGRAMME', signe: false },
      ]),
    ).toEqual(['CONVENTION', 'AGEFICE_PA_FORM']);
  });

  it('ne rend rien quand tout ce qui doit être signé l’est', () => {
    expect(
      piecesNonSignees([
        { kind: 'CONVENTION', signe: true },
        { kind: 'AGEFICE_PA_FORM', signe: true },
        { kind: 'CNI', signe: false },
      ]),
    ).toEqual([]);
  });

  it('une pièce exigée ABSENTE du dossier n’est pas « non signée » — elle est manquante', () => {
    // Les deux manques appellent deux gestes différents : générer, ou signer.
    // Les confondre ferait chercher une signature sur un document inexistant.
    expect(piecesNonSignees([{ kind: 'CONVENTION', signe: true }])).toEqual([]);
  });
});

describe('messageDossierIncomplet — la phrase qui fait corriger', () => {
  it('nomme la pièce, la conséquence, et le geste', () => {
    expect(messageDossierIncomplet(['CONVENTION'])).toBe(
      'Dossier incomplet : Convention de formation non signée. Un financeur refuse un ' +
        'dossier dont les pièces ne portent pas de signature. Envoyez-la en signature ' +
        'depuis la fiche session, ou déposez le scan signé.',
    );
  });

  it('énumère les deux pièces au pluriel, sans les recompter', () => {
    expect(messageDossierIncomplet(['CONVENTION', 'AGEFICE_PA_FORM'])).toBe(
      'Dossier incomplet : Convention de formation et Formulaire AGEFICE PA pré-rempli ' +
        'non signées. Un financeur refuse un dossier dont les pièces ne portent pas de ' +
        'signature. Envoyez-les en signature depuis la fiche session, ou déposez les ' +
        'scans signés.',
    );
  });

  it('les libellés viennent de la table du dossier, jamais réécrits ici', () => {
    expect(LIBELLES_PIECE_DOSSIER.AUDIT_TRAIL).toBe('Certificat de signature');
    expect(LIBELLES_PIECE_DOSSIER.CONVENTION).toBe('Convention de formation');
  });
});
