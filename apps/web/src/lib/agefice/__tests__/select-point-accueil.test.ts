import { describe, it, expect } from 'vitest';
import {
  departmentOfPostalCode,
  pickPointAccueil,
  rankPointsAccueil,
  servesDepartment,
  type PointAccueilCandidate,
} from '../select-point-accueil';

/**
 * Quick 260908-m1v. Les points d'accueil ci-dessous sont RÉELS (annuaire
 * officiel agefice.fr relevé le 2026-09-08) : ce sont eux qui servent le 06.
 */

const pa = (o: Partial<PointAccueilCandidate> & { id: string }): PointAccueilCandidate => ({
  name: o.name ?? o.id,
  postalCode: o.postalCode ?? '00000',
  city: o.city ?? '',
  department: o.department ?? '00',
  departmentsServed: o.departmentsServed ?? [],
  ...o,
});

const UMIH_NICE = pa({
  id: '370',
  name: 'UMIH Nice Azur et Alpes',
  postalCode: '06000',
  city: 'NICE',
  department: '06',
  departmentsServed: ['04', '05', '06', '13', '83', '84'],
});
const CPME_13 = pa({
  id: '1',
  name: 'CPME 13',
  postalCode: '13015',
  city: 'MARSEILLE',
  department: '13',
  departmentsServed: ['04', '05', '06', '13', '2A', '2B', '83', '84'],
});
const CCI_ARLES = pa({
  id: '99',
  name: "CCI PAYS D ARLES",
  postalCode: '13200',
  city: 'ARLES CEDEX',
  department: '13',
  departmentsServed: ['13'],
});
const PLATEFORME = pa({
  id: '607',
  name: 'PTA 607 - PLATEFORME NATIONALE DÉMATÉRIALISÉE',
  postalCode: '75000',
  city: 'PARIS',
  department: '75',
  departmentsServed: Array.from({ length: 95 }, (_, i) => String(i + 1).padStart(2, '0')),
});

describe('departmentOfPostalCode', () => {
  it('métropole → 2 chiffres, outre-mer → 3', () => {
    expect(departmentOfPostalCode('06800')).toBe('06');
    expect(departmentOfPostalCode('97400')).toBe('974');
  });

  it('tolère les espaces et le zéro de tête manquant', () => {
    expect(departmentOfPostalCode('06 800')).toBe('06');
    expect(departmentOfPostalCode('6800')).toBe('06');
  });

  it('la Corse suit la nomenclature de l’annuaire (2A / 2B), pas « 20 »', () => {
    expect(departmentOfPostalCode('20000')).toBe('2A'); // Ajaccio
    expect(departmentOfPostalCode('20190')).toBe('2A');
    expect(departmentOfPostalCode('20200')).toBe('2B'); // Bastia
    expect(departmentOfPostalCode('20600')).toBe('2B');
  });

  it('entrée invalide → null', () => {
    expect(departmentOfPostalCode('abc')).toBeNull();
    expect(departmentOfPostalCode(null)).toBeNull();
  });
});

describe('servesDepartment', () => {
  it("s'appuie sur la couverture officielle, pas sur l'implantation", () => {
    expect(servesDepartment(CPME_13, '06')).toBe(true); // Marseille sert le 06
    expect(servesDepartment(CCI_ARLES, '06')).toBe(false);
  });

  it('sans couverture renseignée, retombe sur l’implantation (référentiel ancien)', () => {
    const ancien = pa({ id: 'x', department: '06', departmentsServed: [] });
    expect(servesDepartment(ancien, '06')).toBe(true);
    expect(servesDepartment(ancien, '13')).toBe(false);
  });
});

describe('pickPointAccueil', () => {
  it('un apprenant de Cagnes-sur-Mer obtient le point d’accueil de Nice', () => {
    const best = pickPointAccueil([CPME_13, PLATEFORME, UMIH_NICE], {
      department: '06',
      city: 'Cagnes-sur-Mer',
      postalCode: '06800',
    });
    expect(best?.name).toBe('UMIH Nice Azur et Alpes');
  });

  it("corrige le défaut signalé : Marseille, pas Arles, pour un apprenant des Bouches-du-Rhône", () => {
    // L'ancien code prenait le premier par ordre alphabétique de ville → ARLES.
    const best = pickPointAccueil([CCI_ARLES, CPME_13], {
      department: '13',
      city: 'Marseille',
      postalCode: '13008',
    });
    expect(best?.name).toBe('CPME 13');
  });

  it('un département sans point implanté est servi par un voisin (69, 92, 2A…)', () => {
    const best = pickPointAccueil([CPME_13, PLATEFORME], { department: '2A' });
    expect(best?.name).toBe('CPME 13');
  });

  it('la plateforme nationale ne sort que s’il n’y a personne d’autre', () => {
    expect(pickPointAccueil([PLATEFORME, UMIH_NICE], { department: '06' })?.id).toBe('370');
    expect(pickPointAccueil([PLATEFORME], { department: '75' })?.id).toBe('607');
  });

  it('aucun point ne couvre le département → null, et on le dira à l’utilisateur', () => {
    expect(pickPointAccueil([CCI_ARLES], { department: '06' })).toBeNull();
    expect(pickPointAccueil([], { department: '06' })).toBeNull();
  });

  it('à département égal, la même ville l’emporte', () => {
    const nice2 = pa({
      id: '999',
      name: 'AUTRE PA 06',
      postalCode: '06600',
      city: 'ANTIBES',
      department: '06',
      departmentsServed: ['06'],
    });
    const best = pickPointAccueil([nice2, UMIH_NICE], {
      department: '06',
      city: 'NICE',
      postalCode: '06000',
    });
    expect(best?.id).toBe('370');
  });
});

describe('rankPointsAccueil — départage sans point local', () => {
  it('préfère le point à couverture étroite au point qui ratisse large', () => {
    const large = pa({
      id: 'large',
      name: 'AAA CCI TRÈS LARGE',
      postalCode: '05001',
      city: 'GAP',
      department: '05',
      departmentsServed: Array.from({ length: 29 }, (_, i) => String(i + 40).padStart(2, '0')),
    });
    const cible = pa({
      id: 'cible',
      name: 'ZZZ CPME VOISINE',
      postalCode: '42000',
      city: 'SAINT-ETIENNE',
      department: '42',
      departmentsServed: ['42', '69'],
    });
    // Sans ce critère, le tri alphabétique donnait « AAA CCI TRÈS LARGE ».
    expect(pickPointAccueil([large, cible], { department: '69', postalCode: '69003' })?.id).toBe(
      'cible',
    );
  });
});

describe('rankPointsAccueil', () => {
  it('rend un classement complet, la plateforme en dernier', () => {
    const ranked = rankPointsAccueil([PLATEFORME, CPME_13, UMIH_NICE], {
      department: '06',
      postalCode: '06800',
    });
    expect(ranked.map((p) => p.id)).toEqual(['370', '1', '607']);
  });
});
