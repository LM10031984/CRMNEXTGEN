import { describe, expect, it } from 'vitest';
import { previewMlsDuplicates, type DuplicateLead } from '../mls-duplicates';
const row = (id: string, phone: string, agency: string): DuplicateLead => ({
  id,
  tenantId: 'tenant',
  source: 'MLS_COTE_D_AZUR',
  importKey: id,
  status: 'NEW',
  firstName: 'Anjélika',
  lastName: 'Test',
  email: null,
  phone,
  city: 'Nice',
  jobTitle: 'Agent',
  priority: 'MEDIUM',
  segments: ['agent'],
  notes: null,
  personId: null,
  ownerUserId: null,
  interestedProductId: null,
  desiredSessionId: null,
  lastActionAt: null,
  lastAction: null,
  nextActionAt: null,
  nextAction: 'Planifier un appel',
  validatedAt: null,
  wonAt: null,
  staleAlertedAt: null,
  lossReason: null,
  reminderTemplate: null,
  callCount: 0,
  importData: { refs: [id] },
  organizationId: `org-${id}`,
  createdAt: new Date('2026-09-20'),
  updatedAt: new Date('2026-09-20'),
  organization: { legalName: agency, brandName: null, network: null, archived: false },
  _count: {
    actions: 0,
    diagnosticSubmissions: 0,
    diagnostics: 0,
    proposals: 0,
    enrollmentBatches: 0,
    tasks: 0,
    comments: 0,
  },
});
const pair = () => [
  row('keep', '+33612345678', 'ERA Côte d’Azur Immobilier'),
  row('remove', '612345678', 'ERA'),
];
describe('réparation des doublons mobiles MLS', () => {
  it('propose le numéro complet et l’agence précise, conserve notes et segments', () => {
    const [keep, remove] = pair() as [DuplicateLead, DuplicateLead];
    remove.firstName = 'Anjelika';
    keep.notes = 'A';
    remove.notes = 'B';
    remove.segments = ['collaborateur'];
    const [p] = previewMlsDuplicates([keep, remove]);
    expect(p).toMatchObject({
      keep: { id: 'keep' },
      remove: { id: 'remove' },
      mergedNotes: 'A\n\nB',
      mergedSegments: ['agent', 'collaborateur'],
    });
  });
  it.each([
    'actions',
    'diagnosticSubmissions',
    'diagnostics',
    'proposals',
    'enrollmentBatches',
    'tasks',
    'comments',
  ])('refuse une fiche ayant une relation %s', (relation) => {
    const p = pair();
    p[1]!._count[relation] = 1;
    expect(previewMlsDuplicates(p)).toEqual([]);
  });
  it('refuse les activités commerciales, affectations et conversions', () => {
    for (const changed of [
      { callCount: 1 },
      { ownerUserId: 'owner' },
      { personId: 'person' },
      { nextActionAt: new Date() },
      { status: 'QUALIFIED' },
      { interestedProductId: 'product' },
    ]) {
      const p = pair();
      Object.assign(p[0]!, changed);
      expect(previewMlsDuplicates(p)).toEqual([]);
    }
  });
  it('refuse les divergences, réseaux différents, mobiles partagés et autres tenants', () => {
    for (const changed of [
      { firstName: 'Autre' },
      { email: 'different@example.invalid' },
      { city: 'Cannes' },
      { tenantId: 'foreign' },
      { source: 'Salon' },
      { priority: 'HIGH' },
      { nextAction: 'Autre action' },
    ]) {
      const p = pair();
      p[0]!.email = 'a@example.invalid';
      Object.assign(p[1]!, changed);
      expect(previewMlsDuplicates(p)).toEqual([]);
    }
    const p = pair();
    p[0]!.organization!.legalName = 'Orpi Azur';
    expect(previewMlsDuplicates(p)).toEqual([]);
    expect(previewMlsDuplicates([...pair(), row('third', '0612345678', 'ERA')])).toEqual([]);
  });
  it('change le jeton si une valeur à conserver change', () => {
    const p = pair();
    const before = previewMlsDuplicates(p)[0]!.digest;
    p[1]!.notes = 'Nouvelle note';
    expect(previewMlsDuplicates(p)[0]!.digest).not.toBe(before);
  });
});
