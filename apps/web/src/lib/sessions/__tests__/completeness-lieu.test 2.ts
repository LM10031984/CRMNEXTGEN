import { describe, it, expect } from 'vitest';
import { getSessionCompleteness } from '../completeness';

/**
 * AGEFICE 2026-08-28 — un lieu simplement rattaché à la session ne suffit
 * plus : sans raison sociale, sans CP ou sans ville, la feuille d'émargement
 * revient en demande de complément. Le pack de clôture est donc bloqué en
 * amont, comme il l'est déjà pour un formateur ou un tarif manquant.
 */

const BASE = {
  startDate: new Date('2026-09-14'),
  endDate: new Date('2026-09-16'),
  pricePerLearner: 2500,
  modality: 'PRESENTIEL' as string | null,
  trainers: [{ isPrimary: true }],
  product: {
    programMd: 'Programme détaillé conforme Qualiopi, objectifs en verbes de Bloom.',
    aiDraftedAt: null,
  },
  participantsCount: 4,
};

const LIEU_COMPLET = {
  legalName: "SARL L'Agence Signature",
  address: { street: '12 rue Masséna', postalCode: '06000', city: 'Nice' },
};

describe('getSessionCompleteness — lieu conforme AGEFICE', () => {
  it('est prête quand le lieu porte raison sociale, CP et ville', () => {
    const r = getSessionCompleteness({
      ...BASE,
      locationId: 'loc-1',
      location: LIEU_COMPLET,
    });
    expect(r.ready).toBe(true);
    expect(r.ratio).toBe(1);
  });

  it('bloque le pack quand la raison sociale du lieu manque', () => {
    const r = getSessionCompleteness({
      ...BASE,
      locationId: 'loc-1',
      location: {
        legalName: null,
        address: { street: 'Akorimmo, 63 bd de Cessole', postalCode: '06100', city: 'Nice' },
      },
    });
    expect(r.ready).toBe(false);
    const blocker = r.blockers.find((b) => b.key === 'location_incomplete');
    expect(blocker?.label).toContain('raison sociale');
    expect(blocker?.fix.href).toBe('#section-lieu');
  });

  it('énumère toutes les mentions manquantes dans un seul blocker', () => {
    const r = getSessionCompleteness({
      ...BASE,
      locationId: 'loc-1',
      location: { legalName: null, address: {} },
    });
    const blocker = r.blockers.find((b) => b.key === 'location_incomplete');
    expect(blocker?.label).toBe(
      'Lieu de formation incomplet (raison sociale, code postal, ville)',
    );
    expect(r.blockers.filter((b) => b.key === 'location_incomplete')).toHaveLength(1);
  });

  it("n'exige rien du lieu en distanciel", () => {
    const r = getSessionCompleteness({
      ...BASE,
      modality: 'DISTANCIEL',
      locationId: 'loc-1',
      location: { legalName: null, address: {} },
    });
    expect(r.blockers.map((b) => b.key)).not.toContain('location_incomplete');
    expect(r.ready).toBe(true);
  });

  it('ne double pas le blocker quand aucun lieu n’est rattaché', () => {
    const r = getSessionCompleteness({ ...BASE, locationId: null, location: null });
    const cles = r.blockers.map((b) => b.key);
    expect(cles).toContain('no_location');
    expect(cles).not.toContain('location_incomplete');
  });

  it('reste silencieux pour un appelant qui ne charge pas le lieu', () => {
    // Rétro-compatibilité : `location` absent ⇒ on ne peut rien vérifier, on
    // ne bloque donc pas (le blocker `no_location` continue de couvrir le cas
    // « aucun lieu »).
    const r = getSessionCompleteness({ ...BASE, locationId: 'loc-1' });
    expect(r.blockers.map((b) => b.key)).not.toContain('location_incomplete');
    expect(r.ready).toBe(true);
  });
});
