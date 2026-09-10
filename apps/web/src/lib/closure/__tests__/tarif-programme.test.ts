import { describe, it, expect } from 'vitest';
import { resoudreTarifProgramme, resoudrePrixProgramme } from '../tarif-programme';
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

/**
 * Correction du 02/09 (Laurent) : « c'est un contrat avec une entreprise donc
 * le montant est pas par stagiaire, il devrait afficher 2 200 € et pas 1 100 €
 * par stagiaire. La règle il prend le montant total point. »
 *
 * Cas réel SES-0109 : deux salariées de l'AGENCE DE L'OLIVIER à 1 100 € chacune.
 * La convention engage l'entreprise sur 2 200 € — le programme doit dire 2 200 €.
 *
 * Test de puissance : remplacer la somme par `tarif × effectif` passe encore
 * ici, mais casse « additionne les prix RÉELS » (des salariés à prix différents).
 */
describe('resoudrePrixProgramme — total entreprise vs prix par stagiaire', () => {
  const salarie = (priceHT: number, sponsorOrgId = 'org-olivier') => ({
    priceHT,
    sponsorOrgId,
    couvertParConvention: true,
  });
  const autoPayeur = (priceHT: number, sponsorOrgId = 'org-ei') => ({
    priceHT,
    sponsorOrgId,
    couvertParConvention: false,
  });

  it('SES-0109 : deux salariées à 1 100 € → 2 200 € au TOTAL', () => {
    expect(
      resoudrePrixProgramme({
        inscrits: [salarie(1100), salarie(1100)],
        tarifSession: 1100,
        prixProduit: 2500,
      }),
    ).toEqual({ mode: 'TOTAL_ENTREPRISE', montantHT: 2200 });
  });

  it('additionne les prix RÉELS, pas tarif × effectif', () => {
    expect(
      resoudrePrixProgramme({
        inscrits: [salarie(1500), salarie(700)],
        tarifSession: 1100,
        prixProduit: 2500,
      }),
    ).toEqual({ mode: 'TOTAL_ENTREPRISE', montantHT: 2200 });
  });

  it('une salariée seule : le total vaut son prix, mais reste un total', () => {
    const r = resoudrePrixProgramme({
      inscrits: [salarie(2500)],
      tarifSession: 2500,
      prixProduit: 2500,
    });
    expect(r).toEqual({ mode: 'TOTAL_ENTREPRISE', montantHT: 2500 });
  });

  it('session inter d’auto-payeurs : prix PAR STAGIAIRE, jamais un total absurde', () => {
    expect(
      resoudrePrixProgramme({
        inscrits: [autoPayeur(2500, 'ei-1'), autoPayeur(2500, 'ei-2'), autoPayeur(2500, 'ei-3')],
        tarifSession: 2500,
        prixProduit: 2500,
      }),
    ).toEqual({ mode: 'PAR_STAGIAIRE', montantHT: 2500 });
  });

  it('session MIXTE (salariés + agent commercial) : on reste par stagiaire', () => {
    expect(
      resoudrePrixProgramme({
        inscrits: [salarie(1100), autoPayeur(1100, 'ei-agent')],
        tarifSession: 1100,
        prixProduit: 2500,
      }).mode,
    ).toBe('PAR_STAGIAIRE');
  });

  it('deux entreprises sur la même session : pas de total, il ne concernerait qu’une partie', () => {
    expect(
      resoudrePrixProgramme({
        inscrits: [salarie(1100, 'org-a'), salarie(1100, 'org-b')],
        tarifSession: 1100,
        prixProduit: 2500,
      }).mode,
    ).toBe('PAR_STAGIAIRE');
  });

  it('un prix manquant ⇒ pas de total (il sous-estimerait l’engagement)', () => {
    expect(
      resoudrePrixProgramme({
        inscrits: [salarie(1100), salarie(0)],
        tarifSession: 1100,
        prixProduit: 2500,
      }).mode,
    ).toBe('PAR_STAGIAIRE');
  });

  it('session sans inscrit ⇒ prix catalogue par stagiaire', () => {
    expect(
      resoudrePrixProgramme({ inscrits: [], tarifSession: null, prixProduit: 2500 }),
    ).toEqual({ mode: 'PAR_STAGIAIRE', montantHT: 2500 });
  });
});
