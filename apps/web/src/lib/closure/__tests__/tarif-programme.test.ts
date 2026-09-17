import { describe, it, expect } from 'vitest';
import {
  resoudreTarifProgramme,
  resoudrePrixProgramme,
  refusForfaitNonConfirme,
  programmeDoitEtrePropreALaSession,
  prixModeDuProduit,
} from '../tarif-programme';
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
 * LE MODE DU PRODUIT DÉCIDE, LA SESSION CONFIRME (17/09/2026).
 *
 * Ce qui change par rapport au 02/09. Le mode se DÉDUISAIT de la composition de
 * la session : tous sous convention, un seul commanditaire, tous avec un prix
 * ⇒ total. Un produit vendu au forfait et un produit vendu à la place étaient
 * donc indiscernables tant qu'on ne regardait pas qui s'était inscrit — et le
 * catalogue, qui n'a pas d'inscrits, ne pouvait rien annoncer de juste.
 *
 * `TrainingProduct.pricingMode` porte désormais la décision. Les conditions
 * n'ont pas changé, leur RÔLE si : elles confirment, et quand elles ne
 * confirment pas, ce n'est plus « alors c'est un prix par tête » mais un REFUS
 * NOMMÉ — annoncer un prix de place sur un produit vendu au forfait serait faux
 * dans l'enveloppe du financeur.
 *
 * Test de puissance : rendre au mode produit un rôle consultatif — décider
 * encore par la composition — fait virer ROUGE « un produit vendu à la place
 * reste par stagiaire, même sur une salle de salariés ».
 */
describe('resoudrePrixProgramme — le mode du produit décide', () => {
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
  const FORFAIT = 'FORFAIT_ENTREPRISE' as const;
  const PLACE = 'PAR_STAGIAIRE' as const;

  it('SES-0109 : deux salariées à 1 100 € sur un produit au forfait → 2 200 € au TOTAL', () => {
    expect(
      resoudrePrixProgramme({
        modeProduit: FORFAIT,
        inscrits: [salarie(1100), salarie(1100)],
        tarifSession: 1100,
        prixProduit: 2500,
      }),
    ).toEqual({ mode: 'TOTAL_ENTREPRISE', montantHT: 2200 });
  });

  it('additionne les prix RÉELS, pas tarif × effectif', () => {
    expect(
      resoudrePrixProgramme({
        modeProduit: FORFAIT,
        inscrits: [salarie(1500), salarie(700)],
        tarifSession: 1100,
        prixProduit: 2500,
      }),
    ).toEqual({ mode: 'TOTAL_ENTREPRISE', montantHT: 2200 });
  });

  it('une salariée seule : le total vaut son prix, mais reste un total', () => {
    expect(
      resoudrePrixProgramme({
        modeProduit: FORFAIT,
        inscrits: [salarie(2500)],
        tarifSession: 2500,
        prixProduit: 2500,
      }),
    ).toEqual({ mode: 'TOTAL_ENTREPRISE', montantHT: 2500 });
  });

  it('un produit vendu à la place reste PAR STAGIAIRE, même sur une salle de salariés', () => {
    // LE test de la bascule : cette salle cochait les trois conditions et
    // donnait un total avant le 17/09. Le produit dit « à la place », donc
    // c'est par stagiaire, et la salle n'a plus voix au chapitre.
    expect(
      resoudrePrixProgramme({
        modeProduit: PLACE,
        inscrits: [salarie(1100), salarie(1100)],
        tarifSession: 1100,
        prixProduit: 2500,
      }),
    ).toEqual({ mode: 'PAR_STAGIAIRE', montantHT: 1100 });
  });

  it('session inter d’auto-payeurs : prix PAR STAGIAIRE', () => {
    expect(
      resoudrePrixProgramme({
        modeProduit: PLACE,
        inscrits: [autoPayeur(2500, 'ei-1'), autoPayeur(2500, 'ei-2')],
        tarifSession: 2500,
        prixProduit: 2500,
      }),
    ).toEqual({ mode: 'PAR_STAGIAIRE', montantHT: 2500 });
  });

  it('produit au forfait SANS inscrit : le montant est celui du catalogue', () => {
    // Le cas du programme produit, et d'une session pas encore remplie.
    expect(
      resoudrePrixProgramme({
        modeProduit: FORFAIT,
        inscrits: [],
        tarifSession: null,
        prixProduit: 2500,
      }),
    ).toEqual({ mode: 'TOTAL_ENTREPRISE', montantHT: 2500 });
  });

  it('produit à la place sans inscrit : catalogue par stagiaire', () => {
    expect(
      resoudrePrixProgramme({
        modeProduit: PLACE,
        inscrits: [],
        tarifSession: null,
        prixProduit: 2500,
      }),
    ).toEqual({ mode: 'PAR_STAGIAIRE', montantHT: 2500 });
  });
});

/**
 * Le REFUS NOMMÉ — ce qui remplace le repli silencieux sur le prix par tête.
 *
 * Avant, une session qui ne confirmait pas retombait sur « par stagiaire » sans
 * rien dire. Sur un produit vendu au forfait, c'est annoncer un prix de place
 * dans une enveloppe OPCO. On refuse, et on nomme ce qui cloche à qui peut le
 * corriger.
 */
describe('refusForfaitNonConfirme', () => {
  const salarie = (priceHT: number, sponsorOrgId = 'org-a') => ({
    priceHT,
    sponsorOrgId,
    couvertParConvention: true,
  });
  const autoPayeur = (priceHT: number, sponsorOrgId = 'org-ei') => ({
    priceHT,
    sponsorOrgId,
    couvertParConvention: false,
  });
  const FORFAIT = 'FORFAIT_ENTREPRISE' as const;

  it('se tait pour un produit vendu à la place, quelle que soit la salle', () => {
    expect(
      refusForfaitNonConfirme({
        modeProduit: 'PAR_STAGIAIRE',
        inscrits: [salarie(1100, 'org-a'), salarie(1100, 'org-b')],
      }),
    ).toBeNull();
  });

  it('se tait quand tout confirme', () => {
    expect(
      refusForfaitNonConfirme({ modeProduit: FORFAIT, inscrits: [salarie(1100), salarie(1100)] }),
    ).toBeNull();
  });

  it('se tait sans inscrit — il n’y a rien à totaliser, pas une anomalie', () => {
    expect(refusForfaitNonConfirme({ modeProduit: FORFAIT, inscrits: [] })).toBeNull();
  });

  it('deux commanditaires : nomme le nombre et dit de scinder', () => {
    const r = refusForfaitNonConfirme({
      modeProduit: FORFAIT,
      inscrits: [salarie(1100, 'org-a'), salarie(1100, 'org-b')],
    });
    expect(r).toContain('2 commanditaires');
    expect(r).toContain('Scindez');
  });

  it('salle mixte : compte les inscrits hors convention et dit quoi faire', () => {
    const r = refusForfaitNonConfirme({
      modeProduit: FORFAIT,
      // MÊME agence : un salarié et un agent commercial d'org-a. Sinon c'est le
      // refus « deux commanditaires » qui répond, et on ne teste plus rien.
      inscrits: [salarie(1100), autoPayeur(1100, 'org-a')],
    });
    expect(r).toContain('1 inscrit ne relève pas');
    expect(r).toContain('vendu à la place');
  });

  it('prix manquant : le dit plutôt que de sous-estimer l’engagement', () => {
    const r = refusForfaitNonConfirme({
      modeProduit: FORFAIT,
      inscrits: [salarie(1100), salarie(0)],
    });
    expect(r).toContain("1 inscrit n'a pas de prix");
  });

  it('le commanditaire multiple prime sur le reste — le motif le plus structurel d’abord', () => {
    const r = refusForfaitNonConfirme({
      modeProduit: FORFAIT,
      inscrits: [salarie(1100, 'org-a'), autoPayeur(0, 'org-b')],
    });
    expect(r).toContain('commanditaires');
  });
});

/**
 * ASSALIT SYNDIC (SES-0107), 11/09 : huit salariés à 312,50 €, forfait de
 * 2 500 € pour l'entreprise. Le mode TOTAL_ENTREPRISE existait déjà, mais aucun
 * bouton n'y menait — tous généraient le programme de CATALOGUE, qui annonce le
 * prix par tête. D'où cette règle, partagée par tous les points d'entrée.
 */
describe('programmeDoitEtrePropreALaSession', () => {
  const salarie = (priceHT: number, sponsorOrgId = 'org-assalit') => ({
    priceHT,
    sponsorOrgId,
    couvertParConvention: true,
  });
  const autoPayeur = (priceHT: number, sponsorOrgId = 'org-ei') => ({
    priceHT,
    sponsorOrgId,
    couvertParConvention: false,
  });

  it('SES-0107 : produit au forfait, huit salariés, sans tarif de session ⇒ programme de la session', () => {
    expect(
      programmeDoitEtrePropreALaSession({
        modeProduit: 'FORFAIT_ENTREPRISE',
        inscrits: Array.from({ length: 8 }, () => salarie(312.5)),
        tarifSession: null,
        prixProduit: 2500,
      }),
    ).toBe(true);
  });

  it('tarif négocié pour la session ⇒ programme de la session, quel que soit le mode', () => {
    expect(
      programmeDoitEtrePropreALaSession({
        modeProduit: 'PAR_STAGIAIRE',
        inscrits: [autoPayeur(1800), autoPayeur(1800, 'org-ei-2')],
        tarifSession: 1800,
        prixProduit: 2500,
      }),
    ).toBe(true);
  });

  it('session inter au prix catalogue ⇒ le programme de catalogue suffit', () => {
    expect(
      programmeDoitEtrePropreALaSession({
        modeProduit: 'PAR_STAGIAIRE',
        inscrits: [autoPayeur(2500), autoPayeur(2500, 'org-ei-2')],
        tarifSession: null,
        prixProduit: 2500,
      }),
    ).toBe(false);
  });

  it('produit au forfait SANS inscrit ⇒ catalogue : il sait désormais annoncer le forfait', () => {
    // Depuis le 17/09, le programme produit porte le mode. Fabriquer un PDF de
    // session identique au PDF produit serait un doublon à maintenir.
    expect(
      programmeDoitEtrePropreALaSession({
        modeProduit: 'FORFAIT_ENTREPRISE',
        inscrits: [],
        tarifSession: 0,
        prixProduit: 2500,
      }),
    ).toBe(false);
  });
});

/**
 * Deux vocabulaires, et c'est voulu : le produit dit comment il se VEND, le
 * document dit ce qu'il AFFICHE.
 */
describe('prixModeDuProduit', () => {
  it('traduit le forfait en total affiché', () => {
    expect(prixModeDuProduit('FORFAIT_ENTREPRISE')).toBe('TOTAL_ENTREPRISE');
  });

  it('traduit la place en prix par stagiaire', () => {
    expect(prixModeDuProduit('PAR_STAGIAIRE')).toBe('PAR_STAGIAIRE');
  });
});
