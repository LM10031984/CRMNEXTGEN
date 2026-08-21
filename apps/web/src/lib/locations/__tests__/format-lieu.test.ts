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
