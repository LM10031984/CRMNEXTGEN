import { describe, it, expect } from 'vitest';
import {
  valideEtapeWizard,
  avertissementsEtapeWizard,
  type EtatWizard,
} from '../wizard-etapes';

/**
 * Ce qui autorise à passer d'une étape à l'autre dans le wizard de création
 * de session.
 *
 * PROBLÈME RÉSOLU (11/09/2026) : l'étape 3 exigeait « au moins un
 * participant ». Or on crée une session AVANT d'avoir des inscrits — c'est
 * même le cas normal : on planifie une date au catalogue, puis les
 * inscriptions arrivent, par le lien public, par SmartOF ou à la main.
 *
 * Laurent s'est retrouvé à s'inscrire LUI-MÊME comme apprenant pour franchir
 * l'étape, puis à créer « Start Academy » comme employeur pour satisfaire le
 * rattachement — deux fiches parasites dans la base, nées d'un garde-fou
 * déplacé. Une session sans inscrit n'a rien d'invalide ; elle est seulement
 * incomplète, et la fiche session le dit déjà.
 *
 * Ce qui reste bloquant est ce sans quoi la session n'existe pas : un produit
 * et des dates cohérentes.
 *
 * SECOND GARDE-FOU DÉPLACÉ (16/09/2026) : « formateur indisponible sur toutes
 * les dates » refusait l'étape. Or une session mixte salariés /
 * auto-entrepreneurs se scinde en DEUX sessions qui partagent délibérément
 * dates, salle et formateur — chaque population ayant son tarif, donc ses
 * propres pièces. L'ancienne règle rendait la seconde session impossible à
 * créer. Le chevauchement est devenu un AVERTISSEMENT.
 *
 * Tests de puissance : rétablir le refus sur `participants.length === 0` fait
 * virer ROUGE « laisse passer une session sans aucun inscrit » ; rétablir le
 * refus sur le formateur fait virer ROUGE « ne bloque plus un formateur déjà
 * pris sur toutes les dates ».
 */

const BASE: EtatWizard = {
  produitChoisi: true,
  dateDebut: '2026-10-01',
  dateFin: '2026-10-03',
  formateurIds: ['f-1'],
  disponibilites: {},
  formateurs: [{ id: 'f-1', firstName: 'Laurent', lastName: 'Marx' }],
  nbParticipants: 0,
};

describe('valideEtapeWizard', () => {
  it('laisse passer une session sans aucun inscrit — le cas normal à la création', () => {
    expect(valideEtapeWizard(3, BASE)).toBeNull();
  });

  it('laisse aussi passer avec des inscrits', () => {
    expect(valideEtapeWizard(3, { ...BASE, nbParticipants: 4 })).toBeNull();
  });

  it('exige un produit à l’étape 1', () => {
    expect(valideEtapeWizard(1, { ...BASE, produitChoisi: false })).toMatch(/produit/i);
    expect(valideEtapeWizard(1, BASE)).toBeNull();
  });

  it('exige des dates à l’étape 2', () => {
    expect(valideEtapeWizard(2, { ...BASE, dateDebut: '' })).toMatch(/dates/i);
    expect(valideEtapeWizard(2, { ...BASE, dateFin: '' })).toMatch(/dates/i);
  });

  it('refuse une fin antérieure au début', () => {
    expect(valideEtapeWizard(2, { ...BASE, dateDebut: '2026-10-05', dateFin: '2026-10-01' })).toMatch(
      /≥ date début/i,
    );
  });

  it('exige au moins un formateur', () => {
    expect(valideEtapeWizard(2, { ...BASE, formateurIds: [] })).toMatch(/formateur/i);
  });

  it('ne bloque plus un formateur déjà pris sur toutes les dates', () => {
    // LE cas du dédoublement par régime de paiement : la seconde session
    // reprend le même formateur, aux mêmes dates, et doit pouvoir se créer.
    expect(
      valideEtapeWizard(2, {
        ...BASE,
        disponibilites: { 'f-1': { totalDates: 3, availableDates: 0 } },
      }),
    ).toBeNull();
  });

  it('accepte un formateur partiellement disponible — à l’utilisateur de trancher', () => {
    expect(
      valideEtapeWizard(2, {
        ...BASE,
        disponibilites: { 'f-1': { totalDates: 3, availableDates: 1 } },
      }),
    ).toBeNull();
  });

  it('ne bloque pas sur une disponibilité inconnue', () => {
    expect(
      valideEtapeWizard(2, { ...BASE, disponibilites: { 'f-1': { totalDates: 0, availableDates: 0 } } }),
    ).toBeNull();
  });
});

describe('avertissementsEtapeWizard — ce qui se signale sans s’interdire', () => {
  it('signale un formateur pris sur toutes les dates, en le nommant', () => {
    const [a, ...reste] = avertissementsEtapeWizard(2, {
      ...BASE,
      disponibilites: { 'f-1': { totalDates: 3, availableDates: 0 } },
    });
    expect(reste).toHaveLength(0);
    // Le nom compte : « un formateur est déjà pris » n'aide personne.
    expect(a).toContain('Marx');
    expect(a).toMatch(/déjà rattaché/i);
  });

  it('signale un chevauchement partiel en donnant le compte', () => {
    const [a] = avertissementsEtapeWizard(2, {
      ...BASE,
      disponibilites: { 'f-1': { totalDates: 3, availableDates: 1 } },
    });
    expect(a).toContain('2 dates sur 3');
  });

  it('se tait quand le formateur est libre', () => {
    expect(
      avertissementsEtapeWizard(2, {
        ...BASE,
        disponibilites: { 'f-1': { totalDates: 3, availableDates: 3 } },
      }),
    ).toEqual([]);
  });

  it('se tait sur une disponibilité inconnue — on n’avertit pas d’un vide', () => {
    expect(
      avertissementsEtapeWizard(2, {
        ...BASE,
        disponibilites: { 'f-1': { totalDates: 0, availableDates: 0 } },
      }),
    ).toEqual([]);
  });

  it('ne dit rien hors de l’étape 2', () => {
    const etat = { ...BASE, disponibilites: { 'f-1': { totalDates: 3, availableDates: 0 } } };
    expect(avertissementsEtapeWizard(1, etat)).toEqual([]);
    expect(avertissementsEtapeWizard(3, etat)).toEqual([]);
  });
});
