import { describe, it, expect } from 'vitest';
import {
  fallbackLieuOf,
  mentionsLieuManquantes,
  villeLieuFormation,
} from '../format-lieu';

/**
 * AGEFICE 2026-08-28 — demande de complément sur une prise en charge :
 * « Le document Feuille(s) d'émargement est incomplet : raison sociale du lieu
 * de formation ».
 *
 * Trois mentions font foi sur l'émargement : raison sociale, code postal,
 * ville. Ces tests verrouillent la règle appliquée à la fois à la saisie d'un
 * lieu et au blocage du pack de clôture.
 */

describe('mentionsLieuManquantes', () => {
  it('accepte un lieu portant raison sociale, CP et ville', () => {
    expect(
      mentionsLieuManquantes({
        legalName: "SARL L'Agence Signature",
        name: 'Agence Nice Centre',
        address: { street: '12 rue Masséna', postalCode: '06000', city: 'Nice' },
      }),
    ).toEqual([]);
  });

  it('signale la raison sociale manquante — le motif exact du refus AGEFICE', () => {
    expect(
      mentionsLieuManquantes({
        legalName: null,
        name: 'Nice — Akorimmo',
        address: { street: 'Akorimmo, 63 bd de Cessole', postalCode: '06100', city: 'Nice' },
      }),
    ).toEqual(['raison sociale']);
  });

  it("ne prend PAS le nom d'usage pour une raison sociale", () => {
    // 53 des 55 lieux en base au 28/08/2026 ont ce profil : l'enseigne est
    // noyée dans `name` (« Vitrolles — Nestenn »), jamais dans `legalName`.
    // Accepter `name` reviendrait à retomber dans le refus AGEFICE.
    const manquantes = mentionsLieuManquantes({
      legalName: '   ',
      name: 'Vitrolles — Nestenn',
      address: { postalCode: '13127', city: 'Vitrolles' },
    });
    expect(manquantes).toContain('raison sociale');
  });

  it('signale CP et ville manquants', () => {
    expect(
      mentionsLieuManquantes({
        legalName: 'SAS Start Academy',
        name: 'Salle Bleue',
        address: { street: '618 bd Jean Maurel' },
      }),
    ).toEqual(['code postal', 'ville']);
  });

  it('signale les trois mentions quand le lieu est absent', () => {
    expect(mentionsLieuManquantes(null)).toEqual([
      'raison sociale',
      'code postal',
      'ville',
    ]);
  });

  it("traite une adresse en chaîne libre comme dépourvue de CP et de ville", () => {
    // `address` peut être une chaîne sur de vieux enregistrements : on ne
    // devine pas, on demande la saisie structurée.
    expect(
      mentionsLieuManquantes({
        legalName: 'EXPERTA',
        name: 'EXPERTA',
        address: "5 place de l'Ile de Beauté, 06300 Nice",
      }),
    ).toEqual(['code postal', 'ville']);
  });
});

describe('villeLieuFormation — mention « Fait à … »', () => {
  it("prend la ville de l'adresse structurée", () => {
    expect(
      villeLieuFormation(
        { address: { street: '12 rue Masséna', postalCode: '06000', city: 'Nice' } },
        'Cagnes-sur-Mer',
      ),
    ).toBe('Nice');
  });

  it("extrait la ville d'une adresse en chaîne libre, après le code postal", () => {
    expect(
      villeLieuFormation({ address: '5 place de l’Ile de Beauté, 06300 Nice' }, 'Cagnes-sur-Mer'),
    ).toBe('Nice');
  });

  it('retombe sur la ville du siège quand le lieu est absent ou muet', () => {
    expect(villeLieuFormation(null, 'Cagnes-sur-Mer')).toBe('Cagnes-sur-Mer');
    expect(villeLieuFormation({ name: 'Salle Bleue' }, 'Cagnes-sur-Mer')).toBe(
      'Cagnes-sur-Mer',
    );
  });
});

describe('fallbackLieuOf', () => {
  it("porte la raison sociale de l'OF, que `addressFull` seul ne donne pas", () => {
    expect(
      fallbackLieuOf({
        name: 'Start Academy',
        addressFull: '12 avenue des Camélias, 06800 Cagnes-sur-Mer',
      }),
    ).toBe('Start Academy, 12 avenue des Camélias, 06800 Cagnes-sur-Mer');
  });
});
