import { describe, it, expect } from 'vitest';
import {
  buildEiLegalName,
  classifyEiRename,
  legalNameKey,
  personNameKey,
} from '../ei-organization-name';

/**
 * Quick 260908-lhg. Les cas « ignore » et « warn » ci-dessous sont TIRÉS DE LA
 * BASE de production (scan des 238 liens EI_SELF du 2026-09-08) : ce sont eux
 * qui interdisent un renommage large.
 */

describe('legalNameKey / personNameKey', () => {
  it("ignore la casse, les accents, la ponctuation et l'ordre des mots", () => {
    expect(legalNameKey('HOUSSAIN EL GUERTIT')).toBe(legalNameKey('el guertit, houssain'));
    expect(personNameKey('Stéphane', 'Rousseau')).toBe(legalNameKey('ROUSSEAU  Stephane'));
  });

  it('vide → clé vide', () => {
    expect(legalNameKey(null)).toBe('');
    expect(personNameKey(null, null)).toBe('');
  });
});

describe('buildEiLegalName', () => {
  it('reproduit le format posé à la création', () => {
    expect(buildEiLegalName('Houssain', 'EL GUERTIT')).toBe('Houssain EL GUERTIT');
  });

  it('tolère un prénom manquant sans laisser d’espace en tête', () => {
    expect(buildEiLegalName(null, 'ROUSSEAU')).toBe('ROUSSEAU');
  });
});

describe('classifyEiRename — le cas à corriger', () => {
  it('cas témoin EL GUERTIT : la raison sociale EST l’ancien nom → rename', () => {
    expect(
      classifyEiRename({
        legalName: 'HOUSSAIN EL GUERTIJ',
        oldFirstName: 'Houssain',
        oldLastName: 'EL GUERTIJ',
      }),
    ).toBe('rename');
  });

  it('renomme aussi quand la raison sociale est dans l’ordre inverse', () => {
    expect(
      classifyEiRename({
        legalName: 'ROUSSEAU Stéphane',
        oldFirstName: 'Stéphane',
        oldLastName: 'Rousseau',
      }),
    ).toBe('rename');
  });
});

describe('classifyEiRename — ce qu’il ne faut JAMAIS réécrire (cas réels)', () => {
  it('vraie société liée en EI_SELF : « EVIMERIA » pour Anthony Maietta → ignore', () => {
    expect(
      classifyEiRename({
        legalName: 'EVIMERIA',
        oldFirstName: 'Anthony',
        oldLastName: 'Maietta',
      }),
    ).toBe('ignore');
  });

  it('SARL partagée par plusieurs apprenants : « Habitat Concept Immo » → ignore', () => {
    expect(
      classifyEiRename({
        legalName: 'Habitat Concept Immo',
        oldFirstName: 'Sophie',
        oldLastName: 'Molinier',
      }),
    ).toBe('ignore');
  });

  it('lien erroné vers l’entreprise d’un tiers : « Wilfried GILBERT » → ignore', () => {
    expect(
      classifyEiRename({
        legalName: 'Wilfried GILBERT',
        oldFirstName: 'Marion',
        oldLastName: 'Maino',
      }),
    ).toBe('ignore');
  });

  it('nom de naissance légitime : « LOUCHART JEAN-DOAT Sylvie » → warn, pas rename', () => {
    // La raison sociale porte le nom de naissance en plus — c'est le nom LÉGAL
    // de l'entreprise, on alerte mais on n'écrase pas.
    expect(
      classifyEiRename({
        legalName: 'LOUCHART JEAN-DOAT Sylvie',
        oldFirstName: 'sylvie',
        oldLastName: 'JEAN-DOAT',
      }),
    ).toBe('warn');
  });

  it('variante avec suffixe : « ADRIEN MONFORT EI » → warn', () => {
    expect(
      classifyEiRename({
        legalName: 'ADRIEN MONFORT EI',
        oldFirstName: 'Adrien',
        oldLastName: 'Monfort',
      }),
    ).toBe('warn');
  });

  it('un prénom courant ne doit pas déclencher d’alerte sur une société sans rapport', () => {
    // Sans la restriction au nom de famille, « Sophie Molinier » ferait sonner
    // « SOPHIE IMMOBILIER ». On teste que ce n'est pas le cas.
    expect(
      classifyEiRename({
        legalName: 'SOPHIE IMMOBILIER',
        oldFirstName: 'Sophie',
        oldLastName: 'Molinier',
      }),
    ).toBe('ignore');
  });

  it('raison sociale vide → ignore (rien à corriger)', () => {
    expect(
      classifyEiRename({ legalName: '', oldFirstName: 'Jean', oldLastName: 'Dupont' }),
    ).toBe('ignore');
  });

  it('un nom de famille très court ne sert pas de déclencheur d’alerte', () => {
    // « LI » apparaîtrait dans trop de raisons sociales pour être un signal.
    expect(
      classifyEiRename({ legalName: 'LI PARTNERS CONSEIL', oldFirstName: 'Ana', oldLastName: 'Li' }),
    ).toBe('ignore');
  });
});
