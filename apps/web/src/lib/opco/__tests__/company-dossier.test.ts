import { describe, expect, it } from 'vitest';
import {
  isCompanyDossier,
  controlCompanyPieces,
  selectDossierConvention,
} from '../company-dossier';
describe('dossier salarié', () => {
  it('le lien chez le payeur prime sur une EI ailleurs', () => {
    expect(
      isCompanyDossier({
        sponsorOrgId: 'employer',
        person: {
          legalLinks: [
            { organizationId: 'own', role: 'EI_SELF' },
            { organizationId: 'employer', role: 'SALARIE' },
          ],
        },
      }),
    ).toBe(true);
    expect(
      isCompanyDossier({
        sponsorOrgId: 'own',
        person: {
          legalLinks: [
            { organizationId: 'own', role: 'EI_SELF' },
            { organizationId: 'employer', role: 'SALARIE' },
          ],
        },
      }),
    ).toBe(false);
  });
  it('ne valide pas une convention non signée ou un programme décoché', () => {
    const pieces = [
      { kind: 'CONVENTION', key: 'c', included: true, signe: false },
      { kind: 'PROGRAMME', key: 'p', included: false },
    ];
    expect(controlCompanyPieces(pieces)).toContain('convention signée, programme de formation');
    expect(
      controlCompanyPieces(pieces.map((p) => ({ ...p, included: true, signe: true }))),
    ).toBeNull();
  });
});

it('convention commune du payeur prioritaire pour le salarié, sans prendre celle d’une autre entreprise', () => {
  const docs = [
    { id: 'other', entityType: 'organization', entityId: 'other', participantId: null },
    { id: 'individual', participantId: 'p' },
    { id: 'group', entityType: 'organization', entityId: 'employer', participantId: null },
  ];
  expect(selectDossierConvention(docs, 'p', 'employer', true)?.id).toBe('group');
  expect(selectDossierConvention(docs, 'p', 'employer', false)?.id).toBe('individual');
});
