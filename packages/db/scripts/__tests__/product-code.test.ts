/**
 * La PROVENANCE d'un code produit — pas sa forme.
 *
 * ## Ce que ce test garde, et ce qu'il ne garde SURTOUT pas
 *
 * Il ne contraint **aucun format**. L'hétérogénéité des codes du catalogue est
 * VOULUE : le `Custom ID` SmartOF est la référence qui permet de remonter au
 * dossier d'origine, et un `CHECK` en base rejetterait des codes parfaitement
 * légitimes (`FRM-0001`, `PROD-055`, `PROD-00661`). Relevé du 11/09/2026 à
 * 19:58 CEST sur la prod : 41 codes, 34 en `PROD-*` et 7 en `FRM-*`.
 *
 * Ce qu'il garde, c'est la frontière de provenance :
 *
 *  - code venu du **fichier source** → **verbatim**, c'est la traçabilité ;
 *  - code **fabriqué par nous** → **séquence `PROD-NNNN`**, comme les trois
 *    autres sites qui en fabriquent (`crud-edits.ts` ~l.823,
 *    `import-diag-catalog.ts` ~l.217), et **jamais** un fragment hexadécimal.
 *
 * ## Pourquoi « jamais d'hexadécimal » n'est pas un caprice d'esthétique
 *
 * `PROD-7a78c8b2` n'est pas lisible, ne se dicte pas au téléphone, et surtout
 * il est **invisible au séquenceur**, qui ne lit que `/^PROD-0*(\d+)$/`. Un code
 * fabriqué qui ne rentre pas dans la série ne fait pas avancer la série : il
 * s'accumule à côté.
 */

import { describe, it, expect } from 'vitest';

import { resolveProductCode } from '../lib/product-code.js';

/**
 * Les 41 codes relevés en prod le 11/09/2026 à 19:58 CEST
 * (`https://qualiof.vercel.app/catalogue`, cf. STATE.md « À savoir AVANT
 * d'agir » point 1). On ne présume AUCUN préfixe : les 7 `FRM-*` sont les
 * journées Faros de D-25, et un relevé qui les aurait filtrés sur `PROD-`
 * aurait rendu 34.
 */
const CODES_PROD_11_09 = [
  'FRM-0001', 'FRM-0002', 'FRM-0003', 'FRM-0004', 'FRM-0005', 'FRM-0006', 'FRM-0007',
  'PROD-0001', 'PROD-0003', 'PROD-0041', 'PROD-0042', 'PROD-0043', 'PROD-0044', 'PROD-047',
  'PROD-053', 'PROD-055', 'PROD-0057', 'PROD-0058', 'PROD-0059', 'PROD-0060', 'PROD-0061',
  'PROD-0062', 'PROD-0063', 'PROD-0064', 'PROD-0065', 'PROD-0066', 'PROD-00661', 'PROD-0662',
  'PROD-0663', 'PROD-0667', 'PROD-0668', 'PROD-0670', 'PROD-0671', 'PROD-0672', 'PROD-0673',
  'PROD-0674', 'PROD-0675', 'PROD-7a78c8b2', 'PROD-c0c85e08', 'PROD-cdd22466', 'PROD-f8be726b',
] as const;

/** Le repli d'origine : les 8 premiers caractères d'un UID SmartOF. */
const UID_SMARTOF = '7a78c8b2-0f41-4d3e-9c5a-2b6e8f1d4a07';

describe('resolveProductCode — la provenance décide, pas la forme', () => {
  // ── Le fichier source fait foi : verbatim, quelle que soit la forme ────────

  it('rend VERBATIM un Custom ID, même quand sa forme sort de la convention maison', () => {
    const pris = new Set<string>(CODES_PROD_11_09);

    // Trois formes réellement présentes en prod, aucune conforme à PROD-NNNN.
    expect(resolveProductCode({ uid: UID_SMARTOF, customId: 'FRM-0001' }, pris)).toBe('FRM-0001');
    expect(resolveProductCode({ uid: UID_SMARTOF, customId: 'PROD-047' }, pris)).toBe('PROD-047');
    expect(resolveProductCode({ uid: UID_SMARTOF, customId: 'PROD-00661' }, pris)).toBe(
      'PROD-00661',
    );
  });

  it('rend VERBATIM un Custom ID qui RESSEMBLE à un repli hexadécimal', () => {
    // Le discriminant du test : à la forme, ce code est indistinguable d'un
    // code fabriqué. Seule la provenance les sépare. Une garde écrite sur le
    // FORMAT le rejetterait — et perdrait la traçabilité SmartOF.
    const pris = new Set<string>(CODES_PROD_11_09);
    expect(pris.has('PROD-7a78c8b2')).toBe(true); // il EST au catalogue

    expect(resolveProductCode({ uid: UID_SMARTOF, customId: 'PROD-7a78c8b2' }, pris)).toBe(
      'PROD-7a78c8b2',
    );
  });

  // ── Ce que NOUS fabriquons suit la séquence maison ─────────────────────────

  it('FABRIQUE un PROD-NNNN quand la ligne source ne porte pas de Custom ID', () => {
    const pris = new Set<string>(CODES_PROD_11_09);

    const code = resolveProductCode({ uid: UID_SMARTOF, customId: null }, pris);

    // Pas de fragment hexadécimal : le code doit être lisible ET séquençable.
    expect(code).not.toBe('PROD-7a78c8b2');
    expect(code).toMatch(/^PROD-\d{4,}$/);
  });

  it('continue la série AU-DESSUS du plus grand numéro déjà pris', () => {
    const pris = new Set<string>(CODES_PROD_11_09);
    // Prémisse assertée, pas supposée (quick.md §4 ter) : le maximum du
    // catalogue du 11/09 est 675, porté par `PROD-0675`.
    expect(pris.has('PROD-0675')).toBe(true);
    expect(pris.has('PROD-0676')).toBe(false);

    expect(resolveProductCode({ uid: UID_SMARTOF, customId: null }, pris)).toBe('PROD-0676');
  });

  it('lit PROD-00661 comme 661, exactement comme le séquenceur de crud-edits.ts', () => {
    // Deux codes distincts pour l'œil, un seul numéro pour le séquenceur
    // (`/^PROD-0*(\d+)$/`). Le constat est consigné dans crud-edits.ts et dans
    // STATE.md ; ici, on fige le fait que l'import le lit PAREIL — deux
    // lectures divergentes du même code seraient le vrai danger.
    const pris = new Set<string>(['PROD-00661']);

    expect(resolveProductCode({ uid: UID_SMARTOF, customId: null }, pris)).toBe('PROD-0662');
  });

  it('donne deux numéros DISTINCTS à deux lignes sans Custom ID du même run', () => {
    const pris = new Set<string>(CODES_PROD_11_09);

    const premier = resolveProductCode({ uid: UID_SMARTOF, customId: null }, pris);
    pris.add(premier); // ce que fait l'appelant après chaque ligne
    const second = resolveProductCode(
      { uid: 'c0c85e08-1111-2222-3333-444455556666', customId: null },
      pris,
    );

    expect(premier).toBe('PROD-0676');
    expect(second).toBe('PROD-0677');
  });

  it('SAUTE un numéro déjà pris plutôt que de le réécrire', () => {
    // Un identifiant qui a servi ne se réécrit pas : c'est l'anti-vidage
    // appliqué aux identifiants. `PROD-0676` existe déjà ici — la fabrication
    // doit passer au suivant, pas le revendiquer.
    const pris = new Set<string>([...CODES_PROD_11_09, 'PROD-0676']);

    expect(resolveProductCode({ uid: UID_SMARTOF, customId: null }, pris)).toBe('PROD-0677');
  });

  // ── Un Custom ID VIDE n'est pas un Custom ID ABSENT ────────────────────────

  it("REFUSE un Custom ID présent mais VIDE — c'est une erreur de source", () => {
    // La distinction est tout le sujet. `customId: null` = la colonne n'est pas
    // renseignée : provenance « nous », la série maison s'applique, c'est
    // normal. `customId: ''` = la colonne EXISTE et ne porte rien : la source
    // est cassée, et fabriquer un code par-dessus enterre le défaut.
    //
    // C'est ce que faisait le `||` de `import-from-smartof.ts` (l.695) :
    // `p.customId?.trim() || 'PROD-…'` traitait la chaîne vide exactement
    // comme l'absence, en silence.
    const pris = new Set<string>(CODES_PROD_11_09);

    expect(() => resolveProductCode({ uid: UID_SMARTOF, customId: '' }, pris)).toThrow(
      /Custom ID/i,
    );
  });

  it("REFUSE un Custom ID qui n'est QUE des espaces", () => {
    // Le cas réel d'un export tableur : une cellule « vidée » garde souvent une
    // espace. Sans ce cas, la garde se contourne d'un coup de barre d'espace.
    const pris = new Set<string>(CODES_PROD_11_09);

    expect(() => resolveProductCode({ uid: UID_SMARTOF, customId: '   ' }, pris)).toThrow(
      /Custom ID/i,
    );
  });

  it("NOMME la ligne source dans le refus — sinon le message est inutilisable", () => {
    // Un import qui s'arrête sur « Custom ID vide » sans dire QUELLE ligne
    // oblige à relire le classeur entier. L'UID est la seule adresse stable de
    // la ligne source.
    const pris = new Set<string>(CODES_PROD_11_09);

    expect(() => resolveProductCode({ uid: UID_SMARTOF, customId: '' }, pris)).toThrow(
      new RegExp(UID_SMARTOF),
    );
  });

  it("DISTINGUE le vide de l'absence — `null` fabrique toujours, lui", () => {
    // Le test discriminant (§4 ter) : si quelqu'un « corrige » le refus en
    // rejetant aussi l'absence, l'import cesserait de fabriquer le moindre
    // code et tout produit sans Custom ID serait perdu. Les deux comportements
    // doivent coexister, et c'est ce que ce test fige.
    const pris = new Set<string>(CODES_PROD_11_09);

    expect(resolveProductCode({ uid: UID_SMARTOF, customId: null }, pris)).toBe('PROD-0676');
  });

  // ── Le relevé lui-même, puisque le test le porte en dur ────────────────────

  it('le relevé du 11/09 porte bien 41 codes distincts, dont 7 FRM-*', () => {
    const distincts = new Set<string>(CODES_PROD_11_09);
    expect(distincts.size).toBe(41);
    expect([...distincts].filter((c) => c.startsWith('FRM-'))).toHaveLength(7);
    expect([...distincts].filter((c) => c.startsWith('PROD-'))).toHaveLength(34);
  });
});
