import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseMls, planMls, mlsPhone, mlsKey } from '../mls-import';
export function fixture(rows: unknown[][], directors: unknown[][] = []) {
  const b = XLSX.utils.book_new();
  const header = ["Nom de l'agence", 'Prénom', 'Nom', 'email', 'mobile', 'Ville', 'Titre'];
  for (const [name, data] of [
    ['Users MLS Côte dAzur', rows],
    ['Dirigeant', directors],
    ['Collaborateurs', []],
  ] as const)
    XLSX.utils.book_append_sheet(b, XLSX.utils.aoa_to_sheet([header, ...data]), name);
  return XLSX.write(b, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
const alice = [
  'Azur',
  'Alice',
  'Martin',
  'ALICE@EXAMPLE.COM',
  '06 12 34 56 78',
  'Nice',
  'Dirigeant',
];
describe('import MLS', () => {
  it('normalise accents, email et téléphone, regroupe les onglets et conserve leurs lignes', () => {
    const p = parseMls(fixture([alice], [[' AZUR ', ...alice.slice(1)]]));
    expect(p.rowsRead).toBe(2);
    expect(p.duplicates).toBe(1);
    expect(p.contacts[0]).toMatchObject({
      email: 'alice@example.com',
      phone: '+33612345678',
      segments: ['agent', 'dirigeant'],
      refs: [
        { sheet: 'Users MLS Côte dAzur', row: 2 },
        { sheet: 'Dirigeant', row: 2 },
      ],
    });
    expect(mlsPhone(33612345678)).toBe('+33612345678');
    expect(mlsKey(' Côte   d’Azur ')).toBe('cote d azur');
  });
  it('ne choisit pas arbitrairement entre deux téléphones divergents', () => {
    const p = parseMls(fixture([alice, [...alice.slice(0, 4), '0600000000', ...alice.slice(5)]]));
    expect(p.contacts).toHaveLength(0);
    expect(p.issues).toHaveLength(1);
  });
  it('conserve les références des lignes vides intermédiaires', () => {
    const p = parseMls(fixture([[], alice]));
    expect(p.contacts[0]?.refs[0]?.row).toBe(3);
  });
  it('signale les noms manquants et adresses email invalides', () => {
    const p = parseMls(
      fixture([
        ['Azur', '', 'Martin', 'a@example.com'],
        ['Azur', 'Alice', 'Martin', 'bad'],
      ]),
    );
    expect(p.contacts).toHaveLength(0);
    expect(p.issues).toHaveLength(2);
  });
  it('une réexécution ne recrée aucune fiche, même si le contact a été corrigé ensuite', () => {
    const p = parseMls(fixture([alice]));
    const c = p.contacts[0]!;
    expect(
      planMls(
        p,
        [
          {
            id: '1',
            importKey: c.key,
            firstName: 'Correction',
            lastName: 'Martin',
            email: null,
            phone: null,
          },
        ],
        [],
      ).create,
    ).toHaveLength(0);
  });
  it('rapproche aussi les coordonnées normalisées déjà présentes', () => {
    const p = parseMls(fixture([alice]));
    expect(
      planMls(
        p,
        [
          {
            id: '1',
            importKey: null,
            firstName: 'Alice',
            lastName: 'Martin',
            email: null,
            phone: '0612345678',
          },
        ],
        [],
      ).ignored,
    ).toHaveLength(1);
  });
  it('ne fusionne pas deux identités partageant une boîte agence', () => {
    const p = parseMls(
      fixture([
        alice,
        ['Azur', 'Bob', 'Durand', 'alice@example.com', '0600000000', 'Nice', 'Agent'],
      ]),
    );
    expect(planMls(p, [], []).create).toHaveLength(0);
    expect(planMls(p, [], []).ignored).toHaveLength(2);
  });
  it('ne choisit pas un point de vente quand plusieurs adresses existent', () => {
    const p = parseMls(fixture([alice]));
    const a = [
      { id: '1', legalName: 'Azur', address: { city: 'Nice', street: '1 rue A' } },
      { id: '2', legalName: 'Azur', address: { city: 'Nice', street: '2 rue B' } },
    ];
    expect(planMls(p, [], a).create).toHaveLength(0);
  });
  it('rattache une agence existante unique sans en créer une autre', () => {
    const p = parseMls(fixture([alice]));
    const plan = planMls(p, [], [{ id: 'org', legalName: 'AZUR', address: { city: 'Nice' } }]);
    expect(plan.create[0]?.organizationId).toBe('org');
    expect(plan.newAgencies).toHaveLength(0);
  });
});
