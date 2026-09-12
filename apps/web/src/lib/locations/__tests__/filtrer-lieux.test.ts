import { describe, it, expect } from 'vitest';
import { filtrerLieux } from '../filtrer-lieux';

/**
 * Recherche dans la liste des lieux de formation (59 lieux en base au
 * 11/09/2026). Le `<select>` natif obligeait à parcourir toute la liste ;
 * Laurent a demandé « la petite loupe » sur la fiche session.
 *
 * La recherche doit porter sur TOUT ce qui identifie un lieu — nom d'usage,
 * raison sociale, rue, code postal, ville — parce qu'on cherche un lieu
 * tantôt par son enseigne (« Akorimmo »), tantôt par sa ville (« Nice »),
 * tantôt par son département (« 06 »).
 *
 * Test de puissance : passer le `every` final en `some` fait virer ROUGE
 * « accepte plusieurs mots dans n'importe quel ordre ».
 */

const LIEUX = [
  {
    id: '1',
    name: 'Agence Nice Centre',
    legalName: "SARL L'Agence Signature",
    address: { street: '12 rue Masséna', postalCode: '06000', city: 'Nice' },
  },
  {
    id: '2',
    name: 'Nice — Akorimmo',
    legalName: 'AKORIMMO',
    address: { street: '63 bd de Cessole', postalCode: '06100', city: 'Nice' },
  },
  {
    id: '3',
    name: 'Start Academy Cagnes',
    legalName: 'Start Academy',
    address: { street: '12 avenue des Camélias', postalCode: '06800', city: 'Cagnes-sur-Mer' },
  },
  { id: '4', name: 'Visio', legalName: null, address: null },
];

describe('filtrerLieux', () => {
  it('rend la liste entière quand la recherche est vide', () => {
    expect(filtrerLieux(LIEUX, '')).toHaveLength(4);
    expect(filtrerLieux(LIEUX, '   ')).toHaveLength(4);
  });

  it("trouve par nom d'usage", () => {
    expect(filtrerLieux(LIEUX, 'akorimmo').map((l) => l.id)).toEqual(['2']);
  });

  it('trouve par raison sociale, même absente du nom', () => {
    expect(filtrerLieux(LIEUX, 'signature').map((l) => l.id)).toEqual(['1']);
  });

  it('trouve par ville', () => {
    expect(filtrerLieux(LIEUX, 'nice').map((l) => l.id)).toEqual(['1', '2']);
  });

  it('trouve par code postal, département compris', () => {
    expect(filtrerLieux(LIEUX, '06800').map((l) => l.id)).toEqual(['3']);
    expect(filtrerLieux(LIEUX, '061').map((l) => l.id)).toEqual(['2']);
  });

  it('trouve par rue', () => {
    expect(filtrerLieux(LIEUX, 'cessole').map((l) => l.id)).toEqual(['2']);
  });

  it('ignore accents et casse — « camelias » doit trouver « Camélias »', () => {
    expect(filtrerLieux(LIEUX, 'CAMELIAS').map((l) => l.id)).toEqual(['3']);
  });

  it("accepte plusieurs mots dans n'importe quel ordre", () => {
    // « nice signature » : les deux mots sont présents, sur des champs différents.
    expect(filtrerLieux(LIEUX, 'nice signature').map((l) => l.id)).toEqual(['1']);
    expect(filtrerLieux(LIEUX, 'signature nice').map((l) => l.id)).toEqual(['1']);
  });

  it('ne rend rien quand aucun lieu ne correspond', () => {
    expect(filtrerLieux(LIEUX, 'marseille')).toEqual([]);
  });

  it('tolère un lieu sans adresse ni raison sociale', () => {
    expect(filtrerLieux(LIEUX, 'visio').map((l) => l.id)).toEqual(['4']);
  });
});
