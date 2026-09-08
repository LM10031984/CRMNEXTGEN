import { describe, it, expect } from 'vitest';
import {
  asciiSlug,
  buildDownloadFilename,
  docTypeFilenameLabel,
  extFromStorageKey,
  personFilenamePart,
} from '../download-filename';

/**
 * Demande Laurent 2026-09-08 : « quand on télécharge les documents, ça serait
 * bien qu'ils aient des noms plus parlants ». Cas témoin cité : Stéphane
 * Rousseau, qui recevait « Rousseau Stéphane 24-96-3C95 ».
 */

describe('asciiSlug', () => {
  it('translittère les accents et remplace les espaces', () => {
    expect(asciiSlug('Stéphane Rousseau')).toBe('Stephane-Rousseau');
  });

  it("coupe sur l'apostrophe au lieu de coller les mots", () => {
    expect(asciiSlug("Grille d'observation")).toBe('Grille-d-observation');
    expect(asciiSlug('Grille d’observation')).toBe('Grille-d-observation');
  });

  it('écrase les séparateurs multiples et les tirets de bord', () => {
    expect(asciiSlug('  ASSALIT   SYNDIC (13) ')).toBe('ASSALIT-SYNDIC-13');
  });

  it('null / vide → chaîne vide', () => {
    expect(asciiSlug(null)).toBe('');
    expect(asciiSlug('')).toBe('');
  });
});

describe('docTypeFilenameLabel', () => {
  it('dérive du libellé long du catalogue', () => {
    expect(docTypeFilenameLabel('CERTIFICAT_REALISATION')).toBe('Certificat-de-realisation');
    expect(docTypeFilenameLabel('CONVENTION')).toBe('Convention-de-formation');
  });

  it('applique les surcharges là où le libellé ferait un mauvais nom', () => {
    expect(docTypeFilenameLabel('CNI')).toBe('Piece-identite');
    expect(docTypeFilenameLabel('CFP')).toBe('Attestation-CFP');
    expect(docTypeFilenameLabel('SATISFACTION_CHAUD')).toBe('Satisfaction-a-chaud');
  });

  it('retombe sur le docType brut si inconnu du catalogue', () => {
    expect(docTypeFilenameLabel('TYPE_INCONNU')).toBe('TYPE-INCONNU');
  });
});

describe('personFilenamePart', () => {
  it('met le nom de famille en capitales', () => {
    expect(personFilenamePart('Stéphane', 'Rousseau')).toBe('Stephane-ROUSSEAU');
  });

  it('tolère un prénom ou un nom manquant', () => {
    expect(personFilenamePart(null, 'Rousseau')).toBe('ROUSSEAU');
    expect(personFilenamePart('Stéphane', null)).toBe('Stephane');
    expect(personFilenamePart(null, null)).toBe('');
  });

  it('gère les noms composés et particules', () => {
    expect(personFilenamePart('Houssain', 'El Guertit')).toBe('Houssain-EL-GUERTIT');
  });
});

describe('buildDownloadFilename', () => {
  it('cas témoin — certificat de Stéphane Rousseau sur SES-0110', () => {
    expect(
      buildDownloadFilename({
        docType: 'CERTIFICAT_REALISATION',
        firstName: 'Stéphane',
        lastName: 'Rousseau',
        sessionCode: 'SES-0110',
      }),
    ).toBe('Certificat-de-realisation-Stephane-ROUSSEAU-SES-0110.pdf');
  });

  it("pièce d'identité — pas de session, extension déduite", () => {
    expect(
      buildDownloadFilename({
        docType: 'CNI',
        firstName: 'Stéphane',
        lastName: 'Rousseau',
        ext: 'jpg',
      }),
    ).toBe('Piece-identite-Stephane-ROUSSEAU.jpg');
  });

  it('document de niveau session — pas de personne', () => {
    expect(
      buildDownloadFilename({ docType: 'DEROULE_PEDAGOGIQUE', sessionCode: 'SES-0110' }),
    ).toBe('Deroule-pedagogique-SES-0110.pdf');
  });

  it('accepte un suffixe libre (numéro de facture)', () => {
    expect(buildDownloadFilename({ docType: 'CONVENTION', suffix: 'F-202601-214' })).toBe(
      'Convention-de-formation-F-202601-214.pdf',
    );
  });

  it("ne rend JAMAIS un nom vide — sinon le nom technique de l'objet réapparaît", () => {
    expect(buildDownloadFilename({ docType: '' })).toBe('document.pdf');
  });

  it('reste en ASCII sûr pour une query string et un en-tête HTTP', () => {
    const name = buildDownloadFilename({
      docType: 'ATTESTATION_FIN',
      firstName: 'Aïcha',
      lastName: "N'Diaye",
      sessionCode: 'SES-0094',
    });
    expect(name).toBe('Attestation-Aicha-N-DIAYE-SES-0094.pdf');
    expect(name).toMatch(/^[A-Za-z0-9.-]+$/);
    expect(encodeURIComponent(name)).toBe(name);
  });
});

describe('extFromStorageKey', () => {
  it('lit l’extension réelle de la clé', () => {
    expect(extFromStorageKey('apprenants/abc/scan.JPG')).toBe('jpg');
    expect(extFromStorageKey('closure/x/y-certificat-9f13.pdf')).toBe('pdf');
  });

  it('retombe sur le défaut quand la clé n’a pas d’extension exploitable', () => {
    expect(extFromStorageKey('apprenants/abc/sans-extension')).toBe('pdf');
    expect(extFromStorageKey(null)).toBe('pdf');
  });
});
