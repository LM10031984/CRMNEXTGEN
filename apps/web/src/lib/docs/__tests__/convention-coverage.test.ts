import { describe, it, expect } from 'vitest';
import {
  GROUP_CONVENTION_ENTITY_TYPE,
  groupConventionWhere,
  expandGroupConventions,
  isCoveredByGroupConvention,
} from '../convention-coverage';

/**
 * Quick 260820-j8w — helper de couverture convention (suite revue Codex PR #13).
 *
 * La convention groupe est rattachée à l'ORGANISATION commanditaire, pas aux
 * participants. Quatre consommateurs doivent la résoudre de la même façon
 * (fiche session, dossier OPCO, statut de préparation, garde anti-doublon) —
 * d'où cette source unique. C'est le fait d'avoir traité un seul consommateur
 * qui avait produit les 5 findings.
 */

const PARTICIPANTS = [
  { id: 'sp-1', sponsorOrgId: 'org-optimmo' },
  { id: 'sp-2', sponsorOrgId: 'org-optimmo' },
  { id: 'sp-3', sponsorOrgId: 'org-autre' },
  { id: 'sp-4', sponsorOrgId: 'org-ei-alice' }, // auto-payeur
];

const DOC_GROUPE = {
  id: 'doc-groupe',
  type: 'CONVENTION',
  entityType: GROUP_CONVENTION_ENTITY_TYPE,
  entityId: 'org-optimmo',
};

describe('expandGroupConventions', () => {
  it('couvre tous les salariés du commanditaire, et eux seuls', () => {
    const m = expandGroupConventions([DOC_GROUPE], PARTICIPANTS);
    expect([...m.keys()].sort()).toEqual(['sp-1', 'sp-2']);
    expect(m.get('sp-1')).toBe('doc-groupe');
    expect(m.has('sp-3')).toBe(false); // autre commanditaire
    expect(m.has('sp-4')).toBe(false); // auto-payeur
  });

  it('ignore les documents d’un autre type rattachés à une organisation', () => {
    const autre = { ...DOC_GROUPE, id: 'doc-x', type: 'FACTURE' };
    expect(expandGroupConventions([autre], PARTICIPANTS).size).toBe(0);
  });

  it('ignore les conventions individuelles (entityType=participant)', () => {
    const individuelle = {
      id: 'doc-indiv',
      type: 'CONVENTION',
      entityType: 'participant',
      entityId: 'sp-1',
    };
    expect(expandGroupConventions([individuelle], PARTICIPANTS).size).toBe(0);
  });

  it('renvoie une map vide quand aucun document n’est fourni', () => {
    expect(expandGroupConventions([], PARTICIPANTS).size).toBe(0);
  });

  it('gère plusieurs commanditaires en une passe', () => {
    const docAutre = { ...DOC_GROUPE, id: 'doc-2', entityId: 'org-autre' };
    const m = expandGroupConventions([DOC_GROUPE, docAutre], PARTICIPANTS);
    expect(m.get('sp-1')).toBe('doc-groupe');
    expect(m.get('sp-3')).toBe('doc-2');
    expect(m.size).toBe(3);
  });
});

describe('isCoveredByGroupConvention', () => {
  it('vrai pour un salarié du commanditaire, faux pour un auto-payeur', () => {
    expect(isCoveredByGroupConvention([DOC_GROUPE], PARTICIPANTS[0]!)).toBe(true);
    expect(isCoveredByGroupConvention([DOC_GROUPE], PARTICIPANTS[3]!)).toBe(false);
  });
});

describe('groupConventionWhere', () => {
  it('scelle tenant + type + entityType + org + session', () => {
    expect(groupConventionWhere('tnt-1', 'ses-1', 'org-optimmo')).toEqual({
      tenantId: 'tnt-1',
      type: 'CONVENTION',
      entityType: GROUP_CONVENTION_ENTITY_TYPE,
      entityId: 'org-optimmo',
      sessionId: 'ses-1',
    });
  });

  it('reste scopé au tenant (jamais de fuite inter-tenant)', () => {
    expect(groupConventionWhere('tnt-2', 'ses-1', 'org-optimmo').tenantId).toBe('tnt-2');
  });
});
