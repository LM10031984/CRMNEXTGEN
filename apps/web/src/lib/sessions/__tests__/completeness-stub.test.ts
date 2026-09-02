import { describe, it, expect } from 'vitest';
import { getSessionCompleteness } from '../completeness';

/**
 * Lot 0 · 0.3 (audit produit du 28/08, écart E-3) — `usedStub = true` n'était
 * bloquant nulle part : le PDF générique partait chez l'apprenant, job DONE,
 * badge vert.
 *
 * Le piège de ce correctif, et la raison d'être de ces tests : ranger le
 * contenu générique parmi les blockers ordinaires fermerait la SEULE porte de
 * sortie. Le bouton « Générer le pack » se désactiverait parce qu'un stub
 * existe — stub qu'on ne peut corriger qu'en régénérant. D'où la distinction
 * `blocks: 'generation' | 'delivery'`.
 */

function sessionSaine(stubDocsCount?: number) {
  return {
    ...(stubDocsCount === undefined ? {} : { stubDocsCount }),
    startDate: new Date('2026-10-12'),
    endDate: new Date('2026-10-14'),
    pricePerLearner: 3024,
    locationId: 'loc-1',
    location: { legalName: 'SARL XYZ', address: { postalCode: '06000', city: 'Nice' } },
    modality: 'PRESENTIEL',
    trainers: [{ isPrimary: true }],
    product: { programMd: 'x'.repeat(50), aiDraftedAt: null },
    participantsCount: 3,
  };
}

describe('contenu générique — bloque la remise, jamais la régénération', () => {
  it('session saine sans stub : rien à signaler, ratio plein', () => {
    const r = getSessionCompleteness(sessionSaine(0));
    expect(r.blockers).toHaveLength(0);
    expect(r.ready).toBe(true);
    expect(r.deliverable).toBe(true);
    expect(r.ratio).toBe(1);
  });

  it('un document générique rend la session NON remettable', () => {
    const r = getSessionCompleteness(sessionSaine(2));
    const stub = r.blockers.find((b) => b.key === 'stub_documents');
    expect(stub).toBeDefined();
    expect(stub!.label).toContain('2 documents');
    expect(r.deliverable).toBe(false);
  });

  it('… mais la génération reste possible — sinon le stub serait indécrottable', () => {
    const r = getSessionCompleteness(sessionSaine(2));
    expect(r.ready).toBe(true);
    expect(r.generationBlockers).toHaveLength(0);
  });

  it('le blocker se déclare explicitement comme bloquant la remise', () => {
    const r = getSessionCompleteness(sessionSaine(1));
    expect(r.blockers.find((b) => b.key === 'stub_documents')!.blocks).toBe('delivery');
  });

  it('un vrai blocker de génération, lui, bloque toujours', () => {
    const r = getSessionCompleteness({ ...sessionSaine(1), trainers: [] });
    expect(r.ready).toBe(false);
    expect(r.generationBlockers.map((b) => b.key)).toEqual(['no_primary_trainer']);
    // Les deux restent affichés à l'utilisateur.
    expect(r.blockers).toHaveLength(2);
  });

  it('appelant qui ne compte pas les stubs : comportement d’avant, sans faux vert', () => {
    const r = getSessionCompleteness(sessionSaine(undefined));
    expect(r.blockers.find((b) => b.key === 'stub_documents')).toBeUndefined();
    expect(r.ready).toBe(true);
    expect(r.deliverable).toBe(true);
  });

  it('le libellé reste au singulier pour un seul document', () => {
    const r = getSessionCompleteness(sessionSaine(1));
    expect(r.blockers.find((b) => b.key === 'stub_documents')!.label).toBe(
      '1 document au contenu générique',
    );
  });
});
