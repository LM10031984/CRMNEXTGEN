import { describe, it, expect } from 'vitest';
import { formatLieuFormation } from '../format-lieu';

/**
 * Quick 260821-md8 — composition dédoublonnée du lieu de formation.
 *
 * Défaut constaté le 21/08 sur la convention EXPERTA : le lieu sortait
 * « EXPERTA — EXPERTA, 5 place de l'Ile de Beauté… ». La raison sociale du
 * lieu et son nom sont identiques quand la formation se tient dans les locaux
 * du client — cas dominant de l'intra-entreprise.
 *
 * Le cas légitime « SARL XYZ — Agence Nice Centre » (documenté dans le schéma
 * Prisma) doit survivre : on ne casse pas la composition, on la dédoublonne.
 */

const FALLBACK = '12 avenue des Camélias, 06800 Cagnes-sur-Mer';

describe('formatLieuFormation — dédoublonnage', () => {
  it('ne répète pas la raison sociale quand elle est identique au nom (cas EXPERTA)', () => {
    expect(
      formatLieuFormation(
        {
          legalName: 'EXPERTA',
          name: 'EXPERTA',
          address: { street: "5 place de l'Ile de Beauté", postalCode: '06300', city: 'Nice' },
        },
        FALLBACK,
      ),
    ).toBe("EXPERTA, 5 place de l'Ile de Beauté, 06300 Nice");
  });

  it('ne répète pas la rue quand le nom du lieu EST la rue', () => {
    expect(
      formatLieuFormation(
        {
          legalName: null,
          name: '12 rue de la Paix',
          address: { street: '12 rue de la Paix', postalCode: '06000', city: 'Nice' },
        },
        FALLBACK,
      ),
    ).toBe('12 rue de la Paix, 06000 Nice');
  });

  it('compare sans tenir compte de la casse ni des accents', () => {
    expect(
      formatLieuFormation(
        {
          legalName: "Résidence de l'Île",
          name: "RESIDENCE DE L'ILE",
          address: { street: '3 chemin du Port', postalCode: '06300', city: 'NICE' },
        },
        FALLBACK,
      ),
    ).toBe("Résidence de l'Île, 3 chemin du Port, 06300 NICE");
  });

  it('garde le segment le plus complet quand l’un contient l’autre', () => {
    expect(
      formatLieuFormation({ legalName: 'EXPERTA', name: 'EXPERTA SAS', address: null }, FALLBACK),
    ).toBe('EXPERTA SAS');
  });

  it('préserve le cas légitime « SARL XYZ — Agence Nice Centre »', () => {
    // La ville « Nice » est contenue dans « Agence Nice Centre » : elle doit
    // malgré tout figurer dans l'adresse. Le dédoublonnage ne s'applique aux
    // recouvrements partiels qu'entre raison sociale et nom du lieu.
    expect(
      formatLieuFormation(
        {
          legalName: 'SARL XYZ',
          name: 'Agence Nice Centre',
          address: { street: '12 rue X', postalCode: '06000', city: 'Nice' },
        },
        FALLBACK,
      ),
    ).toBe('SARL XYZ — Agence Nice Centre, 12 rue X, 06000 Nice');
  });

  it('accepte une adresse déjà composée en chaîne', () => {
    expect(
      formatLieuFormation(
        { legalName: 'EXPERTA', name: 'EXPERTA', address: "5 place de l'Ile de Beauté, 06300 Nice" },
        FALLBACK,
      ),
    ).toBe("EXPERTA, 5 place de l'Ile de Beauté, 06300 Nice");
  });

  it('ne laisse jamais un segment vide produire une virgule orpheline', () => {
    expect(
      formatLieuFormation(
        { legalName: '  ', name: 'Salle Bleue', address: { street: '', postalCode: '06000', city: 'Nice' } },
        FALLBACK,
      ),
    ).toBe('Salle Bleue, 06000 Nice');
  });

  it('retombe sur le siège de l’OF quand le lieu est absent ou vide', () => {
    expect(formatLieuFormation(null, FALLBACK)).toBe(FALLBACK);
    expect(formatLieuFormation(undefined, FALLBACK)).toBe(FALLBACK);
    expect(formatLieuFormation({}, FALLBACK)).toBe(FALLBACK);
    expect(formatLieuFormation({ legalName: '', name: '', address: {} }, FALLBACK)).toBe(FALLBACK);
  });

  it('n’invente rien : un lieu sans adresse rend juste son nom', () => {
    expect(formatLieuFormation({ legalName: null, name: 'Salle Bleue' }, FALLBACK)).toBe(
      'Salle Bleue',
    );
  });
});

/**
 * Abréviations postales françaises — portées ici le 11/09/2026 depuis la copie
 * inline du générateur AGEFICE, au moment de la raccorder à cette source
 * unique. Sans elles, « Nice — Agence, 12 av des Fleurs » et la rue
 * « 12 avenue des Fleurs » passaient pour deux segments différents, et
 * l'adresse s'imprimait deux fois d'affilée sur le Cerfa.
 *
 * Le gain profite désormais à TOUS les documents (émargement, convention,
 * pack de clôture), et plus au seul formulaire AGEFICE.
 *
 * Test de puissance : retirer les remplacements d'abréviations de `normalize`
 * fait virer ROUGE « ne répète pas une rue abrégée dans le nom du lieu ».
 */
describe('formatLieuFormation — abréviations postales', () => {
  it('ne répète pas une rue abrégée dans le nom du lieu', () => {
    expect(
      formatLieuFormation(
        {
          legalName: 'AKORIMMO',
          name: '12 av des Fleurs',
          address: { street: '12 avenue des Fleurs', postalCode: '06000', city: 'Nice' },
        },
        'repli',
      ),
    ).toBe('AKORIMMO — 12 av des Fleurs, 06000 Nice');
  });

  it('traite bd, bld et boul comme boulevard', () => {
    expect(
      formatLieuFormation(
        { legalName: 'AKORIMMO', name: '63 bd de Cessole', address: { street: '63 Boulevard de Cessole' } },
        'repli',
      ),
    ).toBe('AKORIMMO — 63 bd de Cessole');
  });

  it('traite st comme saint', () => {
    expect(
      formatLieuFormation(
        { legalName: 'Agence', name: '4 place St Roch', address: { street: '4 Place Saint Roch' } },
        'repli',
      ),
    ).toBe('Agence — 4 place St Roch');
  });

  it('laisse une vraie adresse différente s’ajouter normalement', () => {
    expect(
      formatLieuFormation(
        { legalName: 'AKORIMMO', name: 'Agence Nice Nord', address: { street: '63 bd de Cessole' } },
        'repli',
      ),
    ).toBe('AKORIMMO — Agence Nice Nord, 63 bd de Cessole');
  });
});
