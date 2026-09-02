import { describe, it, expect } from 'vitest';
import { resoudreTarifProgramme } from '../tarif-programme';
import { Prisma } from '@qualiof/db';

/**
 * Constat du 02/09 sur SES-0109 : le programme annonçait « 2 500 € HT par
 * stagiaire » pendant que la convention du MÊME dossier OPCO annonçait 2 200 €
 * pour deux salariés. Le tarif consenti doit gagner — c'est celui que reprennent
 * la convention et la facture.
 */
describe('resoudreTarifProgramme', () => {
  it('le tarif de la session l’emporte sur le catalogue', () => {
    expect(resoudreTarifProgramme(1100, 2500)).toBe(1100);
  });

  it('sans tarif de session, on retombe sur le catalogue', () => {
    expect(resoudreTarifProgramme(null, 2500)).toBe(2500);
    expect(resoudreTarifProgramme(undefined, 2500)).toBe(2500);
  });

  it('un tarif de session à zéro ne rend PAS le programme gratuit', () => {
    expect(resoudreTarifProgramme(0, 2500)).toBe(2500);
  });

  it('rend 0 quand il n’y a de tarif nulle part — l’appelant refuse alors', () => {
    expect(resoudreTarifProgramme(null, 0)).toBe(0);
    expect(resoudreTarifProgramme(null, null)).toBe(0);
  });

  it('accepte les Decimal de Prisma, pas seulement les nombres', () => {
    expect(resoudreTarifProgramme(new Prisma.Decimal('1100.00'), new Prisma.Decimal('2500'))).toBe(1100);
    expect(resoudreTarifProgramme(null, new Prisma.Decimal('2500'))).toBe(2500);
  });

  it('ignore une valeur illisible plutôt que de produire NaN', () => {
    expect(resoudreTarifProgramme('pas un nombre', 2500)).toBe(2500);
  });
});
