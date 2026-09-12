import { describe, it, expect } from 'vitest';
import {
  catalogueTitleKey,
  normalizeName,
  normalizeEmail,
  organizationLooksLikePerson,
  personDedupKey,
} from '../normalize';

describe('normalizeName', () => {
  it('normalise les accents', () => {
    expect(normalizeName('Bergé')).toBe('berge');
    expect(normalizeName('BIANCO Pascal')).toBe('bianco pascal');
  });
  it('gère les espaces multiples', () => {
    expect(normalizeName('  Pascal   BIANCO  ')).toBe('pascal bianco');
  });
});

describe('normalizeEmail', () => {
  it('lowercase et trim', () => {
    expect(normalizeEmail(' Pascal@Bianco.FR ')).toBe('pascal@bianco.fr');
  });
});

describe('organizationLooksLikePerson', () => {
  it('détecte le cas EI Pascal BIANCO', () => {
    expect(organizationLooksLikePerson('BIANCO Pascal — EI', 'Pascal', 'Bianco')).toBe(true);
    expect(organizationLooksLikePerson('Pascal BIANCO', 'Pascal', 'Bianco')).toBe(true);
    expect(organizationLooksLikePerson('SAS BIANCO INVEST', 'Pascal', 'Bianco')).toBe(false);
    expect(organizationLooksLikePerson('DUSAUSSOY Grégory', 'Grégory', 'Dusaussoy')).toBe(true);
  });
});

describe('personDedupKey', () => {
  it('utilise email s\'il existe', () => {
    expect(
      personDedupKey({ firstName: 'Pascal', lastName: 'Bianco', email: 'pascal@gmail.com' }),
    ).toBe('email:pascal@gmail.com');
  });
  it('fallback sur nom+prénom+date naissance', () => {
    expect(
      personDedupKey({ firstName: 'Pascal', lastName: 'Bianco', birthDate: '1972-05-12' }),
    ).toBe('bianco|pascal|1972-05-12');
  });
});

describe('catalogueTitleKey — deux titres qui désignent le même programme', () => {
  it("ne voit qu'un seul programme derrière l'apostrophe typographique", () => {
    // Le doublon réel `BIB-D073` ↔ `PROD-0673` : un seul caractère d'écart,
    // U+2019 contre U+0027, et D-19 bis ne l'a pas écarté.
    expect(catalogueTitleKey('Optimiser son activité grâce à l’Intelligence Artificielle - 40h')).toBe(
      catalogueTitleKey("Optimiser son activité grâce à l'Intelligence Artificielle - 40h"),
    );
  });

  it('rapproche un titre accentué de sa version sans accent', () => {
    // `drive:008` « Face à face acheteurs » et `drive:020` « Face a face
    // acheteurs » : le même programme, importé deux fois.
    expect(catalogueTitleKey('Face à face acheteurs')).toBe(catalogueTitleKey('Face a face acheteurs'));
  });

  it('rapproche un accent DÉCOMPOSÉ (NFD) de sa forme composée — macOS écrit les dossiers ainsi', () => {
    const nfd = 'Optimiser son activite\u0301 immobilie\u0300re';
    const nfc = 'Optimiser son activité immobilière';
    expect(nfd).not.toBe(nfc); // deux chaînes réellement différentes
    expect(catalogueTitleKey(nfd)).toBe(catalogueTitleKey(nfc));
  });

  it('ignore ponctuation, tirets typographiques et espaces insécables', () => {
    expect(catalogueTitleKey('L’immobilier et sa prospection efficace devenir incontournable')).toBe(
      catalogueTitleKey("L'immobilier et sa prospection efficace : Devenir incontournable"),
    );
    expect(catalogueTitleKey('Cadastre Niveau 1 – Présentiel\u00a0Collectif')).toBe(
      catalogueTitleKey('Cadastre Niveau 1 - Presentiel Collectif'),
    );
  });

  it('ne confond pas deux programmes réellement différents', () => {
    expect(catalogueTitleKey('Basic vendeur')).not.toBe(catalogueTitleKey('Basic acheteur'));
    expect(catalogueTitleKey('Cadastre Niveau 1')).not.toBe(catalogueTitleKey('Cadastre Niveau 2'));
  });

  it("reste distincte de normalizeName, qui déduplique des PERSONNES", () => {
    // `normalizeName` garde la ponctuation : c'est ce qui lui faisait rater
    // l'apostrophe typographique sur un titre de programme.
    expect(normalizeName('L’immobilier')).not.toBe(normalizeName("L'immobilier"));
    expect(catalogueTitleKey('L’immobilier')).toBe(catalogueTitleKey("L'immobilier"));
  });

  it('rend une chaîne vide pour une entrée vide', () => {
    expect(catalogueTitleKey(null)).toBe('');
    expect(catalogueTitleKey(undefined)).toBe('');
    expect(catalogueTitleKey('   ')).toBe('');
  });
});
