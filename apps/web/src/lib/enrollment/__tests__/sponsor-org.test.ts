import { describe, it, expect } from 'vitest';
import { resolveSponsorOrg, type SponsorInput } from '../sponsor-org';

const base: SponsorInput = {
  professionalStatus: 'Agent commercial',
  companyName: 'MARX IMMO',
  companySiret: '123 456 789 00012',
  firstName: 'Jean',
  lastName: 'Martin',
  matchedOrganizationId: null,
};

describe('resolveSponsorOrg', () => {
  it('agent commercial : crée son EI avec le SIRET nettoyé', () => {
    expect(resolveSponsorOrg(base)).toEqual({
      kind: 'creer-ei',
      siret: '12345678900012',
      legalName: 'MARX IMMO',
    });
  });

  it('agent commercial sans raison sociale : nom de l’EI dérivé de l’identité', () => {
    const d = resolveSponsorOrg({ ...base, companyName: null });
    expect(d).toEqual({ kind: 'creer-ei', siret: '12345678900012', legalName: 'Jean MARTIN' });
  });

  it('dirigeant avec entreprise connue : réutilise l’organisation trouvée', () => {
    const d = resolveSponsorOrg({
      ...base,
      professionalStatus: 'Dirigeant',
      matchedOrganizationId: 'org-1',
    });
    expect(d).toEqual({ kind: 'org-existante', organizationId: 'org-1' });
  });

  it('dirigeant avec entreprise inconnue : crée l’EI sur le SIRET déclaré', () => {
    const d = resolveSponsorOrg({ ...base, professionalStatus: 'Dirigeant' });
    expect(d.kind).toBe('creer-ei');
  });

  it('salarié avec enseigne connue : l’enseigne paye', () => {
    const d = resolveSponsorOrg({
      ...base,
      professionalStatus: 'Salarié',
      matchedOrganizationId: 'org-enseigne',
    });
    expect(d).toEqual({ kind: 'org-existante', organizationId: 'org-enseigne' });
  });

  it('salarié avec SIRET inconnu : JAMAIS de création automatique', () => {
    const d = resolveSponsorOrg({ ...base, professionalStatus: 'Salarié' });
    expect(d.kind).toBe('a-confirmer');
  });

  it('statut non renseigné : à confirmer', () => {
    const d = resolveSponsorOrg({ ...base, professionalStatus: null });
    expect(d.kind).toBe('a-confirmer');
  });

  it('SIRET absent pour un indépendant : à confirmer', () => {
    const d = resolveSponsorOrg({ ...base, companySiret: null });
    expect(d.kind).toBe('a-confirmer');
  });

  it('SIRET de longueur invalide : à confirmer', () => {
    const d = resolveSponsorOrg({ ...base, companySiret: '1234' });
    expect(d.kind).toBe('a-confirmer');
  });
});
