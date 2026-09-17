import { expect, it } from 'vitest';
import {
  resoudrePrixProgramme,
  refusForfaitNonConfirme,
  programmeDoitEtrePropreALaSession,
} from '../tarif-programme';
const base = {
  modeProduit: 'PAR_STAGIAIRE' as const,
  tarifSession: 120,
  prixProduit: 999,
  inscrits: [1, 2, 3].map(() => ({
    priceHT: 120,
    sponsorOrgId: 'sas',
    couvertParConvention: true,
  })),
};
it('le programme annonce le forfait de SESSION même si le catalogue vend à la place', () => {
  expect(
    resoudrePrixProgramme({ ...base, regimeSession: 'ENTREPRISE', prixTotalSession: 240 }),
  ).toEqual({ mode: 'TOTAL_ENTREPRISE', montantHT: 240 });
});
it('une session individuelle garde son tarif à la place même sur un produit forfait', () => {
  expect(
    resoudrePrixProgramme({
      ...base,
      modeProduit: 'FORFAIT_ENTREPRISE',
      regimeSession: 'INDIVIDUEL',
    }),
  ).toEqual({ mode: 'PAR_STAGIAIRE', montantHT: 120 });
});
it('un prix total absent refuse au lieu de reprendre le catalogue', () => {
  expect(
    refusForfaitNonConfirme({ ...base, regimeSession: 'ENTREPRISE', prixTotalSession: null }),
  ).toMatch(/prix total/i);
});
it('le programme est propre à toute session déclarée, même sans inscrit', () => {
  expect(
    programmeDoitEtrePropreALaSession({
      ...base,
      regimeSession: 'ENTREPRISE',
      prixTotalSession: 240,
      inscrits: [],
      tarifSession: null,
    }),
  ).toBe(true);
});
it('NULL conserve exactement le tarif catalogue et le comportement historique', () => {
  expect(resoudrePrixProgramme({ ...base, regimeSession: null, prixTotalSession: 240 })).toEqual({
    mode: 'PAR_STAGIAIRE',
    montantHT: 120,
  });
});
