import { describe, it, expect } from 'vitest';
import { valideEtapeWizard, type EtatWizard } from '../wizard-etapes';

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
 * Ce qui reste bloquant est ce sans quoi la session n'existe pas : un produit,
 * des dates cohérentes, un formateur qui peut venir.
 *
 * Test de puissance : rétablir le refus sur `participants.length === 0` fait
 * virer ROUGE « laisse passer une session sans aucun inscrit ».
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

  it('refuse un formateur indisponible sur TOUTES les dates, en le nommant', () => {
    const message = valideEtapeWizard(2, {
      ...BASE,
      disponibilites: { 'f-1': { totalDates: 3, availableDates: 0 } },
    });
    expect(message).toMatch(/indisponible/i);
    // Le nom compte : « un formateur est indisponible » n'aide personne.
    expect(message).toContain('Marx');
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
